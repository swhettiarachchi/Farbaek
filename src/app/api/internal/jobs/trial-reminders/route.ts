import { handleHourlyJobs } from "@/server/jobs/hourly";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST /api/internal/jobs/trial-reminders: the address copies of jobs.sh
 * installed before ADR 0068 still call. It runs every hourly job, exactly
 * like /api/internal/jobs/hourly, so nothing on the server has to be
 * reinstalled for new jobs to start.
 */
export async function POST(request: Request) {
  return handleHourlyJobs(request);
}
