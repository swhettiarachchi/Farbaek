import { StatusBadge, type Status } from "@/components/ui/status-badge";
import { EXECUTION_STATE_LABELS, SESSION_STATE_LABELS, type ExecutionState, type SessionState } from "@/core/sandbox/lifecycle";

// Each state is one of the shared kinds (ADR 0183): its words, icon, colour and border together.
export const SESSION_STATE_KIND: Record<SessionState, Status> = {
  requested: "pending",
  provisioning: "working",
  ready: "verified",
  paused: "paused",
  stopping: "working",
  terminated: "off",
  expired: "off",
  failed: "failed",
};

export const EXECUTION_STATE_KIND: Record<ExecutionState, Status> = {
  running: "working",
  succeeded: "verified",
  failed: "failed",
  timed_out: "attention",
  cancelled: "off",
  error: "failed",
};

export function SessionStateBadge({ state }: { state: SessionState }) {
  return <StatusBadge status={SESSION_STATE_KIND[state]} label={SESSION_STATE_LABELS[state]} />;
}

export function ExecutionStateBadge({ state, exitCode }: { state: ExecutionState; exitCode: number | null }) {
  const label = state === "failed" && exitCode !== null ? `Failed (exit ${exitCode})` : EXECUTION_STATE_LABELS[state];
  return <StatusBadge status={EXECUTION_STATE_KIND[state]} label={label} />;
}
