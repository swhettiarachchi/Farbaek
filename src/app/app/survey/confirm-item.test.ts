/**
 * "Confirm" on the surveyor's list (stage 224, ADR 0235), run as the server runs it with the database standing in: only an item drawn
 * or filled in for the surveyor, still on the plan, can be confirmed or put back. SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";

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
const POINTS = [
  [1, 500000, 700000],
  [2, 500040, 700000],
  [3, 500040, 700030],
].map(([n, e, north]) => ({ id: `00000000-0000-4000-8000-00000000000${n}`, pointId: String(n), e: e!, n: north!, z: 0, code: "CP" }));
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "EPSG:5235", crsConfirmedAt: "2026-11-23T10:00:00.000Z" },
    points: POINTS,
    sources: [],
    drawing: { readable: true, document: stored.document, version: stored.version },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
  // The version the page showed, when a press is older than the newest (stage 303): unknown here, so a stale press is refused.
  loadSurveyDrawing: async () => null,
}));

const { confirmSurveyItemAction, removeSurveySymbolAction } = await import("./actions");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const doc = (): SurveyDocument => ({
  ...emptyDocument(),
  lots: [{ id: "lot-1", label: "1", sup: "", note: "", points: POINTS.map((p) => p.id) }],
  sheet: { ...emptyDocument().sheet, landName: "Sample Watta" },
  provenance: { "lot:lot-1": { source: "auto", reviewed: false }, "sheet.landName": { source: "ai_photo", reviewed: false }, "lot:gone": { source: "auto", reviewed: false } },
});
const savedDoc = (i = 0) => saved[i]!.document as SurveyDocument;

beforeEach(() => {
  saved.length = 0;
  stored.document = doc();
  stored.version = 3;
});

describe("confirming an item on the surveyor's list", () => {
  it("confirms an item drawn or filled in, as a new version with its name in the note, and puts it back on Undo", async () => {
    expect(await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key: "lot:lot-1", confirmed: true })).toMatchObject({ status: "done", version: 4 });
    expect(savedDoc().provenance["lot:lot-1"]).toEqual({ source: "auto", reviewed: true });
    expect(saved[0]!.note).toBe("Confirmed: Lot 1");
    expect(saved[0]!.baseVersion).toBe(3);
    // Nothing else changed, and the mark of a lot no longer on the plan was dropped as on every save.
    expect(savedDoc().provenance["sheet.landName"]).toEqual({ source: "ai_photo", reviewed: false });
    expect(savedDoc().provenance["lot:gone"]).toBeUndefined();
    expect(savedDoc().lots).toEqual(doc().lots);

    stored.document = { ...doc(), provenance: { ...doc().provenance, "sheet.landName": { source: "ai_photo", reviewed: true } } };
    await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key: "sheet.landName", confirmed: false });
    expect(savedDoc(1).provenance["sheet.landName"]).toEqual({ source: "ai_photo", reviewed: false });
    expect(saved[1]!.note).toBe("To check again: Land called");
  });

  it("confirms the code list, which may have no mark yet", async () => {
    await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key: "codes", confirmed: true });
    expect(savedDoc().provenance["codes"]).toEqual({ source: "engine", reviewed: true });
  });

  it("refuses an item that isn't waiting, isn't on the plan, wasn't drawn for the surveyor, or a stale version", async () => {
    stored.document = { ...doc(), provenance: { ...doc().provenance, "notes": { source: "engine", reviewed: false } } };
    for (const key of ["sheet.planNumber", "lot:gone", "notes", "lot:<script>", ""]) {
      expect(await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 3, key, confirmed: true })).toMatchObject({ status: "error" });
    }
    expect(await confirmSurveyItemAction({ projectId: PROJECT, baseVersion: 2, key: "lot:lot-1", confirmed: true })).toMatchObject({ status: "error" });
    expect(saved).toEqual([]);
  });
});

describe("removing a symbol the sketch put on the plan", () => {
  const withWell = (): SurveyDocument => ({ ...doc(), symbols: [{ id: "sk-s-abc", code: "Well", point: POINTS[2]!.id }], provenance: { ...doc().provenance, "symbol:sk-s-abc": { source: "ai_photo", reviewed: false } } });

  it("takes it off as a new version, with its mark, and leaves the plan with no symbols listed as before any were added", async () => {
    stored.document = withWell();
    expect(await removeSurveySymbolAction({ projectId: PROJECT, baseVersion: 3, key: "symbol:sk-s-abc" })).toMatchObject({ status: "done", version: 4 });
    expect(saved[0]!.note).toBe("Removed: A well read from the sketch");
    expect("symbols" in savedDoc()).toBe(false);
    expect(savedDoc().provenance["symbol:sk-s-abc"]).toBeUndefined();
    expect(savedDoc().lots).toEqual(doc().lots);
  });

  it("refuses anything but a symbol on the plan, and a stale version", async () => {
    stored.document = withWell();
    for (const key of ["lot:lot-1", "symbol:gone", "symbol:<x>", "sheet.landName"]) expect(await removeSurveySymbolAction({ projectId: PROJECT, baseVersion: 3, key })).toMatchObject({ status: "error" });
    expect(await removeSurveySymbolAction({ projectId: PROJECT, baseVersion: 2, key: "symbol:sk-s-abc" })).toMatchObject({ status: "error" });
    expect(saved).toEqual([]);
  });
});
