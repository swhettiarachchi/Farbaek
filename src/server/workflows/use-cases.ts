/**
 * Creating, approving, continuing and cancelling governed workflows (ADR
 * 0092). The plan is checked here; the database checks the roles, the
 * contracts and the order again.
 */
import { checkFeature } from "@/core/billing/entitlements";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { WorkflowDraftSchema, teamOverlaps, unapprovedSteps, workflowHash, type WorkflowView } from "@/core/realityloop/workflow";
import { CONTRIBUTOR_ROLES, MANAGER_ROLES, type OrgRole } from "@/server/workspace/types";
import { codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteResult } from "@/server/workspace/use-cases";

export const WORKFLOWS_NOT_IN_PLAN = "Governed workflows are included in Max 3x and up.";

export interface WorkflowWriteDeps extends Pick<WriteDeps, "role" | "billing" | "now"> {
  read(orgId: string, id: string): Promise<WorkflowView | null>;
  create(input: { orgId: string; actor: string; projectId: string; title: string; steps: { title: string; notes: string; checkpoint: boolean; together: boolean }[]; ceilingUnits: number }): Promise<RpcResult<string>>;
  approve(input: { workflowId: string; actor: string; sha256: string }): Promise<RpcResult<unknown>>;
  continue(input: { workflowId: string; actor: string }): Promise<RpcResult<unknown>>;
  cancel(input: { workflowId: string; actor: string }): Promise<RpcResult<unknown>>;
}

async function planAllows(deps: Pick<WorkflowWriteDeps, "billing" | "now">, orgId: string): Promise<WriteResult<null>> {
  const snapshot = await deps.billing(orgId);
  const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "advanced_autonomy");
  return feature.allowed ? { ok: true, value: null } : fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? WORKFLOWS_NOT_IN_PLAN : feature.message);
}

async function contributor(deps: Pick<WorkflowWriteDeps, "role">, orgId: string): Promise<WriteResult<OrgRole>> {
  const role = await deps.role(orgId);
  if (!role) return fail("NOT_FOUND");
  return CONTRIBUTOR_ROLES.includes(role) ? { ok: true, value: role } : fail("FORBIDDEN");
}

const done = <T>(r: RpcResult<T>): WriteResult<T> => (r.ok ? r : fail(codeFromDatabaseError(r.error)));

export async function createWorkflow(deps: WorkflowWriteDeps, input: { orgId: string; userId: string; projectId: string; draft: unknown }): Promise<WriteResult<string>> {
  const role = await contributor(deps, input.orgId);
  if (!role.ok) return role;
  const plan = await planAllows(deps, input.orgId);
  if (!plan.ok) return plan;
  const draft = WorkflowDraftSchema.safeParse(input.draft);
  if (!draft.success) return fail("INVALID_WORKFLOW", draft.error.issues[0]?.message ?? undefined);
  return done(await deps.create({ orgId: input.orgId, actor: input.userId, projectId: input.projectId, title: draft.data.title, steps: draft.data.steps, ceilingUnits: draft.data.ceilingUnits }));
}

/** Owners and admins, once every step's contract is approved: binds exactly these steps, contracts and ceiling. */
export async function approveWorkflow(deps: WorkflowWriteDeps, input: { orgId: string; userId: string; workflowId: string }): Promise<WriteResult<WorkflowView>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", "Only an owner or admin can approve a workflow.");
  const plan = await planAllows(deps, input.orgId);
  if (!plan.ok) return plan;
  const w = await deps.read(input.orgId, input.workflowId);
  if (!w) return fail("NOT_FOUND");
  if (w.status !== "draft") return fail("WORKFLOW_CLOSED");
  const missing = unapprovedSteps(w);
  if (missing.length) return fail("CONTRACTS_NOT_APPROVED", `Approve the contract for ${missing.map((s) => `step ${s.position}`).join(", ")} first.`);
  // Agents working at the same time must have separate files (ADR 0128).
  const clash = teamOverlaps(w.steps)[0];
  if (clash) {
    return fail(
      "INVALID_WORKFLOW",
      `Steps ${clash.steps[0]} and ${clash.steps[1]} run at the same time, but both could change ${clash.path === "the whole project" ? "anything in the project" : clash.path}. Give their contracts separate files, or run one after the other.`,
    );
  }
  const r = await deps.approve({ workflowId: w.id, actor: input.userId, sha256: await workflowHash(w) });
  return r.ok ? { ok: true, value: w } : fail(codeFromDatabaseError(r.error));
}

export async function continueWorkflow(deps: WorkflowWriteDeps, input: { orgId: string; userId: string; workflowId: string }): Promise<WriteResult<unknown>> {
  const role = await contributor(deps, input.orgId);
  if (!role.ok) return role;
  return done(await deps.continue({ workflowId: input.workflowId, actor: input.userId }));
}

export async function cancelWorkflow(deps: WorkflowWriteDeps, input: { orgId: string; userId: string; workflowId: string }): Promise<WriteResult<unknown>> {
  const role = await contributor(deps, input.orgId);
  if (!role.ok) return role;
  return done(await deps.cancel({ workflowId: input.workflowId, actor: input.userId }));
}
