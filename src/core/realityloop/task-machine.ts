/**
 * The RealityLoop task lifecycle: one typed state machine for every surface
 * (Studio, Agent, Mesh imports, LaunchOS). Transitions are validated,
 * idempotent per event id, and guarded by optimistic concurrency.
 *
 * Verification states can only be entered with real evidence: a task is not
 * "verified" because code was generated, only because checks ran and passed.
 */

export const TASK_STATES = [
  "RECEIVED",
  "CONTEXT_ASSEMBLED",
  "CONTRACT_DRAFTED",
  "CONTRACT_APPROVED",
  "PLAN_PROPOSED",
  "POLICY_EVALUATED",
  "APPROVAL_PENDING",
  "EXECUTION_AUTHORIZED",
  "EXECUTING",
  "VERIFYING",
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "FAILED",
  "REVIEW_REQUIRED",
  "BLOCKED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "INTERRUPTED",
  "RECOVERY_PENDING",
  "RECOVERED",
  "REQUIRES_HUMAN_INTERVENTION",
] as const;

export type TaskState = (typeof TASK_STATES)[number];

export type TaskEventType =
  | "assemble_context"
  | "draft_contract"
  | "revise_contract"
  | "approve_contract"
  | "reject"
  | "propose_plan"
  | "evaluate_policy"
  | "require_approval"
  | "authorize"
  | "block"
  | "grant_approval"
  | "expire"
  | "start_execution"
  | "begin_verification"
  | "mark_verified"
  | "mark_partially_verified"
  | "mark_failed"
  | "require_review"
  | "interrupt"
  | "plan_recovery"
  | "recover"
  | "escalate"
  | "cancel";

const TRANSITIONS: Partial<Record<TaskState, Partial<Record<TaskEventType, TaskState>>>> = {
  RECEIVED: { assemble_context: "CONTEXT_ASSEMBLED" },
  CONTEXT_ASSEMBLED: { draft_contract: "CONTRACT_DRAFTED" },
  CONTRACT_DRAFTED: { revise_contract: "CONTRACT_DRAFTED", approve_contract: "CONTRACT_APPROVED", reject: "REJECTED" },
  CONTRACT_APPROVED: { propose_plan: "PLAN_PROPOSED", revise_contract: "CONTRACT_DRAFTED" },
  PLAN_PROPOSED: { evaluate_policy: "POLICY_EVALUATED" },
  POLICY_EVALUATED: { require_approval: "APPROVAL_PENDING", authorize: "EXECUTION_AUTHORIZED", block: "BLOCKED" },
  APPROVAL_PENDING: { grant_approval: "EXECUTION_AUTHORIZED", reject: "REJECTED", expire: "EXPIRED" },
  EXECUTION_AUTHORIZED: { start_execution: "EXECUTING" },
  EXECUTING: { begin_verification: "VERIFYING", mark_failed: "FAILED", interrupt: "INTERRUPTED", escalate: "REQUIRES_HUMAN_INTERVENTION" },
  VERIFYING: {
    mark_verified: "VERIFIED",
    mark_partially_verified: "PARTIALLY_VERIFIED",
    mark_failed: "FAILED",
    require_review: "REVIEW_REQUIRED",
    interrupt: "INTERRUPTED",
    escalate: "REQUIRES_HUMAN_INTERVENTION",
  },
  BLOCKED: { revise_contract: "CONTRACT_DRAFTED" },
  FAILED: { plan_recovery: "RECOVERY_PENDING" },
  INTERRUPTED: { plan_recovery: "RECOVERY_PENDING", escalate: "REQUIRES_HUMAN_INTERVENTION" },
  RECOVERY_PENDING: { recover: "RECOVERED", escalate: "REQUIRES_HUMAN_INTERVENTION" },
  REVIEW_REQUIRED: { escalate: "REQUIRES_HUMAN_INTERVENTION" },
};

