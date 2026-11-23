/**
 * AutoSurvey's Generate Plan (stage 222), run as the server runs it, with the database standing in: every problem stops it before a
 * project exists, and a clean set of files becomes one project, one source per file and one drawn version. SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument } from "@/core/survey/document";

// Shared with the stand-ins below, which vitest moves above everything else.
const { calls, stored, carried, created } = vi.hoisted(() => ({
  carried: { value: { codes: null, settings: null } as unknown },
  created: { document: null as unknown },
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
        created.document = input.document;
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
vi.mock("@/server/survey/defaults", () => ({ loadStartingDefaults: async () => carried.value }));
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "EPSG:5235" },
    points: stored.map((p, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ...p })),
    sources: [],
    drawing: { readable: true, document: created.document ?? emptyDocument(), version: 1 },
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
  carried.value = { codes: null, settings: null };
  created.document = null;
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

describe("Generate Plan with a returning surveyor's defaults (stage 226, ADR 0237)", () => {
  const office = [
    { code: "CP", meaning: "Concrete Post", kind: "mark" as const, line: "solid" as const, legend: true },
    { code: "St", meaning: "Stone", kind: "mark" as const, line: "solid" as const, legend: true },
    { code: "FN", meaning: "Wire Fence", kind: "line" as const, line: "dashed" as const, legend: true },
  ];

  it("starts from the code list the surveyor checked last, for one more check, and their sheet's presentation", async () => {
    carried.value = { codes: { entries: office, from: "Lot 7" }, settings: { values: { ...emptyDocument().settings, paper: "A3", orientation: "landscape" }, from: "Lot 9" } };
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }] });
    const doc = calls[0]!.input.document as ReturnType<typeof emptyDocument>;
    expect(doc.codes).toEqual(office);
    expect(doc.provenance["codes"]).toEqual({ source: "engine", reviewed: false });
    expect([doc.settings.paper, doc.settings.orientation, doc.settings.scale]).toEqual(["A3", "landscape", null]);
  });

  it("takes an office code library uploaded with the files over the carried list, for the surveyor to check once", async () => {
    carried.value = { codes: { entries: office, from: "Lot 7" }, settings: null };
    const fcl = ["Code,Linework,3D Linework,Layer,Description", "CP,None,No,MON,Concrete Post", "St,None,No,MON,Boundary Stone", "MW,2D Polyline,No,WALL,Masonry Wall"].join("\n");
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }], library: { name: "office.fcl", content: fcl } });
    const doc = calls[0]!.input.document as ReturnType<typeof emptyDocument>;
    expect(doc.codes.map((c) => [c.code, c.meaning, c.kind])).toEqual([
      ["CP", "Concrete Post", "mark"],
      ["St", "Boundary Stone", "mark"],
      ["MW", "Masonry Wall", "line"],
    ]);
    expect(doc.provenance["codes"]).toEqual({ source: "engine", reviewed: false });
  });

  it("never lets the Survey Department's list replace an office library, only the common list", async () => {
    // Corner marks coded with the Survey Department's own codes (CoP, WoP), which the common list lacks.
    const dsrFile = ["Point,Easting,Northing,Height,Code", "1,450000.000,700000.000,20.00,CoP", "2,450040.000,700000.000,20.00,WoP", "3,450040.000,700030.000,20.00,CoP", "4,450000.000,700030.000,20.00,WoP"].join("\n");
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "dsr.csv", content: dsrFile }] });
    const swapped = calls.find((c) => c.kind === "draw")?.input.document as ReturnType<typeof emptyDocument> | undefined;
    expect(swapped?.codes.some((c) => c.code === "CoP")).toBe(true);
    calls.length = 0;
    const fcl = ["Code,Description", "CoP,Concrete post", "WoP,Wooden post"].join("\n");
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "dsr.csv", content: dsrFile }], library: { name: "office.csv", content: fcl } });
    const kept = calls.find((c) => c.kind === "draw")?.input.document as ReturnType<typeof emptyDocument> | undefined;
    expect(kept?.codes.map((c) => c.meaning)).toEqual(["Concrete post", "Wooden post"]);
  });

  it("stops before anything is saved when the code library can't be read", async () => {
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }], library: { name: "office.fcl", content: "Name,Layer\nIP,MON" } });
    expect(r.result).toMatchObject({ status: "error", problems: [{ file: "office.fcl", problem: "This code library has no Code column in its first line." }] });
    expect(calls).toEqual([]);
  });
});
