/**
 * Published sites in the database (migration 19). Workspace pages read with
 * the person's session under Row Level Security; publishing and rollback go
 * through the service-role `app_*` functions; serving a live site reads with
 * the service role, because anyone on the internet may visit it.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { launchEvidence, type EvidencePack, type EvidenceStatus, type LaunchEvidence } from "@/core/publish/evidence";
import type { PublishedFile } from "@/core/publish/site";
import type { RpcResult } from "@/server/workspace/use-cases";
import type { SiteDomainView } from "./domains";
import type { PublishCheck } from "./publish";

export interface SiteView {
  id: string;
  name: string;
  liveDeploymentId: string | null;
  createdAt: string;
  /** Taken offline by Farbaek staff (ADR 0032), with the notice they wrote for the owner. */
  blocked: { at: string; notice: string } | null;
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
  /** What evidence covered the files (ADR 0050); null for versions published before the gate. */
  evidence: EvidenceStatus | null;
  evidenceProofPack: string | null;
  /** Why an owner or admin published without verified evidence. */
  overrideReason: string | null;
}

const SiteRow = z.object({
  id: z.string(),
  name: z.string(),
  live_deployment_id: z.string().nullable(),
  created_at: z.string(),
  blocked_at: z.string().nullable().optional(),
  blocked_notice: z.string().nullable().optional(),
});
const DeploymentRow = z.object({
  id: z.string(),
  number: z.number(),
  file_count: z.number(),
  total_bytes: z.coerce.number(),
  digest: z.string(),
  security_score: z.number().nullable(),
  created_by: z.string(),
  created_at: z.string(),
  evidence: z.enum(["verified", "unverified", "partially_verified", "failed", "changed", "none"]).nullable(),
  evidence_proofpack: z.string().nullable(),
  override_reason: z.string().nullable(),
});
const FilesJson = z.array(z.object({ path: z.string(), revision: z.number().int().positive(), sha256: z.string(), size: z.number() }));

export async function getSite(client: SupabaseClient, orgId: string, projectId: string): Promise<SiteView | null> {
  const { data, error } = await client.from("sites").select("id, name, live_deployment_id, created_at, blocked_at, blocked_notice").eq("org_id", orgId).eq("project_id", projectId).maybeSingle();
  if (error) throw new Error(`Couldn't load the site: ${error.message}`);
  if (!data) return null;
  const r = SiteRow.parse(data);
  return {
    id: r.id,
    name: r.name,
    liveDeploymentId: r.live_deployment_id,
    createdAt: r.created_at,
    blocked: r.blocked_at ? { at: r.blocked_at, notice: r.blocked_notice ?? "Farbaek has taken this site offline." } : null,
  };
}

