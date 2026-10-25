/**
 * Recording and reading background job runs (ADR 0071, migration v43).
 * Recording never throws: a job's own work matters more than its report.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { jobStatuses, type JobKey, type JobStatus } from "@/core/ops/jobs";
import { log } from "@/server/observability/log";

export async function noteJobRun(admin: SupabaseClient, job: JobKey, ok: boolean, detail: string | null = null): Promise<void> {
  const { error } = await admin.rpc("app_note_job_run", { p_job: job, p_ok: ok, p_detail: detail });
  if (error) log("warn", "job_run.not_recorded", { job, error: error.message });
}

const Runs = z.array(z.object({ job: z.string(), last_ok_at: z.string().nullable(), last_failed_at: z.string().nullable(), last_detail: z.string().nullable() }));

/** Each job's state, or null when the runs can't be read. */
export async function readJobStatuses(admin: SupabaseClient, now: Date): Promise<JobStatus[] | null> {
  const { data, error } = await admin.rpc("app_job_runs");
  if (error) return null;
  const rows = Runs.safeParse(data);
  if (!rows.success) return null;
  return jobStatuses(
    rows.data.map((r) => ({ job: r.job, lastOkAt: r.last_ok_at, lastFailedAt: r.last_failed_at, lastDetail: r.last_detail })),
    now,
  );
}
