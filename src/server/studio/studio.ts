/**
 * The image and video studios on the server (stage 201, ADR 0216). Each request is checked, reserves usage for everything it
 * may make, then runs: pictures in parallel, each streaming a first look; a video in a working row with progress while it
 * renders. What's made is saved as it finishes; usage settles to the real cost of what was made, and a request that made nothing
 * is refunded. The engines are injected, so this is tested without a provider.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { imageSize } from "@/core/chat/files";
import { approxTokens, reserveUnits } from "@/core/billing/rate-card";
import {
  IMAGE_DETAIL,
  imageOutputTokens,
  imagePrompt,
  shapeOf,
  videoPrompt,
  videoTokens,
  type StudioEvent,
  type StudioImageRequest,
  type StudioItem,
  type StudioVideoRequest,
} from "@/core/studio/studio";
import type { DraftFailure, ProviderUsage } from "@/server/ai/contract-drafter";
import type { AspectRatio, ImageGenerator } from "@/server/ai/gemini-image";
import type { StudioImageEngine } from "@/server/ai/openai-image";
import type { VideoEngine } from "@/server/ai/gemini-video";
import { log } from "@/server/observability/log";
import { refundUsage, reserveUsage, resolvePlan, settleUsage, type AiUsageDeps, type UsageContext } from "@/server/workspace/ai-usage";
import { sha256Hex } from "@/core/workspace/device-copy";

type Rpc<T> = { ok: true; value: T } | { ok: false; error: string };

export interface StudioWrites {
  save(i: { orgId: string; actor: string; batchId: string; kind: "image" | "upload"; prompt: string; settings: Record<string, unknown>; model: string | null; parentId: string | null; mime: string; size: number; sha256: string; content: string; width: number | null; height: number | null }): Promise<Rpc<string>>;
  begin(i: { orgId: string; actor: string; batchId: string; prompt: string; settings: Record<string, unknown>; model: string; parentId: string | null; usageEntry: string }): Promise<Rpc<string>>;
  /** Renders a stopped server left behind: marked failed, with the usage reservations to give back. */
  reclaim(i: { orgId: string; actor: string }): Promise<Rpc<{ id: string; usageEntry: string | null }[]>>;
  finish(i: { orgId: string; actor: string; id: string; mime: string; size: number; sha256: string; content: string; width: number | null; height: number | null; durationMs: number | null }): Promise<Rpc<null>>;
  fail(i: { orgId: string; actor: string; id: string; error: string }): Promise<Rpc<null>>;
  remove(i: { orgId: string; actor: string; id: string }): Promise<Rpc<null>>;
}

export function createStudioWrites(admin: SupabaseClient): StudioWrites {
  const call = async <T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<Rpc<T>> => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  };
  const nothing = z.unknown().transform(() => null);
  return {
    save: (i) =>
      call(
        "app_studio_save",
        { p_org: i.orgId, p_actor: i.actor, p_batch: i.batchId, p_kind: i.kind, p_prompt: i.prompt, p_settings: i.settings, p_model: i.model, p_parent: i.parentId, p_mime: i.mime, p_size: i.size, p_sha256: i.sha256, p_content: i.content, p_width: i.width, p_height: i.height },
        z.string(),
      ),
    begin: (i) =>
      call("app_studio_begin", { p_org: i.orgId, p_actor: i.actor, p_batch: i.batchId, p_prompt: i.prompt, p_settings: i.settings, p_model: i.model, p_parent: i.parentId, p_usage_entry: i.usageEntry }, z.string()),
    reclaim: (i) =>
      call(
        "app_studio_reclaim",
        { p_org: i.orgId, p_actor: i.actor },
        z.array(z.object({ id: z.string(), usage_entry: z.string().nullable() })).transform((rows) => rows.map((r) => ({ id: r.id, usageEntry: r.usage_entry }))),
      ),
    finish: (i) =>
      call(
        "app_studio_finish",
        { p_org: i.orgId, p_actor: i.actor, p_id: i.id, p_mime: i.mime, p_size: i.size, p_sha256: i.sha256, p_content: i.content, p_width: i.width, p_height: i.height, p_duration_ms: i.durationMs },
        nothing,
      ),
    fail: (i) => call("app_studio_fail", { p_org: i.orgId, p_actor: i.actor, p_id: i.id, p_error: i.error }, nothing),
    remove: (i) => call("app_studio_delete", { p_org: i.orgId, p_actor: i.actor, p_id: i.id }, nothing),
  };
}

