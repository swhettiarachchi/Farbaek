import { describe, expect, it } from "vitest";
import type { StudioEvent, StudioImageRequest, StudioVideoRequest } from "@/core/studio/studio";
import { createOpenAiImageEngine, failureOf, readEvents, type StudioImageEngine } from "@/server/ai/openai-image";
import { findVideo, type VideoEngine } from "@/server/ai/gemini-video";
import type { AiUsageDeps, UsageContext } from "@/server/workspace/ai-usage";
import { prepareImages, prepareVideo, toItem, type StudioDeps, type StudioWrites } from "./studio";

// A 1x1 PNG.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
const MP4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32, 0, 0, 0, 0]);

function fakeDeps(over: Partial<StudioDeps> = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const usage: UsageContext & AiUsageDeps = {
    billing: async () => ({ state: "active", paidPlanId: "pro" }) as never,
    now: () => new Date("2026-11-17T10:00:00Z"),
    newEventId: () => "e1",
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: input.status === "refunded" ? "refund" : "settle", input }), { ok: true, value: null }),
  };
  let n = 0;
  const writes: StudioWrites = {
    save: async (input) => (calls.push({ name: "save", input }), { ok: true, value: `img-${++n}` }),
    begin: async (input) => (calls.push({ name: "begin", input }), { ok: true, value: "vid-1" }),
    reclaim: async (input) => (calls.push({ name: "reclaim", input }), { ok: true, value: [{ id: "old", usageEntry: "entry-old" }] }),
    finish: async (input) => (calls.push({ name: "finish", input }), { ok: true, value: null }),
    fail: async (input) => (calls.push({ name: "fail", input }), { ok: true, value: null }),
    remove: async () => ({ ok: true, value: null }),
  };
  const deps: StudioDeps = {
    usage,
    writes,
    pictures: async (ids) => ids.map((id) => ({ id, mime: "image/png", data: PNG })),
    openai: null,
    gemini: null,
    video: null,
    safetyId: "person-hash",
    now: () => Date.parse("2026-11-17T10:00:00Z"),
    ...over,
  };
  return { deps, calls };
}

const imageRequest = (over: Partial<StudioImageRequest> = {}): StudioImageRequest => ({ prompt: "A loaf of sourdough on linen", shape: "4:5", detail: "high", style: "photo", format: "webp", transparent: false, count: 2, references: [], ...over });
const videoRequest = (over: Partial<StudioVideoRequest> = {}): StudioVideoRequest => ({ prompt: "Waves at dawn", shape: "16:9", seconds: 8, resolution: "720p", style: "cinematic", still: null, ...over });

async function run(prepared: Awaited<ReturnType<typeof prepareImages>>) {
  const events: StudioEvent[] = [];
  if (prepared.ok) await prepared.run((e) => events.push(e), new AbortController().signal);
  return events;
}

const engine = (results: ("ok" | "blocked" | "busy")[]): StudioImageEngine & { inputs: unknown[] } => {
  let i = 0;
  const e = {
    model: "gpt-image-2.5-sunburst",
    inputs: [] as unknown[],
    async make(input: unknown, onPartial: (d: string, m: string) => void) {
      e.inputs.push(input);
      const r = results[i++ % results.length];
      if (r === "blocked") return { ok: false as const, failure: "BLOCKED" as const, usage: null };
      if (r === "busy") return { ok: false as const, failure: "PROVIDER_BUSY" as const, usage: null };
      onPartial(PNG, "image/webp");
      return { ok: true as const, data: PNG, mime: "image/webp", usage: { model: "gpt-image-2.5-sunburst", inputTokens: 40, outputTokens: 2_000 } };
    },
  };
  return e;
};

