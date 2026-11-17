/**
 * What every studio route checks first (stage 201, ADR 0216), the way chat's turn does: same origin, signed in, a workspace that
 * takes changes, a role that may use its AI, and Farbaek's AI not paused. Then the engines and the dependencies the studio's
 * flows run on. Answers as JSON before anything streams.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { encodeEvent, encodeKeepAlive } from "@/core/chat/sse";
import type { StudioEvent } from "@/core/studio/studio";
import { platformPause } from "@/server/platform/state";
import { geminiVideoEngine } from "@/server/ai/gemini-video";
import { imageGeneration } from "@/server/ai/image-config";
import { openAiImageEngine } from "@/server/ai/openai-image";
import { log } from "@/server/observability/log";
import { sameOrigin } from "@/server/sandbox/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import { sha256Hex } from "@/core/workspace/device-copy";
import { createStudioWrites, type PreparedStudio, type StudioDeps } from "./studio";

export const studioJson = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "no-store" } });
export const studioRefuse = (message: string, status: number) => studioJson({ ok: false, message }, status);

export type StudioGate = { ok: false; response: Response } | { ok: true; orgId: string; userId: string; user: SupabaseClient; admin: SupabaseClient };

/** The checks before any studio write. */
export async function studioGate(request: Request): Promise<StudioGate> {
  const no = (message: string, status: number) => ({ ok: false as const, response: studioRefuse(message, status) });
  if (!sameOrigin(request)) return no("This request didn't come from Farbaek.", 403);
  const ctx = await loadAppContext();
  if (!ctx) return no("You're signed out. Sign in, then try again.", 401);
  if (ctx.mode === "demo") return no("The demo workspace is read-only, so making is off.", 403);
  if (!ctx.current) return no("Create a workspace first.", 403);
  if (!ctx.writes.enabled) return no(ctx.writes.reason ?? "Changes are off for this workspace right now.", 403);
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return no("Viewers can see the workspace but can't use its AI.", 403);
  const paused = platformPause("ai_runs");
  if (paused) return no(paused, 503);
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return no("The studios aren't set up on this server.", 503);
  // What's made has to be kept. If the library can't be reached (stage 202: its table was missing in production for a morning),
  // stop before the provider is asked, so nothing is made that would be paid for and then lost.
  const library = await user.from("studio_media").select("id").eq("org_id", ctx.current.id).limit(1);
  if (library.error) {
    log("error", "studio.library_unreachable", { org: ctx.current.id, error: library.error.message });
    return no("Your library can't be reached right now, so nothing was made or counted. Try again in a moment.", 503);
  }
  return { ok: true, orgId: ctx.current.id, userId: ctx.user.id, user, admin };
}

/** A per-person limit on top of the plan's usage: keeps a stuck script from emptying it. Null when it couldn't be checked. */
export async function studioLimit(admin: SupabaseClient, key: string, seconds: number, max: number): Promise<boolean | null> {
  const r = await admin.rpc("app_rate_limit", { p_key: key, p_window_seconds: seconds, p_limit: max });
  return r.error ? null : r.data === true;
}

/** The studio's dependencies for one person in one workspace. */
export async function studioDeps(gate: Extract<StudioGate, { ok: true }>): Promise<StudioDeps> {
  const writes = createStudioWrites(gate.admin);
  return {
    usage: createSupabaseWriteDeps(gate.user, gate.admin, gate.userId),
    writes,
    pictures: async (ids) => {
      const { data, error } = await gate.user.from("studio_media").select("id, mime, content").in("id", ids).eq("org_id", gate.orgId).eq("status", "ready").in("kind", ["image", "upload"]);
      if (error || !data) return [];
      return data.flatMap((r) => (typeof r.content === "string" && typeof r.mime === "string" ? [{ id: String(r.id), mime: r.mime, data: r.content }] : []));
    },
    openai: openAiImageEngine(),
    gemini: imageGeneration().generator,
    video: geminiVideoEngine(),
    // Not the person's id: a hash OpenAI's abuse checks can tell people apart by.
    safetyId: (await sha256Hex(`farbaek-studio:${gate.userId}`)).slice(0, 40),
    now: () => Date.now(),
  };
}

/** Streams a prepared studio request as Server-Sent Events, with a keep-alive every 15 seconds. */
export function studioStream(prepared: PreparedStudio, request: Request, what: string): Response {
  const abort = new AbortController();
  request.signal.addEventListener("abort", () => abort.abort(), { once: true });
  if (request.signal.aborted) abort.abort();
  let open = true;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (bytes: Uint8Array) => {
        if (!open) return;
        try {
          controller.enqueue(bytes);
        } catch {
          open = false;
        }
      };
      const emit = (e: StudioEvent) => send(encodeEvent(e.type, e));
      const keepAlive = setInterval(() => send(encodeKeepAlive()), 15_000);
      prepared
        .run(emit, abort.signal)
        .catch((error: unknown) => log("error", `studio.${what}_failed`, { reason: error instanceof Error ? error.name : "unknown" }))
        .finally(() => {
          clearInterval(keepAlive);
          if (open) {
            open = false;
            try {
              controller.close();
            } catch {
              // Already closed.
            }
          }
        });
    },
    cancel() {
      open = false;
    },
  });
  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store, no-transform", "x-accel-buffering": "no" } });
}
