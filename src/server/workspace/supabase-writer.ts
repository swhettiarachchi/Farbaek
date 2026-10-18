import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { TASK_STATES } from "@/core/realityloop/task-machine";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "./organizations";
import { ORG_ROLES } from "./types";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import type { AiCreditDeps } from "./ai-drafting";
import { IntentContractSchema } from "@/core/realityloop/contract";
import type { FileDeps } from "./files";
import type { ProposalDeps } from "./proposals";
import type { RecoveryDeps } from "./recovery";
import type { AgentAdminDeps } from "./agents";
import type { InvitationDeps } from "./invitations";
import { createSupabaseReader } from "./supabase-reader";
import { ProposalRowSchema, proposalFromRow } from "./types";
import type { ProjectAdminDeps, RpcResult, WriteDeps } from "./use-cases";

/**
 * WriteDeps backed by Supabase. Reads use the signed-in user's client (Row
 * Level Security applies); writes call the service-role-only app_* functions.
 */
export function createSupabaseWriteDeps(
  user: SupabaseClient,
  admin: SupabaseClient,
  userId: string,
): WriteDeps & AiCreditDeps & FileDeps & ProposalDeps & ProjectAdminDeps & RecoveryDeps & InvitationDeps & AgentAdminDeps {
  const reader = createSupabaseReader(user);
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }

  return {
    async role(orgId) {
      const { data } = await user.from("organization_members").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      const parsed = z.object({ role: z.enum(ORG_ROLES) }).safeParse(data);
      return parsed.success ? parsed.data.role : null;
    },

    async billing(orgId) {
      const { data, error } = await user.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
      if (error || !data) return null;
      try {
        return billingSnapshotFromRow(data);
      } catch {
        return null;
      }
    },

    async countActiveProjects(orgId) {
      const { count, error } = await user.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId).is("archived_at", null);
      if (error) throw new Error(`Couldn't count projects: ${error.message}`);
      return count ?? 0;
    },

    async loadTask(orgId, taskId) {
      if (!z.uuid().safeParse(taskId).success) return null;
      const [{ data: task }, { data: history }] = await Promise.all([
        user.from("tasks").select("id, project_id, state, version").eq("org_id", orgId).eq("id", taskId).maybeSingle(),
        user.from("task_transitions").select("event_id").eq("org_id", orgId).eq("task_id", taskId),
      ]);
      const parsed = z.object({ id: z.string(), project_id: z.string(), state: z.enum(TASK_STATES), version: z.number().int() }).safeParse(task);
      if (!parsed.success) return null;
      const eventIds = z.array(z.object({ event_id: z.string() })).catch([]).parse(history).map((h) => h.event_id);
      const { project_id, ...rest } = parsed.data;
      return { ...rest, projectId: project_id, eventIds };
    },

    createProject: (i) =>
      rpc("app_create_project", { p_org: i.orgId, p_actor: i.actor, p_name: i.name, p_description: i.description, p_limit: i.limit }, z.string()),

    createTask: (i) => rpc("app_create_task", { p_org: i.orgId, p_actor: i.actor, p_project: i.projectId, p_title: i.title }, z.string()),

    applyTransition: (i) =>
      rpc(
        "app_apply_task_transition",
        {
          p_task: i.taskId,
          p_actor_user: i.actor,
          p_actor_kind: "user",
          p_actor_id: i.actor,
          p_event_id: i.eventId,
          p_event_type: i.eventType,
          p_from: i.from,
          p_to: i.to,
          p_expected_version: i.expectedVersion,
        },
        z.number().int(),
      ),

    saveContract: (i) =>
      rpc(
        "app_save_contract",
        {
          p_task: i.taskId,
          p_actor: i.actor,
          p_body: i.body,
          p_sha256: i.sha256,
          p_based_on: i.basedOn,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
        },
        z.number().int(),
      ),

    approveContract: (i) =>
      rpc(
        "app_approve_contract",
        {
          p_task: i.taskId,
          p_actor: i.actor,
          p_version: i.version,
          p_sha256: i.sha256,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
        },
        z.null().or(z.literal("")).transform(() => null),
      ),

    async countAiCredits(orgId, period) {
      const { data, error } = await user.rpc("ai_credits_used", { p_org: orgId, p_from: period.start.toISOString(), p_to: period.end.toISOString() });
      if (error) throw new Error(`Couldn't count AI credits: ${error.message}`);
      return z.number().int().nonnegative().parse(data);
    },

    reserveAiCredits: (i) =>
      rpc(
        "app_reserve_ai_credits",
        {
          p_org: i.orgId,
          p_actor: i.actor,
          p_key: i.key,
          p_operation: i.operation,
          p_task: i.taskId,
          p_credits: i.credits,
          p_limit: i.limit,
          p_period_start: i.period.start.toISOString(),
          p_period_end: i.period.end.toISOString(),
        },
        z.string(),
      ),

    settleAiCredits: (i) =>
      rpc(
        "app_settle_ai_credits",
        {
          p_org: i.orgId,
          p_entry: i.entryId,
          p_status: i.status,
          p_model: i.usage?.model.slice(0, 100) || null,
          p_input_tokens: i.usage?.inputTokens ?? null,
          p_output_tokens: i.usage?.outputTokens ?? null,
        },
        z.null().or(z.literal("")).transform(() => null),
      ),

    importFiles: (i) =>
      rpc(
        "app_import_files",
        {
          p_project: i.projectId,
          p_actor: i.actor,
          p_files: i.files,
          p_max_file_bytes: WORKSPACE_LIMITS.maxFileBytes,
          p_max_import_bytes: WORKSPACE_LIMITS.maxImportBytes,
          p_max_project_bytes: WORKSPACE_LIMITS.maxProjectBytes,
          p_max_files: WORKSPACE_LIMITS.maxProjectFiles,
        },
        z.object({ created: z.number().int(), updated: z.number().int(), unchanged: z.number().int() }),
      ),

    saveFile: (i) =>
      rpc(
        "app_save_file",
        {
          p_project: i.projectId,
          p_actor: i.actor,
          p_path: i.path,
          p_content: i.content,
          p_expected_revision: i.expectedRevision,
          p_max_file_bytes: WORKSPACE_LIMITS.maxFileBytes,
          p_max_project_bytes: WORKSPACE_LIMITS.maxProjectBytes,
          p_max_files: WORKSPACE_LIMITS.maxProjectFiles,
        },
        z.number().int(),
      ),

    deleteFile: (i) =>
      rpc(
        "app_delete_file",
        { p_project: i.projectId, p_actor: i.actor, p_path: i.path, p_expected_revision: i.expectedRevision },
        z.null().or(z.literal("")).transform(() => null),
      ),

    async approvedContract(orgId, taskId) {
      const { data, error } = await user
        .from("intent_contracts")
        .select("version, sha256, body")
        .eq("org_id", orgId)
        .eq("task_id", taskId)
        .eq("status", "approved")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Couldn't load the contract: ${error.message}`);
      if (!data) return null;
      const row = z.object({ version: z.number().int(), sha256: z.string(), body: IntentContractSchema }).parse(data);
      return { version: row.version, sha256: row.sha256, body: row.body };
    },

    countEvaluations: (orgId, period) => reader.countEvaluations(orgId, period.start, period.end),

    projectFiles: async (orgId, projectId) => (await reader.listFiles(orgId, projectId)).map((f) => ({ path: f.path, revision: f.revision, sizeBytes: f.sizeBytes })),

    async fileContent(orgId, projectId, path) {
      const f = await reader.getFile(orgId, projectId, path);
      return f ? { revision: f.revision, sha256: f.sha256, content: f.content } : null;
    },

    createProposal: (i) =>
      rpc(
        "app_create_proposal",
        {
          p_task: i.taskId,
          p_actor: i.actor,
          p_contract_version: i.contractVersion,
          p_plan: i.plan,
          p_changes: i.changes.map((c) => ({ path: c.path, kind: c.kind, base_revision: c.baseRevision, content: c.content, sha256: c.sha256, reason: c.reason })),
          p_dropped: i.dropped,
          p_violations: i.violations,
          p_sha256: i.sha256,
          p_model: i.usage.model.slice(0, 100) || null,
          p_input_tokens: i.usage.inputTokens,
          p_output_tokens: i.usage.outputTokens,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
          p_policy: { outcome: i.policy.outcome, version: i.policy.policyVersion, findings: i.policy.findings },
          p_evaluation_limit: i.evaluationLimit,
          p_period_start: i.period.start.toISOString(),
          p_period_end: i.period.end.toISOString(),
        },
        z.string(),
      ),

    async loadProposal(orgId, proposalId) {
      if (!z.uuid().safeParse(proposalId).success) return null;
      const { data, error } = await user
        .from("change_proposals")
        .select("id, task_id, project_id, status, contract_version, plan, changes, dropped, violations, sha256, model, created_at, decided_at, applied_sha256, policy")
        .eq("org_id", orgId)
        .eq("id", proposalId)
        .maybeSingle();
      if (error) throw new Error(`Couldn't load the proposal: ${error.message}`);
      if (!data) return null;
      const row = ProposalRowSchema.parse(data);
      const record = proposalFromRow(row);
      return {
        id: row.id,
        taskId: row.task_id,
        projectId: row.project_id,
        status: row.status,
        sha256: row.sha256,
        changes: record.changes,
        policyOutcome: record.policy?.outcome ?? null,
        contractVersion: record.contractVersion,
        model: record.model,
        policy: record.policy,
      };
    },

    applyProposal: (i) =>
      rpc(
        "app_apply_proposal",
        {
          p_proposal: i.proposalId,
          p_actor: i.actor,
          p_files: i.files,
          p_applied_sha256: i.appliedSha256,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
          p_max_file_bytes: WORKSPACE_LIMITS.maxFileBytes,
          p_max_project_bytes: WORKSPACE_LIMITS.maxProjectBytes,
          p_max_files: WORKSPACE_LIMITS.maxProjectFiles,
          p_proofpack: i.proofpack,
          p_proofpack_digest: i.proofpackDigest,
          p_proofpack_status: i.proofpackStatus,
        },
        z.number().int(),
      ),

    async latestProofPackDigest(orgId, projectId) {
      const { data, error } = await user.from("proofpacks").select("digest").eq("org_id", orgId).eq("project_id", projectId).order("seq", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`Couldn't read the latest ProofPack: ${error.message}`);
      return data ? z.object({ digest: z.string() }).parse(data).digest : null;
    },

    discardProposal: (i) =>
      rpc(
        "app_discard_proposal",
        { p_proposal: i.proposalId, p_actor: i.actor, p_expected_task_version: i.expectedTaskVersion, p_steps: i.steps },
        z.null().or(z.literal("")).transform(() => null),
      ),

    recoverySource: (orgId, projectId, proposal) => reader.getRecoverySource(orgId, projectId, proposal),

    async findRecovery(orgId, operationSha256) {
      const { data, error } = await user.from("recovery_operations").select("id, restored, status, digest").eq("org_id", orgId).eq("operation_sha256", operationSha256).maybeSingle();
      if (error) throw new Error(`Couldn't check for an earlier recovery: ${error.message}`);
      return data ? z.object({ id: z.string(), restored: z.number().int(), status: z.enum(["recovered", "partially_recovered"]), digest: z.string() }).parse(data) : null;
    },

    recoverChange: (i) =>
      rpc(
        "app_recover_change",
        {
          p_proposal: i.proposalId,
          p_actor: i.actor,
          p_operations: i.operations,
          p_plan_sha256: i.planSha256,
          p_operation_sha256: i.operationSha256,
          p_expected_task_version: i.expectedTaskVersion,
          p_steps: i.steps,
          p_policy: i.policy,
          p_receipt: i.receipt,
          p_receipt_digest: i.receiptDigest,
          p_status: i.status,
          p_max_file_bytes: WORKSPACE_LIMITS.maxFileBytes,
          p_max_project_bytes: WORKSPACE_LIMITS.maxProjectBytes,
          p_max_files: WORKSPACE_LIMITS.maxProjectFiles,
        },
        z.object({ id: z.string(), restored: z.number().int(), status: z.enum(["recovered", "partially_recovered"]), digest: z.string(), replayed: z.boolean() }),
      ),

    createInvitation: (i) =>
      rpc(
        "app_create_invitation",
        { p_org: i.orgId, p_actor: i.actor, p_email: i.email, p_role: i.role, p_token_sha256: i.tokenSha256, p_expires_at: i.expiresAt, p_seat_limit: i.seatLimit },
        z.string(),
      ),

    revokeInvitation: (i) => rpc("app_revoke_invitation", { p_invitation: i.invitationId, p_actor: i.actor }, z.null().or(z.literal("")).transform(() => null)),

    createAgentPairing: (i) =>
      rpc("app_create_agent_pairing", { p_org: i.orgId, p_actor: i.actor, p_code_sha256: i.codeSha256, p_expires_at: i.expiresAt, p_agent_limit: i.agentLimit }, z.string()),

    revokeAgent: (i) => rpc("app_revoke_agent", { p_agent: i.agentId, p_actor: i.actor }, z.null().or(z.literal("")).transform(() => null)),

    async invitationPreview(tokenSha256) {
      const { data, error } = await admin.rpc("app_invitation_preview", { p_token_sha256: tokenSha256 });
      if (error) throw new Error(`Couldn't read the invitation: ${error.message}`);
      const rows = z
        .array(z.object({ org_id: z.string(), org_name: z.string(), role: z.enum(ORG_ROLES), email: z.string(), expires_at: z.string(), state: z.enum(["open", "accepted", "revoked", "expired"]) }))
        .parse(data ?? []);
      const r = rows[0];
      return r ? { orgId: r.org_id, orgName: r.org_name, role: r.role, email: r.email, expiresAt: r.expires_at, state: r.state } : null;
    },

    async orgBillingAsSystem(orgId) {
      const { data, error } = await admin.from("organizations").select(ORGANIZATION_SELECT).eq("id", orgId).maybeSingle();
      if (error || !data) return null;
      try {
        return billingSnapshotFromRow(data);
      } catch {
        return null;
      }
    },

    acceptInvitation: (i) => rpc("app_accept_invitation", { p_token_sha256: i.tokenSha256, p_actor: i.actor, p_seat_limit: i.seatLimit }, z.string()),

    archiveProject: (i) =>
      rpc("app_archive_project", { p_project: i.projectId, p_actor: i.actor }, z.null().or(z.literal("")).transform(() => null)),

    newEventId: () => crypto.randomUUID(),
    now: () => new Date(),
  };
}
