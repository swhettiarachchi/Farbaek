/**
 * The surveyor's sketch habits saved and forgotten (stage 298), run as the server runs it with the database standing in:
 * only a code the card offers is taken, and only unconfirmed lines drawn that way take it. SYNTHETIC values only (fixture.ts).
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


const { saveSketchHabitAction, forgetSketchHabitAction, saveSurveyDrawingAction } = await import("./actions");
const { commonCodes } = await import("@/core/survey/codes");
const { emptyDocument } = await import("@/core/survey/document");
const { applySketch } = await import("@/core/survey/sketchintel/apply");
const { SYNTH_DRAWING, SYNTH_POINTS } = await import("@/core/survey/sketchintel/fixture");
const { interpretDocument } = await import("@/core/survey/sketchintel/findings");

const PROJECT = "11111111-1111-4111-8111-111111111111";
/** The fixture's unlabelled line 31 to 32 drawn double, applied as a sketch read puts it on the plan, waiting for the surveyor. */
const withDouble = (): SurveyDocument => {
  const drawing = { ...SYNTH_DRAWING, lines: SYNTH_DRAWING.lines.map((l) => (l.id === "l3" ? { ...l, style: "double" as const } : l)) };
  const doc: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [], unreadable: [], drawing } };
  return applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
};
const l3 = (doc: SurveyDocument) => {
  const p = interpretDocument(doc, SYNTH_POINTS)!.proposals.find((x) => x.kind === "line" && x.from.includes("l3"))!;
  return doc.features.find((f) => f.id === p.id)!;
};
const savedDoc = (i = 0) => saved[i]!.document as SurveyDocument;

beforeEach(() => {
  saved.length = 0;
  stored.document = withDouble();
  stored.version = 3;
});

describe("saying a sketch habit", () => {
  it("keeps it as the surveyor's, and the unconfirmed double line takes the code at once", async () => {
    expect(l3(stored.document as SurveyDocument).code).toBe("");
    const r = await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double", code: "MW" });
    expect(r).toMatchObject({ status: "done", version: 4 });
    expect((r as { message: string }).message).toMatch(/^Saved: on your sketches, a double line is a masonry wall \(MW\)\. 1 line takes it now\. Your next plans start with it\./);
    expect(saved[0]!.note).toBe("Your sketch habit: a double line is a masonry wall (MW)");
    expect(savedDoc().sketchHabits).toEqual([{ style: "double", code: "MW" }]);
    expect(Date.parse(savedDoc().sketchHabitsSaidAt ?? "")).toBeGreaterThan(Date.parse("2026-11-01T00:00:00Z"));
    expect(l3(savedDoc()).code).toBe("MW");
    // It stays the surveyor's to confirm: the habit says what it is, not that it's right.
    expect(savedDoc().provenance[`feature:${l3(savedDoc()).id}`]).toEqual({ source: "ai_photo", reviewed: false });
  });

  it("refuses a code the card doesn't offer, a confirmed line keeps its code, and a stale version saves nothing", async () => {
    expect(await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double", code: "NF" })).toMatchObject({ status: "error" });
    expect(await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double", code: "ZZ" })).toMatchObject({ status: "error" });
    expect(await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 2, style: "double", code: "MW" })).toMatchObject({ status: "error" });
    expect(await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "single" as "double", code: "MW" })).toMatchObject({ status: "error" });
    expect(saved).toEqual([]);
    const doc = withDouble();
    const key = `feature:${l3(doc).id}`;
    stored.document = { ...doc, provenance: { ...doc.provenance, [key]: { source: "ai_photo", reviewed: true } } };
    await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double", code: "MW" });
    expect(l3(savedDoc()).code).toBe("");
  });

  it("keeps a code the surveyor typed on a line not yet confirmed, and moves lines from the habit it replaces", async () => {
    const doc = withDouble();
    const id = l3(doc).id;
    stored.document = { ...doc, features: doc.features.map((f) => (f.id === id ? { ...f, code: "RW" } : f)) };
    await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double", code: "MW" });
    expect(l3(savedDoc()).code).toBe("RW");
    // A double line that took MW from the habit takes RW when the habit becomes RW.
    saved.length = 0;
    stored.document = { ...doc, sketchHabits: [{ style: "double", code: "MW" }], features: doc.features.map((f) => (f.id === id ? { ...f, code: "MW" } : f)) };
    await saveSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double", code: "RW" });
    expect(savedDoc().sketchHabits).toEqual([{ style: "double", code: "RW" }]);
    expect(l3(savedDoc()).code).toBe("RW");
  });

  it("is never set by a plan saved from the browser: the stored habits are kept", async () => {
    const doc = withDouble();
    await saveSurveyDrawingAction({ projectId: PROJECT, baseVersion: 3, document: { ...doc, sketchHabits: [{ style: "double", code: "EDn" }], sketchHabitsSaidAt: "2026-11-28T08:00:00.000Z" } });
    expect(savedDoc()).not.toHaveProperty("sketchHabits");
    expect(savedDoc()).not.toHaveProperty("sketchHabitsSaidAt");
    saved.length = 0;
    stored.document = { ...doc, sketchHabits: [{ style: "double", code: "MW" }], sketchHabitsSaidAt: "2026-11-20T09:00:00.000Z" };
    await saveSurveyDrawingAction({ projectId: PROJECT, baseVersion: 3, document: { ...doc, sketchHabits: [] } });
    expect(savedDoc().sketchHabits).toEqual([{ style: "double", code: "MW" }]);
    expect(savedDoc().sketchHabitsSaidAt).toBe("2026-11-20T09:00:00.000Z");
  });
});

describe("forgetting a sketch habit", () => {
  it("leaves an empty list, so it isn't carried back, and the lines keep their codes", async () => {
    const doc = withDouble();
    stored.document = { ...doc, sketchHabits: [{ style: "double", code: "MW" }], features: doc.features.map((f) => (f.id === l3(doc).id ? { ...f, code: "MW" } : f)) };
    expect(await forgetSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double" })).toMatchObject({ status: "done" });
    expect(savedDoc().sketchHabits).toEqual([]);
    expect(l3(savedDoc()).code).toBe("MW");
    expect(saved[0]!.note).toBe("Sketch habit forgotten: a double line");
    // Nothing to forget: refused.
    stored.document = withDouble();
    expect(await forgetSketchHabitAction({ projectId: PROJECT, baseVersion: 3, style: "double" })).toMatchObject({ status: "error" });
  });
});
