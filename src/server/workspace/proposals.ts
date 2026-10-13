/**
 * Change proposals: the agent proposes targeted edits under the approved
 * contract, a person reviews each file's diff and approves the exact content
 * they accepted, and applying writes new file revisions.
 *
 * Lifecycle: CONTRACT_APPROVED, then propose_plan (agent), evaluate_policy
 * (Farbaek: the deterministic contract checks), then require_approval, or
 * block when a check fails. Approving runs grant_approval (the person),
 * start_execution and begin_verification. Verification waits for an isolated
 * runner; nothing here marks a task verified.
 */
import { WORKSPACE_LIMITS } from "@/config/workspace";
import {
  DROP_LABELS,
  appliedHash,
  buildChanges,
  checkProposal,
  planFrom,
  proposalHash,
  type Dropped,
  type ProposedChange,
  type Violation,
} from "@/core/realityloop/change-proposal";
import type { IntentContract } from "@/core/realityloop/contract";
import type { TaskEventType, TaskState } from "@/core/realityloop/task-machine";
import { sha256Hex } from "@/core/trust/canonical-json";
import { screenFile } from "@/core/workspace/files";
import type { ChangeProposer } from "@/server/ai/change-proposer";
import { refundAndFail, reserveCredits, settleCredits, type AiCreditDeps } from "./ai-credits";
import { MESSAGES, codeFromDatabaseError, fail, planSteps, requireContributor, type RpcResult, type TransitionStep, type WriteDeps, type WriteResult } from "./use-cases";

export const MAX_CONTEXT_FILES = 20;
export const MAX_CONTEXT_BYTES = 300 * 1024;
const MANUAL = "You can still edit the files yourself.";

export interface StoredProposal {
  id: string;
  taskId: string;
  projectId: string;
  status: "pending" | "blocked" | "applied" | "discarded";
  sha256: string;
  changes: ProposedChange[];
}

export interface ProposalDeps {
  approvedContract(orgId: string, taskId: string): Promise<{ version: number; sha256: string; body: IntentContract } | null>;
  projectFiles(orgId: string, projectId: string): Promise<{ path: string; revision: number; sizeBytes: number }[]>;
  fileContent(orgId: string, projectId: string, path: string): Promise<{ revision: number; sha256: string; content: string } | null>;
  createProposal(input: {
    taskId: string;
    actor: string;
    contractVersion: number;
    plan: ReturnType<typeof planFrom>;
    changes: ProposedChange[];
    dropped: Dropped[];
    violations: Violation[];
    sha256: string;
    usage: { model: string; inputTokens: number; outputTokens: number };
    expectedTaskVersion: number;
    steps: TransitionStep[];
  }): Promise<RpcResult<string>>;
  loadProposal(orgId: string, proposalId: string): Promise<StoredProposal | null>;
  applyProposal(input: { proposalId: string; actor: string; files: { path: string; content: string }[]; appliedSha256: string; expectedTaskVersion: number; steps: TransitionStep[] }): Promise<RpcResult<number>>;
  discardProposal(input: { proposalId: string; actor: string; expectedTaskVersion: number; steps: TransitionStep[] }): Promise<RpcResult<null>>;
}

type Deps = WriteDeps & AiCreditDeps & ProposalDeps;

/** Plans the steps with the state machine and labels who decides each one. */
function steps(deps: Deps, task: { id: string; state: TaskState; version: number }, orgId: string, userId: string, events: { type: TaskEventType; actor: "user" | "agent" | "system" }[]) {
  const planned = planSteps(deps, { ...task, orgId }, userId, events.map((e) => e.type));
  if (!planned.ok) return planned;
  return {
    ok: true as const,
    steps: planned.steps.map((s, i) => (events[i]!.actor === "user" ? s : { ...s, actor_kind: events[i]!.actor, actor_id: events[i]!.actor === "agent" ? "farbaek-agent" : "farbaek" })),
  };
}

export interface ProposeResult {
  proposalId: string;
  status: "pending" | "blocked";
  dropped: Dropped[];
  violations: Violation[];
}

