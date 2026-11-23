/**
 * Answers about field sketches as the server saves them (stage 223, ADR 0234), with the database standing in: "keep as surveyed" on
 * a sketch difference survives the save, and a plan saved from the browser can't change or remove what was read. SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SketchRecord } from "@/core/survey/autosurvey/sketch";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";

const { saved, project } = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  project: { document: null as unknown, crsConfirmedAt: "2026-11-23T10:00:00.000Z" as string | null },
}));

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
        return { ok: true, value: 2 };
      },
    },
  };
});
// A 40 by 30 m rectangle near SLD99's central meridian.
const POINTS = [
  [1, 500000, 700000],
  [2, 500040, 700000],
  [3, 500040, 700030],
  [4, 500000, 700030],
].map(([n, e, north]) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, pointId: String(n), e: e!, n: north!, z: 0, code: "CP" }));
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "EPSG:5235", crsConfirmedAt: project.crsConfirmedAt },
    points: POINTS,
    sources: [],
    drawing: { readable: true, document: project.document, version: 1 },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
}));

const { saveSurveyDrawingAction, setKeptAsSurveyedAction } = await import("./actions");

const PROJECT = "11111111-1111-4111-8111-111111111111";
// Written 40.50 between 1 and 2, which the coordinates make 40.000 m: a real difference.
const SKETCH: SketchRecord = {
  model: "claude-sonnet-5-5",
  readAt: "2026-11-23T10:00:00.000Z",
  files: ["sketch-sample.jpg"],
  readings: [{ id: "r1", file: "sketch-sample.jpg", kind: "distance", text: "40.50", from: "1", to: "2", near: "" }],
  unreadable: [],
};

beforeEach(() => {
  saved.length = 0;
  project.document = { ...emptyDocument(), sketch: SKETCH };
  project.crsConfirmedAt = "2026-11-23T10:00:00.000Z";
});

describe("answers about sketches", () => {
  it("keeps a sketch difference as surveyed, and the answer survives the save", async () => {
    const r = await setKeptAsSurveyedAction({ projectId: PROJECT, baseVersion: 1, key: "sketch:r1", keep: true });
    expect(r).toMatchObject({ status: "done" });
    expect((saved[0]!.document as SurveyDocument).kept).toEqual(["sketch:r1"]);
  });

  it("keeps the answer when the plan is saved again from the browser", async () => {
    project.document = { ...emptyDocument(), sketch: SKETCH, kept: ["sketch:r1"] };
    await saveSurveyDrawingAction({ projectId: PROJECT, baseVersion: 1, document: project.document });
    expect((saved[0]!.document as SurveyDocument).kept).toEqual(["sketch:r1"]);
  });

  it("never takes the readings from the browser: removing or making them up changes nothing", async () => {
    await saveSurveyDrawingAction({ projectId: PROJECT, baseVersion: 1, document: { ...emptyDocument(), sketch: null } });
    expect((saved[0]!.document as SurveyDocument).sketch).toEqual(SKETCH);
    const madeUp = { ...SKETCH, readings: [{ ...SKETCH.readings[0]!, text: "40.00" }] };
    await saveSurveyDrawingAction({ projectId: PROJECT, baseVersion: 1, document: { ...emptyDocument(), sketch: madeUp } });
    expect((saved[1]!.document as SurveyDocument).sketch).toEqual(SKETCH);
  });
});