/** States from which nothing further happens (cancel included). */
export const TERMINAL_STATES: ReadonlySet<TaskState> = new Set([
  "VERIFIED",
  "PARTIALLY_VERIFIED",
  "REJECTED",
  "EXPIRED",
  "CANCELLED",
  "RECOVERED",
  "REQUIRES_HUMAN_INTERVENTION",
]);

export interface CheckResult {
  name: string;
  command: string;
  /** null means the check did not run. It never counts as passing. */
  exitCode: number | null;
}

export interface VerificationEvidence {
  checks: CheckResult[];
  proofPackDigest?: string;
}

export interface TaskEvent {
  id: string;
  type: TaskEventType;
  at: Date;
  actor: { kind: "user" | "agent" | "system"; id: string };
  evidence?: VerificationEvidence;
}

export interface TransitionRecord {
  eventId: string;
  type: TaskEventType;
  from: TaskState;
  to: TaskState;
  at: Date;
  actor: TaskEvent["actor"];
}

export interface TaskSnapshot {
  id: string;
  orgId: string;
  state: TaskState;
  version: number;
  history: readonly TransitionRecord[];
}

export type TransitionErrorCode = "VERSION_CONFLICT" | "INVALID_TRANSITION" | "TERMINAL_STATE" | "GUARD_FAILED";

export type TransitionResult =
  | { ok: true; task: TaskSnapshot; applied: boolean }
  | { ok: false; code: TransitionErrorCode; message: string };

export function newTask(id: string, orgId: string): TaskSnapshot {
  return { id, orgId, state: "RECEIVED", version: 0, history: [] };
}

export function allowedEvents(state: TaskState): TaskEventType[] {
  if (TERMINAL_STATES.has(state)) return [];
  return [...(Object.keys(TRANSITIONS[state] ?? {}) as TaskEventType[]), "cancel"];
}

function passed(check: CheckResult): boolean {
  return check.exitCode === 0;
}

function guard(event: TaskEvent): string | null {
  const checks = event.evidence?.checks ?? [];
  switch (event.type) {
    case "mark_verified":
      if (checks.length === 0) return "Verification needs at least one check result.";
      if (!checks.every(passed)) return "Every check must have run and exited 0 to mark a task verified.";
      if (!event.evidence?.proofPackDigest) return "A verified task needs a ProofPack digest.";
      return null;
    case "mark_partially_verified":
      if (!checks.some(passed)) return "Partial verification needs at least one passing check.";
      if (checks.every(passed)) return "All checks passed; use mark_verified.";
      return null;
    case "mark_failed":
      if (checks.length > 0 && checks.every(passed)) return "All checks passed; a failure needs a failing or missing check.";
      return null;
    default:
      return null;
  }
}

export function transition(task: TaskSnapshot, event: TaskEvent, expectedVersion: number): TransitionResult {
  // Replaying an already-applied event is a no-op, even with a stale version.
  if (task.history.some((h) => h.eventId === event.id)) {
    return { ok: true, task, applied: false };
  }
  if (task.version !== expectedVersion) {
    return { ok: false, code: "VERSION_CONFLICT", message: `Task is at version ${task.version}, not ${expectedVersion}.` };
  }
  if (TERMINAL_STATES.has(task.state)) {
    return { ok: false, code: "TERMINAL_STATE", message: `Task is ${task.state} and can't change.` };
  }

  const to = event.type === "cancel" ? "CANCELLED" : TRANSITIONS[task.state]?.[event.type];
  if (!to) {
    return { ok: false, code: "INVALID_TRANSITION", message: `${event.type} is not allowed from ${task.state}.` };
  }

  const guardMessage = guard(event);
  if (guardMessage) return { ok: false, code: "GUARD_FAILED", message: guardMessage };

  const record: TransitionRecord = { eventId: event.id, type: event.type, from: task.state, to, at: event.at, actor: event.actor };
  return {
    ok: true,
    applied: true,
    task: { ...task, state: to, version: task.version + 1, history: [...task.history, record] },
  };
}
