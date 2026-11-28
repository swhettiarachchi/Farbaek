"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { ADJUST_METHODS, ADJUST_NAMES, weighedShort } from "@/core/survey/adjust";
import { grammarForLibrary } from "@/core/survey/grammar";
import { autoDraft } from "@/core/survey/autodraft";
import { START_LIMITS, gridProblem, importOrder, importPointsOf, pointClashes, readSurveyFile, readTogether, statedSurveyDate, drawsWithDsrList, type FileRead, type StartProblem } from "@/core/survey/autosurvey/start";
import { startName } from "@/core/survey/autosurvey/job-facts";
import { codesAreCommonList, dsrCodes } from "@/core/survey/codes";
import { LIBRARY_LIMITS, libraryFor, parseCodeLibrary } from "@/core/survey/codelib";
import { withDefaults } from "@/core/survey/autosurvey/defaults";
import { asThePlanHasThem, conflictSaid, pointConflicts, updateForNewPoints } from "@/core/survey/autosurvey/update";
import { officeProfileBodySchema, profileFromPlan, profilePrecision, withProfile, type OfficeProfile } from "@/core/survey/profile";
import { numberKey, redrawFromCorrection } from "@/core/survey/sketchintel/correct";
import { interpretDocument } from "@/core/survey/sketchintel/findings";
import { withLinePutBack } from "@/core/survey/sketchintel/second-reading";
import { joinWords } from "@/core/survey/sketchintel/interpret";
import { withJoin, withoutJoin } from "@/core/survey/sketchintel/joins";
import { HABIT_STYLES, HABIT_TAKES, STYLE_WORDS, habitEntry, habitSaid } from "@/core/survey/sketchintel/classify";
import { FIRST_VERSION, finishable, generateStages, type JobStage } from "@/core/survey/autosurvey/job";
import { SKETCH_LIMITS } from "@/core/survey/autosurvey/sketch";
import { crsById } from "@/core/survey/crs";
import { emptyDocument, lotName, provenanceLive, pruneConstructed, pruneProvenance, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "@/core/survey/document";
import { itemOf, quietSketchItems } from "@/core/survey/exceptions";
import { IMPORT_LIMITS, type ColumnRole, type Delimiter, type ImportIssue } from "@/core/survey/import/delimited";
import { unreadableFile } from "@/core/survey/import/detect";
import { readPoints } from "@/core/survey/import/read";
import { approvalHash, buildPlan } from "@/core/survey/view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadSurveyDrawing, loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { hasSurveyorDetails, loadRecentPlans, loadStartingDefaults } from "@/server/survey/defaults";
import { applySuggestion, declineSuggestion } from "@/core/survey/learning";
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
/** A number on a sketch that can be joined in a press (stage 303, 304): no space, bar or plus, which the join's key is written with. */
const JOIN_POINT = /^[^\s|+]+$/;

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
  // The person generating it is the plan's surveyor when they have surveyor details here, as the start screen tells them (stage 294):
  // named from the start, so a plan drawn only from a sketch (files with no codes draw nothing first) names them too.
  if (uuid.safeParse(g.w.actor.userId).success && (await hasSurveyorDetails(g.w.user, g.w.actor.orgId, g.w.actor.userId))) document = { ...document, surveyorUserId: g.w.actor.userId };
  const created = await surveyStore.createProject(g.w.admin, g.w.actor, { name: startName(i.title, reads, new Date()), planType: "cadastral", crsId: crs.id, confirm: true, document });
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

const addInput = z.object({
  projectId: uuid,
  /** The version the surveyor was looking at: the plan is updated on it, or not at all. */
  baseVersion: z.number().int().min(1),
  /** The grid the page showed: files are read in it, and nothing is added if it has changed since. */
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
});

export type AddState =
  | { status: "idle" }
  | { status: "error"; message: string; problems: StartProblem[] }
  /** `before` is the version the update was made on, for "See what changed". */
  | { status: "done"; message: string; version: number; before: number; newPoints: number; said: string[]; kept: string[] };

/**
 * "Add to this plan" (stage 306, ADR 0311): more survey files for a plan already drawn. Every file is read again here with the same tested
 * readers; any that can't be read, a point number given twice, points off the plan's grid, or a point the plan already has somewhere
 * else stops it before anything is imported, each said with what to do. Points the plan has are sent exactly as it has them, so each is
 * kept once. Then each file is imported as its own source, and the plan is updated only where the new points change it
 * (`updateForNewPoints`), saved as one version. A file that fails part way still leaves the plan updated for those before it, and a save
 * another press got in before is made again once on the newest version, so the points imported are never left undrawn.
 */
export async function addToSurveyPlanAction(input: z.input<typeof addInput>): Promise<AddState> {
  const parsed = addInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST, problems: [] };
  const i = parsed.data;
  const bytes = i.files.reduce((sum, f) => sum + f.content.length, 0);
  if (bytes > START_LIMITS.dataBytes) return { status: "error", message: `These files hold more than ${START_LIMITS.dataBytes / 1024 / 1024} MB of survey data together. Add fewer at a time.`, problems: [] };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message, problems: [] };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, i.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND, problems: [] };
  if (data.project.crsId !== i.crsId) return { status: "error", message: SURVEY_MESSAGES.CRS_CHANGED, problems: [] };
  if (data.drawing.version !== i.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT, problems: [] };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be added to it. Reload, or ask support.", problems: [] };
  const crs = crsById(data.project.crsId);
  if (!crs) return { status: "error", message: "This plan's coordinate system isn't one Farbaek knows, so nothing can be added to it.", problems: [] };

  const reads: FileRead[] = [];
  const contents: string[] = [];
  const problems: StartProblem[] = [];
  for (const f of i.files) {
    const r = readSurveyFile(f.name, f.content, crs, f.adjust);
    if (r.ok) {
      reads.push(r.read);
      contents.push(f.content);
    } else problems.push({ file: r.name, problem: r.problem });
  }
  problems.push(...pointClashes(reads));
  const grid = gridProblem(reads.flatMap((r) => r.points), crs);
  if (grid) problems.push(grid);
  // A point the plan already has, given somewhere else: the database would refuse the whole file, so each is said first.
  for (const r of reads) {
    const clash = pointConflicts(data.points, r);
    if (clash.length > 0) problems.push({ file: r.name, problem: `${clash.slice(0, 4).map(conflictSaid).join(" ")}${clash.length > 4 ? ` And ${clash.length - 4} more.` : ""} Points are never changed once imported: if a point was shot again, give it a new number in the file.` });
  }
  if (problems.length > 0) return { status: "error", message: problems.length === 1 ? "One thing needs you before these files can be added. Nothing was changed." : `${problems.length} things need you before these files can be added. Nothing was changed.`, problems };

  const ordered = importOrder(reads);
  const together = readTogether(ordered);
  let newPoints = 0;
  let addedFiles: string[] = [];
  let failed = "";
  for (const [index, r] of ordered.entries()) {
    const imported = await surveyStore.importPoints(g.w.admin, g.w.actor, {
      projectId: i.projectId,
      fileName: r.name,
      format: r.format,
      content: contents[reads.indexOf(r)]!,
      settings: { delimiter: r.delimiter, hasHeader: r.hasHeader, columns: r.columns, units: "metre", crs: crs.id, by: "update", ...(r.reduction ? { reduction: r.reduction } : {}), ...(r.surveyDate ? { surveyDate: r.surveyDate } : {}) },
      points: asThePlanHasThem(data.points, importPointsOf(ordered, index, together.kept)).map((p) => ({ point_id: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code ?? "", line: p.line })),
    });
    if (!imported.ok) {
      failed = ` ${r.name} wasn't added: ${imported.message}${index + 1 < ordered.length ? " Nor were the files after it." : ""} Add ${index + 1 < ordered.length ? "them" : "it"} again once ${r.name} is fixed.`;
      break;
    }
    newPoints += imported.value.added;
    addedFiles = [...addedFiles, r.name];
  }
  revalidatePath(`/app/survey/${i.projectId}`);
  if (addedFiles.length === 0) return { status: "error", message: `Nothing was changed.${failed}`, problems: [] };
  const files = addedFiles.length === 1 ? addedFiles[0]! : `the ${addedFiles.length} files`;
  const pointsSaid = newPoints === 0 ? `Every point in ${files} was already in the plan.` : `${newPoints} new ${newPoints === 1 ? "point" : "points"} added from ${files}.`;
  const added = reads.filter((r) => addedFiles.includes(r.name));
  const note = `Added ${newPoints} ${newPoints === 1 ? "point" : "points"} from ${addedFiles.join(", ")}`.slice(0, 200);
  // The plan updated for the points it didn't have when the surveyor pressed, on the version they saw, or once on a newer one saved since.
  for (let attempt = 0; attempt < 2; attempt++) {
    const now = await loadSurveyProject(g.w.user, g.w.actor.orgId, i.projectId);
    if (!now || !now.drawing.readable) return { status: "error", message: `${pointsSaid} The plan wasn't updated with them: its latest version couldn't be read. Draw what's needed on the Lots step.${failed}`, problems: [] };
    const u = updateForNewPoints(now.drawing.document, data.points, now.points, statedSurveyDate(added));
    if (u.added.length + u.removed.length === 0) return { status: "done", message: `${pointsSaid}${newPoints > 0 ? " Nothing on the plan changes with them." : ""}${failed}`, version: now.drawing.version, before: i.baseVersion, newPoints, said: u.said, kept: u.kept };
    const next = tidy(pruneProvenance(u.document), now);
    if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: `${pointsSaid} The plan couldn't be updated with them: the result didn't pass the plan's own checks. Draw what's needed on the Lots step.${failed}`, problems: [] };
    const saved = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: i.projectId, baseVersion: now.drawing.version, document: next, note });
    if (saved.ok) return { status: "done", message: `${pointsSaid} The plan is updated as version ${saved.value}.${failed}`, version: saved.value, before: i.baseVersion, newPoints, said: u.said, kept: u.kept };
    if (saved.code !== "VERSION_CONFLICT" || attempt === 1) return { status: "error", message: `${pointsSaid} The plan wasn't updated with them: ${saved.message} Draw what's needed on the Lots step.${failed}`, problems: [] };
  }
  return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT, problems: [] };
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
  const next: SurveyDocument = { ...pruned, sketch: data.drawing.readable ? data.drawing.document.sketch : null };
  // The surveyor's sketch habits are set only by their press on a card (saveSketchHabitAction): a plan saved from the browser keeps the
  // stored ones, so none can be set, changed or carried without it.
  delete next.sketchHabits;
  delete next.sketchHabitsSaidAt;
  const stored = data.drawing.readable ? data.drawing.document : null;
  if (stored?.sketchHabits !== undefined) next.sketchHabits = stored.sketchHabits;
  if (stored?.sketchHabitsSaidAt !== undefined) next.sketchHabitsSaidAt = stored.sketchHabitsSaidAt;
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
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.key !== "string" || !/^(?:(?:dup|leg):[0-9a-f:|-]{36,120}|sketch:r\d{1,3}|check:[im]\d{1,3}|sketch:job|left:l\d{1,3}|join:[^\s|+]{1,32}\|[^\s|+]{1,32}(?:\+[^\s|+]{1,32}\|[^\s|+]{1,32}){0,5})$/.test(input.key)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
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
  const left = input.key.startsWith("left:");
  const notJoined = input.key.startsWith("join:");
  const note = `${input.keep ? (left ? "Left out" : notJoined ? "Not joined" : "Kept as surveyed") : "To check again"}: ${finding.message}`.slice(0, 200);
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: next, note });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  return { status: "done", message: `Saved as version ${r.value}.`, version: r.value };
}

