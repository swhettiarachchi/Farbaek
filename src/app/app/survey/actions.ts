"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { crsById } from "@/core/survey/crs";
import { emptyDocument, pruneProvenance, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "@/core/survey/document";
import { IMPORT_LIMITS, parseDelimited, type ColumnRole, type Delimiter, type ImportIssue } from "@/core/survey/import/delimited";
import { parseGeoJsonPoints } from "@/core/survey/import/geojson";
import { approvalHash, buildPlan } from "@/core/survey/view";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadSurveyProject, type SurveyProjectData } from "@/server/survey/read";
import { SURVEY_MESSAGES, surveyStore, type Actor } from "@/server/survey/store";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SurveyFormState = { status: "idle" } | { status: "error"; message: string; issues?: ImportIssue[] } | { status: "done"; message: string; version?: number };

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
  format: z.enum(["delimited", "geojson"]),
  delimiter: z.enum([",", "\t", ";", "whitespace"]),
  hasHeader: z.boolean(),
  columns: z.array(z.enum(["point", "easting", "northing", "elevation", "code", "ignore"])).min(3).max(40),
  units: z.literal("metre"),
  /** The grid the page showed when the person confirmed the units. */
  crsId: z.string().max(40),
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
  const result = i.format === "geojson" ? parseGeoJsonPoints(i.content, crsById(crsId)?.epsg ?? null) : parseDelimited(i.content, { delimiter: i.delimiter as Delimiter, hasHeader: i.hasHeader, columns: i.columns as ColumnRole[] });
  const errors = result.issues.filter((x) => x.severity === "error");
  if (errors.length > 0) return { status: "error", message: `${errors.length} ${errors.length === 1 ? "row" : "rows"} can't be read, so nothing was imported. Fix the file and try again.`, issues: result.issues.slice(0, 50) };
  if (result.points.length === 0) return { status: "error", message: "The file has no points to import.", issues: result.issues.slice(0, 50) };
  const r = await surveyStore.importPoints(g.w.admin, g.w.actor, {
    projectId: i.projectId,
    fileName: i.fileName,
    format: i.format,
    content: i.content,
    settings: { delimiter: i.delimiter, hasHeader: i.hasHeader, columns: i.columns, units: i.units, crs: crsId },
    points: result.points.map((p) => ({ point_id: p.pointId, e: p.e, n: p.n, z: p.z, code: p.code ?? "", line: p.line })),
  });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/survey/${i.projectId}`);
  const warnings = result.issues.filter((x) => x.severity === "warning").length;
  return { status: "done", message: `Imported ${r.value.added} ${r.value.added === 1 ? "point" : "points"}${r.value.skipped ? `; ${r.value.skipped} already here, unchanged` : ""}${warnings ? `; ${warnings} repeated ${warnings === 1 ? "row" : "rows"} kept once` : ""}.` };
}

/**
 * A document as it's saved: "keep as surveyed" answers only for near misses
 * the plan has now (none can be added from outside, and none outlives its
 * near miss), so the list stays short and every entry means something.
 */
function tidy(doc: SurveyDocument, data: { points: SurveyProjectData["points"]; project: { crsId: string } }): SurveyDocument {
  if (doc.kept.length === 0) return doc;
  const view = buildPlan({ points: data.points, document: doc, crsId: data.project.crsId, crsConfirmation: null, surveyor: null, approval: null });
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
  // Marks for items no longer on the plan are dropped, so none can hold an approval with nothing to check.
  const r = await surveyStore.saveDrawing(g.w.admin, g.w.actor, { projectId: input.projectId, baseVersion: input.baseVersion, document: tidy(pruneProvenance(doc.data), data), note: input.note?.slice(0, 200) ?? null });
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
  if (!uuid.safeParse(input.projectId).success || !Number.isInteger(input.baseVersion) || typeof input.key !== "string" || !/^(dup|leg):[0-9a-f:|-]{36,120}$/.test(input.key)) return { status: "error", message: SURVEY_MESSAGES.INVALID_REQUEST };
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
