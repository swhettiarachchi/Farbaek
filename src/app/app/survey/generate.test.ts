/**
 * AutoSurvey's Generate Plan (stage 222), run as the server runs it, with the database standing in: every problem stops it before a
 * project exists, and a clean set of files becomes one project, one source per file and one drawn version. SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument } from "@/core/survey/document";

// Shared with the stand-ins below, which vitest moves above everything else.
const { calls, stored } = vi.hoisted(() => ({
  calls: [] as { kind: string; input: Record<string, unknown> }[],
  stored: [] as { pointId: string; e: number; n: number; z: number | null; code: string | null }[],
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
      createProject: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        calls.push({ kind: "create", input });
        return { ok: true, value: "11111111-1111-4111-8111-111111111111" };
      },
      importPoints: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        calls.push({ kind: "import", input });
        const points = input.points as { point_id: string; e: number; n: number; z: number | null; code: string }[];
        stored.push(...points.map((p) => ({ pointId: p.point_id, e: p.e, n: p.n, z: p.z, code: p.code || null })));
        return { ok: true, value: { source_id: `source-${calls.length}`, added: points.length, skipped: 0 } };
      },
      saveDrawing: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        calls.push({ kind: "draw", input });
        return { ok: true, value: 2 };
      },
    },
  };
});
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "EPSG:5235" },
    points: stored.map((p, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ...p })),
    sources: [],
    drawing: { readable: true, document: emptyDocument(), version: 1 },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
}));

const { generateSurveyPlanAction } = await import("./actions");

const boundary = ["Point,Easting,Northing,Height,Code", "1,450000.000,700000.000,20.00,CP", "2,450040.000,700000.000,20.00,CP", "3,450040.000,700030.000,20.00,St", "4,450000.000,700030.000,20.00,St"].join("\n");
const extra = ["Point,Easting,Northing,Height,Code", "10,450020.000,700015.000,20.50,Well"].join("\n");

async function generate(input: Parameters<typeof generateSurveyPlanAction>[0]): Promise<{ redirect: string | null; result: Awaited<ReturnType<typeof generateSurveyPlanAction>> | null }> {
  try {
    return { redirect: null, result: await generateSurveyPlanAction(input) };
  } catch (e) {
    const m = /^REDIRECT (.+)$/.exec((e as Error).message);
    if (m) return { redirect: m[1]!, result: null };
    throw e;
  }
}

beforeEach(() => {
  calls.length = 0;
  stored.length = 0;
});

describe("Generate Plan", () => {
  it("makes one project with the grid confirmed, imports each file as its own source, draws once and opens the plan", async () => {
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "extra.csv", content: extra }] });
    expect(r.result).toEqual({ status: "done", projectId: "11111111-1111-4111-8111-111111111111", next: "/app/survey/11111111-1111-4111-8111-111111111111?step=plan&generated=1", version: 2 });
    expect(calls.map((c) => c.kind)).toEqual(["create", "import", "import", "draw"]);
    const create = calls[0]!.input;
    expect(create).toMatchObject({ planType: "cadastral", crsId: "EPSG:5235", confirm: true });
    expect(String(create.name)).toMatch(/^Survey from boundary, \d{1,2} [A-Z][a-z]{2} \d{4}$/);
    expect(calls[1]!.input).toMatchObject({ fileName: "boundary.csv", format: "delimited", content: boundary });
    expect((calls[1]!.input.settings as Record<string, unknown>).crs).toBe("EPSG:5235");
    expect(calls[2]!.input).toMatchObject({ fileName: "extra.csv", content: extra });
    expect(String(calls[3]!.input.note)).toBe("Drawn by AutoSurvey from 2 files");
  });

  it("stops before anything is saved when a file can't be read, a point has two places or the grid doesn't fit", async () => {
    const unreadable = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "job.dbx", content: "a\u0000b" }] });
    expect(unreadable.result).toMatchObject({ status: "error", problems: [{ file: "job.dbx" }] });
    const moved = boundary.replace("1,450000.000", "1,450000.010").split("\n").slice(0, 2).join("\n");
    const clash = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "moved.csv", content: moved }] });
    expect(clash.result).toMatchObject({ status: "error" });
    expect(clash.result?.status === "error" && clash.result.problems[0]!.problem).toMatch(/^Point 1 is at different coordinates/);
    const wrongGrid = await generate({ title: "", crsId: "EPSG:5234", files: [{ name: "boundary.csv", content: boundary }] });
    expect(wrongGrid.result?.status === "error" && wrongGrid.result.problems.at(-1)!.problem).toMatch(/outside the area Kandawala/);
    expect(calls).toEqual([]);
  });

  it("refuses a coordinate system Farbaek doesn't know, and too much data, before reading anything", async () => {
    expect((await generate({ title: "", crsId: "EPSG:4326", files: [{ name: "a.csv", content: boundary }] })).result).toMatchObject({ status: "error", message: "Choose the coordinate system the survey's points are in." });
    const big = "x".repeat(1_900_000);
    const tooMuch = await generate({ title: "", crsId: "EPSG:5235", files: [1, 2, 3].map((n) => ({ name: `${n}.csv`, content: big })) });
    expect(tooMuch.result?.status === "error" && tooMuch.result.message).toMatch(/more than 5 MB/);
    expect(calls).toEqual([]);
  });

  it("opens on the Draft step, on the version the project was created with, when nothing could be drawn", async () => {
    const plain = ["Point,Easting,Northing,Height,Code", "1,450000.000,700000.000,20.00,Tree", "2,450040.000,700000.000,20.00,Tree"].join("\n");
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "trees.csv", content: plain }] });
    expect(r.result).toEqual({ status: "done", projectId: "11111111-1111-4111-8111-111111111111", next: "/app/survey/11111111-1111-4111-8111-111111111111?step=draft&generated=1", version: 1 });
    expect(calls.map((c) => c.kind)).toEqual(["create", "import"]);
  });

  it("uses the surveyor's own project name", async () => {
    await generate({ title: "Lot 7 boundary", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }] });
    expect(calls[0]!.input.name).toBe("Lot 7 boundary");
  });
});
