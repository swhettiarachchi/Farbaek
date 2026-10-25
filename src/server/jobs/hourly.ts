/**
 * Every hourly job (ADR 0063, ADR 0068), run by farbaek-jobs.timer through
 * POST /api/internal/jobs/hourly, or through /api/internal/jobs/trial-reminders,
 * which copies of jobs.sh installed before ADR 0068 still call. Each job runs
 * on its own: one failing or not being configured never stops another.
 */
import { checkSchedulerToken } from "@/server/jobs/auth";
import { runOutcomeWatches } from "@/server/jobs/outcome-watch";
import { outcomeWatchDeps } from "@/server/jobs/outcome-watch-wiring";
import { runPlatformAlerts } from "@/server/jobs/platform-alerts";
import { platformAlertDeps } from "@/server/jobs/platform-alerts-wiring";
import { runTrialReminders } from "@/server/jobs/trial-reminders";
import { trialReminderDeps } from "@/server/jobs/trial-reminders-wiring";
import { log } from "@/server/observability/log";
import { noteJobRun } from "@/server/ops/jobs";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSandboxConfig } from "@/server/sandbox/config";
import { json, problem } from "@/server/sandbox/http";

type JobResult = { status: "ran"; result: unknown } | { status: "not_configured" } | { status: "failed" };

async function runJob<D>(name: string, deps: D | null, run: (deps: D) => Promise<unknown>): Promise<JobResult> {
  if (!deps) return { status: "not_configured" };
  try {
    const result = await run(deps);
    log("info", `${name}.run`, { result: JSON.stringify(result).slice(0, 2000) });
    return { status: "ran", result };
  } catch (e) {
    log("error", `${name}.run_failed`, { error: e instanceof Error ? e.message : String(e) });
    return { status: "failed" };
  }
}

export async function handleHourlyJobs(request: Request): Promise<Response> {
  const auth = checkSchedulerToken(request, readSandboxConfig().cronSecret);
  if (auth === "missing") return problem(503, "NOT_CONFIGURED", "SANDBOX_CRON_SECRET isn't set on this server.");
  if (auth === "denied") return problem(401, "UNAUTHENTICATED", "Not allowed.");
  const now = new Date();
  const jobs = {
    trialReminders: await runJob("trial_reminders", trialReminderDeps(), (d) => runTrialReminders(d, now)),
    platformAlerts: await runJob("platform_alerts", platformAlertDeps(), (d) => runPlatformAlerts(d, now)),
    outcomeWatch: await runJob("outcome_watch", outcomeWatchDeps(), (d) => runOutcomeWatches(d)),
  };
  const all = Object.values(jobs);
  if (all.every((j) => j.status === "not_configured")) return problem(503, "NOT_CONFIGURED", "Email or the server key for writes isn't set, so no hourly job can run.");
  const failed = all.some((j) => j.status === "failed");
  const admin = createSupabaseAdminClient();
  if (admin) await noteJobRun(admin, "hourly_jobs", !failed, failed ? Object.entries(jobs).filter(([, j]) => j.status === "failed").map(([name]) => `${name} failed`).join(", ") : null);
  // Safe to run again: every job claims its work before doing it.
  return json({ data: jobs }, failed ? 500 : 200);
}