/**
 * "Put it back" (stage 302, ADR 0308): a line Farbaek left out because the independent check didn't find it drawn, drawn again as the
 * sketch was read, and what it draws redrawn: items nobody confirmed are replaced, each waiting for the surveyor; anything confirmed is
 * left as it is. Saved as a new version.
 */
export async function putBackSketchLineAction(input: { projectId: string; baseVersion: number; line: string }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.line !== "string" || !/^l\d{1,3}$/.test(input.line)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== input.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be changed on it. Reload, or ask support." };
  const entry = data.drawing.document.sketch?.leftOut?.find((l) => l.line === input.line);
  const back = withLinePutBack(structuredClone(data.drawing.document), data.points, input.line);
  if (!entry || !back) return { status: "error", message: "That line isn't left out any more. Reload to see the plan as it is now." };
  const next = tidy(pruneProvenance(back.document), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const through = entry.points.join(", ");
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: next, note: `Put back the line through ${through}, as the sketch was read`.slice(0, 200) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  const changed = back.removed.length + back.added.length;
  const redrawn = changed > 0 ? ` ${back.removed.length} ${back.removed.length === 1 ? "item" : "items"} taken off, ${back.added.length} drawn, each waiting for you.` : "";
  return { status: "done", message: `Put back: the line through ${through} is drawn as the sketch was read.${redrawn} Saved as version ${r.value}.`, version: r.value };
}

const joinInput = z.object({
  projectId: z.string().uuid(),
  baseVersion: z.number().int().min(1),
  pairs: z.array(z.object({ from: z.string().min(1).max(32).regex(JOIN_POINT), to: z.string().min(1).max(32).regex(JOIN_POINT) })).min(1).max(6),
  join: z.boolean(),
});

/**
 * "Join 15 to 14" (stage 303, ADR 0309): a stroke the read of the sketch missed, which closes a house round its label, joined as the
 * surveyor's word; or a join they made, taken off. Only a join the plan offers now can be made. What the sketch draws is redrawn: items
 * nobody confirmed change, each waiting for the surveyor; anything confirmed is left as it is. Saved as a new version.
 */
export async function joinSketchPointsAction(input: z.input<typeof joinInput>): Promise<SurveyFormState> {
  const parsed = joinInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const i = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, i.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== i.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be changed on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  // A join is taken off one at a time; joins offered together are made together.
  if (!i.join && i.pairs.length !== 1) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = i.join ? withJoin(doc, data.points, i.pairs, g.w.actor.userId, new Date()) : withoutJoin(doc, data.points, i.pairs[0]!.from, i.pairs[0]!.to);
  if (!r) return { status: "error", message: i.join ? "That join isn't offered on this plan any more. Reload to see the plan as it is now." : "That join isn't on this plan any more. Reload to see the plan as it is now." };
  const next = tidy(pruneProvenance(r.document), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const said = i.join ? `Joined ${joinWords(i.pairs)} on the sketch` : `Took off the join from ${i.pairs[0]!.from} to ${i.pairs[0]!.to}`;
  const saved = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: i.projectId, baseVersion: i.baseVersion, document: next, note: said.slice(0, 200) });
  if (!saved.ok) return { status: "error", message: saved.message };
  revalidatePath(`/app/survey/${i.projectId}`);
  const redrawn = r.removed.length + r.added.length > 0 ? ` ${r.added.length} ${r.added.length === 1 ? "item" : "items"} drawn, ${r.removed.length} taken off, each waiting for you.` : "";
  return { status: "done", message: `${said}.${redrawn} Saved as version ${saved.value}.`, version: saved.value };
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
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be confirmed on it. Reload, or ask support." };
  // Several confirmed one after another (stage 303): a newer version saved by another press since the page was drawn doesn't stand in
  // the way when nothing but confirmations changed in between. Anything else (a new reading, a correction, an edit) asks for a reload.
  let base = input.baseVersion;
  if (data.drawing.version !== base) {
    const seen = await loadSurveyDrawing(g.w.user, input.projectId, base).catch(() => null);
    if (!seen?.readable || !onlyConfirmationsDiffer(seen.document, data.drawing.document)) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
    base = data.drawing.version;
  }
  const doc = structuredClone(data.drawing.document);
  const mark = doc.provenance[input.key];
  const codes = input.key === "codes";
  // The code list may have no mark yet (the common list as it came); anything else must be an item drawn or filled in that's still on the plan.
  if (!codes && (!mark || mark.source === "engine" || !provenanceLive(doc, input.key))) return { status: "error", message: "That item isn't waiting for a confirmation any more. Reload to see the plan as it is now." };
  doc.provenance[input.key] = { source: mark?.source ?? "engine", reviewed: input.confirmed };
  const { label } = itemOf(doc, input.key);
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: base, document: next, note: `${input.confirmed ? "Confirmed" : "To check again"}: ${label}`.slice(0, 200) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  return { status: "done", message: `${input.confirmed ? "Confirmed" : "Back on the list"}: ${label}. Saved as version ${r.value}.`, version: r.value };
}

