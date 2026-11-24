"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADJUST_METHODS, ADJUST_NAMES, weighedShort } from "@/core/survey/adjust";
import { grammarForLibrary } from "@/core/survey/grammar";
import { autoDraft } from "@/core/survey/autodraft";
import { START_LIMITS, gridProblem, importOrder, importPointsOf, pointClashes, readSurveyFile, readTogether, startName, statedSurveyDate, drawsWithDsrList, type FileRead, type StartProblem } from "@/core/survey/autosurvey/start";
import { codesAreCommonList, dsrCodes } from "@/core/survey/codes";
import { LIBRARY_LIMITS, libraryFor, parseCodeLibrary } from "@/core/survey/codelib";
import { withDefaults } from "@/core/survey/autosurvey/defaults";
import { officeProfileBodySchema, profileFromPlan, profilePrecision, withProfile, type OfficeProfile } from "@/core/survey/profile";
import { numberKey, redrawFromCorrection } from "@/core/survey/sketchintel/correct";
import { interpretDocument } from "@/core/survey/sketchintel/findings";
import { FIRST_VERSION, finishable, generateStages, type JobStage } from "@/core/survey/autosurvey/job";
import { SKETCH_LIMITS } from "@/core/survey/autosurvey/sketch";
import { crsById } from "@/core/survey/crs";
import { emptyDocument, provenanceLive, pruneConstructed, pruneProvenance, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "@/core/survey/document";
import { itemOf } from "@/core/survey/exceptions";
import { IMPORT_LIMITS, type ColumnRole, type Delimiter, type ImportIssue } from "@/core/survey/import/delimited";
import { unreadableFile } from "@/core/survey/import/detect";
import { readPoints } from "@/core/survey/import/read";
import { approvalHash, buildPlan } from "@/core/survey/view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { loadStartingDefaults } from "@/server/survey/defaults";
import { loadOfficeProfiles } from "@/server/survey/profiles";
import { JobTracker, loadJob } from "@/server/survey/jobs";
import { SURVEY_MESSAGES, surveyStore, type Actor } from "@/server/survey/store";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SurveyFormState =
  | { status: "idle" }
  | { status: "error"; message: string; issues?: ImportIssue[] }
  | { status: "done"; message: string; version?: number; drawn?: string[]; notDrawn?: string[]; drawError?: string };

interface Writer {
  admin: SupabaseClient;
  user: SupabaseClient;
  actor: Actor;
}

/** The signed-in contributor of the open workspace, with the server's write client, or why not. */
async function writer(): Promise<{ ok: true; w: Writer } | { ok: false; message: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { ok: false, message: "The demo workspace is read-only, so nothing here is saved." };
  if (!ctx.current) return { ok: false, message: "Create a workspace first." };
  if (!ctx.writes.enabled) return { ok: false, message: ctx.writes.reason };
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { ok: false, message: SURVEY_MESSAGES.FORBIDDEN };
  const admin = createSupabaseAdminClient();
  const user = await createSupabaseServerClient();
  if (!admin || !user) return { ok: false, message: SURVEY_MESSAGES.NOT_CONFIGURED };
  return { ok: true, w: { admin, user, actor: { orgId: ctx.current.id, userId: ctx.user.id } } };
}

const uuid = z.string().uuid();

export async function createSurveyProjectAction(_prev: SurveyFormState, form: FormData): Promise<SurveyFormState> {
  const name = String(form.get("name") ?? "").trim();
  const crsId = String(form.get("crs") ?? "");
  const confirm = form.get("confirm") === "yes";
  if (name.length < 1 || name.length > 120) return { status: "error", message: "Give the project a name of 1 to 120 characters." };
  if (!crsById(crsId)) return { status: "error", message: "Choose the coordinate system the survey's points are in." };
  if (!confirm) return { status: "error", message: "Confirm the coordinate system. Farbaek never guesses it from the numbers." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await surveyStore.createProject(g.w.admin, g.w.actor, { name, planType: "cadastral", crsId, confirm, document: emptyDocument() });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/app/survey");
  redirect(`/app/survey/${r.value}?step=import`);
}

export async function updateSurveyProjectAction(_prev: SurveyFormState, form: FormData): Promise<SurveyFormState> {
  const projectId = String(form.get("projectId") ?? "");
  const name = String(form.get("name") ?? "").trim();
  const crsId = String(form.get("crs") ?? "");
  const confirm = form.get("confirm") === "yes";
  if (!uuid.safeParse(projectId).success || name.length < 1 || name.length > 120 || !crsById(crsId)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await surveyStore.updateProject(g.w.admin, g.w.actor, { projectId, name, crsId, confirm });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: confirm ? "Saved. The coordinate system is confirmed, by you." : "Saved." };
}

const importInput = z.object({
  projectId: uuid,
  fileName: z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),
  content: z.string().max(IMPORT_LIMITS.maxBytes),
  format: z.enum(["delimited", "geojson", "gsi", "sdr", "landxml", "jobxml", "fieldbook", "sokkialist", "dxf"]),
  delimiter: z.enum([",", "\t", ";", "whitespace"]),
  hasHeader: z.boolean(),
  columns: z.array(z.enum(["point", "easting", "northing", "elevation", "code", "ignore"])).min(3).max(40),
  units: z.literal("metre"),
  /** The grid the page showed when the person confirmed the units. */
  crsId: z.string().max(40),
  /** Draw the plan from the points straight after the import, when the plan has no lots yet (stage 194). */
  drawPlan: z.boolean().default(true),
  /** The code list to draw with: the project's, or the Survey Department's (DSR Chapter XXII) when the file uses its codes. */
  codeList: z.enum(["project", "dsr"]).default("project"),
  /** The rule the surveyor chose to adjust the job's traverse by (ADR 0241); none keeps the points as shot. */
  adjust: z.enum(ADJUST_METHODS).nullable().default(null),
});

/**
 * Imports a point file. The server reads the file itself with the same tested
 * reader the preview used: the browser's parsed rows are never trusted. Any
 * row that can't be read refuses the whole import, so nothing half-arrives.
 */
export async function importSurveyPointsAction(input: z.input<typeof importInput>): Promise<SurveyFormState> {
  const parsed = importInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const i = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  // The project's grid, read as the person: a GeoJSON file must name this grid, and the database refuses the
  // import if the grid changes before it commits.
  const { data: project } = await g.w.user.from("survey_projects").select("crs_id").eq("id", i.projectId).eq("org_id", g.w.actor.orgId).is("archived_at", null).maybeSingle();
  const crsId = typeof project?.crs_id === "string" ? project.crs_id : null;
  if (!crsId) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (crsId !== i.crsId) return { status: "error", message: SURVEY_MESSAGES.CRS_CHANGED };
  // A file Farbaek can't read (a job database, a printout) is refused here too, with what to upload instead: the browser isn't the check.
  const unreadable = unreadableFile(i.fileName, i.content);
  if (unreadable) return { status: "error", message: unreadable };
  // A field book's legs may start from or close on points already in the project: read them first.
  const known = i.format === "fieldbook" ? ((await loadSurveyProject(g.w.user, g.w.actor.orgId, i.projectId))?.points ?? []) : [];
  const result = readPoints(i.format, i.content, { delimiter: i.delimiter as Delimiter, hasHeader: i.hasHeader, columns: i.columns as ColumnRole[], crs: crsById(crsId) ?? null, known, adjust: i.adjust });
  const errors = result.issues.filter((x) => x.severity === "error");
  // A traverse rule that can't be used is said as itself, not as rows that can't be read (ADR 0241).
  const refused = errors.find((x) => x.code === "TRAVERSE_NOT_ADJUSTED");
  if (refused) return { status: "error", message: `Nothing was imported. ${refused.message}`, issues: result.issues.slice(0, 50) };
  if (errors.length > 0) return { status: "error", message: `${errors.length} ${errors.length === 1 ? "row" : "rows"} can't be read, so nothing was imported. Fix the file and try again.`, issues: result.issues.slice(0, 50) };
  if (result.points.length === 0) return { status: "error", message: "The file has no points to import.", issues: result.issues.slice(0, 50) };
  const r = await surveyStore.importPoints(g.w.admin, g.w.actor, {
    projectId: i.projectId,
    fileName: i.fileName,
    format: i.format,
    content: i.content,
    settings: { delimiter: i.delimiter, hasHeader: i.hasHeader, columns: i.columns, units: i.units, crs: crsId, ...(result.reduction ? { reduction: result.reduction } : {}) },
    points: result.points.map((p) => ({ point_id: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code ?? "", line: p.line })),
  });
  if (!r.ok) return { status: "error", message: r.message };
  // Only exact repeats are "kept once"; a closure, records left out or a later record replacing an earlier are notes, said in the preview.
  const repeats = result.issues.filter((x) => x.code === "DUPLICATE_POINT_SAME" && x.line !== null).length;
  const imported = `Imported ${r.value.added} ${r.value.added === 1 ? "point" : "points"}${r.value.skipped ? `; ${r.value.skipped} already here, unchanged` : ""}${repeats ? `; ${repeats} exact ${repeats === 1 ? "repeat" : "repeats"} kept once` : ""}.`;
  // The plan draws itself from the points, when it has no lots yet. The import stands either way.
  // The rule a traverse was adjusted by goes in the version's note too (ADR 0241); the file name gives way, since a note holds 200 characters.
  const ruled = result.reduction?.traverse?.adjusted ? `, the traverse adjusted by ${ADJUST_NAMES[result.reduction.traverse.adjusted.method]} as chosen` : "";
  const drawing = i.drawPlan ? await drawFromPoints(g.w, i.projectId, `Drawn from ${i.fileName.slice(0, 200 - "Drawn from ".length - ruled.length)}${ruled}`, i.codeList, result.surveyDate) : null;
  revalidatePath(`/app/survey/${i.projectId}`);
  if (!drawing) return { status: "done", message: imported };
  if (!drawing.ok) return { status: "done", message: imported, drawError: `The plan wasn't drawn: ${drawing.message} The points are in; draw it again from the Draft step.` };
  return { status: "done", message: drawing.version ? `${imported} The plan is drawn as version ${drawing.version}: check it, then approve.` : imported, version: drawing.version ?? undefined, drawn: drawing.drawn, notDrawn: drawing.notDrawn };
}

/**
 * The automatic draft (autodraft.ts, ADR 0209) saved as a new version: the lot through the boundary marks, the lines from the field
 * codes, the road, the stated survey date and the importing surveyor, each inference marked for checking. Only onto a plan with no
 * lots; nothing is saved when there's nothing to draw.
 */
async function drawFromPoints(w: Writer, projectId: string, note: string, codeList: "project" | "dsr" = "project", surveyDate: string | null = null, onlyOn: number | null = null): Promise<{ ok: true; version: number | null; drawn: string[]; notDrawn: string[] } | { ok: false; message: string; moved?: true }> {
  const data = await loadSurveyProject(w.user, w.actor.orgId, projectId);
  if (!data) return { ok: false, message: SURVEY_MESSAGES.NOT_FOUND };
  // Drawing only on a given version: a plan saved since is never drawn over (its save would build on the newer version).
  if (onlyOn !== null && data.drawing.version !== onlyOn) return { ok: false, message: "the plan has been saved since, so nothing was drawn over it.", moved: true };
  const mine = data.profiles.some((p) => p.user_id === w.actor.userId) ? w.actor.userId : null;
  if (!data.drawing.readable) return { ok: true, version: null, drawn: [], notDrawn: ["Nothing was drawn: the latest version's settings couldn't be read, so Farbaek doesn't draw over it. Save a new version first."] };
  // The Survey Department's code list, when the surveyor chose it for a file written in its codes; only on a plan not yet drawn, and
  // waiting for the surveyor's check like any list.
  const swap = codeList === "dsr" && data.drawing.document.lots.length === 0;
  const base = swap ? { ...data.drawing.document, codes: dsrCodes(), provenance: { ...data.drawing.document.provenance, codes: { source: "engine" as const, reviewed: false } } } : data.drawing.document;
  const r = autoDraft({ points: data.points, document: base, surveyorUserId: mine, surveyDate });
  // A lot, lines or a road make a drawn plan worth a version; a date or the surveyor block alone doesn't.
  if (r.shapes === 0) return { ok: true, version: null, drawn: [], notDrawn: r.notDrawn.length > 0 ? r.notDrawn : ["Nothing to draw: the points carry no boundary-mark, line or road codes."] };
  const parsed = surveyDocumentSchema.safeParse(r.document);
  if (!parsed.success) return { ok: false, message: "the drawn plan didn't pass its own checks, so nothing was saved." };
  const saved = await surveyStore.saveDrawing(w.admin, w.actor, { projectId, baseVersion: data.drawing.version, document: tidy(pruneProvenance(parsed.data), data), note: note.slice(0, 200) });
  if (!saved.ok) return { ok: false, message: saved.message, ...(saved.code === "VERSION_CONFLICT" ? { moved: true as const } : {}) };
  return { ok: true, version: saved.value, drawn: r.drawn, notDrawn: r.notDrawn };
}

/** "Draw the plan from the points": the same automatic draft for a project whose points are in and whose plan has no lots. */
export async function drawPlanFromPointsAction(input: { projectId: string }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await drawFromPoints(g.w, input.projectId, "Drawn from the points");
  revalidatePath(`/app/survey/${input.projectId}`);
  if (!r.ok) return { status: "error", message: `The plan wasn't drawn: ${r.message}` };
  if (!r.version) return { status: "error", message: r.notDrawn[0] ?? "There was nothing to draw from the points.", issues: [] };
  return { status: "done", message: `The plan is drawn as version ${r.version}: check it, then approve.`, version: r.version, drawn: r.drawn, notDrawn: r.notDrawn };
}

/** The version note's word on a traverse the surveyor chose to adjust (ADR 0241), so the plan's history says how its points were made. */
function adjustedNote(reads: readonly FileRead[]): string {
  // The rules, not the file names: a version's note holds 200 characters.
  // Least squares says what it weighed by (ADR 0274): "least squares (5″, 2 mm + 2 ppm, typical)".
  const named = (a: NonNullable<NonNullable<NonNullable<FileRead["reduction"]>["traverse"]>["adjusted"]>) => (a.method === "least_squares" && a.stats ? `${ADJUST_NAMES[a.method]} (${weighedShort(a.stats.precision)})` : ADJUST_NAMES[a.method]);
  const rules = [...new Set(reads.flatMap((r) => (r.reduction?.traverse?.adjusted ? [named(r.reduction.traverse.adjusted)] : [])))];
  return rules.length === 0 ? "" : `, the traverse adjusted by ${rules.join(" and ")} as chosen`;
}

/** The version's note, within its 200 characters: the profile's name is shortened to fit, never its version or the rules before it. */
function versionNote(head: string, profile: OfficeProfile | null): string {
  if (!profile) return head.slice(0, 200);
  const tail = (name: string) => `, with the office profile "${name}" (version ${profile.version})`;
  const room = 200 - head.length - tail("").length;
  if (room >= profile.name.length) return head + tail(profile.name);
  return room >= 8 ? head + tail(`${profile.name.slice(0, room - 1)}…`) : head.slice(0, 200);
}

const generateInput = z.object({
  title: z.string().max(200).default(""),
  /** The grid the start screen showed. Pressing Generate Plan is the surveyor confirming it: the project records who did. */
  crsId: z.string().max(40),
  files: z
    .array(
      z.object({
        name: z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),
        content: z.string().max(IMPORT_LIMITS.maxBytes),
        /** The rule the surveyor chose for this file's traverse (ADR 0241); none keeps its points as shot. */
        adjust: z.enum(ADJUST_METHODS).nullable().default(null),
      }),
    )
    .min(1)
    .max(START_LIMITS.files),
  /** How many sketch photos the screen will send for reading once the plan is drawn: the job shows that stage (ADR 0239). */
  sketches: z.number().int().min(0).max(SKETCH_LIMITS.photos).default(0),
  /** The office profile the start screen chose or the surveyor picked (ADR 0256), or none: then the surveyor's recent plans. */
  profileId: z.string().uuid().nullable().default(null),
  /** An office code library uploaded with the files (ADR 0237): read again here, never trusted from the browser. */
  library: z.object({ name: z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/), content: z.string().max(LIBRARY_LIMITS.bytes) }).nullable().default(null),
});

