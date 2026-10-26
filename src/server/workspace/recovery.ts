/**
 * Recovery: undoing an applied change, following the spec's steps.
 *
 * 1. Re-check the current state: the proposal must be applied and the task
 *    in a state that allows recovery.
 * 2. Detect intervening changes: the plan is rebuilt from the files as they
 *    are now, and its hash must match the one the person reviewed.
 * 3. The preview is the plan itself (the task page shows it per file).
 * 4. Re-check authorization and entitlement: a contributor, on a plan with
 *    recovery, and an owner or admin when the policy escalates.
 * 5. The approval is bound to the plan hash and the chosen files.
 * 6. Execute idempotently: one operation hash, acted on once.
 * 7. Verify and record evidence: the database checks every restored file
 *    against the earlier revision before it saves the recovery record.
 */
import { cheapestPlanWithFeature, getPlan } from "@/core/billing/catalog";
import { checkFeature } from "@/core/billing/entitlements";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { buildRecoveryReceipt, recoveryReceiptDigest, type RecoveryReceipt, type RecoveryStatus } from "@/core/proof/recovery-receipt";
import {
  RECOVERABLE_STATES,
  planRecovery,
  recoveryOperationHash,
  recoveryPlanHash,
  recoverySteps,
  selectOperations,
  type RecoveryItem,
} from "@/core/realityloop/recovery";
import type { TaskEventType } from "@/core/realityloop/task-machine";
import { evaluateChangePolicy, type PolicyDecision } from "@/core/trust/policy";
import type { ProposalDeps } from "./proposals";
import { MANAGER_ROLES, type RecoverySource } from "./types";
import { MESSAGES, codeFromDatabaseError, fail, planSteps, requireContributor, type RpcResult, type TransitionStep, type WriteDeps, type WriteResult } from "./use-cases";

export interface RecoveryOutcome {
  id: string;
  restored: number;
  status: RecoveryStatus;
  digest: string;
  /** True when this request repeated one already carried out. */
  replayed: boolean;
}

export interface RecoveryDeps {
  recoverySource(orgId: string, projectId: string, proposal: { id: string; changes: readonly { path: string; kind: "create" | "edit"; baseRevision: number }[] }): Promise<RecoverySource | null>;
  /** A recovery already carried out with this operation hash, or null. */
  findRecovery(orgId: string, operationSha256: string): Promise<Omit<RecoveryOutcome, "replayed"> | null>;
  recoverChange(input: {
    proposalId: string;
    actor: string;
    operations: { path: string; action: "restore" | "remove"; from_sha256: string; to_sha256: string | null }[];
    planSha256: string;
    operationSha256: string;
    expectedTaskVersion: number;
    steps: TransitionStep[];
    policy: { outcome: string; version: string; findings: { rule: string; outcome: string; detail: string }[] };
    receipt: RecoveryReceipt;
    receiptDigest: string;
    status: RecoveryStatus;
  }): Promise<RpcResult<RecoveryOutcome>>;
}

type Deps = WriteDeps & Pick<ProposalDeps, "loadProposal"> & RecoveryDeps;

export interface RecoveryPreview {
  items: RecoveryItem[];
  planSha256: string;
  /** The policy decision for undoing every ready file. */
  policy: PolicyDecision;
}

/** The plan for undoing a change, as the task page shows it. Nothing is written. */
export async function previewRecovery(input: { taskId: string; proposalId: string; source: RecoverySource }): Promise<RecoveryPreview> {
  const items = planRecovery(input.source.applied, new Map(Object.entries(input.source.current)));
  const planSha256 = await recoveryPlanHash({ taskId: input.taskId, proposalId: input.proposalId, items });
  // Undo restores a state people already reviewed, so it's judged by the built-in policy alone (ADR 0082). A change a workspace rule escalated stays escalated through proposal.policyOutcome.
  const policy = await evaluateChangePolicy({ files: items.filter((i) => i.status === "ready"), contractViolations: [], rules: null });
  return { items, planSha256, policy };
}

/** The person stops verification and plans the undo; Farbaek records the recovery once it verified the files. */
const SYSTEM_STEPS: ReadonlySet<TaskEventType> = new Set(["recover"]);
export const RECOVERY_NOT_IN_PLAN = `Undoing applied changes is included from the ${getPlan(cheapestPlanWithFeature("replay_and_recovery") ?? "plus").name} plan up, and in the trial. You can still put files back yourself from their history.`;

