/**
 * "Add to this plan" (stage 306, ADR 0311), run as the server runs it with the database standing in: a file that gives a point the plan has
 * somewhere else is refused whole, said point by point, with nothing imported; a clean file is imported and the plan updated once, on the
 * version the surveyor saw. SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { autoDraft } from "@/core/survey/autodraft";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";

const { saved, imported, store } = vi.hoisted(() => ({
  saved: [] as Record<string, unknown>[],
  imported: [] as Record<string, unknown>[],
  store: { points: [] as { id: string; pointId: string; e: number; n: number; z: number | null; code: string | null }[], document: null as unknown, version: 5 },
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
      importPoints: async (_a: unknown, _b: unknown, input: { points: { point_id: string; e: number; n: number; z: number | null; code: string }[] }) => {
        imported.push(input);
        const have = new Set(store.points.map((p) => p.pointId));
        const fresh = input.points.filter((p) => !have.has(p.point_id));
        for (const p of fresh) store.points.push({ id: `00000000-0000-4000-8000-${String(store.points.length + 1).padStart(12, "0")}`, pointId: p.point_id, e: p.e, n: p.n, z: p.z, code: p.code || null });
        return { ok: true, value: { source_id: "s", added: fresh.length, skipped: input.points.length - fresh.length } };
      },
      saveDrawing: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        saved.push(input);
        return { ok: true, value: store.version + 1 };
      },
    },
  };
});
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "LOCAL", crsConfirmedAt: "2026-11-23T10:00:00.000Z" },
    points: store.points.map((p) => ({ ...p })),
    sources: [],
    drawing: { readable: true, document: store.document, version: store.version },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
  loadSurveyDrawing: async () => null,
}));

const { addToSurveyPlanAction } = await import("./actions");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const first = [
  ["1", 1000, 1000, "CP"],
  ["2", 1040, 1000, "CP"],
  ["3", 1040, 1025, "CP"],
] as const;
const csv = (rows: readonly (readonly [string, number, number, string])[]) => `point,easting,northing,code\n${rows.map((r) => r.join(",")).join("\n")}\n`;

beforeEach(() => {
  saved.length = 0;
  imported.length = 0;
  store.version = 5;
  store.points = first.map(([pointId, e, n, code], k) => ({ id: `00000000-0000-4000-8000-${String(k + 1).padStart(12, "0")}`, pointId, e, n, z: null, code }));
  store.document = autoDraft({ points: store.points, document: emptyDocument(), surveyorUserId: null, surveyDate: null }).document;
});

describe("adding to a plan already drawn", () => {
  it("refuses a file that gives a point the plan has somewhere else, saying which, and imports nothing", async () => {
    const r = await addToSurveyPlanAction({ projectId: PROJECT, crsId: "LOCAL", baseVersion: 5, files: [{ name: "day2.csv", content: csv([["3", 1040.2, 1025, "CP"], ["4", 1000, 1025, "CP"]]) }] });
    expect(r.status).toBe("error");
    if (r.status !== "error") return;
    expect(r.message).toBe("One thing needs you before these files can be added. Nothing was changed.");
    expect(r.problems[0]!.problem).toContain("Point 3 is already in this plan; this file gives it 0.200 m from where the plan has it.");
    expect(imported).toEqual([]);
    expect(saved).toEqual([]);
  });

  it("refuses an update on a version the surveyor didn't see", async () => {
    const r = await addToSurveyPlanAction({ projectId: PROJECT, crsId: "LOCAL", baseVersion: 4, files: [{ name: "day2.csv", content: csv([["4", 1000, 1025, "CP"]]) }] });
    expect(r).toMatchObject({ status: "error" });
    expect(imported).toEqual([]);
  });

  it("imports the new points, keeps repeats once, and updates the lot in one version", async () => {
    const r = await addToSurveyPlanAction({ projectId: PROJECT, crsId: "LOCAL", baseVersion: 5, files: [{ name: "day2.csv", content: csv([["3", 1040, 1025, "CP"], ["4", 1000, 1025, "CP"]]) }] });
    expect(r).toMatchObject({ status: "done", version: 6, before: 5, newPoints: 1 });
    expect(imported).toHaveLength(1);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({ baseVersion: 5, note: "Added 1 point from day2.csv" });
    const doc = saved[0]!.document as SurveyDocument;
    expect(doc.lots[0]!.points).toHaveLength(4);
    if (r.status === "done") expect(r.message).toBe("1 new point added from day2.csv. The plan is updated as version 6.");
  });

  it("takes a repeat without heights or codes as the plan has it, not as a clash", async () => {
    const r = await addToSurveyPlanAction({ projectId: PROJECT, crsId: "LOCAL", baseVersion: 5, files: [{ name: "flat.csv", content: "point,easting,northing,elevation\n3,1040,1025,0\n4,1000,1025,0\n" }] });
    expect(r).toMatchObject({ status: "done", newPoints: 1 });
    const sent = (imported[0] as { points: { point_id: string; code: string }[] }).points;
    expect(sent.find((p) => p.point_id === "3")!.code).toBe("CP");
  });

  it("refuses a file read in a grid the plan no longer has", async () => {
    const r = await addToSurveyPlanAction({ projectId: PROJECT, crsId: "EPSG:5235", baseVersion: 5, files: [{ name: "day2.csv", content: csv([["4", 1000, 1025, "CP"]]) }] });
    expect(r).toMatchObject({ status: "error" });
    expect(imported).toEqual([]);
  });

  it("saves nothing when every point is already here", async () => {
    const r = await addToSurveyPlanAction({ projectId: PROJECT, crsId: "LOCAL", baseVersion: 5, files: [{ name: "again.csv", content: csv(first) }] });
    expect(r).toMatchObject({ status: "done", version: 5, newPoints: 0, message: "Every point in again.csv was already in the plan." });
    expect(saved).toEqual([]);
  });
});