export type GenerateState =
  | { status: "idle" }
  | { status: "error"; message: string; problems: StartProblem[]; projectId?: string }
  /** Where the plan opens, and the version on it now, which reading the sketches builds on. */
  | { status: "done"; projectId: string; next: string; version: number; jobId: string | null };

/**
 * AutoSurvey's Generate Plan (stage 222, ADR 0233): every survey file read again here with the same tested readers (the browser's
 * reading is never trusted), then, only when every file reads cleanly, the points fit the chosen grid and no point number has two
 * places, the project is created with the grid confirmed by the person pressing, each file is imported as its own source, and the
 * plan is drawn once from all of them. Anything wrong stops it before a project exists, with one plain problem per file.
 */
export async function generateSurveyPlanAction(input: z.input<typeof generateInput>): Promise<GenerateState> {
  const parsed = generateInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST, problems: [] };
  const i = parsed.data;
  const crs = crsById(i.crsId);
  if (!crs) return { status: "error", message: "Choose the coordinate system the survey's points are in.", problems: [] };
  const bytes = i.files.reduce((sum, f) => sum + f.content.length, 0) + (i.library?.content.length ?? 0);
  if (bytes > START_LIMITS.dataBytes) return { status: "error", message: `These files hold more than ${START_LIMITS.dataBytes / 1024 / 1024} MB of survey data together. Generate from fewer files, then import the rest into the project.`, problems: [] };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message, problems: [] };

  // The office profile chosen (ADR 0256), read through row-level security before the files: least squares weighs a traverse by its
  // total station's stated precision (ADR 0274), as the start screen showed.
  let profile: OfficeProfile | null = null;
  if (i.profileId) {
    profile = (await loadOfficeProfiles(g.w.user, g.w.actor.orgId)).find((p) => p.id === i.profileId) ?? null;
    if (!profile) return { status: "error", message: "That office profile isn't in this workspace any more. Choose another, or none, and generate again. Nothing was saved.", problems: [] };
  }
  const precision = profilePrecision(profile);

  const reads: FileRead[] = [];
  // Each read beside the text it came from: two files may share a name.
  const contents: string[] = [];
  const problems: StartProblem[] = [];
  for (const f of i.files) {
    const r = readSurveyFile(f.name, f.content, crs, f.adjust, precision);
    if (r.ok) {
      reads.push(r.read);
      contents.push(f.content);
    } else problems.push({ file: r.name, problem: r.problem });
  }
  problems.push(...pointClashes(reads));
  const all = reads.flatMap((r) => r.points);
  const grid = gridProblem(all, crs);
  if (grid) problems.push(grid);
  if (problems.length > 0) return { status: "error", message: problems.length === 1 ? "One thing needs you before the plan can be drawn. Nothing was saved." : `${problems.length} things need you before the plan can be drawn. Nothing was saved.`, problems };

  // The office profile's list is taken as checked, with its sheet and statement. Without one, a returning surveyor's own defaults
  // (ADR 0237). An office code library uploaded with the files wins over either, and waits for its check.
  // The surveyor's own carried defaults first, then the profile over them: a profile without a sheet or a code list keeps theirs.
  const carried = await loadStartingDefaults(g.w.user, g.w.actor.orgId, g.w.actor.userId);
  let document = withDefaults(emptyDocument(), { ...carried, ...(profile?.body.codes ? { codes: null, grammar: null } : {}), ...(profile?.body.sheet ? { settings: null } : {}) });
  if (profile) document = withProfile(document, profile, all.map((p) => p.code ?? "").filter(Boolean));
  if (i.library) {
    const lib = parseCodeLibrary(i.library.content);
    if (!lib.ok) return { status: "error", message: "One thing needs you before the plan can be drawn. Nothing was saved.", problems: [{ file: i.library.name, problem: lib.problem }] };
    const taken = libraryFor(lib.entries, all.map((p) => p.code ?? "").filter(Boolean));
    // A Carlson library (.fcl) brings Carlson's line words with it (ADR 0243); the plan's checks and Codes step say which are read.
    const grammar = grammarForLibrary(i.library.name);
    document = { ...document, codes: taken.codes, provenance: { ...document.provenance, codes: { source: "engine", reviewed: false } }, ...(grammar ? { grammar } : {}) };
  }
  const created = await surveyStore.createProject(g.w.admin, g.w.actor, { name: startName(i.title, reads[0]?.name ?? null, new Date()), planType: "cadastral", crsId: crs.id, confirm: true, document });
  if (!created.ok) return { status: "error", message: created.message, problems: [] };
  const projectId = created.value;
  // The next plan starts from the same profile, or from none when none was chosen; a choice that can't be recorded (before schema v105)
  // only means the next one asks again.
  await surveyStore.chooseOfficeProfile(g.w.admin, g.w.actor, profile?.id ?? null).catch(() => null);
  // The run as a job with real stages, so leaving the page and coming back shows where it stands (ADR 0239).
  const job = await JobTracker.start(g.w.admin, g.w.actor, projectId, generateStages(reads.length, i.sketches, new Date()));
  // The same survey uploaded as its instrument file, its printed list and its drawing is one set of points (stage 252): files with heights
  // first, each point imported once, and every file kept as it was uploaded, as a source that agrees.
  const ordered = importOrder(reads);
  const together = readTogether(ordered);
  for (const [index, r] of ordered.entries()) {
    const imported = await surveyStore.importPoints(g.w.admin, g.w.actor, {
      projectId,
      fileName: r.name,
      format: r.format,
      content: contents[reads.indexOf(r)]!,
      // The date the file states is kept with it, so a run finished after a cut-off offers the same date (stage 235).
      settings: { delimiter: r.delimiter, hasHeader: r.hasHeader, columns: r.columns, units: "metre", crs: crs.id, by: "autosurvey", ...(r.reduction ? { reduction: r.reduction } : {}), ...(r.surveyDate ? { surveyDate: r.surveyDate } : {}) },
      points: importPointsOf(ordered, index, together.kept).map((p) => ({ point_id: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code ?? "", line: p.line })),
    });
    if (!imported.ok) {
      await job.stage("import", "failed", `${r.name}: ${imported.message}`, { message: `${r.name} wasn't imported.` });
      revalidatePath("/app/survey");
      return { status: "error", message: `The project was created, but ${r.name} wasn't imported: ${imported.message} Open the project to import it again.`, problems: [], projectId };
    }
  }
  const repeated = together.repeats.filter((x) => x.count > 0);
  const kept = together.kept.size;
  await job.stage(
    "import",
    "done",
    `${kept} ${kept === 1 ? "point" : "points"} from ${reads.length} ${reads.length === 1 ? "file" : "files"}.${repeated.length > 0 ? ` ${repeated.map((x) => `${x.file} repeats ${x.count} of ${x.of.join(" and ")}'s points`).join("; ")}: each is kept once, and every file as a source.` : ""}`.slice(0, 500),
  );
  const drawing = await drawFromPoints(
    g.w,
    projectId,
    versionNote(`Drawn by AutoSurvey from ${reads.length} ${reads.length === 1 ? "file" : "files"}${adjustedNote(reads)}`, profile),
    // The Survey Department's list replaces only the common one: never an office library or the surveyor's own checked list.
    codesAreCommonList(document.codes) && drawsWithDsrList(all, document.codes) ? "dsr" : "project",
    statedSurveyDate(reads),
  );
  revalidatePath("/app/survey");
  revalidatePath(`/app/survey/${projectId}`);
  // The points are in either way; when the plan couldn't be drawn, the project opens on the Draft step, which says why. Without a
  // drawn version the project is still on the one it was created with.
  const drawn = drawing.ok && drawing.version ? drawing.version : null;
  const next = `/app/survey/${projectId}?step=${drawn ? "plan" : "draft"}&generated=1`;
  await job.stage("draw", drawing.ok ? "done" : "failed", !drawing.ok ? drawing.message : drawn ? `Version ${drawn}: ${drawing.drawn.length} ${drawing.drawn.length === 1 ? "thing" : "things"} drawn.` : (drawing.notDrawn[0] ?? "Nothing to draw from the points."), { next });
  return { status: "done", projectId, next, version: drawn ?? 1, jobId: job.id };
}