/** Whether two versions differ only in what was confirmed (the marks' reviewed flags) and kept (stage 303). */
function onlyConfirmationsDiffer(a: SurveyDocument, b: SurveyDocument): boolean {
  const bare = (d: SurveyDocument) => JSON.stringify({ ...d, provenance: Object.fromEntries(Object.keys(d.provenance).sort().map((k) => [k, d.provenance[k]!.source])), kept: [] });
  return bare(a) === bare(b);
}

/**
 * Confirms together the sketch's lines and symbols that nothing stands against (stage 294): one press for what would be a card each.
 * The rule is worked out again here from the plan as saved, so only items that are still read from a photo, still unconfirmed and still
 * free of any question are confirmed, whatever the browser sent. Saved as one new version that says how many.
 */
export async function confirmSketchItemsAction(input: { projectId: string; baseVersion: number; keys: string[] }): Promise<SurveyFormState> {
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || !Array.isArray(input.keys) || input.keys.length === 0 || input.keys.length > 500 || input.keys.some((k) => typeof k !== "string" || !/^feature:[\w.:-]{1,79}$/.test(k))) {
    return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  }
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, input.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== input.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be confirmed on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  const quiet = new Set(quietSketchItems(doc, data.points));
  const keys = [...new Set(input.keys)].filter((k) => quiet.has(k));
  if (keys.length === 0) return { status: "error", message: "None of these are waiting without a question any more. Reload to see the plan as it is now." };
  for (const key of keys) doc.provenance[key] = { source: doc.provenance[key]!.source, reviewed: true };
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const what = `${keys.length} ${keys.length === 1 ? "item" : "items"} read from the sketch`;
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: next, note: `Confirmed together: ${what}` });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${input.projectId}`);
  const left = input.keys.length - keys.length;
  return { status: "done", message: `Confirmed ${what}${left > 0 ? `; ${left} gained a question since, so ${left === 1 ? "it stays" : "they stay"} on the list` : ""}. Saved as version ${r.value}.`, version: r.value };
}

const habitInput = z.object({ projectId: z.string().uuid(), baseVersion: z.number().int().min(1), style: z.enum(HABIT_STYLES), code: z.string().min(1).max(12).optional() });

/**
 * The surveyor's sketch habit (stage 298, ADR 0304): "on my sketches, a double line is a masonry wall". Saved as theirs on this plan and
 * carried to their next ones. The code must be one the card offers, of the kind the style is drawn for, in the plan's own list. The lines
 * the sketch drew that way, with nothing written along them and nobody has confirmed yet, take the code at once; anything confirmed or
 * drawn by hand is left as it is. Saved as a new version that says what was said.
 */
export async function saveSketchHabitAction(input: z.input<typeof habitInput>): Promise<SurveyFormState> {
  const parsed = habitInput.safeParse(input);
  if (!parsed.success || !parsed.data.code) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const { projectId, baseVersion, style, code } = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be saved on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  const entry = habitEntry({ style, code }, doc.codes);
  if (!entry) return { status: "error", message: `${code} isn't ${HABIT_TAKES[style]} in this plan's code list. Choose one the card offers.` };
  // A line keeps any code it has, unless that code is the one this habit replaces: one the surveyor typed is theirs.
  const before = (doc.sketchHabits ?? []).find((h) => h.style === style)?.code;
  doc.sketchHabits = [...(doc.sketchHabits ?? []).filter((h) => h.style !== style), { style, code }];
  doc.sketchHabitsSaidAt = new Date().toISOString();
  // What the sketch drew that way and nobody has confirmed takes the code now; the interpretation says which, by the same rule.
  const sketch = interpretDocument(doc, data.points);
  let changed = 0;
  for (const f of doc.features) {
    const mark = doc.provenance[`feature:${f.id}`];
    if (mark?.source !== "ai_photo" || mark.reviewed) continue;
    const p = sketch?.proposals.find((x) => x.kind === "line" && x.id === f.id);
    if (!p || p.kind !== "line" || p.code !== code || f.code === code || (f.code !== "" && f.code !== before)) continue;
    const drawn = doc.sketch?.drawing?.lines.find((l) => p.from.includes(l.id));
    if (!drawn || drawn.style !== style || drawn.label.trim()) continue;
    f.code = code;
    f.layer = p.layer;
    // Drawn as a fresh read with the habit would draw it: a building's wall is open and goes round to its start, never a closed outline.
    f.closed = p.closed;
    f.points = p.points.map((x) => x.id);
    changed++;
  }
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const said = habitSaid(style, entry);
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId, baseVersion, document: next, note: `Your sketch habit: ${said}`.slice(0, 200) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: `Saved: on your sketches, ${said}.${changed > 0 ? ` ${changed} ${changed === 1 ? "line takes" : "lines take"} it now.` : ""} Your next plans start with it. Saved as version ${r.value}.`, version: r.value };
}

/**
 * Forgets a sketch habit (stage 298): the lines it named keep their code until the surveyor changes them, and the question comes back for
 * any not yet confirmed. Forgetting the last one leaves an empty list, so it isn't carried back from an older plan.
 */
export async function forgetSketchHabitAction(input: z.input<typeof habitInput>): Promise<SurveyFormState> {
  const parsed = habitInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const { projectId, baseVersion, style } = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be saved on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  if (!(doc.sketchHabits ?? []).some((h) => h.style === style)) return { status: "error", message: "That habit isn't on this plan any more. Reload to see the plan as it is now." };
  doc.sketchHabits = (doc.sketchHabits ?? []).filter((h) => h.style !== style);
  doc.sketchHabitsSaidAt = new Date().toISOString();
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId, baseVersion, document: next, note: `Sketch habit forgotten: ${STYLE_WORDS[style]}` });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${projectId}`);
  return { status: "done", message: `Forgotten. Farbaek asks again what ${STYLE_WORDS[style]} is. Saved as version ${r.value}.`, version: r.value };
}

