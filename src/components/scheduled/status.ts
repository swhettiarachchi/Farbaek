import type { Status } from "@/components/ui/status-badge";

/**
 * A scheduled task's and a run's status, as one of the thirteen kinds with its words (ADR 0183). One list, so the Scheduled page
 * and Home say the same thing about the same task.
 */
export const RUN_STATUS: Record<"running" | "retrying" | "done" | "failed" | "skipped", { status: Status; label: string }> = {
  running: { status: "working", label: "Running" },
  retrying: { status: "pending", label: "Trying again soon" },
  done: { status: "done", label: "Ran" },
  failed: { status: "failed", label: "Didn't finish" },
  skipped: { status: "off", label: "Skipped" },
};

export function stateBadge(state: "active" | "paused" | "ended", running: boolean): { status: Status; label: string } {
  if (state === "paused") return { status: "paused", label: "Paused" };
  if (state === "ended") return { status: "off", label: "Ended" };
  if (running) return { status: "working", label: "Running now" };
  return { status: "pending", label: "Scheduled" };
}

/** A task Farbaek paused itself: a real warning, since it has stopped running until the person looks. */
export const STOPPED_BADGE: { status: Status; label: string } = { status: "attention", label: "Paused by Farbaek" };
