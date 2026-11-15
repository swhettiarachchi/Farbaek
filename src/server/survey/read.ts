import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";

/**
 * Survey Studio reads, as the signed-in person: row level security limits
 * every query to their own workspace (migration v93). Writes never happen here.
 */

const projectRow = z.object({
  id: z.string(),
  name: z.string(),
  plan_type: z.string(),
  crs_id: z.string(),
  crs_confirmed_by: z.string().nullable(),
  crs_confirmed_at: z.string().nullable(),
  created_by: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  archived_at: z.string().nullable(),
});

export interface SurveyProject {
  id: string;
  name: string;
  planType: string;
  crsId: string;
  crsConfirmedBy: string | null;
  crsConfirmedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

const toProject = (r: z.infer<typeof projectRow>): SurveyProject => ({
  id: r.id,
  name: r.name,
  planType: r.plan_type,
  crsId: r.crs_id,
  crsConfirmedBy: r.crs_confirmed_by,
  crsConfirmedAt: r.crs_confirmed_at,
  createdBy: r.created_by,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
  archivedAt: r.archived_at,
});

const PROJECT_COLUMNS = "id, name, plan_type, crs_id, crs_confirmed_by, crs_confirmed_at, created_by, created_at, updated_at, archived_at";

export interface SurveyProjectSummary extends SurveyProject {
  pointCount: number;
  approvedVersions: number[];
}

export async function listSurveyProjects(client: SupabaseClient, orgId: string): Promise<SurveyProjectSummary[] | null> {
  const { data, error } = await client
    .from("survey_projects")
    .select(`${PROJECT_COLUMNS}, survey_points(count), survey_approvals(drawing_version, withdrawn_at)`)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !data) return null;
  const extra = z.object({ survey_points: z.array(z.object({ count: z.number() })).catch([]), survey_approvals: z.array(z.object({ drawing_version: z.number(), withdrawn_at: z.string().nullable() })).catch([]) });
  const out: SurveyProjectSummary[] = [];
  for (const raw of data) {
    const p = projectRow.safeParse(raw);
    const x = extra.safeParse(raw);
    if (!p.success) continue;
    out.push({ ...toProject(p.data), pointCount: x.success ? (x.data.survey_points[0]?.count ?? 0) : 0, approvedVersions: x.success ? x.data.survey_approvals.filter((a) => a.withdrawn_at === null).map((a) => a.drawing_version) : [] });
  }
  return out;
}

const pointRow = z.object({ id: z.string(), point_id: z.string(), e: z.coerce.number(), n: z.coerce.number(), z: z.coerce.number().nullable(), code: z.string().nullable(), source_id: z.string(), line: z.number() });
const sourceRow = z.object({ id: z.string(), file_name: z.string(), format: z.string(), sha256: z.string(), size_bytes: z.number(), point_count: z.number(), settings: z.record(z.string(), z.unknown()).catch({}), created_by: z.string().nullable(), created_at: z.string() });
const drawingRow = z.object({ id: z.string(), version: z.number(), document: z.unknown(), note: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string() });
const approvalRow = z.object({ drawing_version: z.number(), approved_by: z.string().nullable(), approved_at: z.string(), content_sha256: z.string(), surveyor: z.record(z.string(), z.unknown()).catch({}), withdrawn_at: z.string().nullable() });
const exportRow = z.object({ kind: z.string(), drawing_version: z.number(), sha256: z.string(), size_bytes: z.number(), created_by: z.string().nullable(), created_at: z.string() });
const profileRow = z.object({ user_id: z.string(), full_name: z.string(), designation: z.string(), registration: z.string(), address: z.string(), contact: z.string(), updated_at: z.string() });

export type SurveySource = Omit<z.infer<typeof sourceRow>, "settings"> & { settings: Record<string, unknown> };
export type SurveyApproval = z.infer<typeof approvalRow>;
export type SurveyExport = z.infer<typeof exportRow>;
export type SurveyorProfile = z.infer<typeof profileRow>;