const ITEM_COLUMNS = "id, batch_id, kind, status, prompt, settings, mime, width, height, duration_ms, size_bytes, error, parent_id, created_at";
const STALE_MS = 15 * 60_000;

const rowSchema = z.object({
  id: z.string(),
  batch_id: z.string(),
  kind: z.enum(["image", "video", "upload"]),
  status: z.enum(["working", "ready", "failed"]),
  prompt: z.string(),
  settings: z.record(z.string(), z.unknown()).nullable(),
  mime: z.string().nullable(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  duration_ms: z.number().nullable(),
  size_bytes: z.number(),
  error: z.string().nullable(),
  parent_id: z.string().nullable(),
  created_at: z.string(),
});

export function toItem(row: z.infer<typeof rowSchema>, now = Date.now()): StudioItem {
  const stale = row.status === "working" && now - Date.parse(row.created_at) > STALE_MS;
  return {
    id: row.id,
    batchId: row.batch_id,
    kind: row.kind,
    status: stale ? "failed" : row.status,
    prompt: row.prompt,
    settings: row.settings ?? {},
    mime: row.mime,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    sizeBytes: row.size_bytes,
    error: stale ? "The video stopped rendering. It wasn't counted." : row.error,
    parentId: row.parent_id,
    createdAt: row.created_at,
  };
}

/** The person's studio items in this workspace, newest first, read through row level security (never the bytes). */
export async function listStudioItems(client: SupabaseClient, orgId: string, kinds: StudioItem["kind"][], limit = 200): Promise<StudioItem[] | null> {
  const { data, error } = await client.from("studio_media").select(ITEM_COLUMNS).eq("org_id", orgId).in("kind", kinds).order("created_at", { ascending: false }).limit(limit);
  if (error) {
    log("error", "studio.library_unreadable", { org: orgId, error: error.message });
    return null;
  }
  const now = Date.now();
  return (data ?? []).flatMap((r) => {
    const parsed = rowSchema.safeParse(r);
    return parsed.success ? [toItem(parsed.data, now)] : [];
  });
}

/** One item's bytes, read as the person: only their own, in a workspace they're in. */
export async function readStudioBytes(client: SupabaseClient, id: string): Promise<{ kind: string; mime: string; content: string; prompt: string } | null> {
  const { data, error } = await client.from("studio_media").select("kind, mime, content, prompt").eq("id", id).eq("status", "ready").maybeSingle();
  if (error || !data || typeof data.content !== "string" || typeof data.mime !== "string") return null;
  return { kind: String(data.kind), mime: data.mime, content: data.content, prompt: String(data.prompt ?? "") };
}

export interface StudioDeps {
  usage: UsageContext & AiUsageDeps;
  writes: StudioWrites;
  /** The person's own ready pictures, as base64, for references and stills. */
  pictures(ids: string[]): Promise<{ id: string; mime: string; data: string }[]>;
  /** OpenAI's image model, when connected. */
  openai: StudioImageEngine | null;
  /** Gemini's image model, used when OpenAI isn't connected. */
  gemini: ImageGenerator | null;
  video: VideoEngine | null;
  /** A non-identifying id for the provider's abuse checks. */
  safetyId: string;
  now(): number;
}

export type StudioFailure = { ok: false; status: number; message: string };

export interface PreparedStudio {
  ok: true;
  batchId: string;
  run(emit: (e: StudioEvent) => void, signal: AbortSignal): Promise<void>;
}

const MANUAL = "What you've made stays in your library.";

const refused = (status: number, message: string): StudioFailure => ({ ok: false, status, message });

const IMAGE_FAILED: Record<string, string> = {
  BLOCKED: "That picture can't be made: the model's safety checks refused it. Try describing it differently.",
  PROVIDER_BUSY: "The image service is busy, so this picture wasn't counted. Try again in a minute.",
  INCOMPLETE: "No picture came back, so it wasn't counted. Try again.",
  PROVIDER_ERROR: "This picture wasn't made, so it wasn't counted. Try again.",
  // A full library has its own words (STORAGE_FULL); anything else is our side, never the person's library (stage 202).
  SAVE: "The picture was made but couldn't be saved to your library. Try again in a moment.",
};

const VIDEO_FAILED: Record<string, string> = {
  BLOCKED: "That video can't be made: the model's safety checks refused it. Try describing it differently.",
  PROVIDER_BUSY: "The video service is busy, so this wasn't counted. Try again in a few minutes.",
  INCOMPLETE: "No video came back, so it wasn't counted. Try again.",
  PROVIDER_ERROR: "The video didn't render, so it wasn't counted. Try again.",
  SAVE: "The video was made but couldn't be saved to your library, so it wasn't counted. Try again in a moment.",
};

function reservationMessage(code: string, message: string): StudioFailure {
  return refused(code === "QUOTA_EXCEEDED" || code === "TRIAL_CAP_REACHED" ? 402 : code === "PLATFORM_DAILY_LIMIT" ? 429 : 503, message);
}

/** Gemini's nearest shape for a studio shape (its 7 aspect ratios cover all of them). */
const GEMINI_ASPECT: Record<string, AspectRatio> = { "1:1": "1:1", "4:5": "4:5", "2:3": "2:3", "9:16": "9:16", "3:2": "3:2", "16:9": "16:9", "21:9": "21:9" };

function sumUsage(model: string, parts: ProviderUsage[]): ProviderUsage | null {
  if (parts.length === 0) return null;
  return parts.reduce<ProviderUsage>(
    (a, u) => ({ ...a, inputTokens: a.inputTokens + u.inputTokens, outputTokens: a.outputTokens + u.outputTokens, cacheReadTokens: (a.cacheReadTokens ?? 0) + (u.cacheReadTokens ?? 0) }),
    { model, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 },
  );
}

const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

/** Pictures to work from, in base64, times the pictures asked for: kept under this so one request can't fill the server's memory. */
const REFERENCE_BUDGET = 48_000_000;

/** Gives back the usage of renders a stopped server left behind, and marks them failed. Quietly does nothing when it can't. */
export async function reclaimRenders(deps: Pick<StudioDeps, "usage" | "writes">, i: { orgId: string; userId: string }): Promise<void> {
  const left = await deps.writes.reclaim({ orgId: i.orgId, actor: i.userId });
  if (!left.ok) return;
  for (const r of left.value) if (r.usageEntry) await refundUsage(deps.usage, { orgId: i.orgId, entryId: r.usageEntry, usage: null, reason: "failed" });
}

/** Pictures: checked, reserved, then made in parallel. */
export async function prepareImages(deps: StudioDeps, input: { orgId: string; userId: string; request: StudioImageRequest; batchId: string }): Promise<StudioFailure | PreparedStudio> {
  const { orgId, userId, request, batchId } = input;
  const engine = deps.openai ? ({ kind: "openai", model: deps.openai.model } as const) : deps.gemini ? ({ kind: "gemini", model: deps.gemini.model } as const) : null;
  if (!engine) return refused(503, "Image making isn't connected on this server yet. Your library stays readable.");

  const references = request.references.length ? await deps.pictures(request.references) : [];
  if (references.length !== request.references.length) return refused(404, "A picture you chose to work from isn't in your library any more.");
  if (references.reduce((n, r) => n + r.data.length, 0) * request.count > REFERENCE_BUDGET) return refused(413, "Those pictures are large: work from fewer of them, or make fewer pictures at once.");

  const plan = await resolvePlan(deps.usage, orgId);
  if (!plan.ok) return refused(503, plan.message);

  const prompt = imagePrompt(request.prompt, request.style);
  const shape = shapeOf(request.shape);
  const quality = IMAGE_DETAIL.find((d) => d.id === request.detail)!.quality;
  const perImage =
    engine.kind === "openai"
      ? reserveUnits(engine.model, approxTokens(prompt) + references.length * 1_600, Math.ceil(imageOutputTokens(request.shape, request.detail) * 1.25))
      : reserveUnits(engine.model, approxTokens(prompt) + references.length * 1_300, 1_400);
  const reserved = await reserveUsage(deps.usage, { orgId, userId, taskId: null, operation: "image_generation", units: perImage * request.count, manual: MANUAL, billing: plan.value });
  if (!reserved.ok) return reservationMessage(reserved.code, reserved.message);
  const entry = { orgId, entryId: reserved.value.entryId };
  const settings = { shape: request.shape, detail: request.detail, style: request.style, format: request.format, transparent: request.transparent, references: request.references };

  // A picture the model has started is paid for, so it finishes and lands in the library even if the person stops watching.
  const keepGoing = new AbortController().signal;
  const estimate: ProviderUsage = {
    model: engine.model,
    inputTokens: approxTokens(prompt) + references.length * 1_600,
    outputTokens: engine.kind === "openai" ? imageOutputTokens(request.shape, request.detail) : 1_120,
    cacheWriteTokens: 0,
    cacheReadTokens: 0,
  };
  return {
    ok: true,
    batchId,
    async run(emit, signal) {
      emit({ type: "start", batchId, count: request.count });
      const spent: ProviderUsage[] = [];
      let made = 0;
      const one = async (index: number) => {
        let outcome: { ok: true; data: string; mime: string; usage: ProviderUsage } | { ok: false; failure: DraftFailure | "BLOCKED"; usage: ProviderUsage | null };
        if (engine.kind === "openai") {
          outcome = await deps.openai!.make(
            { prompt, width: shape.width, height: shape.height, quality, format: request.format, transparent: request.transparent, references: references.map((r) => ({ mime: r.mime, data: r.data })), safetyId: deps.safetyId },
            (data, mime) => emit({ type: "partial", index, data, mime }),
            keepGoing,
          );
        } else {
          const r = await deps.gemini!.generate({ prompt, aspectRatio: GEMINI_ASPECT[request.shape] ?? "1:1", references: references.map((x) => ({ mimeType: x.mime, data: x.data })) }, keepGoing).catch(() => ({ ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null }));
          outcome = r.ok ? { ok: true, data: toBase64(r.bytes), mime: r.mimeType, usage: r.usage } : { ok: false, failure: r.failure, usage: r.usage };
        }
        // A picture made without a usage figure is paid at the estimate, never at nothing.
        if (outcome.ok) spent.push(outcome.usage.outputTokens > 0 ? outcome.usage : estimate);
        else if (outcome.usage) spent.push(outcome.usage);
        if (!outcome.ok) {
          emit({ type: "failed", index, error: IMAGE_FAILED[outcome.failure] ?? IMAGE_FAILED.PROVIDER_ERROR! });
          return;
        }
        const bytes = Buffer.from(outcome.data, "base64");
        const size = imageSize(bytes);
        const mime = ["image/png", "image/jpeg", "image/webp"].includes(outcome.mime) ? outcome.mime : "image/png";
        const saved = await deps.writes.save({
          orgId,
          actor: userId,
          batchId,
          kind: "image",
          prompt: request.prompt,
          settings,
          model: engine.model,
          parentId: request.references[0] ?? null,
          mime,
          size: bytes.length,
          sha256: await sha256Hex(bytes),
          content: outcome.data,
          width: size?.width ?? shape.width,
          height: size?.height ?? shape.height,
        });
        if (!saved.ok) {
          const full = saved.error.includes("STORAGE_FULL");
          if (!full) log("error", "studio.save_failed", { kind: "image", org: orgId, error: saved.error });
          emit({ type: "failed", index, error: full ? "Your studio library is full (500 MB). Delete some pictures or videos, then try again." : IMAGE_FAILED.SAVE! });
          return;
        }
        made += 1;
        emit({
          type: "item",
          index,
          item: {
            id: saved.value,
            batchId,
            kind: "image",
            status: "ready",
            prompt: request.prompt,
            settings,
            mime,
            width: size?.width ?? shape.width,
            height: size?.height ?? shape.height,
            durationMs: null,
            sizeBytes: bytes.length,
            error: null,
            parentId: request.references[0] ?? null,
            createdAt: new Date(deps.now()).toISOString(),
          },
        });
      };
      await Promise.all(Array.from({ length: request.count }, (_, i) => one(i)));
      const usage = sumUsage(engine.model, spent);
      // What was made is paid for; a batch that made nothing is given back whole.
      if (made > 0 && usage) await settleUsage(deps.usage, { ...entry, usage });
      else await refundUsage(deps.usage, { ...entry, usage, reason: "failed" });
      void signal;
      emit({ type: "done", made, error: made === 0 ? "Nothing was made, so nothing was counted." : null });
    },
  };
}

/** A video: checked, reserved, a working row, then rendered with progress. */
export async function prepareVideo(deps: StudioDeps, input: { orgId: string; userId: string; request: StudioVideoRequest; batchId: string }): Promise<StudioFailure | PreparedStudio> {
  const { orgId, userId, request, batchId } = input;
  if (!deps.video) return refused(503, "Video making isn't connected on this server yet. Your library stays readable.");
  const still = request.still ? (await deps.pictures([request.still]))[0] : null;
  if (request.still && !still) return refused(404, "The picture you chose to start from isn't in your library any more.");

  await reclaimRenders(deps, { orgId, userId });
  const plan = await resolvePlan(deps.usage, orgId);
  if (!plan.ok) return refused(503, plan.message);
  const prompt = videoPrompt(request.prompt, request.style);
  const units = reserveUnits(deps.video.model, approxTokens(prompt) + (still ? 1_300 : 0), Math.ceil(videoTokens(request.seconds, request.resolution) * 1.1));
  const reserved = await reserveUsage(deps.usage, { orgId, userId, taskId: null, operation: "video_generation", units, manual: MANUAL, billing: plan.value });
  if (!reserved.ok) return reservationMessage(reserved.code, reserved.message);
  const entry = { orgId, entryId: reserved.value.entryId };
  const settings = { shape: request.shape, seconds: request.seconds, resolution: request.resolution, style: request.style };

  const begun = await deps.writes.begin({ orgId, actor: userId, batchId, prompt: request.prompt, settings, model: deps.video.model, parentId: request.still, usageEntry: reserved.value.entryId });
  if (!begun.ok) {
    await refundUsage(deps.usage, { ...entry, usage: null, reason: "failed" });
    return refused(begun.error.includes("TOO_MANY_RENDERS") ? 429 : begun.error.includes("STORAGE_FULL") ? 409 : 503, begun.error.includes("TOO_MANY_RENDERS") ? "Three videos are already rendering. Wait for one to finish." : begun.error.includes("STORAGE_FULL") ? "Your studio library is full (500 MB). Delete some pictures or videos, then try again." : "The video couldn't start. Try again.");
  }
  const id = begun.value;
  const video = deps.video;
  const working: StudioItem = {
    id,
    batchId,
    kind: "video",
    status: "working",
    prompt: request.prompt,
    settings,
    mime: null,
    width: null,
    height: null,
    durationMs: null,
    sizeBytes: 0,
    error: null,
    parentId: request.still,
    createdAt: new Date(deps.now()).toISOString(),
  };

  return {
    ok: true,
    batchId,
    async run(emit, signal) {
      emit({ type: "start", batchId, count: 1 });
      emit({ type: "item", index: 0, item: working });
      const started = deps.now();
      const tick = setInterval(() => {
        try {
          emit({ type: "progress", seconds: Math.round((deps.now() - started) / 1_000) });
        } catch {
          // Gone: the render carries on and is saved.
        }
      }, 5_000);
      // The render carries on if the person leaves the page: it's paid for and lands in their library. Only the server's own limits stop it.
      void signal;
      const outcome = await video.make({ prompt, shape: request.shape, seconds: request.seconds, resolution: request.resolution, still: still ? { mime: still.mime, data: still.data } : null }, new AbortController().signal).catch(() => ({ ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null }));
      clearInterval(tick);
      const fail = async (message: string, usage: ProviderUsage | null) => {
        await deps.writes.fail({ orgId, actor: userId, id, error: message });
        await refundUsage(deps.usage, { ...entry, usage, reason: "failed" });
        emit({ type: "failed", index: 0, error: message });
        emit({ type: "done", made: 0, error: message });
      };
      if (!outcome.ok) return fail(VIDEO_FAILED[outcome.failure] ?? VIDEO_FAILED.PROVIDER_ERROR!, outcome.usage);
      const isMp4 = outcome.bytes.length > 12 && new TextDecoder("latin1").decode(outcome.bytes.subarray(4, 8)) === "ftyp";
      if (!isMp4) return fail(VIDEO_FAILED.INCOMPLETE!, null);
      const finished = await deps.writes.finish({
        orgId,
        actor: userId,
        id,
        mime: "video/mp4",
        size: outcome.bytes.length,
        sha256: await sha256Hex(outcome.bytes),
        content: toBase64(outcome.bytes),
        width: null,
        height: null,
        durationMs: request.seconds * 1_000,
      });
      if (!finished.ok && !finished.error.includes("STORAGE_FULL") && !finished.error.includes("FILE_TOO_LARGE")) log("error", "studio.save_failed", { kind: "video", org: orgId, error: finished.error });
      if (!finished.ok) return fail(finished.error.includes("STORAGE_FULL") || finished.error.includes("FILE_TOO_LARGE") ? "The video was made but is too large for your library. Delete some items, or try a shorter or lower resolution video." : VIDEO_FAILED.SAVE!, outcome.usage);
      await settleUsage(deps.usage, { ...entry, usage: outcome.usage });
      emit({ type: "item", index: 0, item: { ...working, status: "ready", mime: "video/mp4", sizeBytes: outcome.bytes.length, durationMs: request.seconds * 1_000 } });
      emit({ type: "done", made: 1, error: null });
    },
  };
}
