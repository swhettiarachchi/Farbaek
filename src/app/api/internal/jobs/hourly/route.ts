import { handleHourlyJobs } from "@/server/jobs/hourly";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/internal/jobs/hourly, called hourly by farbaek-jobs.timer with the
 * scheduler's secret: the trial reminders (ADR 0063) and the owner's platform
 * alerts (ADR 0068). Safe to run again at any time.
 */
export async function POST(request: Request) {
  return handleHourlyJobs(request);
}