const lotLabelInput = z.object({
  projectId: z.string().uuid(),
  baseVersion: z.number().int().min(1),
  lotId: z.string().min(1).max(80),
  label: z
    .string()
    .transform((s) => s.trim().replace(/\s+/g, " "))
    .pipe(z.string().min(1).max(40).regex(/^[^\u0000-\u001f\u007f]+$/)),
});

/**
 * Gives a lot its label from the card that says it has none (stage 294), saved as a new version. The label is the surveyor's own, as
 * it appears in the title: never one another lot on the plan already has. Labelling a lot read from a photo doesn't confirm it.
 */
export async function labelLotAction(input: z.input<typeof lotLabelInput>): Promise<SurveyFormState> {
  const parsed = lotLabelInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Type the lot's letter or number, as it appears in the title." };
  const i = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const data = await loadSurveyProject(g.w.user, g.w.actor.orgId, i.projectId);
  if (!data) return { status: "error", message: SURVEY_MESSAGES.NOT_FOUND };
  if (data.drawing.version !== i.baseVersion) return { status: "error", message: SURVEY_MESSAGES.VERSION_CONFLICT };
  if (!data.drawing.readable) return { status: "error", message: "This version couldn't be read, so nothing can be labelled on it. Reload, or ask support." };
  const doc = structuredClone(data.drawing.document);
  const lot = doc.lots.find((l) => l.id === i.lotId);
  if (!lot) return { status: "error", message: "That lot isn't on the plan any more. Reload to see the plan as it is now." };
  // The same comparison as the plan's own check: the whole name, its raised part included ("B" and "B¹" are different lots).
  const named = lotName({ ...lot, label: i.label });
  if (doc.lots.some((l) => l.id !== lot.id && lotName(l) === named)) return { status: "error", message: `Another lot is already called ${named}. Give this one its own label.` };
  lot.label = i.label;
  const next = tidy(pruneProvenance(doc), data);
  if (!surveyDocumentSchema.safeParse(next).success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: i.projectId, baseVersion: i.baseVersion, document: next, note: `Lot labelled ${i.label}`.slice(0, 200) });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${i.projectId}`);
  return { status: "done", message: `Lot ${i.label} is labelled. Saved as version ${r.value}.`, version: r.value };
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

const suggestionInput = z.object({ profileId: z.string().uuid(), baseVersion: z.number().int().min(1), key: z.string().min(1).max(1000), accept: z.boolean() });

/**
 * Adds a suggestion learned from the surveyor's plans to their office profile, or turns it down so it isn't offered again (stage 270,
 * ADR 0277). Either way a new version. The suggestion is worked out again here from their own plans and the profile as saved: what the
 * browser sends is only which one, never what it changes.
 */
export async function answerProfileSuggestionAction(input: z.input<typeof suggestionInput>): Promise<ProfileState> {
  const parsed = suggestionInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
  const i = parsed.data;
  const g = await writer();
  if (!g.ok) return { status: "error", message: g.message };
  const profile = (await loadOfficeProfiles(g.w.user, g.w.actor.orgId)).find((p) => p.id === i.profileId);
  if (!profile) return { status: "error", message: "That profile has been archived, or isn't in this workspace any more. Reload the page." };
  if (profile.version !== i.baseVersion) return { status: "error", message: "Someone saved a newer version of this profile while you were working. Reload to see it. Nothing was saved." };
  const recent = await loadRecentPlans(g.w.user, g.w.actor.orgId, g.w.actor.userId);
  const body = i.accept ? applySuggestion(profile, recent, i.key) : declineSuggestion(profile, recent, i.key);
  if (!body) return { status: "error", message: "That suggestion no longer applies: your plans or the profile have changed since the page was opened. Reload to see what's suggested now. Nothing was saved." };
  const r = await saveOfficeProfileAction({ profileId: profile.id, baseVersion: profile.version, name: profile.name, body });
  if (r.status !== "done") return r;
  return { ...r, message: i.accept ? `Added to the profile, as version ${r.version}. New plans start from it.` : `It won't be suggested again (version ${r.version}).` };
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
