/**
 * Turns a task's real state and transition history into the lifecycle view
 * shown on the task page. A stage is only "verified" if the task actually
 * passed it; nothing is inferred from intent or time.
 */
import { TASK_STATES, type TaskState } from "./task-machine";

export type StageStatus = "verified" | "approval" | "unverified" | "failed";
export type StageKey = "contract" | "plan" | "policy" | "approval" | "execution" | "verification";

export interface LifecycleStage {
  key: StageKey;
  label: string;
  status: StageStatus;
  note: string;
}

const STAGES: { key: StageKey; label: string; doneAt: TaskState }[] = [
  { key: "contract", label: "Contract", doneAt: "CONTRACT_APPROVED" },
  { key: "plan", label: "Plan", doneAt: "PLAN_PROPOSED" },
  { key: "policy", label: "Policy", doneAt: "POLICY_EVALUATED" },
  { key: "approval", label: "Approval", doneAt: "EXECUTION_AUTHORIZED" },
  { key: "execution", label: "Execution", doneAt: "VERIFYING" },
  { key: "verification", label: "Verification", doneAt: "VERIFIED" },
];

export const TASK_STATE_LABELS: Record<TaskState, string> = {
  RECEIVED: "Received",
  CONTEXT_ASSEMBLED: "Context assembled",
  CONTRACT_DRAFTED: "Contract drafted",
  CONTRACT_APPROVED: "Contract approved",
  PLAN_PROPOSED: "Plan proposed",
  POLICY_EVALUATED: "Policy evaluated",
  APPROVAL_PENDING: "Awaiting approval",
  EXECUTION_AUTHORIZED: "Execution authorized",
  EXECUTING: "Executing",
  VERIFYING: "Verifying",
  VERIFIED: "Verified",
  PARTIALLY_VERIFIED: "Partially verified",
  FAILED: "Failed",
  REVIEW_REQUIRED: "Review required",
  BLOCKED: "Blocked by policy",
  REJECTED: "Rejected",
  EXPIRED: "Expired",
  CANCELLED: "Cancelled",
  INTERRUPTED: "Interrupted",
  RECOVERY_PENDING: "Recovery pending",
  RECOVERED: "Recovered",
  REQUIRES_HUMAN_INTERVENTION: "Needs a person",
};

export type StateTone = "verified" | "approval" | "failed" | "unverified" | "info";

/** Badge tone for a task state. Always shown with its label and an icon. */
export function stateTone(state: TaskState): StateTone {
  switch (state) {
    case "VERIFIED":
    case "RECOVERED":
      return "verified";
    case "APPROVAL_PENDING":
    case "REVIEW_REQUIRED":
    case "REQUIRES_HUMAN_INTERVENTION":
      return "approval";
    case "FAILED":
    case "BLOCKED":
    case "REJECTED":
    case "INTERRUPTED":
      return "failed";
    case "CANCELLED":
    case "EXPIRED":
    case "PARTIALLY_VERIFIED":
      return "unverified";
    default:
      return "info";
  }
}

export function isTaskState(value: string): value is TaskState {
  return (TASK_STATES as readonly string[]).includes(value);
}

const FAILURE_NOTES: Partial<Record<TaskState, string>> = {
  FAILED: "failed",
  BLOCKED: "blocked by policy",
  REJECTED: "rejected",
  EXPIRED: "approval expired",
  INTERRUPTED: "interrupted",
  REQUIRES_HUMAN_INTERVENTION: "needs a person",
};

export function lifecycleProgress(state: TaskState, history: readonly { to: TaskState }[]): LifecycleStage[] {
  const reached = new Set<TaskState>(["RECEIVED", state, ...history.map((h) => h.to)]);
  const approvalWasRequested = reached.has("APPROVAL_PENDING");

  const done = STAGES.map((s) => reached.has(s.doneAt));
  // A policy block fails the policy stage even though evaluation completed.
  if (state === "BLOCKED") done[2] = false;
  const current = done.findIndex((d) => !d);

  return STAGES.map((stage, i): LifecycleStage => {
    if (done[i]) {
      const note = stage.key === "approval" && !approvalWasRequested ? "not required" : "done";
      return { key: stage.key, label: stage.label, status: "verified", note };
    }
    if (i !== current) return { key: stage.key, label: stage.label, status: "unverified", note: "not started" };

    const failure = FAILURE_NOTES[state];
    if (failure) return { key: stage.key, label: stage.label, status: "failed", note: failure };
    if (state === "APPROVAL_PENDING") return { key: stage.key, label: stage.label, status: "approval", note: "waiting for approval" };
    if (state === "REVIEW_REQUIRED") return { key: stage.key, label: stage.label, status: "approval", note: "review required" };
    if (state === "CANCELLED") return { key: stage.key, label: stage.label, status: "unverified", note: "cancelled" };
    if (state === "PARTIALLY_VERIFIED") return { key: stage.key, label: stage.label, status: "unverified", note: "partially verified" };
    if (state === "RECOVERY_PENDING") return { key: stage.key, label: stage.label, status: "unverified", note: "recovery pending" };
    return { key: stage.key, label: stage.label, status: "unverified", note: "in progress" };
  });
}