/**
 * Finishes a Generate Plan run that was cut off after its files were imported (stage 235): the project keeps every imported file,
 * so the plan is drawn from its points now, as the run would have. The run's record says so, or, when it can no longer be written
 * (the sweep closed it), a new record does. Sketch photos aren't kept until they're read, so a cut-off read is read again from the
 * Draft step, and the record says that too.
 */
export async function finishCutOffRunAction(input: { projectId: string; jobId: string }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !uuid.safeParse(input.jobId).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const job = await loadJob(g.w.user, input.jobId, input.projectId);
  if (!job) return { status: "error", message: "That run's record isn't there any more. Draw the plan from the Draft step." };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  const latest = Math.max(data.drawing.version, ...data.versions.map((v) => v.version));
  if (!finishable(job, new Date(), latest)) {
    return { status: "error", message: latest !== FIRST_VERSION ? "The plan has been saved since this run stopped, so nothing was drawn over it. Open the plan to see it." : "This run can't be finished from here: it's still working, it finished, or its files weren't all imported. What was saved is on the plan." };
  }
  // The same code list and survey date the run would have drawn with: the Survey Department's list only in place of the common one, for
  // files in its codes, and the first date a file stated, kept with its import.
  const asImported = data.points.map((p) => ({ line: 0, pointId: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code }));
  const codeList = codesAreCommonList(data.drawing.document.codes) && drawsWithDsrList(asImported, data.drawing.document.codes) ? "dsr" : "project";
  const surveyDate = data.sources.map((x) => x.settings.surveyDate).find((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) ?? null;
  const began = new Date();
  const drawing = await drawFromPoints(g.w, input.projectId, "Drawn by AutoSurvey after the run was cut off", codeList, surveyDate, FIRST_VERSION);
  revalidatePath(`/app/survey/${input.projectId}`);
  // Another press (a second tab, or someone else) drew it first: that press finishes the record, and this one leaves it alone.
  if (!drawing.ok && drawing.moved) return { status: "error", message: "The plan has just been drawn or saved by someone else, so nothing was drawn over it. Open the plan to see it." };
  const drawn = drawing.ok && drawing.version ? drawing.version : null;
  const detail = !drawing.ok ? drawing.message : drawn ? `Finished after the cut-off: version ${drawn}, ${drawing.drawn.length} ${drawing.drawn.length === 1 ? "thing" : "things"} drawn.` : (drawing.notDrawn[0] ?? "Nothing to draw from the points.");
  const sketchesLeft = "The photos weren't kept by the cut-off run: read them again from the Draft step.";
  const ended = new Date();
  // The drawing as measured now. The run's start-to-finish time includes the hours it lay cut off, so the record is marked finished later.
  const finish = (stages: JobStage[]) =>
    stages.map((s) =>
      s.id === "draw"
        ? { ...s, state: (drawing.ok ? "done" : "failed") as JobStage["state"], detail, startedAt: began.toISOString(), ms: Math.max(0, Math.min(86_400_000, ended.getTime() - began.getTime())) }
        : s.id === "sketches" && (s.state === "waiting" || s.state === "running")
          ? { ...s, state: "skipped" as const, detail: sketchesLeft }
          : s,
    );
  const tracker = JobTracker.resume(g.w.admin, g.w.actor.orgId, job);
  tracker.set(finish(job.stages));
  tracker.mark({ finishedLater: true });
  const written = await tracker.write(drawing.ok ? "done" : "failed");
  // Only a record the sweep closed gets a new one in its place, so the page shows how the run ended; a write that failed for any other
  // reason leaves the record as it is rather than adding a second run.
  if (!written && job.state === "interrupted") {
    const fresh = await JobTracker.start(g.w.admin, g.w.actor, input.projectId, finish(job.stages.map((s) => (s.id === "import" ? { ...s, detail: "Imported before the run was cut off." } : s))));
    fresh.mark({ finishedLater: true });
    await fresh.write(drawing.ok ? "done" : "failed");
  }
  if (!drawing.ok) return { status: "error", message: `The plan wasn't drawn: ${drawing.message}` };
  return drawn ? { status: "done", message: `The plan is drawn as version ${drawn}: check it, then approve.`, version: drawn, drawn: drawing.drawn, notDrawn: drawing.notDrawn } : { status: "error", message: drawing.notDrawn[0] ?? "There was nothing to draw from the points.", issues: [] };
}

/**
 * A document as it's saved: "keep as surveyed" answers only for near misses
 * the plan has now (none can be added from outside, and none outlives its
 * near miss), so the list stays short and every entry means something.
 * The plan is checked as it's shown, with the project's own confirmation of its
 * coordinate system: the sketch checks only run on a confirmed one, so without it
 * every answer about a sketch would look dead and be dropped.
 */
function tidy(doc: SurveyDocument, data: { points: SurveyProjectData["points"]; project: { crsId: string; crsConfirmedAt: string | null } }): SurveyDocument {
  if (doc.kept.length === 0) return doc;
  const view = buildPlan({ points: data.points, document: doc, crsId: data.project.crsId, crsConfirmation: data.project.crsConfirmedAt ? "confirmed" : null, surveyor: null, approval: null });
  const live = new Set(view.findings.flatMap((f) => (f.keep ? [f.keep.key] : [])));
  return { ...doc, kept: doc.kept.filter((k) => live.has(k)).slice(0, 200) };
}

/** Checks that every point a document names is in the project. */
function unknownPoints(doc: SurveyDocument, known: Set<string>): string[] {
  return [...usedPointIds(doc)].filter((id) => !known.has(id));
}

export async function saveSurveyDrawingAction(input: { projectId: string; baseVersion: number; document: unknown; note?: string }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const doc = surveyDocumentSchema.safeParse(input.document);
  if (!doc.success) return { status: "error", message: "The plan couldn't be saved: some of its settings aren't valid. Reload and try again." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  // Constructed corners no line uses any more are dropped (ADR 0270); one may never take a surveyed point's id.
  const pruned = pruneConstructed(doc.data);
  const known = new Set(data.points.map((p) => p.id));
  const unknown = unknownPoints(pruned, known);
  if (unknown.length > 0 || (pruned.constructed ?? []).some((c) => known.has(c.id))) return { status: "error", message: "The plan uses points that aren't in this project. Reload and try again." };
  // A point worked out by hand never takes a surveyed number as its name (ADR 0272): the line's numbers would read two ways.
  const numbers = new Set(data.points.map((p) => p.pointId.toLowerCase()));
  if ((pruned.constructed ?? []).some((c) => c.kind !== "square" && (numbers.has(c.name.toLowerCase()) || c.name.toLowerCase() === "corner"))) return { status: "error", message: "A point that wasn't surveyed has a surveyed point's number as its name. Rename it, then save again." };
  if (doc.data.surveyorUserId && !data.profiles.some((p) => p.user_id === doc.data.surveyorUserId)) {
    return { status: "error", message: "The chosen surveyor hasn't entered their details in this workspace yet." };
  }
  // What was read from the sketches is only ever written by reading them (readSketchesAction): a plan saved from the browser keeps
  // the stored readings, so none can be made up, changed or removed to clear a difference that holds approval.
  const next = { ...pruned, sketch: data.drawing.readable ? data.drawing.document.sketch : null };
  // Marks for items no longer on the plan are dropped, so none can hold an approval with nothing to check.
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: tidy(pruneProvenance(next), data), note: input.note?.slice(0, 200) ?? null });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  return { status: "done", message: `Saved as version ${r.value}.`, version: r.value };
}

