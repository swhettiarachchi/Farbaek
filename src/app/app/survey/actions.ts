"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { autoDraft } from "@/core/survey/autodraft";
import { START_LIMITS, gridProblem, pointClashes, readSurveyFile, startName, statedSurveyDate, drawsWithDsrList, type FileRead, type StartProblem } from "@/core/survey/autosurvey/start";
import { codesAreCommonList, dsrCodes } from "@/core/survey/codes";
import { LIBRARY_LIMITS, libraryFor, parseCodeLibrary } from "@/core/survey/codelib";
import { withDefaults } from "@/core/survey/autosurvey/defaults";
import { generateStages } from "@/core/survey/autosurvey/job";
import { SKETCH_LIMITS } from "@/core/survey/autosurvey/sketch";
import { crsById } from "@/core/survey/crs";
import { emptyDocument, provenanceLive, pruneProvenance, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "@/core/survey/document";
import { itemOf } from "@/core/survey/exceptions";
import { IMPORT_LIMITS, type ColumnRole, type Delimiter, type ImportIssue } from "@/core/survey/import/delimited";
import { unreadableFile } from "@/core/survey/import/detect";
import { readPoints } from "@/core/survey/import/read";
import { approvalHash, buildPlan } from "@/core/survey/view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { loadStartingDefaults } from "@/server/survey/defaults";
import { JobTracker } from "@/server/survey/jobs";
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
  format: z.enum(["delimited", "geojson", "gsi", "sdr", "landxml", "jobxml", "fieldbook"]),
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
  const result = readPoints(i.format, i.content, { delimiter: i.delimiter as Delimiter, hasHeader: i.hasHeader, columns: i.columns as ColumnRole[], crs: crsById(crsId) ?? null, known });
  const errors = result.issues.filter((x) => x.severity === "error");
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
  const drawing = i.drawPlan ? await drawFromPoints(g.w, i.projectId, `Drawn from ${i.fileName}`, i.codeList, result.surveyDate) : null;
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
async function drawFromPoints(w: Writer, projectId: string, note: string, codeList: "project" | "dsr" = "project", surveyDate: string | null = null): Promise<{ ok: true; version: number | null; drawn: string[]; notDrawn: string[] } | { ok: false; message: string }> {
  const data = await loadSurveyProject(w.user, w.actor.orgId, projectId);
  if (!data) return { ok: false, message: SURVEY_MESSAGES.NOT_FOUND };
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
  if (!saved.ok) return { ok: false, message: saved.message };
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

const generateInput = z.object({
  title: z.string().max(200).default(""),
  /** The grid the start screen showed. Pressing Generate Plan is the surveyor confirming it: the project records who did. */
  crsId: z.string().max(40),
  files: z
    .array(z.object({ name: z.string().min(1).max(200).regex(/^[^\u0000-\u001f\u007f]+$/), content: z.string().max(IMPORT_LIMITS.maxBytes) }))
    .min(1)
    .max(START_LIMITS.files),
  /** How many sketch photos the screen will send for reading once the plan is drawn: the job shows that stage (ADR 0239). */
  sketches: z.number().int().min(0).max(SKETCH_LIMITS.photos).default(0),
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

  const reads: FileRead[] = [];
  // Each read beside the text it came from: two files may share a name.
  const contents: string[] = [];
  const problems: StartProblem[] = [];
  for (const f of i.files) {
    const r = readSurveyFile(f.name, f.content, crs);
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

  // A returning surveyor's own defaults (ADR 0237): the code list they checked last and their sheet's presentation, read through
  // row-level security; an office code library uploaded with the files wins over the carried list, and waits for their check.
  let document = withDefaults(emptyDocument(), await loadStartingDefaults(g.w.user, g.w.actor.orgId, g.w.actor.userId));
  if (i.library) {
    const lib = parseCodeLibrary(i.library.content);
    if (!lib.ok) return { status: "error", message: "One thing needs you before the plan can be drawn. Nothing was saved.", problems: [{ file: i.library.name, problem: lib.problem }] };
    const taken = libraryFor(lib.entries, all.map((p) => p.code ?? "").filter(Boolean));
    document = { ...document, codes: taken.codes, provenance: { ...document.provenance, codes: { source: "engine", reviewed: false } } };
  }
  const created = await surveyStore.createProject(g.w.admin, g.w.actor, { name: startName(i.title, reads[0]?.name ?? null, new Date()), planType: "cadastral", crsId: crs.id, confirm: true, document });
  if (!created.ok) return { status: "error", message: created.message, problems: [] };
  const projectId = created.value;
  // The run as a job with real stages, so leaving the page and coming back shows where it stands (ADR 0239).
  const job = await JobTracker.start(g.w.admin, g.w.actor, projectId, generateStages(reads.length, i.sketches));
  for (const [n, r] of reads.entries()) {
    const imported = await surveyStore.importPoints(g.w.admin, g.w.actor, {
      projectId,
      fileName: r.name,
      format: r.format,
      content: contents[n]!,
      settings: { delimiter: r.delimiter, hasHeader: r.hasHeader, columns: r.columns, units: "metre", crs: crs.id, by: "autosurvey", ...(r.reduction ? { reduction: r.reduction } : {}) },
      points: r.points.map((p) => ({ point_id: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code ?? "", line: p.line })),
    });
    if (!imported.ok) {
      await job.stage("import", "failed", `${r.name}: ${imported.message}`, { message: `${r.name} wasn't imported.` });
      revalidatePath("/app/survey");
      return { status: "error", message: `The project was created, but ${r.name} wasn't imported: ${imported.message} Open the project to import it again.`, problems: [], projectId };
    }
  }
  await job.stage("import", "done", `${all.length} ${all.length === 1 ? "point" : "points"} from ${reads.length} ${reads.length === 1 ? "file" : "files"}.`);
  const drawing = await drawFromPoints(
    g.w,
    projectId,
    `Drawn by AutoSurvey from ${reads.length} ${reads.length === 1 ? "file" : "files"}`,
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
  const unknown = unknownPoints(doc.data, new Set(data.points.map((p) => p.id)));
  if (unknown.length > 0) return { status: "error", message: "The plan uses points that aren't in this project. Reload and try again." };
  if (doc.data.surveyorUserId && !data.profiles.some((p) => p.user_id === doc.data.surveyorUserId)) {
    return { status: "error", message: "The chosen surveyor hasn't entered their details in this workspace yet." };
  }
  // What was read from the sketches is only ever written by reading them (readSketchesAction): a plan saved from the browser keeps
  // the stored readings, so none can be made up, changed or removed to clear a difference that holds approval.
  const next = { ...doc.data, sketch: data.drawing.readable ? data.drawing.document.sketch : null };
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
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.key !== "string" || !/^(?:(?:dup|leg):[0-9a-f:|-]{36,120}|sketch:r\d{1,3})$/.test(input.key)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
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
