/**
 * Correcting a number as the sketch was read, as the server saves it (stage 249, ADR 0257), with the database standing in: one press
 * redraws what the misread number drew, the reading stays as read, and a correction never invents a point, reaches a number that isn't
 * on the photo, or lands on a stale version. SYNTHETIC values only: a 10 m square whose corner 4 was read as 7, a point inside it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SketchRecord } from "@/core/survey/autosurvey/sketch";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";
import { applySketch } from "@/core/survey/sketchintel/apply";
import { interpretDocument } from "@/core/survey/sketchintel/findings";

const { saved, project } = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  project: { document: null as unknown, version: 1, points: [] as unknown[] },
}));

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT ${to}`);
  },
}));
vi.mock("@/server/workspace/context", () => ({
  loadAppContext: async () => ({ mode: "live", current: { id: "org-1" }, user: { id: "22222222-2222-4222-8222-222222222222" }, role: "owner", writes: { enabled: true, reason: "" } }),
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
        return { ok: true, value: 2 };
      },
    },
  };
});
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "EPSG:5235", crsConfirmedAt: "2026-11-24T10:00:00.000Z" },
    points: project.points,
    sources: [],
    drawing: { readable: true, document: project.document, version: project.version },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
}));

const { correctSketchNumberAction } = await import("./actions");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const at = (pointId: string, e: number, n: number) => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e: 500000 + e, n: 700000 + n, z: 0, code: null });
const POINTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("7", 4, 6)];
const line = (id: string, points: string[]) => ({ id, file: "sketch-sample.jpg", points, label: "MW", style: "double" as const, closes: false, certain: true });
const SKETCH: SketchRecord = {
  model: "claude-sonnet-5-5",
  readAt: "2026-11-24T10:00:00.000Z",
  files: ["sketch-sample.jpg"],
  readings: [{ id: "r1", file: "sketch-sample.jpg", kind: "point", text: "7", from: "", to: "", near: "" }],
  unreadable: [],
  drawing: { lines: [line("l1", ["1", "2", "3"]), line("l2", ["3", "7", "1"])], symbols: [], areas: [] },
};
const idOf = (pointId: string) => POINTS.find((p) => p.pointId === pointId)!.id;
const drawn = () => {
  const doc: SurveyDocument = { ...emptyDocument(), sketch: SKETCH };
  return applySketch(doc, interpretDocument(doc, POINTS)!).document;
};
const fix = { projectId: PROJECT, baseVersion: 1, file: "sketch-sample.jpg", reading: "r1", to: "4" };

beforeEach(() => {
  saved.length = 0;
  project.points = POINTS;
  project.version = 1;
  project.document = drawn();
});

describe("correcting a number as the sketch was read", () => {
  it("redraws what the misread number drew, keeps the reading as read and records the correction as the surveyor's", async () => {
    const before = project.document as SurveyDocument;
    expect(before.features.some((f) => f.points.includes(idOf("7")))).toBe(true);
    const r = await correctSketchNumberAction(fix);
    expect(r).toMatchObject({ status: "done", version: 2 });
    const doc = saved[0]!.document as SurveyDocument;
    expect(doc.sketch!.readings).toEqual(SKETCH.readings);
    expect(doc.sketch!.drawing).toEqual(SKETCH.drawing);
    expect(doc.sketch!.corrections).toEqual([{ file: "sketch-sample.jpg", label: "7", to: "4", by: expect.any(String), at: expect.any(String) }]);
    expect(doc.features.some((f) => f.points.includes(idOf("7")))).toBe(false);
    expect(doc.lots).toHaveLength(1);
    expect(new Set(doc.lots[0]!.points)).toEqual(new Set(["1", "2", "3", "4"].map(idOf)));
    expect(doc.provenance[`lot:${doc.lots[0]!.id}`]).toEqual({ source: "ai_photo", reviewed: false });
    expect(String(saved[0]!.note)).toContain("the number read as 7 is 4");
  });

  it("corrects a corrected number again where it stands, and drops the correction when it goes back to what was read", async () => {
    project.document = { ...drawn(), sketch: { ...SKETCH, corrections: [{ file: "sketch-sample.jpg", label: "7", to: "4", by: null, at: "2026-11-24T10:00:00.000Z" }] } };
    await correctSketchNumberAction({ ...fix, to: "2" });
    expect((saved[0]!.document as SurveyDocument).sketch!.corrections).toEqual([expect.objectContaining({ label: "7", to: "2" })]);
    await correctSketchNumberAction({ ...fix, to: "7" });
    expect((saved[1]!.document as SurveyDocument).sketch!.corrections).toEqual([]);
  });

  it("refuses a number that isn't one surveyed point, a number not read on that photo, a photo not on the plan and a stale version", async () => {
    expect(await correctSketchNumberAction({ ...fix, to: "9" })).toMatchObject({ status: "error", message: expect.stringContaining("no point 9") });
    project.points = [...POINTS, { ...at("4", 20, 20), id: "00000000-0000-4000-8000-000000000099" }];
    expect(await correctSketchNumberAction(fix)).toMatchObject({ status: "error", message: expect.stringContaining("More than one") });
    project.points = POINTS;
    expect(await correctSketchNumberAction({ ...fix, reading: "r5" })).toMatchObject({ status: "error", message: expect.stringContaining("isn't read on that sketch") });
    expect(await correctSketchNumberAction({ ...fix, file: "other.jpg" })).toMatchObject({ status: "error", message: expect.stringContaining("isn't on this plan") });
    expect(await correctSketchNumberAction({ ...fix, to: "7" })).toMatchObject({ status: "error", message: expect.stringContaining("already read as 7") });
    expect(await correctSketchNumberAction({ ...fix, baseVersion: 3 })).toMatchObject({ status: "error" });
    expect(await correctSketchNumberAction({ ...fix, to: "4\u0000" })).toMatchObject({ status: "error" });
    expect(saved).toHaveLength(0);
  });

  it("corrects two numbers swapped on a photo, each press its own reading, the second never undoing the first", async () => {
    const sketch = { ...SKETCH, readings: [...SKETCH.readings, { id: "r2", file: "sketch-sample.jpg", kind: "point" as const, text: "4", from: "", to: "", near: "" }] };
    project.document = { ...drawn(), sketch };
    await correctSketchNumberAction(fix);
    project.document = saved[0]!.document;
    const r = await correctSketchNumberAction({ ...fix, reading: "r2", to: "7" });
    expect(r).toMatchObject({ status: "done", message: expect.stringContaining("the number read as 4 is 7") });
    expect((saved[1]!.document as SurveyDocument).sketch!.corrections!.map((c) => [c.label, c.to])).toEqual([
      ["7", "4"],
      ["4", "7"],
    ]);
  });

  it("names what it left in the version's note too, not only on the screen", async () => {
    const doc = drawn();
    project.document = { ...doc, provenance: Object.fromEntries(Object.entries(doc.provenance).map(([k, v]) => [k, k.startsWith("lot:") ? { ...v, reviewed: true } : v])) };
    await correctSketchNumberAction(fix);
    expect(String(saved[0]!.note)).toContain("1 confirmed item still uses 7");
  });

  it("never changes a line or lot the surveyor confirmed, and says so", async () => {
    const doc = drawn();
    project.document = { ...doc, provenance: Object.fromEntries(Object.entries(doc.provenance).map(([k, v]) => [k, k.startsWith("lot:") ? { ...v, reviewed: true } : v])) };
    const r = await correctSketchNumberAction(fix);
    expect(r).toMatchObject({ status: "done", message: expect.stringContaining("you confirmed still uses 7") });
    const after = saved[0]!.document as SurveyDocument;
    expect(after.lots.map((l) => l.points)).toEqual((project.document as SurveyDocument).lots.map((l) => l.points));
  });
});
