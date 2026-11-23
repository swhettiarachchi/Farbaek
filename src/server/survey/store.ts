import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

/**
 * Survey Studio writes (migration v93). Each call goes to an app_survey_*
 * function that only the service role can run; the function checks the
 * person's role again and writes the audit event. Callers check first too.
 */

export type SurveyResult<T> = { ok: true; value: T } | { ok: false; code: SurveyErrorCode; message: string };

export const SURVEY_MESSAGES = {
  FORBIDDEN: "Only owners, admins and members of this workspace can change survey projects.",
  WORKSPACE_SUSPENDED: "Farbaek has paused this workspace, so its survey projects can't change right now.",
  NOT_FOUND: "That survey project isn't in this workspace, or it has been archived.",
  PLAN_TYPE_NOT_AVAILABLE: "Only land survey (cadastral) plans can be made in this version of Survey Studio.",
  QUOTA_EXCEEDED: "This workspace has reached a Survey Studio limit (200 projects, 20,000 points or 5,000 versions per project).",
  POINT_CONFLICT: "Some point numbers are already in this project with different coordinates. Imported points are never changed: give corrected points new numbers.",
  VERSION_CONFLICT: "Someone saved a newer version of this plan while you were working. Reload to see it, then make your change again.",
  NOT_THE_SURVEYOR: "Only the surveyor this plan names can approve it.",
  NO_SURVEYOR_PROFILE: "Enter your surveyor details before approving a plan.",
  ALREADY_APPROVED: "This version is already approved.",
  CRS_CHANGED: "The project's coordinate system changed while you were working. Reload, check it, and try again. Nothing was changed.",
  INVALID_REQUEST: "That request wasn't valid. Nothing was changed.",
  NOT_CONFIGURED: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com.",
  FORMAT_NOT_READY: "This kind of file can be imported once Farbaek's database update v104 is applied. Upload the job's .sdr or a points CSV meanwhile.",
  UNKNOWN: "That didn't work, and nothing was changed. Try again in a moment.",
} as const;

export type SurveyErrorCode = keyof typeof SURVEY_MESSAGES;

export function surveyError(code: SurveyErrorCode): { ok: false; code: SurveyErrorCode; message: string } {
  return { ok: false, code, message: SURVEY_MESSAGES[code] };
}

/** The code a database error names, or UNKNOWN. POINT_CONFLICT carries the first point numbers after a colon. */
export function surveyErrorFrom(message: string): { ok: false; code: SurveyErrorCode; message: string } {
  // A format the database doesn't list yet (stage 242's Sokkia point list and DXF, before schema v104): said, not "try again".
  if (message.includes("survey_sources_format_check")) return surveyError("FORMAT_NOT_READY");
  const code = (Object.keys(SURVEY_MESSAGES) as SurveyErrorCode[]).find((c) => message.includes(c)) ?? "UNKNOWN";
  if (code === "POINT_CONFLICT") {
    const ids = /POINT_CONFLICT: ([^\n]+)/.exec(message)?.[1]?.slice(0, 120);
    return { ok: false, code, message: ids ? `${SURVEY_MESSAGES.POINT_CONFLICT} Points: ${ids}.` : SURVEY_MESSAGES.POINT_CONFLICT };
  }
  return surveyError(code);
}

async function rpc<T>(admin: SupabaseClient, fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<SurveyResult<T>> {
  const { data, error } = await admin.rpc(fn, args);
  if (error) return surveyErrorFrom(error.message);
  const parsed = schema.safeParse(data);
  return parsed.success ? { ok: true, value: parsed.data } : surveyError("UNKNOWN");
}

export interface Actor {
  orgId: string;
  userId: string;
}

export const surveyStore = {
  createProject: (admin: SupabaseClient, a: Actor, i: { name: string; planType: string; crsId: string; confirm: boolean; document: unknown }) =>
    rpc(admin, "app_survey_create_project", { p_org: a.orgId, p_actor: a.userId, p_name: i.name, p_plan_type: i.planType, p_crs: i.crsId, p_confirm: i.confirm, p_document: i.document }, z.string().uuid()),
  updateProject: (admin: SupabaseClient, a: Actor, i: { projectId: string; name: string; crsId: string; confirm: boolean }) =>
    rpc(admin, "app_survey_update_project", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_name: i.name, p_crs: i.crsId, p_confirm: i.confirm }, z.unknown()),
  importPoints: (admin: SupabaseClient, a: Actor, i: { projectId: string; fileName: string; format: string; content: string; settings: unknown; points: unknown[] }) =>
    rpc(admin, "app_survey_import", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_file_name: i.fileName, p_format: i.format, p_content: i.content, p_settings: i.settings, p_points: i.points }, z.object({ source_id: z.string(), added: z.number(), skipped: z.number() })),
  saveDrawing: (admin: SupabaseClient, a: Actor, i: { projectId: string; baseVersion: number; document: unknown; note: string | null }) =>
    rpc(admin, "app_survey_save_drawing", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_base_version: i.baseVersion, p_document: i.document, p_note: i.note }, z.number().int()),
  setProfile: (admin: SupabaseClient, a: Actor, i: { fullName: string; designation: string; registration: string; address: string; contact: string }) =>
    rpc(admin, "app_survey_set_profile", { p_org: a.orgId, p_actor: a.userId, p_full_name: i.fullName, p_designation: i.designation, p_registration: i.registration, p_address: i.address, p_contact: i.contact }, z.unknown()),
  approve: (admin: SupabaseClient, a: Actor, i: { projectId: string; version: number; crsId: string; sha256: string }) =>
    rpc(admin, "app_survey_approve", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_version: i.version, p_crs: i.crsId, p_content_sha256: i.sha256 }, z.string().uuid()),
  recordExport: (admin: SupabaseClient, a: Actor, i: { projectId: string; version: number; kind: string; sha256: string; size: number; options: unknown }) =>
    rpc(admin, "app_survey_record_export", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_version: i.version, p_kind: i.kind, p_sha256: i.sha256, p_size: i.size, p_options: i.options }, z.string().uuid()),
  /** AutoSurvey's jobs (v102, ADR 0239): one Generate Plan run, its stages, and its end. */
  jobStart: (admin: SupabaseClient, a: Actor, i: { projectId: string; stages: unknown }) => rpc(admin, "app_survey_job_start", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_kind: "generate", p_stages: i.stages }, z.string().uuid()),
  jobUpdate: (admin: SupabaseClient, orgId: string, i: { jobId: string; stages: unknown; state: "running" | "done" | "failed" | "interrupted"; result: unknown }) =>
    rpc(admin, "app_survey_job_update", { p_org: orgId, p_job: i.jobId, p_stages: i.stages, p_state: i.state, p_result: i.result }, z.unknown()),
  /** One read's sketch photos, kept with the project (v103, ADR 0240). */
  keepSketches: (admin: SupabaseClient, a: Actor, i: { projectId: string; readAt: string; photos: { name: string; mime: string; sha256: string; content: string }[] }) =>
    rpc(admin, "app_survey_keep_sketches", { p_org: a.orgId, p_actor: a.userId, p_project: i.projectId, p_read_at: i.readAt, p_photos: i.photos }, z.number().int()),
  archive: (admin: SupabaseClient, a: Actor, projectId: string) => rpc(admin, "app_survey_archive_project", { p_org: a.orgId, p_actor: a.userId, p_project: projectId }, z.unknown()),
};
