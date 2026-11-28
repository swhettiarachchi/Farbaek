/**
 * "Confirm all" for the sketch's items nothing stands against (stage 294), run as the server runs it with the database standing in:
 * the server works the rule out again, so only items still free of any question are confirmed. SYNTHETIC values only (fixture.ts).
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SurveyDocument } from "@/core/survey/document";

const { saved, stored } = vi.hoisted(() => ({ saved: [] as Record<string, unknown>[], stored: { document: null as unknown, version: 3 } }));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/server/workspace/context", () => ({
  loadAppContext: async () => ({ mode: "live", current: { id: "org-1" }, user: { id: "user-1" }, role: "owner", writes: { enabled: true, reason: "" } }),
}));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
vi.mock("@/server/supabase/server", () => ({ createSupabaseServerClient: async () => ({}) }));
vi.mock("@/server/survey/store", async () => {
  const actual = await vi.importActual<typeof import("@/server/survey/store")>("@/server/survey/store");
  return {
    ...actual,
    surveyStore: {
      saveDrawing: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        saved.push(input);
        return { ok: true, value: 4 };
      },
    },
  };
});
vi.mock("@/server/survey/read", async () => {
  const { SYNTH_POINTS } = await import("@/core/survey/sketchintel/fixture");
  return {
    loadSurveyProject: async () => ({
      project: { id: "11111111-1111-4111-8111-111111111111", crsId: "LOCAL", crsConfirmedAt: "2026-11-23T10:00:00.000Z" },
      points: SYNTH_POINTS,
      sources: [],
      drawing: { readable: true, document: stored.document, version: stored.version },
      versions: [],
      approvals: [],
      exports: [],
      profiles: [],
    }),
  };
});

const { confirmSketchItemsAction, labelLotAction } = await import("./actions");
const { commonCodes } = await import("@/core/survey/codes");
const { emptyDocument } = await import("@/core/survey/document");
const { quietSketchItems } = await import("@/core/survey/exceptions");
const { applySketch } = await import("@/core/survey/sketchintel/apply");
const { SYNTH_DRAWING, SYNTH_POINTS } = await import("@/core/survey/sketchintel/fixture");
const { interpretDocument } = await import("@/core/survey/sketchintel/findings");

const PROJECT = "11111111-1111-4111-8111-111111111111";
/** The synthetic sketch read with certainty and exact numbers, its lot confirmed: the lines round it then have nothing open. */
const applied = (): SurveyDocument => {
  const drawing = { ...SYNTH_DRAWING, lines: SYNTH_DRAWING.lines.map((l) => ({ ...l, certain: true, points: l.points.map((p) => p.replace(/^0+(?=\d)/, "")) })) };
  const doc: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [], unreadable: [], drawing } };
  const out = applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
  const lot = Object.keys(out.provenance).find((k) => k.startsWith("lot:"))!;
  return { ...out, provenance: { ...out.provenance, [lot]: { source: "ai_photo", reviewed: true } } };
};
const savedDoc = () => saved[0]!.document as SurveyDocument;

beforeEach(() => {
  saved.length = 0;
  stored.document = applied();
  stored.version = 3;
});

