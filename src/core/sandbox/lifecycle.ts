/**
 * Sandbox session lifecycle (ADR 0013). One explicit transition table, used
 * by the server before it calls the database, and mirrored by the database
 * function that applies every change under a version check. A transition the
 * table doesn't list is refused, so a retried or concurrent request can't move
 * a session twice.
 *
 * Termination and expiry are two-phase: the session moves to `stopping`
 * before the provider is asked to destroy the sandbox, and reaches its final
 * state only once that cleanup has been attempted. A crash in between leaves
 * a `stopping` session that the sweeper finishes.
 */

export const SESSION_STATES = ["requested", "provisioning", "ready", "paused", "stopping", "terminated", "expired", "failed"] as const;
export type SessionState = (typeof SESSION_STATES)[number];

export const SESSION_EVENTS = ["provision", "provisioned", "pause", "resume", "stop", "expire", "finish_termination", "finish_expiry", "fail"] as const;
export type SessionEvent = (typeof SESSION_EVENTS)[number];

const TRANSITIONS: Record<SessionState, Partial<Record<SessionEvent, SessionState>>> = {
  requested: { provision: "provisioning", stop: "stopping", fail: "failed" },
  provisioning: { provisioned: "ready", stop: "stopping", fail: "failed" },
  ready: { pause: "paused", stop: "stopping", expire: "stopping", fail: "failed" },
  paused: { resume: "ready", stop: "stopping", expire: "stopping", fail: "failed" },
  stopping: { finish_termination: "terminated", finish_expiry: "expired", fail: "failed" },
  terminated: {},
  expired: {},
  failed: {},
};

export const TERMINAL_SESSION_STATES: ReadonlySet<SessionState> = new Set(["terminated", "expired", "failed"]);

/** States that hold (or may hold) a provider sandbox, so they count toward concurrency limits. */
export const ACTIVE_SESSION_STATES: readonly SessionState[] = ["requested", "provisioning", "ready", "paused", "stopping"];

export function nextSessionState(from: SessionState, event: SessionEvent): SessionState | null {
  return TRANSITIONS[from][event] ?? null;
}

export function allowedSessionEvents(state: SessionState): SessionEvent[] {
  return Object.keys(TRANSITIONS[state]) as SessionEvent[];
}

/** Every (from, to) pair the table allows. The database migration encodes the same list; a test keeps them equal. */
export function allowedSessionPairs(): [SessionState, SessionState][] {
  const pairs = new Map<string, [SessionState, SessionState]>();
  for (const from of SESSION_STATES) {
    for (const to of Object.values(TRANSITIONS[from])) pairs.set(`${from}>${to}`, [from, to as SessionState]);
  }
  return [...pairs.values()];
}

export type EndReason = "user" | "ttl" | "idle" | "provider_gone" | "failed";

export const SESSION_STATE_LABELS: Record<SessionState, string> = {
  requested: "Requested",
  provisioning: "Starting",
  ready: "Running",
  paused: "Paused",
  stopping: "Stopping",
  terminated: "Terminated",
  expired: "Expired",
  failed: "Failed",
};

export const END_REASON_LABELS: Record<EndReason, string> = {
  user: "Stopped by a person",
  ttl: "Reached its time limit",
  idle: "Stopped after being idle",
  provider_gone: "The runtime no longer had it",
  failed: "Failed",
};

export const EXECUTION_STATES = ["running", "succeeded", "failed", "timed_out", "cancelled", "error"] as const;
export type ExecutionState = (typeof EXECUTION_STATES)[number];

export const EXECUTION_STATE_LABELS: Record<ExecutionState, string> = {
  running: "Running",
  succeeded: "Succeeded",
  failed: "Failed",
  timed_out: "Timed out",
  cancelled: "Cancelled",
  error: "Didn't finish",
};