describe("the image studio (stage 201)", () => {
  it("says so when no image model is connected, and reserves nothing", async () => {
    const { deps, calls } = fakeDeps();
    expect(await prepareImages(deps, { orgId: "o", userId: "u", request: imageRequest(), batchId: "b" })).toMatchObject({ ok: false, status: 503 });
    expect(calls).toEqual([]);
  });

  it("makes each picture with a first look, saves it, and settles to what was made", async () => {
    const openai = engine(["ok", "ok"]);
    const { deps, calls } = fakeDeps({ openai });
    const events = await run(await prepareImages(deps, { orgId: "o", userId: "u", request: imageRequest(), batchId: "b" }));
    expect(events.filter((e) => e.type === "partial")).toHaveLength(2);
    expect(events.filter((e) => e.type === "item")).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: "done", made: 2, error: null });
    expect(calls.filter((c) => c.name === "save")[0]!.input).toMatchObject({ kind: "image", prompt: "A loaf of sourdough on linen", model: "gpt-image-2.5-sunburst", mime: "image/webp" });
    expect(calls.find((c) => c.name === "settle")!.input.usage).toMatchObject({ outputTokens: 4_000 });
    // The style's brief follows the person's words, at the shape's own size.
    expect(openai.inputs[0]).toMatchObject({ width: 1024, height: 1280, quality: "high", prompt: expect.stringContaining("A loaf of sourdough on linen\n\nA real photograph") });
  });

  it("says why a refused picture wasn't made, and gives everything back when nothing was", async () => {
    const { deps, calls } = fakeDeps({ openai: engine(["blocked", "busy"]) });
    const events = await run(await prepareImages(deps, { orgId: "o", userId: "u", request: imageRequest(), batchId: "b" }));
    expect(events.find((e) => e.type === "failed")).toMatchObject({ error: expect.stringContaining("safety checks") });
    expect(events.at(-1)).toMatchObject({ type: "done", made: 0 });
    expect(calls.some((c) => c.name === "settle")).toBe(false);
    expect(calls.some((c) => c.name === "refund")).toBe(true);
  });

  it("works from the person's own pictures, and refuses one that's gone", async () => {
    const openai = engine(["ok"]);
    const { deps } = fakeDeps({ openai });
    await run(await prepareImages(deps, { orgId: "o", userId: "u", request: imageRequest({ count: 1, references: ["00000000-0000-4000-8000-000000000001"] }), batchId: "b" }));
    expect(openai.inputs[0]).toMatchObject({ references: [{ mime: "image/png" }] });
    const gone = fakeDeps({ openai, pictures: async () => [] });
    expect(await prepareImages(gone.deps, { orgId: "o", userId: "u", request: imageRequest({ references: ["00000000-0000-4000-8000-000000000001"] }), batchId: "b" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("the video studio (stage 201)", () => {
  const video = (ok: boolean): VideoEngine => ({
    model: "gemini-omni-1.2-flash",
    make: async () => (ok ? { ok: true, bytes: MP4, mime: "video/mp4", usage: { model: "gemini-omni-1.2-flash", inputTokens: 10, outputTokens: 46_336 } } : { ok: false, failure: "PROVIDER_BUSY", usage: null }),
  });

  it("renders in a working row, keeps the video and settles to its length", async () => {
    const { deps, calls } = fakeDeps({ video: video(true) });
    const events = await run(await prepareVideo(deps, { orgId: "o", userId: "u", request: videoRequest(), batchId: "b" }));
    expect(calls.find((c) => c.name === "reserve")!.input.operation).toBe("video_generation");
    // A render a stopped server left behind was given back first, and the new one carries its reservation.
    expect(calls.find((c) => c.name === "refund")!.input.entryId).toBe("entry-old");
    expect(calls.find((c) => c.name === "begin")!.input.usageEntry).toBe("entry-1");
    expect(events.filter((e) => e.type === "item").map((e) => (e.type === "item" ? e.item.status : null))).toEqual(["working", "ready"]);
    expect(calls.find((c) => c.name === "finish")!.input).toMatchObject({ mime: "video/mp4", durationMs: 8_000 });
    expect(calls.find((c) => c.name === "settle")!.input.usage.outputTokens).toBe(46_336);
  });

  it("marks a failed render and gives the usage back", async () => {
    const { deps, calls } = fakeDeps({ video: video(false) });
    const events = await run(await prepareVideo(deps, { orgId: "o", userId: "u", request: videoRequest(), batchId: "b" }));
    expect(calls.find((c) => c.name === "fail")!.input.error).toContain("busy");
    expect(calls.some((c) => c.name === "refund")).toBe(true);
    expect(events.at(-1)).toMatchObject({ type: "done", made: 0 });
  });

  it("reads a render left working for 15 minutes as failed", () => {
    const row = { id: "v", batch_id: "b", kind: "video" as const, status: "working" as const, prompt: "p", settings: {}, mime: null, width: null, height: null, duration_ms: null, size_bytes: 0, error: null, parent_id: null, created_at: "2026-11-17T10:00:00Z" };
    expect(toItem(row, Date.parse("2026-11-17T10:20:00Z"))).toMatchObject({ status: "failed", error: expect.stringContaining("wasn't counted") });
    expect(toItem(row, Date.parse("2026-11-17T10:05:00Z")).status).toBe("working");
  });
});

describe("the providers' replies", () => {
  it("reads OpenAI's streamed events and its refusals", async () => {
    const body = new Response('event: image_generation.partial_image\ndata: {"type":"image_generation.partial_image","b64_json":"AAA","partial_image_index":0}\n\nevent: image_generation.completed\ndata: {"type":"image_generation.completed","b64_json":"BBB","usage":{"input_tokens":5,"output_tokens":9}}\n\n').body!;
    const seen = [];
    for await (const e of readEvents(body)) seen.push(e.event);
    expect(seen).toEqual(["image_generation.partial_image", "image_generation.completed"]);
    expect(failureOf(400, { error: { code: "moderation_blocked", type: "image_generation_user_error" } })).toBe("BLOCKED");
    expect(failureOf(429, null)).toBe("PROVIDER_BUSY");
    expect(failureOf(400, { error: { code: "invalid_value" } })).toBe("PROVIDER_ERROR");
  });

  it("sends a picture request to OpenAI and returns the finished image with its usage", async () => {
    const sent: { url: string; body: Record<string, unknown> }[] = [];
    const fakeFetch = (async (url: string, init: RequestInit) => {
      sent.push({ url, body: JSON.parse(String(init.body)) });
      return new Response('data: {"type":"image_edit.completed","b64_json":"CCC","usage":{"input_tokens":7,"output_tokens":11}}\n\n', { status: 200 });
    }) as unknown as typeof fetch;
    const e = createOpenAiImageEngine({ apiKey: "test", fetch: fakeFetch });
    const out = await e.make({ prompt: "p", width: 1024, height: 1280, quality: "high", format: "webp", transparent: false, references: [{ mime: "image/png", data: PNG }], safetyId: "s" }, () => {}, new AbortController().signal);
    expect(out).toMatchObject({ ok: true, data: "CCC", mime: "image/webp", usage: { outputTokens: 11 } });
    expect(sent[0]!.url).toBe("https://api.openai.com/v1/images/edits");
    expect(sent[0]!.body).toMatchObject({ model: "gpt-image-2.5-sunburst", size: "1024x1280", n: 1, stream: true, images: [{ image_url: expect.stringMatching(/^data:image\/png;base64,/) }] });
  });

  it("finds Gemini's video inline or by address, and only on Google's host", () => {
    expect(findVideo({ steps: [{ type: "model_output", content: [{ type: "video", mime_type: "video/mp4", data: "AAA" }] }] })).toEqual({ data: "AAA" });
    expect(findVideo({ steps: [{ type: "model_output", content: [{ type: "video", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc:download?alt=media" }] }] })).toMatchObject({ uri: expect.any(String) });
    expect(findVideo({ steps: [{ type: "model_output", content: [{ type: "video", uri: "https://evil.example/x" }] }] })).toBeNull();
  });
});
