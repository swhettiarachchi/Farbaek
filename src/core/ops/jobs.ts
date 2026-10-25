/**
 * Farbaek's background jobs and how late each may be (ADR 0071). Each run is
 * recorded (migration v43); a job whose last success is older than its limit,
 * or whose last run failed, needs a look. A job that has never reported is
 * unknown, not failing: the backup scripts start reporting only once the
 * server's installed copies are updated.
 */
export const JOBS = [
  { key: "sandbox_sweep", label: "Sandbox sweep", every: "every 15 minutes", lateAfterHours: 1 },
  { key: "hourly_jobs", label: "Hourly jobs", every: "hourly: trial reminders, alerts and outcome watch", lateAfterHours: 3 },
  { key: "db_backup", label: "Nightly backup", every: "nightly at 02:30 UTC", lateAfterHours: 30 },
  { key: "restore_test", label: "Backup restore test", every: "weekly on Sundays", lateAfterHours: 8 * 24 },
] as const;

export type JobKey = (typeof JOBS)[number]["key"];
export interface JobRun {
  job: string;
  lastOkAt: string | null;
  lastFailedAt: string | null;
  lastDetail: string | null;
}
export type JobState = "ok" | "late" | "failing" | "never";
export interface JobStatus {
  key: JobKey;
  label: string;
  every: string;
  state: JobState;
  lastOkAt: string | null;
  lastFailedAt: string | null;
  detail: string | null;
}

export function jobStatuses(runs: readonly JobRun[], now: Date): JobStatus[] {
  return JOBS.map((job) => {
    const run = runs.find((r) => r.job === job.key);
    const ok = run?.lastOkAt ? Date.parse(run.lastOkAt) : null;
    const failed = run?.lastFailedAt ? Date.parse(run.lastFailedAt) : null;
    const state: JobState =
      ok === null && failed === null
        ? "never"
        : failed !== null && (ok === null || failed > ok)
          ? "failing"
          : ok !== null && now.getTime() - ok > job.lateAfterHours * 3_600_000
            ? "late"
            : "ok";
    return { key: job.key, label: job.label, every: job.every, state, lastOkAt: run?.lastOkAt ?? null, lastFailedAt: run?.lastFailedAt ?? null, detail: run?.lastDetail ?? null };
  });
}

/** For /api/ready: the jobs that need a look, by key. Jobs that never reported don't count. */
export function jobsNeedingALook(statuses: readonly JobStatus[]): JobKey[] {
  return statuses.filter((s) => s.state === "late" || s.state === "failing").map((s) => s.key);
}
