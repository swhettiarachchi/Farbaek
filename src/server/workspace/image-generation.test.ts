import { describe, expect, it } from "vitest";
import type { ImageGenerator, ImageOutcome } from "@/server/ai/gemini-image";
import type { AiUsageDeps } from "./ai-usage";
import type { FileDeps } from "./files";
import { generateProjectImage, imageStem } from "./image-generation";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const USAGE = { model: "gemini-3.1-flash-lite-image", inputTokens: 20, outputTokens: 1120 };

function fakeGenerator(outcome: ImageOutcome | Error): ImageGenerator & { prompts: string[] } {
  const g = {
    model: "gemini-3.1-flash-lite-image",
    prompts: [] as string[],
    async generate(input: { prompt: string }) {
      g.prompts.push(input.prompt);
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return g;
}

function fakeDeps(over: { role?: OrgRole; saveError?: string } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & FileDeps & AiUsageDeps = {
    role: async () => over.role ?? "member",
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    importFiles: async () => ({ ok: true, value: { created: 0, updated: 0, unchanged: 0 } }),
    saveFile: async () => ({ ok: true, value: 1 }),
    saveImage: async (input) => (calls.push({ name: "saveImage", input }), over.saveError ? { ok: false, error: over.saveError } : { ok: true, value: 1 }),
    deleteFile: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    newEventId: () => "e1",
    now: () => new Date("2026-10-29T10:00:00Z"),
  };
  return { deps, calls };
}

const input = { orgId: "o1", userId: "u1", projectId: "p1", prompt: "A warm bakery storefront at dawn", aspectRatio: "16:9", name: "assets/hero", existingPaths: new Set<string>() };

describe("generating an image into a project (ADR 0109)", () => {
  it("reserves usage, saves the image under a name from its real kind, and settles to the reported usage", async () => {
    const { deps, calls } = fakeDeps();
    const gen = fakeGenerator({ ok: true, bytes: PNG, mimeType: "image/png", usage: USAGE });
    const r = await generateProjectImage(deps, gen, { ...input, existingPaths: new Set(["assets/hero.png"]) });
    expect(r).toEqual({ ok: true, value: { path: "assets/hero-2.png", revision: 1, model: "gemini-3.1-flash-lite-image" } });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "saveImage", "settle"]);
    expect(calls[0]!.input).toMatchObject({ operation: "image_generation", taskId: null });
    expect(calls[2]!.input).toMatchObject({ status: "settled", units: 336 + 1 });
    // A JPEG becomes .jpg, whatever the name asked for.
    const jpeg = fakeDeps();
    expect(await generateProjectImage(jpeg.deps, fakeGenerator({ ok: true, bytes: JPEG, mimeType: "image/jpeg", usage: USAGE }), { ...input, name: "Hero Photo.png" })).toMatchObject({ ok: true, value: { path: "assets/hero-photo.jpg" } });
  });

  it("refunds when Google declines, fails or sends something that isn't an image, and when the image can't be saved", async () => {
    for (const [outcome, code] of [
      [{ ok: false, failure: "REFUSED", usage: null }, "AI_REFUSED"],
      [{ ok: false, failure: "PROVIDER_BUSY", usage: null }, "AI_BUSY"],
      [new Error("network"), "AI_INCOMPLETE"],
      [{ ok: true, bytes: new TextEncoder().encode("<html>"), mimeType: "image/png", usage: USAGE }, "AI_INCOMPLETE"],
    ] as const) {
      const { deps, calls } = fakeDeps();
      const r = await generateProjectImage(deps, fakeGenerator(outcome as ImageOutcome | Error), input);
      expect(r).toMatchObject({ ok: false, code });
      expect(calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "refunded", refundReason: "failed" });
      expect(calls.some((c) => c.name === "saveImage")).toBe(false);
    }
    const full = fakeDeps({ saveError: "PROJECT_TOO_LARGE" });
    expect(await generateProjectImage(full.deps, fakeGenerator({ ok: true, bytes: PNG, mimeType: "image/png", usage: USAGE }), input)).toMatchObject({ ok: false, code: "PROJECT_TOO_LARGE" });
    expect(full.calls.at(-1)).toMatchObject({ name: "settle", input: { status: "refunded" } });
  });

  it("checks the person, the server and the request before reserving anything", async () => {
    const viewer = fakeDeps({ role: "viewer" });
    expect((await generateProjectImage(viewer.deps, fakeGenerator({ ok: true, bytes: PNG, mimeType: "image/png", usage: USAGE }), input)).ok).toBe(false);
    const { deps, calls } = fakeDeps();
    expect(await generateProjectImage(deps, null, input)).toMatchObject({ ok: false, code: "AI_UNAVAILABLE" });
    expect(await generateProjectImage(deps, fakeGenerator({ ok: true, bytes: PNG, mimeType: "image/png", usage: USAGE }), { ...input, prompt: "x" })).toMatchObject({ ok: false, code: "INVALID_IMAGE" });
    expect(await generateProjectImage(deps, fakeGenerator({ ok: true, bytes: PNG, mimeType: "image/png", usage: USAGE }), { ...input, aspectRatio: "7:3" })).toMatchObject({ ok: false, code: "INVALID_IMAGE" });
    expect(await generateProjectImage(deps, fakeGenerator({ ok: true, bytes: PNG, mimeType: "image/png", usage: USAGE }), { ...input, name: "../../etc" })).toMatchObject({ ok: false });
    expect(calls).toEqual([]);
  });

  it("turns a name into a folder and a stem", () => {
    expect([imageStem("Hero Photo"), imageStem("assets/hero.png"), imageStem("img/Team Picture.JPG"), imageStem("  "), imageStem("../x")]).toEqual(["assets/hero-photo", "assets/hero", "img/team-picture", null, null]);
  });
});
