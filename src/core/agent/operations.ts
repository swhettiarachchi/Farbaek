/**
 * The lifecycle of an agent run and of each operation inside it (spec §7,
 * "Cancellation and recovery"). Transitions are explicit; a run that was
 * running when the app stopped becomes interrupted and is never resumed
 * silently: a person decides what to do next.
 */

export const RUN_STATES = ["planned", "approved", "queued", "running", "completed", "failed", "cancelled", "interrupted"] as const;
export type RunState = (typeof RUN_STATES)[number];

export const RUN_EVENTS = ["approve", "queue", "start", "complete", "fail", "cancel", "interrupt", "restart"] as const;
export type RunEvent = (typeof RUN_EVENTS)[number];

const TRANSITIONS: Partial<Record<RunState, Partial<Record<RunEvent, RunState>>>> = {
  planned: { approve: "approved", cancel: "cancelled" },
  approved: { queue: "queued", start: "running", cancel: "cancelled" },
  queued: { start: "running", cancel: "cancelled", interrupt: "interrupted" },
  running: { complete: "completed", fail: "failed", cancel: "cancelled", interrupt: "interrupted" },
  // An interrupted run starts again only when a person asks, as a new attempt.
  interrupted: { restart: "approved", cancel: "cancelled" },
  failed: { restart: "approved" },
};

export const FINAL_RUN_STATES: ReadonlySet<RunState> = new Set(["completed", "cancelled"]);

export function nextRunState(state: RunState, event: RunEvent): RunState | null {
  return TRANSITIONS[state]?.[event] ?? null;
}

/** What a run's state means after the app restarts: anything that was moving stops and waits for a person. */
export function stateAfterRestart(state: RunState): RunState {
  return state === "running" || state === "queued" ? "interrupted" : state;
}

export const RUN_STATE_LABELS: Record<RunState, string> = {
  planned: "Planned",
  approved: "Approved",
  queued: "Queued",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
  interrupted: "Interrupted",
};
