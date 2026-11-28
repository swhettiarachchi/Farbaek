/**
 * Several confirmed one after another (stage 303): a press made on the version the page showed lands on the newer one another press saved,
 * when the item is exactly as the surveyor saw it; a changed item asks for a reload. SYNTHETIC values only (fixture.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SurveyDocument } from "@/core/survey/document";

const { saved, stored } = vi.hoisted(() => ({ saved: [] as Record<string, unknown>[], stored: { latest: null as unknown, version: 4, seen: null as unknown } }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT ${to}`); } }));
vi.mock("@/server/workspace/context", () => ({
  loadAppContext: async () => ({ mode: "live", current: { id: "org-1" }, user: { id: "user-1" }, role: "owner", writes: { enabled: true, reason: "" } }),
}));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/server/survey/store", async () => {
  const actual = await vi.importActual<typeof import("@/server/survey/store")>("@/server/survey/store");
  return { ...actual, surveyStore: { saveDrawing: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => (saved.push(input), { ok: true, value: 5 }) } };
});
vi.mock("@/server/survey/read", async () => {
  const { SYNTH_POINTS } = await import("@/core/survey/sketchintel/fixture");
  return {
    loadSurveyProject: async () => ({
      project: { id: "11111111-1111-4111-8111-111111111111", crsId: "LOCAL", crsConfirmedAt: "2026-11-23T10:00:00.000Z" },
      points: SYNTH_POINTS,
      sources: [],
      drawing: { readable: true, document: stored.latest, version: stored.version },
      versions: [],
      approvals: [],
      exports: [],
      profiles: [],
    }),
    loadSurveyDrawing: async () => (stored.seen ? { readable: true, document: stored.seen, version: 3 } : null),
  };
});

const { confirmSurveyItemAction } = await import("./actions");
const { commonCodes } = await import("@/core/survey/codes");
const { emptyDocument } = await import("@/core/survey/document");
const { applySketch } = await import("@/core/survey/sketchintel/apply");
const { SYNTH_DRAWING, SYNTH_POINTS } = await import("@/core/survey/sketchintel/fixture");
const { interpretDocument } = await import("@/core/survey/sketchintel/findings");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const drawn = (): SurveyDocument => {
  const doc: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [], unreadable: [], drawing: SYNTH_DRAWING } };
  return applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
};

beforeEach(() => {
  saved.length = 0;
});

describe("confirming one item after another", () => {
  it("lands on the newer version when the item is as the surveyor saw it", async () => {
    const seen = drawn();
    const [a, b] = Object.keys(seen.provenance).filter((k) => k.startsWith("feature:"));
    // Version 4: another item confirmed by the press before this one.
    stored.seen = seen;
    stored.latest = { ...seen, provenance: { ...seen.provenance, [a!]: { source: "ai_photo", reviewed: true } } };
    const r = await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key: b!, confirmed: true });
    expect(r).toMatchObject({ status: "done" });
    expect(saved[0]!.baseVersion).toBe(4);
    const doc = saved[0]!.document as SurveyDocument;
    expect(doc.provenance[a!]).toEqual({ source: "ai_photo", reviewed: true });
    expect(doc.provenance[b!]).toEqual({ source: "ai_photo", reviewed: true });
  });

  it("asks for a reload when the item changed in between, or the earlier version can't be read", async () => {
    const seen = drawn();
    const key = Object.keys(seen.provenance).find((k) => k.startsWith("feature:"))!;
    const id = key.slice("feature:".length);
    stored.seen = seen;
    stored.latest = { ...seen, features: seen.features.map((f) => (f.id === id ? { ...f, code: "NF" } : f)) };
    expect(await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key, confirmed: true })).toMatchObject({ status: "error" });
    // Another item redrawn in between (a new reading, a correction): the page showed something else, so a reload is asked for.
    const other = Object.keys(seen.provenance).filter((k) => k.startsWith("feature:"))[1]!.slice("feature:".length);
    stored.latest = { ...seen, features: seen.features.map((f) => (f.id === other ? { ...f, layer: "FENCES" as const } : f)) };
    expect(await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key, confirmed: true })).toMatchObject({ status: "error" });
    stored.seen = null;
    stored.latest = seen;
    expect(await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key, confirmed: true })).toMatchObject({ status: "error" });
    expect(saved).toEqual([]);
  });
});