export async function listDeployments(client: SupabaseClient, orgId: string, siteId: string, limit = 20): Promise<DeploymentView[]> {
  const { data, error } = await client
    .from("site_deployments")
    .select("id, number, file_count, total_bytes, digest, security_score, created_by, created_at, evidence, evidence_proofpack, override_reason")
    .eq("org_id", orgId)
    .eq("site_id", siteId)
    .order("number", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Couldn't load deployments: ${error.message}`);
  return z
    .array(DeploymentRow)
    .parse(data)
    .map((r) => ({
      id: r.id,
      number: r.number,
      fileCount: r.file_count,
      totalBytes: r.total_bytes,
      digest: r.digest,
      securityScore: r.security_score,
      createdBy: r.created_by,
      createdAt: r.created_at,
      evidence: r.evidence,
      evidenceProofPack: r.evidence_proofpack,
      overrideReason: r.override_reason,
    }));
}

const PackRow = z.object({
  digest: z.string(),
  status: z.enum(["unverified", "partially_verified", "verified", "failed"]),
  task_id: z.string(),
  created_at: z.string(),
  verifies: z.string().nullable(),
});
// The statement itself isn't fetched: only which change a check run verified.
const PACK_COLUMNS = "digest, status, task_id, created_at, verifies:statement->predicate->verification->>appliedProofPack";
const toPack = (r: z.infer<typeof PackRow>): EvidencePack => ({ digest: r.digest, status: r.status, createdAt: r.created_at, taskId: r.task_id, verifies: r.verifies });

/**
 * The evidence that covers a project's files now (ADR 0050), read as the
 * person: the latest change ProofPack, the latest check run of that change,
 * and when a file last changed. The database repeats this when publishing.
 */
export async function latestEvidence(client: SupabaseClient, orgId: string, projectId: string): Promise<LaunchEvidence> {
  const latest = () => client.from("proofpacks").select(PACK_COLUMNS).eq("org_id", orgId).eq("project_id", projectId).order("seq", { ascending: false }).limit(1);
  const [change, revision] = await Promise.all([
    latest().is("statement->predicate->verification", null).maybeSingle(),
    client.from("project_file_revisions").select("created_at").eq("project_id", projectId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (change.error) throw new Error(`Couldn't load the evidence: ${change.error.message}`);
  if (revision.error) throw new Error(`Couldn't load the file history: ${revision.error.message}`);
  const c = change.data ? toPack(PackRow.parse(change.data)) : null;
  let v: EvidencePack | null = null;
  if (c) {
    const check = await latest().eq("statement->predicate->verification->>appliedProofPack", c.digest).maybeSingle();
    if (check.error) throw new Error(`Couldn't load the evidence: ${check.error.message}`);
    v = check.data ? toPack(PackRow.parse(check.data)) : null;
  }
  const changedAt = revision.data ? z.object({ created_at: z.string() }).parse(revision.data).created_at : null;
  return launchEvidence({ change: c, verification: v, filesChangedAt: changedAt });
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
  input: { orgId: string; actor: string; projectId: string; name: string; files: PublishedFile[]; digest: string; reportId: string; overrideReason: string | null },
): Promise<RpcResult<string>> {
  const { data, error } = await admin.rpc("app_publish_site", {
    p_org: input.orgId,
    p_actor: input.actor,
    p_project: input.projectId,
    p_name: input.name,
    p_files: input.files,
    p_digest: input.digest,
    p_report: input.reportId,
    p_override_reason: input.overrideReason,
  });
  if (error) return { ok: false, error: rpcError(error) };
  return { ok: true, value: z.string().parse(data) };
}

export async function setLiveDeployment(admin: SupabaseClient, input: { orgId: string; actor: string; siteId: string; deploymentId: string | null }): Promise<RpcResult<null>> {
  const { error } = await admin.rpc("app_set_live_deployment", { p_org: input.orgId, p_actor: input.actor, p_site: input.siteId, p_deployment: input.deploymentId });
  return error ? { ok: false, error: rpcError(error) } : { ok: true, value: null };
}

export type SiteForServing = { state: "live"; deploymentId: string; projectId: string; files: PublishedFile[] } | { state: "none" | "blocked" | "paused" | "suspended" };

/** For serving (migration v21): whether a name is live, blocked, paused or suspended, and the live files when it is. */
export async function siteForServingAsSystem(admin: SupabaseClient, name: string): Promise<SiteForServing> {
  const { data, error } = await admin.rpc("app_site_for_serving", { p_name: name });
  if (error) throw new Error(`Couldn't load the site: ${error.message}`);
  const r = z
    .union([
      z.object({ state: z.literal("live"), deployment_id: z.string(), project_id: z.string(), files: FilesJson }),
      z.object({ state: z.enum(["none", "blocked", "paused", "suspended"]) }),
    ])
    .parse(data);
  return r.state === "live" ? { state: "live", deploymentId: r.deployment_id, projectId: r.project_id, files: r.files } : { state: r.state };
}

/** For serving: one stored revision's text, which never changes once written. */
export async function revisionContentAsSystem(admin: SupabaseClient, projectId: string, path: string, revision: number): Promise<string | null> {
  const { data, error } = await admin.from("project_file_revisions").select("content").eq("project_id", projectId).eq("path", path).eq("revision", revision).maybeSingle();
  if (error) throw new Error(`Couldn't load the file: ${error.message}`);
  return typeof data?.content === "string" ? data.content : null;
}

// ------------------------------------------------ custom domains (ADR 0045)

const DomainRow = z.object({
  id: z.string(),
  site_id: z.string(),
  hostname: z.string(),
  status: z.enum(["pending", "verified"]),
  verify_token: z.string(),
  verified_at: z.string().nullable(),
  checked_at: z.string().nullable(),
});
const DOMAIN_COLUMNS = "id, site_id, hostname, status, verify_token, verified_at, checked_at";
const domainFromRow = (r: z.infer<typeof DomainRow>): SiteDomainView => ({
  id: r.id,
  siteId: r.site_id,
  hostname: r.hostname,
  status: r.status,
  verifyToken: r.verify_token,
  verifiedAt: r.verified_at,
  checkedAt: r.checked_at,
});

/** A site's domains, read as the person (Row Level Security). */
export async function listSiteDomains(client: SupabaseClient, orgId: string, siteId: string): Promise<SiteDomainView[]> {
  const { data, error } = await client.from("site_domains").select(DOMAIN_COLUMNS).eq("org_id", orgId).eq("site_id", siteId).order("created_at");
  if (error) throw new Error(`Couldn't load the site's domains: ${error.message}`);
  return z.array(DomainRow).parse(data).map(domainFromRow);
}

export async function loadSiteDomain(client: SupabaseClient, orgId: string, domainId: string): Promise<SiteDomainView | null> {
  if (!z.uuid().safeParse(domainId).success) return null;
  const { data, error } = await client.from("site_domains").select(DOMAIN_COLUMNS).eq("org_id", orgId).eq("id", domainId).maybeSingle();
  if (error) throw new Error(`Couldn't load the domain: ${error.message}`);
  return data ? domainFromRow(DomainRow.parse(data)) : null;
}

export async function addDomainRpc(admin: SupabaseClient, input: { siteId: string; actor: string; hostname: string; token: string }): Promise<RpcResult<string>> {
  const { data, error } = await admin.rpc("app_add_site_domain", { p_site: input.siteId, p_actor: input.actor, p_hostname: input.hostname, p_token: input.token });
  return error ? { ok: false, error: rpcError(error) } : { ok: true, value: z.string().parse(data) };
}

export async function markDomainRpc(admin: SupabaseClient, input: { domainId: string; actor: string; verified: boolean }): Promise<RpcResult<string>> {
  const { data, error } = await admin.rpc("app_mark_site_domain", { p_domain: input.domainId, p_actor: input.actor, p_verified: input.verified });
  return error ? { ok: false, error: rpcError(error) } : { ok: true, value: z.string().parse(data) };
}

export async function removeDomainRpc(admin: SupabaseClient, input: { domainId: string; actor: string }): Promise<RpcResult<null>> {
  const { error } = await admin.rpc("app_remove_site_domain", { p_domain: input.domainId, p_actor: input.actor });
  return error ? { ok: false, error: rpcError(error) } : { ok: true, value: null };
}

/** For serving and certificates: the site a verified domain belongs to. */
export async function siteNameForDomainAsSystem(admin: SupabaseClient, hostname: string): Promise<string | null> {
  const { data, error } = await admin.rpc("app_site_name_for_domain", { p_hostname: hostname });
  if (error) throw new Error(`Couldn't look up the domain: ${error.message}`);
  return z.string().nullable().parse(data);
}
