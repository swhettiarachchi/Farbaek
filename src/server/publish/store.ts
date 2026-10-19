/**
 * Published sites in the database (migration 19). Workspace pages read with
 * the person's session under Row Level Security; publishing and rollback go
 * through the service-role `app_*` functions; serving a live site reads with
 * the service role, because anyone on the internet may visit it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PublishedFile } from "@/core/publish/site";
import type { RpcResult } from "@/server/workspace/use-cases";
import type { PublishCheck } from "./publish";

export interface SiteView {
  id: string;
  name: string;
  liveDeploymentId: string | null;
  createdAt: string;
}

export interface DeploymentView {
  id: string;
  number: number;
  fileCount: number;
  totalBytes: number;
  digest: string;
  securityScore: number | null;
  createdBy: string;
  createdAt: string;
}

const SiteRow = z.object({ id: z.string(), name: z.string(), live_deployment_id: z.string().nullable(), created_at: z.string() });
const DeploymentRow = z.object({
  id: z.string(),
  number: z.number(),
  file_count: z.number(),
  total_bytes: z.coerce.number(),
  digest: z.string(),
  security_score: z.number().nullable(),
  created_by: z.string(),
  created_at: z.string(),
});
const FilesJson = z.array(z.object({ path: z.string(), revision: z.number().int().positive(), sha256: z.string(), size: z.number() }));

export async function getSite(client: SupabaseClient, orgId: string, projectId: string): Promise<SiteView | null> {
  const { data, error } = await client.from("sites").select("id, name, live_deployment_id, created_at").eq("org_id", orgId).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`Couldn't load the site: ${error.message}`);
  if (!data) return null;
  const r = SiteRow.parse(data);
  return { id: r.id, name: r.name, liveDeploymentId: r.live_deployment_id, createdAt: r.created_at };
}

export async function listDeployments(client: SupabaseClient, orgId: string, siteId: string, limit = 20): Promise<DeploymentView[]> {
  const { data, error } = await client
    .from("site_deployments")
    .select("id, number, file_count, total_bytes, digest, security_score, created_by, created_at")
    .eq("org_id", orgId)
    .eq("site_id", siteId)
    .order("number", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load deployments: ${error.message}`);
  return z
    .array(DeploymentRow)
    .parse(data)
    .map((r) => ({ id: r.id, number: r.number, fileCount: r.file_count, totalBytes: r.total_bytes, digest: r.digest, securityScore: r.security_score, createdBy: r.created_by, createdAt: r.created_at }));
}

/** The project's latest security check, with how many critical findings it had. */
export async function latestCheck(client: SupabaseClient, orgId: string, projectId: string): Promise<PublishCheck | null> {
  const { data, error } = await client
    .from("security_reports")
    .select("id, status, started_at, counts")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the security check: ${error.message}`);
  if (!data) return null;
  const r = z.object({ id: z.string(), status: z.enum(["running", "done", "failed"]), started_at: z.string(), counts: z.record(z.string(), z.number()).nullable() }).parse(data);
  return { id: r.id, status: r.status, startedAt: r.started_at, critical: r.counts?.critical ?? 0 };
}

const rpcError = (e: { message: string } | null) => (e ? e.message : "UNKNOWN");

export async function publishRpc(
  admin: SupabaseClient,
  input: { orgId: string; actor: string; projectId: string; name: string; files: PublishedFile[]; digest: string; reportId: string },
): Promise<RpcResult<string>> {
  const { data, error } = await admin.rpc("app_publish_site", {
    p_org: input.orgId,
    p_actor: input.actor,
    p_project: input.projectId,
    p_name: input.name,
    p_files: input.files,
    p_digest: input.digest,
    p_report: input.reportId,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, value: z.string().parse(data) };
}

export async function setLiveDeployment(admin: SupabaseClient, input: { orgId: string; actor: string; siteId: string; deploymentId: string | null }): Promise<RpcResult<null>> {
  const { error } = await admin.rpc("app_set_live_deployment", { p_org: input.orgId, p_actor: input.actor, p_site: input.siteId, p_deployment: input.deploymentId });
  return error ? { ok: false, error: rpcError(error) } : { ok: true, value: null };
}

/** For serving: the live deployment behind a site name, or null when there's no live site by that name. */
export async function liveSiteAsSystem(admin: SupabaseClient, name: string): Promise<{ deploymentId: string; projectId: string; files: PublishedFile[] } | null> {
  const { data: site, error } = await admin.from("sites").select("live_deployment_id").eq("name", name).maybeSingle();
  if (error) throw new Error(`Couldn't load the site: ${error.message}`);
  const live = z.string().nullable().parse(site?.live_deployment_id ?? null);
  if (!live) return null;
  const { data, error: e2 } = await admin.from("site_deployments").select("id, project_id, files").eq("id", live).maybeSingle();
  if (e2) throw new Error(`Couldn't load the deployment: ${e2.message}`);
  if (!data) return null;
  const r = z.object({ id: z.string(), project_id: z.string(), files: FilesJson }).parse(data);
  return { deploymentId: r.id, projectId: r.project_id, files: r.files };
}

/** For serving: one stored revision's text, which never changes once written. */
export async function revisionContentAsSystem(admin: SupabaseClient, projectId: string, path: string, revision: number): Promise<string | null> {
  const { data, error } = await admin.from("project_file_revisions").select("content").eq("project_id", projectId).eq("path", path).eq("revision", revision).maybeSingle();
  if (error) throw new Error(`Couldn't load the file: ${error.message}`);
  return typeof data?.content === "string" ? data.content : null;
}