/**
 * "Keep as surveyed": the surveyor's answer to a near miss (two corner numbers
 * a few millimetres apart, or a corner a few centimetres off a neighbouring
 * lot's leg), saved as a new version so the approval covers it. Nothing moves.
 * Only a near miss the plan has now can be kept.
 */
export async function setKeptAsSurveyedAction(input: { projectId: string; baseVersion: number; key: string; keep: boolean }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.key !== "string" || !/^(?:(?:dup|leg):[0-9a-f:|-]{36,120}|sketch:r\d{1,3}|check:[im]\d{1,3})$/.test(input.key)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== input.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  const view = buildPlan({ points: data.points, document: data.drawing.document, crsId: data.project.crsId, crsConfirmation: data.project.crsConfirmedAt ? "confirmed" : null, surveyor: null, approval: null });
  const finding = view.findings.find((f) => f.keep?.key === input.key);
  if (!finding) return { status: "error", message: "That near miss isn't on the plan any more. Reload to see the checks as they are now." };
  const doc = structuredClone(data.drawing.document);
  doc.kept = input.keep ? [...new Set([...doc.kept, input.key])] : doc.kept.filter((k) => k !== input.key);
  const note = `${input.keep ? "Kept as surveyed" : "To check again"}: ${finding.message}`.slice(0, 200);
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: next, note });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  return { status: "done", message: `Saved as version ${r.value}.`, version: r.value };
}