export async function proposeChange(
  deps: Deps,
  proposer: ChangeProposer,
  input: { orgId: string; userId: string; taskId: string; contextPaths: string[]; notes: string; taskTitle: string; projectName: string },
): Promise<WriteResult<ProposeResult>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const task = await deps.loadTask(input.orgId, input.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.state !== "CONTRACT_APPROVED") return fail("INVALID_TRANSITION", "A change can be proposed once the contract is approved and no other proposal is open.");
  const contract = await deps.approvedContract(input.orgId, task.id);
  if (!contract) return fail("INVALID_TRANSITION", "Approve the intent contract first.");

  const files = await deps.projectFiles(input.orgId, task.projectId);
  if (files.length === 0) return fail("NO_CONTEXT", "Import the project's files first, then choose the ones the change needs.");
  const wanted = [...new Set(input.contextPaths)];
  if (wanted.length === 0 || wanted.length > MAX_CONTEXT_FILES) return fail("NO_CONTEXT");
  const known = new Map(files.map((f) => [f.path, f]));
  if (wanted.some((p) => !known.has(p))) return fail("NO_CONTEXT", "Some chosen files aren't in the project anymore. Reload and choose again.");
  if (wanted.reduce((n, p) => n + known.get(p)!.sizeBytes, 0) > MAX_CONTEXT_BYTES) return fail("CONTEXT_TOO_LARGE");
  const context = [];
  for (const path of wanted) {
    const f = await deps.fileContent(input.orgId, task.projectId, path);
    if (!f) return fail("NO_CONTEXT", "Some chosen files aren't in the project anymore. Reload and choose again.");
    context.push({ path, ...f });
  }

  const reserved = await reserveCredits(deps, { orgId: input.orgId, userId: input.userId, taskId: task.id, operation: "change_proposal", manual: MANUAL });
  if (!reserved.ok) return reserved;
  const { entryId } = reserved.value;

  let outcome;
  try {
    outcome = await proposer.propose({
      contract: contract.body,
      taskTitle: input.taskTitle,
      projectName: input.projectName,
      paths: files.map((f) => f.path),
      files: context.map((f) => ({ path: f.path, content: f.content })),
      notes: input.notes.slice(0, 4_000),
    });
  } catch {
    outcome = { ok: false as const, failure: "PROVIDER_ERROR" as const, usage: null };
  }
  if (!outcome.ok) return refundAndFail(deps, { orgId: input.orgId, entryId, usage: outcome.usage }, outcome.failure);

  const { changes, dropped } = await buildChanges(outcome.output, context, new Set(known.keys()), WORKSPACE_LIMITS.maxFileBytes);
  if (changes.length === 0) {
    const why = dropped.length ? ` ${dropped.slice(0, 3).map((d) => `${d.path}: ${DROP_LABELS[d.reason]}.`).join(" ")}` : " It didn't propose any edits.";
    return refundAndFail(deps, { orgId: input.orgId, entryId, usage: outcome.usage }, { code: "NO_APPLICABLE_CHANGES", message: `${MESSAGES.NO_APPLICABLE_CHANGES}${why}` });
  }
  const violations = checkProposal(contract.body, changes);
  const sha256 = await proposalHash({ taskId: task.id, contractVersion: contract.version, contractSha256: contract.sha256, changes });
  const planned = steps(deps, task, input.orgId, input.userId, [
    { type: "propose_plan", actor: "agent" },
    { type: "evaluate_policy", actor: "system" },
    { type: violations.length ? "block" : "require_approval", actor: "system" },
  ]);
  if (!planned.ok) return refundAndFail(deps, { orgId: input.orgId, entryId, usage: outcome.usage }, { code: planned.code, message: MESSAGES[planned.code] });

  const created = await deps.createProposal({
    taskId: task.id,
    actor: input.userId,
    contractVersion: contract.version,
    plan: planFrom(outcome.output),
    changes,
    dropped,
    violations,
    sha256,
    usage: outcome.usage,
    expectedTaskVersion: task.version,
    steps: planned.steps,
  });
  if (!created.ok) {
    const code = codeFromDatabaseError(created.error);
    const message = code === "FILE_CHANGED" ? "A file changed while the proposal was being made." : MESSAGES[code];
    return refundAndFail(deps, { orgId: input.orgId, entryId, usage: outcome.usage }, { code, message });
  }

  await settleCredits(deps, { orgId: input.orgId, entryId, status: "settled", usage: outcome.usage });
  return { ok: true, value: { proposalId: created.value, status: violations.length ? "blocked" : "pending", dropped, violations } };
}