export async function recoverChange(
  deps: Deps,
  input: { orgId: string; userId: string; proposalId: string; planSha256: string; paths: string[] },
): Promise<WriteResult<RecoveryOutcome>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const proposal = await deps.loadProposal(input.orgId, input.proposalId);
  if (!proposal) return fail("NOT_FOUND");

  // A repeated confirmation returns the first result instead of acting twice.
  const operationSha256 = await recoveryOperationHash({ planSha256: input.planSha256, paths: input.paths });
  const earlier = await deps.findRecovery(input.orgId, operationSha256);
  if (earlier) return { ok: true, value: { ...earlier, replayed: true } };

  if (proposal.status !== "applied") return fail("NOT_RECOVERABLE", "Only an applied change can be undone.");
  const task = await deps.loadTask(input.orgId, proposal.taskId);
  if (!task) return fail("NOT_FOUND");
  if (!RECOVERABLE_STATES.has(task.state)) return fail("NOT_RECOVERABLE");

  const snapshot = await deps.billing(input.orgId);
  const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "replay_and_recovery");
  if (!feature.allowed) return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? RECOVERY_NOT_IN_PLAN : feature.message);

  const source = await deps.recoverySource(input.orgId, proposal.projectId, proposal);
  if (!source) return fail("NOT_RECOVERABLE", "Nothing this change wrote is on record, so there's nothing to undo.");
  const { items, planSha256, policy: fullPolicy } = await previewRecovery({ taskId: task.id, proposalId: proposal.id, source });
  if (planSha256 !== input.planSha256) return fail("RECOVERY_CHANGED");

  const selection = selectOperations(items, input.paths);
  if (!selection.ok) return fail("INVALID_RECOVERY", selection.reason === "empty" ? "Choose at least one file to restore." : MESSAGES.RECOVERY_CHANGED);
  const { operations, complete } = selection;

  const policy = operations.length === items.filter((i) => i.status === "ready").length ? fullPolicy : await evaluateChangePolicy({ files: operations, contractViolations: [], rules: null });
  if (policy.outcome === "BLOCK") return fail("POLICY_BLOCKED");
  if ((policy.outcome === "ESCALATE" || proposal.policyOutcome === "ESCALATE") && !MANAGER_ROLES.includes(role.value)) {
    return fail("APPROVER_ROLE_REQUIRED", "Undoing this change touches sensitive files, so an owner or admin has to approve it.");
  }

  const events = recoverySteps(task.state, complete);
  if (!events) return fail("NOT_RECOVERABLE");
  const planned = planSteps(deps, { ...task, orgId: input.orgId }, input.userId, events);
  if (!planned.ok) return fail(planned.code);
  const steps = planned.steps.map((s) => (SYSTEM_STEPS.has(s.event_type) ? { ...s, actor_kind: "system" as const, actor_id: "farbaek" } : s));

  const chosen = new Set(operations.map((o) => o.path));
  const left = items.flatMap<{ path: string; reason: "changed" | "deleted" | "not_selected" }>((i) =>
    i.status === "conflict" ? [{ path: i.path, reason: i.reason }] : i.status === "ready" && !chosen.has(i.path) ? [{ path: i.path, reason: "not_selected" as const }] : [],
  );
  const policyRecord = { outcome: policy.outcome, version: policy.policyVersion, findings: policy.findings };
  const receipt = buildRecoveryReceipt({
    task: { id: task.id, organizationId: input.orgId, projectId: proposal.projectId },
    proposal: { id: proposal.id, sha256: proposal.sha256 },
    proofPack: source.proofPackDigest,
    plan: { sha256: planSha256 },
    operationSha256,
    policy: policyRecord,
    approval: { approvedBy: input.userId, approvedAt: deps.now().toISOString() },
    operations,
    left,
    complete,
    createdAt: deps.now().toISOString(),
  });
  const receiptDigest = await recoveryReceiptDigest(receipt);

  const result = await deps.recoverChange({
    proposalId: proposal.id,
    actor: input.userId,
    operations: operations.map((o) =>
      o.action === "restore"
        ? { path: o.path, action: o.action, from_sha256: o.fromSha256, to_sha256: o.toSha256 }
        : { path: o.path, action: o.action, from_sha256: o.fromSha256, to_sha256: null },
    ),
    planSha256,
    operationSha256,
    expectedTaskVersion: task.version,
    steps,
    policy: policyRecord,
    receipt,
    receiptDigest,
    status: receipt.predicate.status,
  });
  if (!result.ok) {
    const code = codeFromDatabaseError(result.error);
    return fail(code, code === "FILE_CHANGED" ? MESSAGES.RECOVERY_CHANGED : MESSAGES[code]);
  }
  return result;
}