/**
 * "Confirm" on the surveyor's list (stage 224, ADR 0235): an item Farbaek drew or filled in, or the code list, confirmed with one
 * press and saved as a new version so the approval covers it; `confirmed: false` puts it back on the list. Only an item the plan has,
 * marked as drawn or filled in for the surveyor, can be confirmed: nothing the surveyor typed, and nothing else in the plan changes.
 */
export async function confirmSurveyItemAction(input: { projectId: string; baseVersion: number; key: string; confirmed: boolean }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.key !== "string" || typeof input.confirmed !== "boolean" || !/^[a-z][\w.:-]{0,79}$/i.test(input.key)) {
    return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  }
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== input.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be confirmed on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  const mark = doc.provenance[input.key];
  const codes = input.key === "codes";
  // The code list may have no mark yet (the common list as it came); anything else must be an item drawn or filled in that's still on the plan.
  if (!codes && (!mark || mark.source === "engine" || !provenanceLive(doc, input.key))) return { status: "error", message: "That item isn't waiting for a confirmation any more. Reload to see the plan as it is now." };
  doc.provenance[input.key] = { source: mark?.source ?? "engine", reviewed: input.confirmed };
  const { label } = itemOf(doc, input.key);
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: next, note: `${input.confirmed ? "Confirmed" : "To check again"}: ${label}`.slice(0, 200) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  return { status: "done", message: `${input.confirmed ? "Confirmed" : "Back on the list"}: ${label}. Saved as version ${r.value}.`, version: r.value };
}