export async function applyProposal(
  deps: Deps,
  input: { orgId: string; userId: string; proposalId: string; reviewedSha256: string; files: { path: string; content: string }[] },
): Promise<WriteResult<{ written: number; appliedSha256: string }>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const proposal = await deps.loadProposal(input.orgId, input.proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending") return fail("PROPOSAL_CLOSED");
  if (proposal.sha256 !== input.reviewedSha256) return fail("PROPOSAL_CHANGED");
  const task = await deps.loadTask(input.orgId, proposal.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.state !== "APPROVAL_PENDING") return fail("INVALID_TRANSITION", "This task isn't waiting for approval.");

  const byPath = new Map(proposal.changes.map((c) => [c.path, c]));
  const files: { path: string; content: string; sha256: string }[] = [];
  for (const f of input.files) {
    const change = byPath.get(f.path);
    if (!change) return fail("INVALID_PROPOSAL");
    // A new file whose content was entirely rejected isn't created.
    if (change.kind === "create" && f.content === "") continue;
    const screened = screenFile(f.path, f.content, new TextEncoder().encode(f.content).length, WORKSPACE_LIMITS.maxFileBytes);
    if (!screened.ok) return fail(screened.reason === "too_large" ? "FILE_TOO_LARGE" : "SECRET_IN_CONTENT");
    files.push({ path: f.path, content: f.content, sha256: await sha256Hex(f.content) });
  }
  if (files.length === 0) return fail("NOTHING_TO_APPLY");

  const appliedSha256 = await appliedHash({ proposalSha256: proposal.sha256, files });
  const planned = steps(deps, task, input.orgId, input.userId, [
    { type: "grant_approval", actor: "user" },
    { type: "start_execution", actor: "system" },
    { type: "begin_verification", actor: "system" },
  ]);
  if (!planned.ok) return fail(planned.code);

  const result = await deps.applyProposal({
    proposalId: proposal.id,
    actor: input.userId,
    files: files.map(({ path, content }) => ({ path, content })),
    appliedSha256,
    expectedTaskVersion: task.version,
    steps: planned.steps,
  });
  if (!result.ok) {
    const code = codeFromDatabaseError(result.error);
    return fail(code, code === "FILE_CHANGED" ? "A file changed after this proposal was made. Discard it and propose again." : MESSAGES[code]);
  }
  return { ok: true, value: { written: result.value, appliedSha256 } };
}

export async function discardProposal(deps: Deps, input: { orgId: string; userId: string; proposalId: string }): Promise<WriteResult<null>> {
  const role = await requireContributor(deps, input.orgId);
  if (!role.ok) return role;
  const proposal = await deps.loadProposal(input.orgId, input.proposalId);
  if (!proposal) return fail("NOT_FOUND");
  if (proposal.status !== "pending" && proposal.status !== "blocked") return fail("PROPOSAL_CLOSED");
  const task = await deps.loadTask(input.orgId, proposal.taskId);
  if (!task) return fail("NOT_FOUND");
  if (task.state !== "APPROVAL_PENDING" && task.state !== "BLOCKED") return fail("INVALID_TRANSITION", "This proposal can't be discarded from the task's current state.");

  const planned = steps(deps, task, input.orgId, input.userId, [{ type: "discard_plan", actor: "user" }]);
  if (!planned.ok) return fail(planned.code);
  const result = await deps.discardProposal({ proposalId: proposal.id, actor: input.userId, expectedTaskVersion: task.version, steps: planned.steps });
  if (!result.ok) return fail(codeFromDatabaseError(result.error));
  return result;
}
