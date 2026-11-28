/**
 * AutoSurvey's Generate Plan (stage 222), run as the server runs it, with the database standing in: every problem stops it before a
 * project exists, and a clean set of files becomes one project, one source per file and one drawn version. SYNTHETIC values only.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyDocument } from "@/core/survey/document";

// Shared with the stand-ins below, which vitest moves above everything else.
const { calls, stored, carried, created, jobs, cutOff, office, person } = vi.hoisted(() => ({
  // Who is generating, and whether they have surveyor details in the workspace (stage 294).
  person: { id: "user-1", surveyor: false },
  // The workspace's office profiles (stage 248) and what the store was asked to save or remember.
  office: { profiles: [] as unknown[], saved: [] as Record<string, unknown>[], chosen: [] as (string | null)[], saveResult: null as unknown },
  // A cut-off run the page shows (stage 235), and whether its record can still be written.
  cutOff: { job: null as unknown, writable: true, latest: 1, conflict: false, sources: [] as unknown[] },
  carried: { value: { codes: null, settings: null } as unknown, recent: [] as unknown[] },
  created: { document: null as unknown },
  jobs: [] as { kind: string; input: Record<string, unknown> }[],
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
  loadAppContext: async () => ({ mode: "live", current: { id: "org-1" }, user: { id: person.id }, role: "owner", writes: { enabled: true, reason: "" } }),
}));
vi.mock("@/server/supabase/admin", () => ({ createSupabaseAdminClient: () => ({}) }));
// The person's own reads: only the detailed import asks one (the project's grid), so the chain answers that.
vi.mock("@/server/supabase/server", () => {
  const chain: Record<string, unknown> = {};
  for (const k of ["from", "select", "eq", "is"]) chain[k] = () => chain;
  chain.maybeSingle = async () => ({ data: { crs_id: "EPSG:5235" } });
  return { createSupabaseServerClient: async () => chain };
});
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
      jobStart: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        jobs.push({ kind: "start", input });
        return { ok: true, value: "22222222-2222-4222-8222-222222222222" };
      },
      jobUpdate: async (_a: unknown, _org: unknown, input: Record<string, unknown>) => {
        jobs.push({ kind: "update", input });
        if (!cutOff.writable) return { ok: false, message: "NOT_FOUND" };
        return { ok: true, value: null };
      },
      saveOfficeProfile: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        office.saved.push(input);
        return office.saveResult ?? { ok: true, value: { id: "33333333-3333-4333-8333-333333333333", version: input.baseVersion ? Number(input.baseVersion) + 1 : 1 } };
      },
      chooseOfficeProfile: async (_a: unknown, _b: unknown, id: string | null) => {
        office.chosen.push(id);
        return { ok: true, value: null };
      },
      saveDrawing: async (_a: unknown, _b: unknown, input: Record<string, unknown>) => {
        // Another press saved first: the database refuses a save that doesn't build on the latest version.
        if (cutOff.conflict) return { ok: false, code: "VERSION_CONFLICT", message: "VERSION_CONFLICT" };
        calls.push({ kind: "draw", input });
        return { ok: true, value: 2 };
      },
    },
  };
});
vi.mock("@/server/survey/defaults", () => ({ loadStartingDefaults: async () => carried.value, loadRecentPlans: async () => carried.recent, hasSurveyorDetails: async () => person.surveyor }));
vi.mock("@/server/survey/profiles", () => ({ loadOfficeProfiles: async () => office.profiles, loadProfileChoice: async () => null, loadProfileVersions: async () => [] }));
vi.mock("@/server/survey/jobs", async () => {
  const actual = await vi.importActual<typeof import("@/server/survey/jobs")>("@/server/survey/jobs");
  return { ...actual, loadJob: async () => cutOff.job };
});
vi.mock("@/server/survey/read", () => ({
  loadSurveyProject: async () => ({
    project: { id: "11111111-1111-4111-8111-111111111111", crsId: "EPSG:5235" },
    points: stored.map((p, i) => ({ id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`, ...p })),
    sources: cutOff.sources,
    drawing: { readable: true, document: created.document ?? emptyDocument(), version: cutOff.latest },
    versions: [],
    approvals: [],
    exports: [],
    profiles: [],
  }),
}));

const { answerProfileSuggestionAction, generateSurveyPlanAction, saveOfficeProfileAction } = await import("./actions");

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
  carried.recent = [];
  created.document = null;
  jobs.length = 0;
  Object.assign(cutOff, { job: null, writable: true, latest: 1, conflict: false, sources: [] });
  Object.assign(office, { profiles: [], saved: [], chosen: [], saveResult: null });
  Object.assign(person, { id: "user-1", surveyor: false });
});

describe("suggestions learned from the surveyor's plans (stage 270, ADR 0277)", () => {
  const sheetOf = () => {
    const s = emptyDocument().settings;
    return { template: s.template, paper: s.paper, orientation: s.orientation, perchDecimals: s.perchDecimals, secondDecimals: s.secondDecimals, distanceDecimals: s.distanceDecimals, overleaf: s.overleaf, permitBox: s.permitBox, slant: s.slant, faceDimensions: s.faceDimensions };
  };
  const PROFILE = { id: "66666666-6666-4666-8666-666666666666", name: "Sokkia office", version: 2, updatedAt: "2026-11-24T00:00:00Z", body: { crsId: "EPSG:5235", equipment: [], codes: null, sheet: sheetOf(), statement: "" } };
  const ticked = (name: string) => {
    const d = emptyDocument();
    d.settings.wallTicks = true;
    // Started from the profile (ADR 0277): only such plans are learned from.
    d.fromProfile = { id: PROFILE.id, version: 1 };
    return { name, document: d };
  };

  it("adds a suggestion worked out again on the server, as a new version, and turns one down so it isn't offered again", async () => {
    office.profiles = [PROFILE];
    carried.recent = [ticked("Plan B"), ticked("Plan A")];
    const added = await answerProfileSuggestionAction({ profileId: PROFILE.id, baseVersion: 2, key: "setting:wallTicks=on", accept: true });
    expect(added).toMatchObject({ status: "done", version: 3, message: expect.stringContaining("Added to the profile") });
    expect((office.saved.at(-1)!.body as { sheet: { wallTicks?: boolean } }).sheet.wallTicks).toBe(true);
    expect(office.saved.at(-1)).toMatchObject({ profileId: PROFILE.id, baseVersion: 2, name: "Sokkia office" });

    const turned = await answerProfileSuggestionAction({ profileId: PROFILE.id, baseVersion: 2, key: "setting:wallTicks=on", accept: false });
    expect(turned).toMatchObject({ status: "done", message: expect.stringContaining("won't be suggested again") });
    expect((office.saved.at(-1)!.body as { declined: string[] }).declined).toEqual(["setting:wallTicks=on"]);
  });

  it("saves nothing for a stale version, a suggestion the plans no longer make, or a profile not in the workspace", async () => {
    office.profiles = [PROFILE];
    carried.recent = [ticked("Plan B"), ticked("Plan A")];
    expect(await answerProfileSuggestionAction({ profileId: PROFILE.id, baseVersion: 1, key: "setting:wallTicks=on", accept: true })).toMatchObject({ status: "error", message: expect.stringContaining("newer version") });
    expect(await answerProfileSuggestionAction({ profileId: PROFILE.id, baseVersion: 2, key: "setting:noLotLetters=on", accept: true })).toMatchObject({ status: "error", message: expect.stringContaining("no longer applies") });
    carried.recent = [ticked("Plan B")];
    expect(await answerProfileSuggestionAction({ profileId: PROFILE.id, baseVersion: 2, key: "setting:wallTicks=on", accept: true })).toMatchObject({ status: "error" });
    office.profiles = [];
    expect(await answerProfileSuggestionAction({ profileId: PROFILE.id, baseVersion: 2, key: "setting:wallTicks=on", accept: true })).toMatchObject({ status: "error" });
    expect(office.saved).toEqual([]);
  });
});

describe("office profiles (stage 248)", () => {
  const PROFILE = {
    id: "44444444-4444-4444-8444-444444444444",
    name: "Sokkia office",
    version: 3,
    updatedAt: "2026-11-24T00:00:00Z",
    body: {
      crsId: "EPSG:5235",
      equipment: [{ kind: "total_station", make: "Sokkia", model: "CX", exports: ["sdr", "delimited"] }],
      codes: { entries: [{ code: "CP", meaning: "Concrete Post", kind: "mark", line: "solid", legend: true }, { code: "St", meaning: "Stake", kind: "mark", line: "solid", legend: true }, { code: "BW", meaning: "Boundary wall", kind: "line", line: "solid", legend: true }], grammar: "carlson" },
      sheet: { ...emptyDocument().settings, paper: "A3", orientation: "landscape" },
      statement: "As pointed out by the owner and the neighbours",
    },
  };

  it("starts the plan from the chosen profile: its list taken as checked, its sheet and statement, and remembers the choice", async () => {
    office.profiles = [PROFILE];
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }], profileId: PROFILE.id });
    expect(r.result?.status).toBe("done");
    const doc = calls[0]!.input.document as ReturnType<typeof emptyDocument>;
    expect(doc.codes.map((c) => c.code)).toEqual(["CP", "St", "BW"]);
    expect(doc.grammar).toBe("carlson");
    expect(doc.provenance["codes"]).toEqual({ source: "engine", reviewed: true });
    expect(doc.settings).toMatchObject({ paper: "A3", orientation: "landscape" });
    expect(doc.sheet.statement).toBe("As pointed out by the owner and the neighbours");
    expect(office.chosen).toEqual([PROFILE.id]);
    expect(String(calls.find((c) => c.kind === "draw")!.input.note)).toContain('with the office profile "Sokkia office" (version 3)');
  });

  it("layers a profile over the surveyor's own defaults: one without a sheet keeps their sheet; none forgets the choice", async () => {
    const mine = { ...emptyDocument().settings, paper: "A2", orientation: "portrait" };
    carried.value = { codes: null, settings: { values: mine, from: "Earlier plan" } };
    office.profiles = [{ ...PROFILE, body: { ...PROFILE.body, sheet: null } }];
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }], profileId: PROFILE.id });
    const doc = calls[0]!.input.document as ReturnType<typeof emptyDocument>;
    expect(doc.settings).toMatchObject({ paper: "A2", orientation: "portrait" });
    expect(doc.provenance["codes"]).toEqual({ source: "engine", reviewed: true });
    calls.length = 0;
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }] });
    expect(office.chosen).toEqual([PROFILE.id, null]);
  });

  it("refuses a profile that isn't in the workspace before anything is saved", async () => {
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }], profileId: PROFILE.id });
    expect(r.result).toMatchObject({ status: "error", message: expect.stringContaining("isn't in this workspace any more") });
    expect(calls).toEqual([]);
  });

  it("saves a profile only when it's whole: a name, a known grid, a version to build on when editing", async () => {
    const ok = await saveOfficeProfileAction({ profileId: null, baseVersion: null, name: "  Leica office  ", body: { ...PROFILE.body, codes: null } as never });
    expect(ok).toMatchObject({ status: "done", version: 1 });
    expect(office.saved[0]).toMatchObject({ name: "Leica office", profileId: null });
    expect(await saveOfficeProfileAction({ profileId: null, baseVersion: null, name: "  ", body: PROFILE.body as never })).toMatchObject({ status: "error" });
    expect(await saveOfficeProfileAction({ profileId: null, baseVersion: null, name: "Bad grid", body: { ...PROFILE.body, crsId: "EPSG:9999" } as never })).toMatchObject({ status: "error" });
    expect(await saveOfficeProfileAction({ profileId: PROFILE.id, baseVersion: null, name: "No base", body: PROFILE.body as never })).toMatchObject({ status: "error" });
    office.saveResult = { ok: false, code: "VERSION_CONFLICT", message: "VERSION_CONFLICT" };
    expect(await saveOfficeProfileAction({ profileId: PROFILE.id, baseVersion: 3, name: "Late", body: PROFILE.body as never })).toMatchObject({ status: "error", message: expect.stringContaining("newer version of this profile") });
    expect(office.saved).toHaveLength(2);
  });
});

describe("Generate Plan", () => {
  it("makes one project with the grid confirmed, imports each file as its own source, draws once and opens the plan", async () => {
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "extra.csv", content: extra }] });
    expect(r.result).toEqual({ status: "done", projectId: "11111111-1111-4111-8111-111111111111", next: "/app/survey/11111111-1111-4111-8111-111111111111?step=plan&generated=1", version: 2, jobId: "22222222-2222-4222-8222-222222222222" });
    // The run as a job: importing, then drawing, then done, since no sketches follow (ADR 0239).
    const last = jobs.at(-1)!.input as { state: string; stages: { id: string; state: string }[]; result: { next?: string } };
    expect(jobs.map((j) => j.kind)).toEqual(["start", "update", "update"]);
    expect(last.state).toBe("done");
    expect(last.stages.map((x) => [x.id, x.state])).toEqual([["import", "done"], ["draw", "done"], ["sketches", "skipped"]]);
    expect(last.result.next).toBe("/app/survey/11111111-1111-4111-8111-111111111111?step=plan&generated=1");
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
    expect(clash.result?.status === "error" && clash.result.problems[0]!.problem).toMatch(/^Point 1 is at a different place/);
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
    expect(r.result).toEqual({ status: "done", projectId: "11111111-1111-4111-8111-111111111111", next: "/app/survey/11111111-1111-4111-8111-111111111111?step=draft&generated=1", version: 1, jobId: "22222222-2222-4222-8222-222222222222" });
    expect(calls.map((c) => c.kind)).toEqual(["create", "import"]);
  });

  it("uses the surveyor's own project name", async () => {
    await generate({ title: "Lot 7 boundary", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }] });
    expect(calls[0]!.input.name).toBe("Lot 7 boundary");
  });

  it("names the person generating as the plan's surveyor from the start, when they have surveyor details (stage 294)", async () => {
    // Files with no codes draw nothing first, so the plan the sketch later draws must already name them.
    const plain = ["Point,Easting,Northing,Height,Code", "1,450000.000,700000.000,20.00,Tree", "2,450040.000,700000.000,20.00,Tree"].join("\n");
    Object.assign(person, { id: "44444444-4444-4444-8444-444444444444", surveyor: true });
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "trees.csv", content: plain }] });
    expect((created.document as { surveyorUserId: string | null }).surveyorUserId).toBe("44444444-4444-4444-8444-444444444444");
    // Without surveyor details, nobody is named.
    calls.length = 0;
    Object.assign(person, { surveyor: false });
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "trees.csv", content: plain }] });
    expect((created.document as { surveyorUserId: string | null }).surveyorUserId).toBeNull();
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
    // A Carlson library brings Carlson's line words (ADR 0243).
    expect(doc.grammar).toBe("carlson");
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

describe("Generate Plan's job (stage 229, ADR 0239)", () => {
  it("keeps the job running with the sketches stage started when photos follow", async () => {
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }], sketches: 2 });
    expect(r.result).toMatchObject({ status: "done", jobId: "22222222-2222-4222-8222-222222222222" });
    const last = jobs.at(-1)!.input as { state: string; stages: { id: string; state: string; label: string }[] };
    expect(last.state).toBe("running");
    expect(last.stages.map((x) => [x.id, x.state])).toEqual([["import", "done"], ["draw", "done"], ["sketches", "running"]]);
    expect(last.stages[2]!.label).toBe("Reading 2 sketches with Claude");
  });
});

const { importSurveyPointsAction } = await import("./actions");

describe("Generate Plan with a traverse (stage 231, ADR 0241)", () => {
  // A SYNTHETIC Sokkia SDR33 loop beside the boundary: control A, east to B, north to C, back to A about 2 cm long.
  const f16 = (s: string) => s.padEnd(16);
  const id16 = (s: string) => s.padStart(16);
  const sdr = [
    `00NM${f16("SDR33 V04-04.02")}${"".padEnd(4)}${f16("23-Nov-26 09:30")}111111`,
    `01NM${" ".repeat(46)}1`,
    `08KI${id16("BS")}${f16("700200.000")}${f16("450100.000")}${f16("20.000")}${f16("TS")}`,
    `02TP${id16("A")}${f16("700100.000")}${f16("450100.000")}${f16("20.000")}${f16("1.500")}${f16("STN")}`,
    `03NM${f16("1.500")}`,
    `07TP${id16("A")}${id16("BS")}${f16("0.0000")}${f16("0.0000")}`,
    `09F1${id16("A")}${id16("B")}${f16("100.000")}${f16("90.0000")}${f16("90.0000")}${f16("TS")}`,
    `02TP${id16("B")}${f16("")}${f16("")}${f16("")}${f16("1.500")}${f16("STN")}`,
    `03NM${f16("1.500")}`,
    `07TP${id16("B")}${id16("A")}${f16("270.0000")}${f16("0.0000")}`,
    `09F1${id16("B")}${id16("C")}${f16("100.000")}${f16("90.0000")}${f16("90.0000")}${f16("TS")}`,
    `02TP${id16("C")}${f16("")}${f16("")}${f16("")}${f16("1.500")}${f16("STN")}`,
    `03NM${f16("1.500")}`,
    `07TP${id16("C")}${id16("B")}${f16("180.0000")}${f16("0.0000")}`,
    `09F1${id16("C")}${id16("A")}${f16("141.441356")}${f16("90.0000")}${f16("45.0000")}${f16("TS")}`,
  ].join("\n");
  const traverseOf = (n: number) => ((calls[n]!.input.settings as { reduction: { traverse: Record<string, unknown> } }).reduction.traverse);

  it("keeps the points as shot unless a rule is chosen, then records the rule with the import and in the version's note", async () => {
    const plain = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "job.sdr", content: sdr }] });
    expect(plain.result).toMatchObject({ status: "done" });
    expect(traverseOf(2)).toMatchObject({ start: "A", through: ["B", "C"], closesOn: "A", adjusted: null });
    expect(String(calls.at(-1)!.input.note)).toBe("Drawn by AutoSurvey from 2 files");
    const shotC = stored.find((p) => p.pointId === "C")!;

    calls.length = 0;
    stored.length = 0;
    const adjusted = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "job.sdr", content: sdr, adjust: "compass" }] });
    expect(adjusted.result).toMatchObject({ status: "done" });
    expect(traverseOf(2)).toMatchObject({ adjusted: { method: "compass", engine: "adjust/1.1.0" } });
    expect(String(calls.at(-1)!.input.note)).toBe("Drawn by AutoSurvey from 2 files, the traverse adjusted by the compass rule (Bowditch) as chosen");
    // C moved towards closing the loop, by under a centimetre in each direction.
    const c = stored.find((p) => p.pointId === "C")!;
    expect(c.e - shotC.e).toBeGreaterThan(0.005);
    expect(c.e - shotC.e).toBeLessThan(0.01);
    expect(stored.find((p) => p.pointId === "A")).toMatchObject({ e: 450100, n: 700100 });
  });

  it("weighs least squares by the chosen office profile's total station, read on the server, and records which (ADR 0274)", async () => {
    const own = { angleSeconds: 2, distanceMm: 1, distancePpm: 1.5 };
    office.profiles = [
      {
        id: "55555555-5555-4555-8555-555555555555",
        name: "Sokkia office",
        version: 1,
        updatedAt: "2026-11-24T00:00:00Z",
        body: { crsId: "EPSG:5235", equipment: [{ kind: "total_station", make: "Sokkia", model: "CX", exports: ["sdr"], precision: own }], codes: null, sheet: null, statement: "" },
      },
    ];
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "job.sdr", content: sdr, adjust: "least_squares" }], profileId: "55555555-5555-4555-8555-555555555555" });
    expect(r.result).toMatchObject({ status: "done" });
    expect(traverseOf(2)).toMatchObject({ adjusted: { method: "least_squares", stats: { precision: { ...own, instrument: "Sokkia CX" } } } });
    // The version's note says what it was weighed by.
    expect(String(calls.at(-1)!.input.note)).toBe('Drawn by AutoSurvey from 2 files, the traverse adjusted by least squares (2″, 1 mm + 1.5 ppm, from the office profile) as chosen, with the office profile "Sokkia office" (version 1)');

    // Without a profile: a typical total station's, and the record says so by its figures.
    calls.length = 0;
    stored.length = 0;
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "job.sdr", content: sdr, adjust: "least_squares" }] });
    expect(traverseOf(2)).toMatchObject({ adjusted: { method: "least_squares", stats: { precision: { angleSeconds: 5, distanceMm: 2, distancePpm: 2 } } } });
    expect((traverseOf(2).adjusted as { stats: { precision: { instrument?: string } } }).stats.precision.instrument).toBeUndefined();
    expect(String(calls.at(-1)!.input.note)).toBe("Drawn by AutoSurvey from 2 files, the traverse adjusted by least squares (5″, 2 mm + 2 ppm, typical) as chosen");

    // A long profile name is shortened to keep the note within 200 characters, never its version.
    calls.length = 0;
    stored.length = 0;
    (office.profiles[0] as { name: string }).name = "Sokkia CX-105 set-up for the Kandy and Kegalle offices, field crews A and B, 2026";
    await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary }, { name: "job.sdr", content: sdr, adjust: "least_squares" }], profileId: "55555555-5555-4555-8555-555555555555" });
    const note = String(calls.at(-1)!.input.note);
    expect(note.length).toBeLessThanOrEqual(200);
    expect(note).toMatch(/…" \(version 1\)$/);
  });

  it("stops before anything is saved when a rule is chosen for a file it can't adjust", async () => {
    const r = await generate({ title: "", crsId: "EPSG:5235", files: [{ name: "boundary.csv", content: boundary, adjust: "transit" }] });
    expect(r.result).toMatchObject({ status: "error", problems: [{ file: "boundary.csv", problem: expect.stringMatching(/adjusts only a Sokkia SDR job's traverse/) }] });
    expect(calls).toEqual([]);
  });
});

describe("The detailed import with a traverse (stage 231, ADR 0241)", () => {
  const f16 = (s: string) => s.padEnd(16);
  const id16 = (s: string) => s.padStart(16);
  // The same SYNTHETIC loop as above, beside the boundary already imported.
  const sdr = [
    `00NM${f16("SDR33 V04-04.02")}${"".padEnd(4)}${f16("23-Nov-26 09:30")}111111`,
    `01NM${" ".repeat(46)}1`,
    `08KI${id16("BS")}${f16("700200.000")}${f16("450100.000")}${f16("20.000")}${f16("TS")}`,
    `02TP${id16("A")}${f16("700100.000")}${f16("450100.000")}${f16("20.000")}${f16("1.500")}${f16("STN")}`,
    `03NM${f16("1.500")}`,
    `07TP${id16("A")}${id16("BS")}${f16("0.0000")}${f16("0.0000")}`,
    `09F1${id16("A")}${id16("B")}${f16("100.000")}${f16("90.0000")}${f16("90.0000")}${f16("TS")}`,
    `02TP${id16("B")}${f16("")}${f16("")}${f16("")}${f16("1.500")}${f16("STN")}`,
    `03NM${f16("1.500")}`,
    `07TP${id16("B")}${id16("A")}${f16("270.0000")}${f16("0.0000")}`,
    `09F1${id16("B")}${id16("C")}${f16("100.000")}${f16("90.0000")}${f16("90.0000")}${f16("TS")}`,
    `02TP${id16("C")}${f16("")}${f16("")}${f16("")}${f16("1.500")}${f16("STN")}`,
    `03NM${f16("1.500")}`,
    `07TP${id16("C")}${id16("B")}${f16("180.0000")}${f16("0.0000")}`,
    `09F1${id16("C")}${id16("A")}${f16("141.441356")}${f16("90.0000")}${f16("45.0000")}${f16("TS")}`,
  ].join("\n");
  const input = { projectId: "11111111-1111-4111-8111-111111111111", fileName: "job.sdr", content: sdr, format: "sdr" as const, delimiter: "," as const, hasHeader: false, columns: ["point", "easting", "northing"] as ("point" | "easting" | "northing")[], units: "metre" as const, crsId: "EPSG:5235" };

  it("adjusts only by the rule chosen, records it with the import and says it in the version's note", async () => {
    // The boundary is already in the project, so importing the job draws the plan.
    stored.push(...["1,450000.000,700000.000,CP", "2,450040.000,700000.000,CP", "3,450040.000,700030.000,St", "4,450000.000,700030.000,St"].map((l) => {
      const [pointId, e, n, code] = l.split(",");
      return { pointId: pointId!, e: Number(e), n: Number(n), z: null, code: code! };
    }));
    const first = await importSurveyPointsAction({ ...input, adjust: "compass" });
    expect(first).toMatchObject({ status: "done", version: 2 });
    const settings = calls.find((c) => c.kind === "import")!.input.settings as { reduction: { traverse: { adjusted: { method: string } } } };
    expect(settings.reduction.traverse.adjusted.method).toBe("compass");
    expect(String(calls.find((c) => c.kind === "draw")!.input.note)).toBe("Drawn from job.sdr, the traverse adjusted by the compass rule (Bowditch) as chosen");

    calls.length = 0;
    await importSurveyPointsAction({ ...input, fileName: `${"x".repeat(196)}.sdr`, adjust: "transit" });
    // A long name gives way: the note stays within the 200 characters a version holds, and still names the rule.
    const note = String(calls.find((c) => c.kind === "draw")?.input.note ?? "");
    expect(note.length).toBeLessThanOrEqual(200);
    expect(note.endsWith("the traverse adjusted by the transit rule as chosen")).toBe(true);
  });

  it("refuses a rule chosen for a points file, with nothing saved", async () => {
    const r = await importSurveyPointsAction({ ...input, fileName: "pts.csv", content: "1,450000,700000\n", format: "delimited", adjust: "compass" });
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("Nothing was imported. You chose to adjust by the compass rule (Bowditch), and Farbaek adjusts only a Sokkia SDR job") });
    expect(calls).toEqual([]);
  });
});

describe("Finishing a cut-off run (stage 235)", () => {
  const projectId = "11111111-1111-4111-8111-111111111111";
  const jobId = "33333333-3333-4333-8333-333333333333";
  const quiet = new Date(Date.now() - 60 * 60_000).toISOString();
  const cut = (importing: string, drawing: string) => ({
    id: jobId,
    state: "running",
    stages: [
      { id: "import", label: "Importing 1 file", state: importing, startedAt: quiet, ms: 900 },
      { id: "draw", label: "Drawing the plan", state: drawing, startedAt: quiet },
      { id: "sketches", label: "Reading 2 sketches with Claude", state: "waiting" },
    ],
    result: {},
    started_at: quiet,
    updated_at: quiet,
  });
  const boundaryPoints = () =>
    stored.push(
      ...["1,450000.000,700000.000,CP", "2,450040.000,700000.000,CP", "3,450040.000,700030.000,St", "4,450000.000,700030.000,St"].map((l) => {
        const [pointId, e, n, code] = l.split(",");
        return { pointId: pointId!, e: Number(e), n: Number(n), z: null, code: code! };
      }),
    );

  it("draws the plan from the imported points and finishes the run's own record, the sketches left to read again", async () => {
    boundaryPoints();
    cutOff.job = cut("done", "running");
    cutOff.writable = true;
    const { finishCutOffRunAction } = await import("./actions");
    const r = await finishCutOffRunAction({ projectId, jobId });
    expect(r).toMatchObject({ status: "done", version: 2 });
    expect(String(calls.find((c) => c.kind === "draw")!.input.note)).toBe("Drawn by AutoSurvey after the run was cut off");
    const last = jobs.at(-1)!.input as { state: string; stages: { id: string; state: string; detail?: string }[] };
    expect(jobs.map((j) => j.kind)).toEqual(["update"]);
    expect(last.state).toBe("done");
    expect(last.stages.map((x) => [x.id, x.state])).toEqual([["import", "done"], ["draw", "done"], ["sketches", "skipped"]]);
    expect(last.stages[2]!.detail).toBe("The photos weren't kept by the cut-off run: read them again from the Draft step.");
    // The drawing is timed now, and the record says it finished later, so its start-to-finish time is never shown or counted.
    expect((last.stages[1] as { ms?: number }).ms).toBeGreaterThanOrEqual(0);
    expect((jobs.at(-1)!.input as { result: Record<string, unknown> }).result).toMatchObject({ finishedLater: true });
  });

  it("offers the survey date the files stated, kept with their import", async () => {
    boundaryPoints();
    cutOff.job = cut("done", "running");
    cutOff.sources = [{ settings: { by: "autosurvey", surveyDate: "2026-11-14" } }];
    const { finishCutOffRunAction } = await import("./actions");
    await finishCutOffRunAction({ projectId, jobId });
    expect((calls.find((c) => c.kind === "draw")!.input.document as { sheet: { surveyDate: string } }).sheet.surveyDate).toBe("2026-11-14");
  });

  it("never draws over a plan saved since the run stopped, and leaves its record alone", async () => {
    boundaryPoints();
    cutOff.job = cut("done", "running");
    cutOff.latest = 3;
    const { finishCutOffRunAction } = await import("./actions");
    const r = await finishCutOffRunAction({ projectId, jobId });
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("saved since") });
    expect(calls.filter((c) => c.kind === "draw")).toEqual([]);
    expect(jobs).toEqual([]);
  });

  it("leaves the record to the press that drew first when two presses race", async () => {
    boundaryPoints();
    cutOff.job = cut("done", "running");
    cutOff.conflict = true;
    const { finishCutOffRunAction } = await import("./actions");
    const r = await finishCutOffRunAction({ projectId, jobId });
    expect(r).toMatchObject({ status: "error", message: expect.stringContaining("someone else") });
    expect(jobs).toEqual([]);
  });

  it("writes a new record only when the sweep closed the run's own", async () => {
    boundaryPoints();
    cutOff.job = { ...cut("done", "running"), state: "interrupted" };
    cutOff.writable = false;
    const { finishCutOffRunAction } = await import("./actions");
    const r = await finishCutOffRunAction({ projectId, jobId });
    cutOff.writable = true;
    expect(r).toMatchObject({ status: "done" });
    expect(jobs.map((j) => j.kind)).toEqual(["update", "start", "update"]);
    expect((jobs[1]!.input.stages as { id: string; detail?: string }[])[0]!.detail).toBe("Imported before the run was cut off.");
    expect((jobs[2]!.input as { result: Record<string, unknown> }).result).toMatchObject({ finishedLater: true });
  });

  it("adds no second record when a still-running record can't be written", async () => {
    boundaryPoints();
    cutOff.job = cut("done", "running");
    cutOff.writable = false;
    const { finishCutOffRunAction } = await import("./actions");
    const r = await finishCutOffRunAction({ projectId, jobId });
    expect(r).toMatchObject({ status: "done" });
    expect(jobs.map((j) => j.kind)).toEqual(["update"]);
  });

  it("refuses a run that's finished, still working, or cut off before its files were all imported, drawing nothing", async () => {
    const { finishCutOffRunAction } = await import("./actions");
    for (const job of [{ ...cut("done", "done"), state: "done" }, { ...cut("done", "running"), updated_at: new Date().toISOString() }, cut("running", "waiting"), null]) {
      cutOff.job = job;
      const r = await finishCutOffRunAction({ projectId, jobId });
      expect(r.status).toBe("error");
    }
    expect(calls.filter((c) => c.kind === "draw")).toEqual([]);
    expect(jobs).toEqual([]);
  });
});
