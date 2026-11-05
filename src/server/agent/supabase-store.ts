/**
 * The agent API's data access, with the server's secret-key client. Agent
 * requests carry an agent token, not a Supabase session, so Row Level
 * Security can't scope these reads: every query here filters by the
 * workspace the token resolved to, and writes go through the app_* SQL
 * functions, which check the agent, the person and their role again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { IntentContractSchema } from "@/core/realityloop/contract";
import { TASK_STATES } from "@/core/realityloop/task-machine";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "@/server/workspace/organizations";
import { ORG_ROLES } from "@/server/workspace/types";
import type { RpcResult } from "@/server/workspace/use-cases";
import { AGENT_CAPABILITIES, type AgentStore } from "./service";
import { policyRecord } from "@/core/trust/policy";
import { readActiveRules } from "@/server/workspace/workspace-rules";

const isUuid = (s: string) => z.uuid().safeParse(s).success;

export function createSupabaseAgentStore(admin: SupabaseClient): AgentStore {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  const fail = (what: string, error: { message: string }): never => {
    throw new Error(`Couldn't read ${what}: ${error.message}`);
  };

  return {
    async session(tokenSha256) {
      const r = await rpc(
        "app_agent_session",
        { p_token_sha256: tokenSha256 },
        z.array(
          z.object({
            agent_id: z.string(),
            org_id: z.string(),
            user_id: z.string(),
            role: z.enum(ORG_ROLES).nullable(),
            name: z.string(),
            lease_expires_at: z.string(),
            lease_projects: z.array(z.string()).nullable(),
            lease_capabilities: z.array(z.enum(AGENT_CAPABILITIES)),
            lease_actions_per_hour: z.number().int(),
            agents_paused: z.boolean(),
            org_suspended: z.boolean(),
            may_run_agents: z.boolean(),
          }),
        ),
      );
      if (!r.ok) throw new Error(`Couldn't resolve the agent: ${r.error}`);
      const row = r.value[0];
      return row
        ? {
            agentId: row.agent_id,
            orgId: row.org_id,
            userId: row.user_id,
            role: row.role,
            name: row.name,
            agentsPaused: row.agents_paused,
            suspended: row.org_suspended,
            mayRunAgents: row.may_run_agents,
            lease: { expiresAt: row.lease_expires_at, projects: row.lease_projects, capabilities: row.lease_capabilities, actionsPerHour: row.lease_actions_per_hour },
          }
        : null;
    },

    async rateLimit(key, windowSeconds, limit) {
      const r = await rpc("app_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit }, z.boolean());
      // Fail closed: if the counter can't be read, the request is refused.
      return r.ok ? r.value : false;
    },

    async checkTools(agentId, manifest, known) {
      const r = await rpc("app_check_agent_tools", { p_agent: agentId, p_manifest: manifest, p_known: [...known] }, z.enum(["pinned_now", "match", "quarantined"]));
      // Fail closed: tools that can't be checked are treated as changed.
      return r.ok ? r.value : "quarantined";
    },

    async billing(orgId) {
      const { data, error } = await admin.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
      if (error || !data) return null;
      try {
        return billingSnapshotFromRow(data);
      } catch {
        return null;
      }
    },

    async workspaceName(orgId) {
      const { data } = await admin.from("organizations").select("name").eq("id", orgId).maybeSingle();
      return z.object({ name: z.string() }).safeParse(data).data?.name ?? null;
    },

    async pairingOrg(codeSha256) {
      const { data, error } = await admin
        .from("agent_pairings")
        .select("org_id")
        .eq("code_sha256", codeSha256)
        .is("redeemed_at", null)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      if (error) fail("the pairing code", error);
      return z.object({ org_id: z.string() }).safeParse(data).data?.org_id ?? null;
    },

    async redeemPairing(i) {
      const r = await rpc(
        "app_redeem_agent_pairing",
        { p_code_sha256: i.codeSha256, p_token_sha256: i.tokenSha256, p_name: i.name, p_platform: i.platform, p_app_version: i.appVersion, p_agent_limit: i.agentLimit },
        z.array(z.object({ agent_id: z.string(), org_id: z.string() })).length(1),
      );
      return r.ok ? { ok: true, value: { agentId: r.value[0]!.agent_id, orgId: r.value[0]!.org_id } } : r;
    },

    async readyTasks(orgId) {
      const { data, error } = await admin
        .from("tasks")
        .select("id, title, project_id, updated_at, projects!inner(name, archived_at)")
        .eq("org_id", orgId)
        .eq("state", "CONTRACT_APPROVED")
        .is("projects.archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(100);
      if (error) fail("tasks", error);
      const Row = z.object({ id: z.string(), title: z.string(), project_id: z.string(), updated_at: z.string(), projects: z.union([z.object({ name: z.string() }), z.array(z.object({ name: z.string() })).length(1)]) });
      return z
        .array(Row)
        .parse(data ?? [])
        .map((r) => ({ id: r.id, title: r.title, projectId: r.project_id, projectName: Array.isArray(r.projects) ? r.projects[0]!.name : r.projects.name, updatedAt: r.updated_at }));
    },

    async loadTask(orgId, taskId) {
      if (!isUuid(taskId)) return null;
      const { data, error } = await admin.from("tasks").select("id, title, project_id, state, version").eq("org_id", orgId).eq("id", taskId).maybeSingle();
      if (error) fail("the task", error);
      const parsed = z.object({ id: z.string(), title: z.string(), project_id: z.string(), state: z.enum(TASK_STATES), version: z.number().int() }).safeParse(data);
      if (!parsed.success) return null;
      const { project_id, ...rest } = parsed.data;
      return { ...rest, projectId: project_id };
    },

    async approvedContract(orgId, taskId) {
      const { data, error } = await admin
        .from("intent_contracts")
        .select("version, sha256, body")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) fail("the contract", error);
      if (!data) return null;
      const row = z.object({ version: z.number().int(), sha256: z.string(), body: IntentContractSchema }).parse(data);
      return { version: row.version, sha256: row.sha256, body: row.body };
    },

    async project(orgId, projectId) {
      if (!isUuid(projectId)) return null;
      const { data, error } = await admin.from("projects").select("id, name, archived_at").eq("org_id", orgId).eq("id", projectId).maybeSingle();
      if (error) fail("the project", error);
      const parsed = z.object({ id: z.string(), name: z.string(), archived_at: z.string().nullable() }).safeParse(data);
      return parsed.success ? { id: parsed.data.id, name: parsed.data.name, archived: parsed.data.archived_at !== null } : null;
    },

    async projectFiles(orgId, projectId) {
      const Row = z.object({ path: z.string(), revision: z.number().int(), sha256: z.string(), size_bytes: z.number().int() });
      const rows: z.infer<typeof Row>[] = [];
      // PostgREST returns at most 1,000 rows per request, so read in pages.
      for (let from = 0; ; from += 1000) {
        const { data, error } = await admin
          .from("project_files")
          .select("path, revision, sha256, size_bytes")
          .eq("org_id", orgId)
          .eq("project_id", projectId)
          // Agents work on text: images (ADR 0108) aren't in their snapshot, and the database refuses text on an image path.
          .eq("encoding", "utf8")
          .order("path")
          .range(from, from + 999);
        if (error) fail("project files", error);
        const page = z.array(Row).parse(data ?? []);
        rows.push(...page);
        if (page.length < 1000) break;
      }
      return rows.map((r) => ({ path: r.path, revision: r.revision, sha256: r.sha256, sizeBytes: r.size_bytes }));
    },

    async fileContents(orgId, projectId, files) {
      const out = new Map<string, string>();
      for (let i = 0; i < files.length; i += 100) {
        const chunk = files.slice(i, i + 100);
        const { data, error } = await admin
          .from("project_file_revisions")
          .select("path, revision, content")
          .eq("org_id", orgId)
          .eq("project_id", projectId)
          .eq("encoding", "utf8")
          .in(
            "path",
            chunk.map((f) => f.path),
          )
          .not("content", "is", null);
        if (error) fail("file contents", error);
        const wanted = new Map(chunk.map((f) => [f.path, f.revision]));
        for (const r of z.array(z.object({ path: z.string(), revision: z.number().int(), content: z.string() })).parse(data ?? [])) {
          if (wanted.get(r.path) === r.revision) out.set(r.path, r.content);
        }
      }
      return out;
    },

    workspaceRules: (orgId) => readActiveRules(admin, orgId),

    async countEvaluations(orgId, period) {
      const { count, error } = await admin
        .from("evaluation_events")
        .select("org_id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .gte("occurred_at", period.start.toISOString())
        .lt("occurred_at", period.end.toISOString());
      if (error) fail("usage", error);
      return count ?? 0;
    },

    createAgentProposal: (i) =>
      rpc(
        "app_create_agent_proposal",
        {
          p_agent: i.agentId,
          p_task: i.taskId,
          p_actor: i.actor,
          p_contract_version: i.contractVersion,
          p_plan: i.plan,
          p_changes: i.changes.map((c) => ({ path: c.path, kind: c.kind, base_revision: c.baseRevision, content: c.content, sha256: c.sha256, reason: c.reason })),
          p_dropped: [],
          p_violations: i.violations,
          p_sha256: i.sha256,
          p_model: i.usage.model.slice(0, 100) || null,
          p_input_tokens: i.usage.inputTokens,
          p_output_tokens: i.usage.outputTokens,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
          p_policy: policyRecord(i.policy),
          p_evaluation_limit: i.evaluationLimit,
          p_period_start: i.period.start.toISOString(),
          p_period_end: i.period.end.toISOString(),
        },
        z.string(),
      ),

    async revokeAgent(agentId, actor) {
      const r = await rpc("app_revoke_agent", { p_agent: agentId, p_actor: actor }, z.null().or(z.literal("")));
      return r.ok ? { ok: true, value: null } : r;
    },

    async agentProposal(orgId, agentId, proposalId) {
      if (!isUuid(proposalId)) return null;
      // Scoped to the workspace and to the agent that made it.
      const { data, error } = await admin
        .from("change_proposals")
        .select("id, task_id, status, sha256, created_at, expires_at, decided_at, applied_sha256")
        .eq("org_id", orgId)
        .eq("agent_id", agentId)
        .eq("id", proposalId)
        .maybeSingle();
      if (error) fail("the proposal", error);
      const row = z
        .object({
          id: z.string(),
          task_id: z.string(),
          status: z.enum(["pending", "blocked", "applied", "discarded"]),
          sha256: z.string(),
          created_at: z.string(),
          expires_at: z.string(),
          decided_at: z.string().nullable(),
          applied_sha256: z.string().nullable(),
        })
        .safeParse(data);
      if (!row.success) return null;
      const { data: pack, error: packError } = await admin
        .from("proofpacks")
        .select("digest, status")
        .eq("org_id", orgId)
        .eq("proposal_id", proposalId)
        .order("seq", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (packError) fail("the ProofPack", packError);
      const proofPack = z.object({ digest: z.string(), status: z.enum(["unverified", "partially_verified", "verified", "failed"]) }).nullable().parse(pack ?? null);
      const r = row.data;
      return { id: r.id, taskId: r.task_id, status: r.status, sha256: r.sha256, createdAt: r.created_at, expiresAt: r.expires_at, decidedAt: r.decided_at, appliedSha256: r.applied_sha256, proofPack };
    },

    newEventId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}
