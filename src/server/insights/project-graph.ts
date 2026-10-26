/**
 * The records behind a project's graph (ADR 0089), read as the person:
 * Row Level Security keeps them to their own workspaces, and the org filter
 * keeps them to this one. Only the columns the graph shows are read; a
 * proposal's file contents never are.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ProjectGraphRecords } from "@/core/insights/project-graph";

export const GRAPH_LIMITS = { tasks: 60, fileChanges: 2_000, deployments: 200, launches: 100, incidents: 100 };

const Task = z.object({ id: z.string(), title: z.string(), state: z.string(), created_at: z.string() });
const Contract = z.object({ task_id: z.string(), version: z.number().int(), status: z.string(), created_at: z.string(), approved_at: z.string().nullable() });
const Proposal = z.object({
  id: z.string(),
  task_id: z.string(),
  status: z.enum(["pending", "blocked", "applied", "discarded"]),
  outcome: z.string().nullable(),
  created_at: z.string(),
  decided_at: z.string().nullable(),
});
const Pack = z.object({
  digest: z.string(),
  task_id: z.string(),
  proposal_id: z.string().nullable(),
  status: z.enum(["unverified", "partially_verified", "verified", "failed"]),
  created_at: z.string(),
  seq: z.coerce.number(),
});
const FileChange = z.object({ path: z.string(), proposal_id: z.string() });
const Deployment = z.object({
  id: z.string(),
  number: z.number().int(),
  created_at: z.string(),
  evidence: z.string().nullable(),
  evidence_proofpack: z.string().nullable(),
  override_reason: z.string().nullable(),
});
const Launch = z.object({
  id: z.string(),
  status: z.enum(["authorized", "uploading", "building", "ready", "failed"]),
  authorized_at: z.string(),
  evidence_proofpack: z.string().nullable(),
});
const Incident = z.object({
  number: z.number().int(),
  title: z.string(),
  severity: z.string(),
  status: z.string(),
  proposal_id: z.string().nullable(),
  opened_at: z.string(),
});

type Result = { data: unknown; error: { message: string } | null };

/** Runs one query and checks its rows. Queries are thenables, so several can run at once. */
async function rows<T>(what: string, query: PromiseLike<Result>, schema: z.ZodType<T>): Promise<T[]> {
  const result = await query;
  if (result.error) throw new Error(`Couldn't load the project graph's ${what}: ${result.error.message}`);
  return z.array(schema).parse(result.data ?? []);
}

export async function readProjectGraph(client: SupabaseClient, orgId: string, projectId: string): Promise<ProjectGraphRecords> {
  const tasks = await rows(
    "tasks",
    client.from("tasks").select("id, title, state, created_at").eq("org_id", orgId).eq("project_id", projectId).order("created_at", { ascending: false }).limit(GRAPH_LIMITS.tasks + 1),
    Task,
  );
  const shown = tasks.slice(0, GRAPH_LIMITS.tasks);
  const ids = shown.map((t) => t.id);
  const none = ids.length === 0;

  const [contracts, proposals, packs, site, launches, incidents] = await Promise.all([
    none ? Promise.resolve([]) : rows("contracts", client.from("intent_contracts").select("task_id, version, status, created_at, approved_at").eq("org_id", orgId).in("task_id", ids), Contract),
    none
      ? Promise.resolve([])
      : rows(
          "changes",
          client.from("change_proposals").select("id, task_id, status, outcome:policy->>outcome, created_at, decided_at").eq("org_id", orgId).in("task_id", ids),
          Proposal,
        ),
    none ? Promise.resolve([]) : rows("ProofPacks", client.from("proofpacks").select("digest, task_id, proposal_id, status, created_at, seq").eq("org_id", orgId).in("task_id", ids), Pack),
    Promise.resolve(client.from("sites").select("id, live_deployment_id").eq("org_id", orgId).eq("project_id", projectId).maybeSingle()),
    rows(
      "launches",
      client.from("launch_orders").select("id, status, authorized_at, evidence_proofpack").eq("org_id", orgId).eq("project_id", projectId).order("authorized_at", { ascending: false }).limit(GRAPH_LIMITS.launches),
      Launch,
    ),
    rows(
      "incidents",
      client.from("incidents").select("number, title, severity, status, proposal_id, opened_at").eq("org_id", orgId).eq("project_id", projectId).order("opened_at", { ascending: false }).limit(GRAPH_LIMITS.incidents),
      Incident,
    ),
  ]);
  if (site.error) throw new Error(`Couldn't load the project graph's site: ${site.error.message}`);
  const siteRow = z.object({ id: z.string(), live_deployment_id: z.string().nullable() }).nullable().parse(site.data);

  const proposalIds = proposals.filter((p) => p.status === "applied").map((p) => p.id);
  const [fileChanges, deployments] = await Promise.all([
    proposalIds.length === 0
      ? Promise.resolve([])
      : rows(
          "files",
          client.from("project_file_revisions").select("path, proposal_id").eq("org_id", orgId).eq("project_id", projectId).in("proposal_id", proposalIds).limit(GRAPH_LIMITS.fileChanges + 1),
          FileChange,
        ),
    siteRow
      ? rows(
          "versions",
          client
            .from("site_deployments")
            .select("id, number, created_at, evidence, evidence_proofpack, override_reason")
            .eq("org_id", orgId)
            .eq("site_id", siteRow.id)
            .order("number", { ascending: false })
            .limit(GRAPH_LIMITS.deployments),
          Deployment,
        )
      : Promise.resolve([]),
  ]);

  return {
    projectId,
    tasks: shown.map((t) => ({ id: t.id, title: t.title, state: t.state, createdAt: t.created_at })),
    contracts: contracts.map((c) => ({ taskId: c.task_id, version: c.version, status: c.status, createdAt: c.created_at, approvedAt: c.approved_at })),
    proposals: proposals.map((p) => ({ id: p.id, taskId: p.task_id, status: p.status, outcome: p.outcome, createdAt: p.created_at, decidedAt: p.decided_at })),
    proofpacks: packs.map((p) => ({ digest: p.digest, taskId: p.task_id, proposalId: p.proposal_id, status: p.status, createdAt: p.created_at, seq: p.seq })),
    fileChanges: fileChanges.slice(0, GRAPH_LIMITS.fileChanges).map((f) => ({ path: f.path, proposalId: f.proposal_id })),
    deployments: deployments.map((d) => ({
      number: d.number,
      createdAt: d.created_at,
      evidence: d.evidence,
      evidenceProofPack: d.evidence_proofpack,
      overrideReason: d.override_reason,
      live: siteRow?.live_deployment_id === d.id,
    })),
    launches: launches.map((l) => ({ id: l.id, status: l.status, authorizedAt: l.authorized_at, evidenceProofPack: l.evidence_proofpack })),
    incidents: incidents.map((i) => ({ number: i.number, title: i.title, severity: i.severity, status: i.status, proposalId: i.proposal_id, openedAt: i.opened_at })),
    truncated: tasks.length > GRAPH_LIMITS.tasks || fileChanges.length > GRAPH_LIMITS.fileChanges,
  };
}