const correctionInput = z.object({
  projectId: z.string().uuid(),
  baseVersion: z.number().int().min(1),
  file: z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/),
  /** The point reading the press is about, by its id: the number corrected is that reading's own, as read. */
  reading: z.string().regex(/^r\d{1,3}$/),
  to: z.string().min(1).max(32).regex(/^[^\u0000-\u001f\u007f]+$/),
});

/**
 * Corrects a point number as the sketch was read (stage 249, ADR 0257): "the number read as 10 on this photo is 20". The correction is
 * kept beside the reading with who made it and when, the reading stays as read, and what the sketch drew from it is redrawn: items it
 * put on the plan that nobody confirmed are replaced by what the corrected reading proposes, each waiting for the surveyor as before.
 * Anything the surveyor confirmed or edited is left as it is, and named. Saved as a new version.
 */
export async function correctSketchNumberAction(input: z.input<typeof correctionInput>): Promise<SurveyFormState> {
  const parsed = correctionInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const i = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, i.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== i.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be corrected on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  const sketch = doc.sketch;
  if (!sketch?.drawing || !sketch.files.includes(i.file)) return { status: "error", message: "That sketch isn't on this plan any more. Reload to see the plan as it is now." };
  // The number corrected is the reading's own, as read: never one an earlier correction produced, so two numbers swapped on a photo
  // are corrected by correcting each, and a second press never undoes the first.
  const reading = sketch.readings.find((r) => r.id === i.reading && r.file === i.file && r.kind === "point");
  if (!reading) return { status: "error", message: "That number isn't read on that sketch any more. Reload to see the plan as it is now." };
  const asRead = reading.text;
  const key = numberKey(asRead);
  const earlier = (sketch.corrections ?? []).filter((c) => c.file === i.file && numberKey(c.label) === key);
  const now = earlier.at(-1)?.to ?? asRead;
  if (numberKey(now) === numberKey(i.to)) return { status: "error", message: `The number read as ${asRead} is already read as ${i.to}. Nothing was changed.` };
  const back = numberKey(i.to) === key;
  // The number it becomes must be exactly one surveyed point: a correction never invents or chooses between points. Going back to
  // the number as read is always allowed.
  const targets = data.points.filter((p) => p.pointId === i.to);
  if (!back && targets.length !== 1) return { status: "error", message: targets.length === 0 ? `There's no point ${i.to} in the survey files, so the number can't be corrected to it.` : `More than one surveyed point is numbered ${i.to}, so the number can't be corrected to it.` };
  // One correction per number on a photo: the newest replaces any before it, and going back to the number as read leaves none.
  const corrections = (sketch.corrections ?? []).filter((c) => !(c.file === i.file && numberKey(c.label) === key));
  if (!back) corrections.push({ file: i.file, label: asRead, to: i.to, by: g.w.actor.userId, at: new Date().toISOString() });
  if (corrections.length > 50) return { status: "error", message: "This sketch has 50 corrections, its most. Read it again from the Draft step." };
  const before = interpretDocument(doc, data.points);
  const corrected: SurveyDocument = { ...doc, sketch: { ...sketch, corrections } };
  const after = interpretDocument(corrected, data.points);
  const redrawn = redrawFromCorrection(corrected, before, after);
  const next = tidy(pruneProvenance(redrawn.document), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const changed = redrawn.removed.length + redrawn.added.length;
  const said = back ? `the number read as ${asRead} is ${asRead} again` : `the number read as ${asRead} is ${i.to}`;
  // What the surveyor confirmed and the correction leaves as it was is in the version's note too, so it's never only on a screen.
  const keptNote = redrawn.kept.length > 0 ? `; ${redrawn.kept.length} confirmed ${redrawn.kept.length === 1 ? "item still uses" : "items still use"} ${now}` : "";
  const note = `Corrected the sketch: ${said}${changed > 0 ? "; redrew what it drew" : ""}${keptNote}`.slice(0, 200);
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: i.projectId, baseVersion: i.baseVersion, document: next, note });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${i.projectId}`);
  const kept = redrawn.kept.length > 0 ? ` ${redrawn.kept.length === 1 ? "One item you confirmed still uses" : `${redrawn.kept.length} items you confirmed still use`} ${now}: check ${redrawn.kept.length === 1 ? "it" : "them"} on the Lots step.` : "";
  const redraw = changed > 0 ? ` ${redrawn.removed.length} ${redrawn.removed.length === 1 ? "item" : "items"} drawn from ${now} taken off, ${redrawn.added.length} drawn from ${back ? asRead : i.to}, each waiting for you.` : "";
  return { status: "done", message: `Corrected: ${said}.${redraw}${kept} Saved as version ${r.value}.`, version: r.value };
}

/**
 * Takes a symbol off the plan (a well the sketch put at a point, ADR 0249), saved as a new version. Symbols have no editor of their
 * own, so this is how a wrong one goes; the point itself is never touched, and its own code still draws as it did.
 */
export async function removeSurveySymbolAction(input: { projectId: string; baseVersion: number; key: string }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.key !== "string" || !/^symbol:[A-Za-z0-9_-]{1,40}$/.test(input.key)) {
    return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  }
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== input.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be removed from it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  const id = input.key.slice("symbol:".length);
  if (!(doc.symbols ?? []).some((s) => s.id === id)) return { status: "error", message: "That symbol isn't on the plan any more. Reload to see the plan as it is now." };
  const { label } = itemOf(doc, input.key);
  const symbols = (doc.symbols ?? []).filter((s) => s.id !== id);
  // A plan without symbols has none listed, as before any were added, so its approval fingerprint is the same.
  if (symbols.length > 0) doc.symbols = symbols;
  else delete doc.symbols;
  delete doc.provenance[input.key];
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: next, note: `Removed: ${label}`.slice(0, 200) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  return { status: "done", message: `Removed: ${label}. Saved as version ${r.value}.`, version: r.value };
}

export async function setSurveyorProfileAction(_prev: SurveyFormState, form: FormData): Promise<SurveyFormState> {
  const field = (k: string, max: number) => String(form.get(k) ?? "").trim().slice(0, max);
  const fullName = field("fullName", 120);
  if (!fullName) return { status: "error", message: "Enter your name as it appears on your plans." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const r = await surveyStore.setProfile(g.w.admin, g.w.actor, { fullName, designation: field("designation", 120), registration: field("registration", 60), address: field("address", 300), contact: field("contact", 160) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/app/survey", "layout");
  return { status: "done", message: "Your surveyor details are saved. They appear on plans you are responsible for." };
}

/**
 * The surveyor approves the latest version. The server recomputes the plan,
 * refuses while any check blocks approval, and records the hash of exactly
 * what was approved. Approval in Farbaek is a record of review, not
 * certification: the surveyor still signs the printed plan.
 */
export async function approveSurveyAction(_prev: SurveyFormState, form: FormData): Promise<SurveyFormState> {
  const projectId = String(form.get("projectId") ?? "");
  const version = Number(form.get("version"));
  if (!uuid.safeParse(projectId).success || !Number.isInteger(version)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  if (form.get("confirm") !== "yes") return { status: "error", message: "Tick the box to confirm you reviewed this version." };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== version) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  const profile = data.profiles.find((p) => p.user_id === g.w.actor.userId);
  const view = buildPlan({
    points: data.points,
    document: data.drawing.document,
    crsId: data.project.crsId,
    crsConfirmation: data.project.crsConfirmedAt ? "confirmed" : null,
    surveyor: profile ? { name: profile.full_name, designation: profile.designation, registration: profile.registration, address: profile.address, contact: profile.contact } : null,
    approval: null,
  });
  if (view.blocksApproval.length > 0) return { status: "error", message: `This version can't be approved yet: ${view.blocksApproval.map((f) => f.message).join(" ")}` };
  const sha256 = await approvalHash({ document: data.drawing.document, crsId: data.project.crsId, points: data.points });
  const r = await surveyStore.approve(g.w.admin, g.w.actor, { projectId, version, crsId: data.project.crsId, sha256 });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: `Version ${version} is approved by you. Print it at 100% and sign it: the signature on paper is what certifies a plan.` };
}

