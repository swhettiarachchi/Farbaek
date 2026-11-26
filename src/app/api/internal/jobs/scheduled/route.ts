import { after } from "next/server";
import { noteMinuteTick } from "@/server/automation/minute-tick";
import { startDueTasks } from "@/server/automation/wiring";
import { checkSchedulerToken } from "@/server/jobs/auth";
import { noteJobRun } from "@/server/ops/jobs";
import { readSandboxConfig } from "@/server/sandbox/config";
import { json, problem } from "@/server/sandbox/http";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

export const dynamic = "force-dynamic";
// A run may take ten minutes: the tick answers at once, and its runs carry on after the response.
export const maxDuration = 900;

/**
 * POST /api/internal/jobs/scheduled, called every minute by farbaek-scheduled.timer with the scheduler's secret (stage 271,
 * ADR 0278): starts the scheduled tasks that are due. Safe to call at any time and as often as wanted: a task is claimed under a
 * lease in the database, so two calls never run the same due time twice. Not part of the public API.
 */
export async function POST(request: Request) {
  const auth = checkSchedulerToken(request, readSandboxConfig().cronSecret);
  if (auth === "missing") return problem(503, "NOT_CONFIGURED", "Not configured.");
  if (auth === "denied") return problem(401, "UNAUTHENTICATED", "Not allowed.");
  const tick = await startDueTasks((work) => after(work));
  // The page may promise "within a minute" only while these ticks arrive and can claim what is due.
  if (tick.status !== "not_configured" && tick.status !== "failed") noteMinuteTick();
  const admin = createSupabaseAdminClient();
  if (admin && tick.status !== "not_configured") {
    await noteJobRun(admin, "scheduled_tasks", tick.status !== "failed", tick.status === "ran" ? `Started ${tick.claimed}; ${tick.running} running.` : tick.status === "paused" ? "AI is paused for the platform, so nothing was started." : "Due tasks couldn't be claimed.").catch(() => undefined);
  }
  if (tick.status === "not_configured") return problem(503, "NOT_CONFIGURED", "The server key for writes isn't set.");
  if (tick.status === "failed") return problem(500, "INTERNAL", "Due tasks couldn't be claimed; it is safe to run again.");
  return json({ data: tick });
}