export interface SurveyDrawing {
  id: string;
  version: number;
  document: SurveyDocument;
  /** False when a stored document didn't match the current schema; the screen says so instead of guessing. */
  readable: boolean;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

function toDrawing(r: z.infer<typeof drawingRow>): SurveyDrawing {
  const parsed = surveyDocumentSchema.safeParse(r.document);
  return { id: r.id, version: r.version, document: parsed.success ? parsed.data : emptyDocument(), readable: parsed.success, note: r.note, createdBy: r.created_by, createdAt: r.created_at };
}

export interface SurveyProjectData {
  project: SurveyProject;
  points: SurveyPoint[];
  sources: SurveySource[];
  drawing: SurveyDrawing;
  versions: { version: number; note: string | null; createdBy: string | null; createdAt: string }[];
  approvals: SurveyApproval[];
  exports: SurveyExport[];
  profiles: SurveyorProfile[];
}

/** Every point of a project, a page at a time (the gateway returns at most 1,000 rows per request). */
async function readPoints(client: SupabaseClient, projectId: string): Promise<SurveyPoint[] | null> {
  const out: SurveyPoint[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await client.from("survey_points").select("id, point_id, e, n, z, code, source_id, line").eq("project_id", projectId).order("created_at").order("line").range(from, from + 999);
    if (error || !data) return null;
    for (const raw of data) {
      const r = pointRow.safeParse(raw);
      if (r.success) out.push({ id: r.data.id, pointId: r.data.point_id, e: r.data.e, n: r.data.n, z: r.data.z, code: r.data.code });
    }
    if (data.length < 1000) break;
  }
  return out;
}

/** A project with everything its screens need, or null when it isn't this workspace's or can't be read. */
export async function loadSurveyProject(client: SupabaseClient, orgId: string, projectId: string, version?: number): Promise<SurveyProjectData | null> {
  if (!z.string().uuid().safeParse(projectId).success) return null;
  const { data: p } = await client.from("survey_projects").select(PROJECT_COLUMNS).eq("org_id", orgId).eq("id", projectId).is("archived_at", null).maybeSingle();
  const project = projectRow.safeParse(p);
  if (!project.success) return null;
  const drawingQuery = client.from("survey_drawings").select("id, version, document, note, created_by, created_at").eq("project_id", projectId);
  const [points, sources, drawing, versions, approvals, exports, profiles] = await Promise.all([
    readPoints(client, projectId),
    client.from("survey_sources").select("id, file_name, format, sha256, size_bytes, point_count, settings, created_by, created_at").eq("project_id", projectId).order("created_at"),
    (version ? drawingQuery.eq("version", version) : drawingQuery.order("version", { ascending: false }).limit(1)).maybeSingle(),
    client.from("survey_drawings").select("version, note, created_by, created_at").eq("project_id", projectId).order("version", { ascending: false }).limit(100),
    client.from("survey_approvals").select("drawing_version, approved_by, approved_at, content_sha256, surveyor, withdrawn_at").eq("project_id", projectId).order("approved_at", { ascending: false }),
    client.from("survey_exports").select("kind, drawing_version, sha256, size_bytes, created_by, created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(50),
    client.from("survey_surveyor_profiles").select("user_id, full_name, designation, registration, address, contact, updated_at").eq("org_id", orgId),
  ]);
  const d = drawingRow.safeParse(drawing.data);
  if (!points || !d.success) return null;
  return {
    project: toProject(project.data),
    points,
    sources: (sources.data ?? []).map((s) => sourceRow.safeParse(s)).filter((r) => r.success).map((r) => r.data),
    drawing: toDrawing(d.data),
    versions: (versions.data ?? []).map((v) => z.object({ version: z.number(), note: z.string().nullable(), created_by: z.string().nullable(), created_at: z.string() }).safeParse(v)).filter((r) => r.success).map((r) => ({ version: r.data.version, note: r.data.note, createdBy: r.data.created_by, createdAt: r.data.created_at })),
    approvals: (approvals.data ?? []).map((a) => approvalRow.safeParse(a)).filter((r) => r.success).map((r) => r.data),
    exports: (exports.data ?? []).map((e) => exportRow.safeParse(e)).filter((r) => r.success).map((r) => r.data),
    profiles: (profiles.data ?? []).map((x) => profileRow.safeParse(x)).filter((r) => r.success).map((r) => r.data),
  };
}
