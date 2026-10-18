/**
 * Why something didn't work, in categories people can act on. A failed build,
 * a timeout, a resource limit, a provider outage and a refused request are
 * different problems with different fixes, so they are never collapsed into
 * one "error".
 */

export const FAILURE_CATEGORIES = [
  "command_failed",
  "timeout",
  "resource_limit",
  "cancelled",
  "provider_unavailable",
  "provider_rejected",
  "sandbox_gone",
  "not_authorized",
  "quota_exceeded",
  "invalid_request",
  "control_plane_interrupted",
  "cleanup_failed",
] as const;
export type FailureCategory = (typeof FAILURE_CATEGORIES)[number];

export const FAILURE_LABELS: Record<FailureCategory, { title: string; action: string }> = {
  command_failed: { title: "The command exited with an error", action: "Read the output, fix the cause and run it again." },
  timeout: { title: "The time limit was reached", action: "Run a shorter step, or raise the limit within your plan." },
  resource_limit: { title: "A resource limit was reached", action: "The process was stopped for memory, disk or process limits. Use a larger size or a lighter command." },
  cancelled: { title: "Cancelled", action: "Nothing else to do. Run it again if you still need it." },
  provider_unavailable: { title: "The sandbox runtime didn't respond", action: "This is on the runtime's side. Try again shortly; nothing ran twice." },
  provider_rejected: { title: "The sandbox runtime refused the request", action: "Check the runtime's key, template and account limits in Settings." },
  sandbox_gone: { title: "The sandbox no longer exists", action: "It reached the runtime's own time limit or was removed. Start a new session." },
  not_authorized: { title: "Not allowed", action: "Your role or the session's owner doesn't allow this." },
  quota_exceeded: { title: "Plan limit reached", action: "Stop a running session or wait for the next usage period." },
  invalid_request: { title: "The request wasn't valid", action: "Check the values and try again." },
  control_plane_interrupted: { title: "Farbaek lost track of this run", action: "The server restarted while it ran. The result is unknown, so run it again." },
  cleanup_failed: { title: "Cleanup didn't finish", action: "Farbaek keeps retrying. The runtime's own time limit still ends the sandbox." },
};

/**
 * Classifies a finished command from facts only. Exit 137 is SIGKILL, which
 * the kernel's out-of-memory killer sends, so without a cancel or timeout it
 * is reported as a resource limit, with the exit code kept beside it.
 */
export function classifyExit(input: { exitCode: number | null; timedOut: boolean; cancelled: boolean }): FailureCategory | null {
  if (input.cancelled) return "cancelled";
  if (input.timedOut) return "timeout";
  if (input.exitCode === 0) return null;
  if (input.exitCode === null) return "control_plane_interrupted";
  if (input.exitCode === 137) return "resource_limit";
  return "command_failed";
}
