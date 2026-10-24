import { runTrialReminders } from "@/server/jobs/trial-reminders";
import { trialReminderDeps } from "@/server/jobs/trial-reminders-wiring";
import { checkSchedulerToken } from "@/server/jobs/auth";
import { log } from "@/server/observability/log";
import { readSandboxConfig } from "@/server/sandbox/config";
import { json, problem } from "@/server/sandbox/http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/internal/jobs/trial-reminders, called hourly by farbaek-jobs.timer
 * with the scheduler's secret (ADR 0063). Sends the trial reminders that are
 * due and records what happened to each. Safe to run again at any time.
 */
export async function POST(request: Request) {
  const auth = checkSchedulerToken(request, readSandboxConfig().cronSecret);
  if (auth === "missing") return problem(503, "NOT_CONFIGURED", "SANDBOX_CRON_SECRET isn't set on this server.");
  if (auth === "denied") return problem(401, "UNAUTHENTICATED", "Not allowed.");
  const deps = trialReminderDeps();
  if (!deps) return problem(503, "NOT_CONFIGURED", "Email or the server key for writes isn't set, so no reminders are sent.");
  try {
    const run = await runTrialReminders(deps, new Date());
    log("info", "trial_reminders.run", { ...run });
    return json({ data: run });
  } catch (e) {
    log("error", "trial_reminders.run_failed", { error: e instanceof Error ? e.message : String(e) });
    return problem(500, "INTERNAL", "The run failed; it is safe to run again.");
  }
}