describe("confirming the sketch's quiet items together", () => {
  it("confirms them all as one new version that says how many, and nothing else", async () => {
    const doc = stored.document as SurveyDocument;
    const quiet = quietSketchItems(doc, SYNTH_POINTS);
    const r = await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 3, keys: quiet });
    expect(r).toMatchObject({ status: "done", version: 4 });
    expect(saved[0]!.note).toBe(`Confirmed together: ${quiet.length} items read from the sketch`);
    for (const key of quiet) expect(savedDoc().provenance[key]).toEqual({ source: "ai_photo", reviewed: true });
    // Everything else read from the photo still waits.
    for (const [key, p] of Object.entries(doc.provenance)) if (!quiet.includes(key)) expect(savedDoc().provenance[key]).toEqual(p);
    expect(savedDoc().features).toEqual(doc.features);
  });

  it("confirms only what the server finds still quiet: a lot, a questioned line or a made-up key sent with them is left alone", async () => {
    const doc = stored.document as SurveyDocument;
    const quiet = quietSketchItems(doc, SYNTH_POINTS);
    const lot = Object.keys(doc.provenance).find((k) => k.startsWith("lot:"))!;
    const questioned = Object.keys(doc.provenance).find((k) => k.startsWith("feature:") && !quiet.includes(k))!;
    const r = await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 3, keys: [...quiet, questioned, "feature:sk-l-made-up"] });
    expect(r).toMatchObject({ status: "done" });
    expect((r as { message: string }).message).toMatch(/2 gained a question since, so they stay on the list/);
    expect(savedDoc().provenance[questioned]).toEqual({ source: "ai_photo", reviewed: false });
    expect(savedDoc().provenance[lot]).toEqual(doc.provenance[lot]);
    // A lot's key isn't even accepted in the request.
    expect(await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 3, keys: [lot] })).toMatchObject({ status: "error" });
  });

  it("saves nothing for a stale version, an empty or malformed list, or when nothing is quiet any more", async () => {
    const quiet = quietSketchItems(stored.document as SurveyDocument, SYNTH_POINTS);
    expect(await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 2, keys: quiet })).toMatchObject({ status: "error" });
    expect(await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 3, keys: [] })).toMatchObject({ status: "error" });
    expect(await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 3, keys: ["feature:<script>"] })).toMatchObject({ status: "error" });
    expect(await confirmSketchItemsAction({ projectId: "not-a-project", baseVersion: 3, keys: quiet })).toMatchObject({ status: "error" });
    const done = stored.document as SurveyDocument;
    stored.document = { ...done, provenance: { ...done.provenance, ...Object.fromEntries(quiet.map((k) => [k, { source: "ai_photo", reviewed: true }])) } };
    expect(await confirmSketchItemsAction({ projectId: PROJECT, baseVersion: 3, keys: quiet })).toMatchObject({ status: "error" });
    expect(saved).toEqual([]);
  });
});

describe("labelling the lot from its card (stage 294)", () => {
  const lotId = () => (stored.document as SurveyDocument).lots[0]!.id;
  const unlabelled = () => {
    const doc = stored.document as SurveyDocument;
    return { ...doc, lots: doc.lots.map((l) => ({ ...l, label: "" })) };
  };

  it("labels it as typed, tidied, as a new version, without confirming a lot read from the photo", async () => {
    stored.document = unlabelled();
    expect(await labelLotAction({ projectId: PROJECT, baseVersion: 3, lotId: lotId(), label: "  X  " })).toMatchObject({ status: "done", version: 4 });
    expect(saved[0]!.note).toBe("Lot labelled X");
    expect(savedDoc().lots[0]!.label).toBe("X");
    const key = `lot:${lotId()}`;
    expect(savedDoc().provenance[key]).toEqual((stored.document as SurveyDocument).provenance[key]);
  });

  it("refuses an empty label, one another lot has, a lot not on the plan, and a stale version", async () => {
    const doc = unlabelled();
    const twin = { ...doc.lots[0]!, id: "other-lot", label: "A" };
    stored.document = { ...doc, lots: [...doc.lots, twin] };
    expect(await labelLotAction({ projectId: PROJECT, baseVersion: 3, lotId: lotId(), label: "   " })).toMatchObject({ status: "error" });
    expect(await labelLotAction({ projectId: PROJECT, baseVersion: 3, lotId: lotId(), label: "A" })).toMatchObject({ status: "error", message: "Another lot is already called A. Give this one its own label." });
    expect(await labelLotAction({ projectId: PROJECT, baseVersion: 3, lotId: "gone", label: "B" })).toMatchObject({ status: "error" });
    expect(await labelLotAction({ projectId: PROJECT, baseVersion: 2, lotId: lotId(), label: "B" })).toMatchObject({ status: "error" });
    expect(saved).toEqual([]);
  });

  it("compares whole names as the plan's own check does: B beside B¹ is its own lot", async () => {
    const doc = unlabelled();
    stored.document = { ...doc, lots: [...doc.lots, { ...doc.lots[0]!, id: "other-lot", label: "B", sup: "1" }] };
    expect(await labelLotAction({ projectId: PROJECT, baseVersion: 3, lotId: lotId(), label: "B" })).toMatchObject({ status: "done" });
  });
});