export async function archiveSurveyProjectAction(form: FormData): Promise<void> {
  const projectId = String(form.get("projectId") ?? "");
  if (!uuid.safeParse(projectId).success) return;
  const g = await writer();
  if (!g.ok) return;
  await surveyStore.archive(g.w.admin, g.w.actor, projectId);
  revalidatePath("/app/survey");
  redirect("/app/survey");
}

const profileInput = z.object({
  profileId: z.string().uuid().nullable(),
  baseVersion: z.number().int().min(1).nullable(),
  name: z.string().max(80),
  body: officeProfileBodySchema,
});

export type ProfileState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string; profileId: string; version: number };

/**
 * Saves an office profile (stage 248, ADR 0256): a new one, or a new version from the one on screen. Nothing about a piece of land is
 * in a profile; the body is checked here against the same schema the reader uses, so a profile Generate Plan can't read is never saved.
 */
export async function saveOfficeProfileAction(input: z.input<typeof profileInput>): Promise<ProfileState> {
  const parsed = profileInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Some of the profile's settings weren't valid. Check them and save again. Nothing was saved." };
  const i = parsed.data;
  if (!i.name.trim()) return { status: "error", message: "Give the profile a name, such as the instrument or the office it's for." };
  if ((i.profileId === null) !== (i.baseVersion === null)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const saved = await surveyStore.saveOfficeProfile(g.w.admin, g.w.actor, { profileId: i.profileId, baseVersion: i.baseVersion, name: i.name.trim(), body: i.body });
  if (!saved.ok)
    return {
      status: "error",
      message:
        saved.code === "VERSION_CONFLICT"
          ? "Someone saved a newer version of this profile while you were working. Reload to see it, then make your change again."
          : saved.code === "QUOTA_EXCEEDED"
            ? "This workspace has as many office profiles, or versions of this one, as it can keep (50 in use, 200 versions each). Archive one you no longer use."
            : saved.code === "NOT_FOUND"
              ? "That profile has been archived, or isn't in this workspace any more. Reload the page."
              : saved.message,
    };
  revalidatePath("/app/survey/office");
  revalidatePath("/app/survey/new");
  return { status: "done", message: saved.value.version === 1 ? "Profile saved. New plans can start from it." : `Saved as version ${saved.value.version}. Earlier versions are kept.`, profileId: saved.value.id, version: saved.value.version };
}

/** Archives an office profile: it's no longer offered; its versions stay for the plans that started from them. */
export async function archiveOfficeProfileAction(_prev: { status: string }, form: FormData): Promise<{ status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string }> {
  const input = { profileId: String(form.get("profileId") ?? "") };
  if (!uuid.safeParse(input.profileId).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const done = await surveyStore.archiveOfficeProfile(g.w.admin, g.w.actor, input.profileId);
  if (!done.ok) return { status: "error", message: done.code === "NOT_FOUND" ? "That profile isn't in this workspace any more." : done.message };
  revalidatePath("/app/survey/office");
  revalidatePath("/app/survey/new");
  return { status: "done", message: "Archived. New plans won't be offered it." };
}

/**
 * Starts an office profile from a plan the surveyor has set up (stage 248): its checked office code list and line words, its sheet and
 * its statement, and its project's grid. Its instruments are added on the profile page.
 */
export async function officeProfileFromPlanAction(input: { projectId: string; name: string }): Promise<ProfileState> {
  if (!uuid.safeParse(input.projectId).success || typeof input.name !== "string") return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data || !data.drawing.readable) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  return saveOfficeProfileAction({ profileId: null, baseVersion: null, name: input.name.trim().slice(0, 80) || `Set up as on ${data.project.name}`.slice(0, 80), body: profileFromPlan(data.drawing.document, data.project.crsConfirmedAt ? data.project.crsId : null) });
}
