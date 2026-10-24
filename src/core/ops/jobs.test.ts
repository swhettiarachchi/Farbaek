import { describe, expect, it } from "vitest";
import { jobStatuses, jobsNeedingALook, type JobRun } from "./jobs";

const NOW = new Date("2026-10-24T16:00:00Z");
const ago = (hours: number) => new Date(NOW.getTime() - hours * 3_600_000).toISOString();
const state = (runs: JobRun[], key: string) => jobStatuses(runs, NOW).find((s) => s.key === key)!.state;

describe("background job states", () => {
  it("is ok within each job's limit, and late past it", () => {
    expect(state([{ job: "db_backup", lastOkAt: ago(14), lastFailedAt: null, lastDetail: null }], "db_backup")).toBe("ok");
    expect(state([{ job: "db_backup", lastOkAt: ago(31), lastFailedAt: null, lastDetail: null }], "db_backup")).toBe("late");
    expect(state([{ job: "sandbox_sweep", lastOkAt: ago(0.5), lastFailedAt: null, lastDetail: null }], "sandbox_sweep")).toBe("ok");
    expect(state([{ job: "sandbox_sweep", lastOkAt: ago(1.5), lastFailedAt: null, lastDetail: null }], "sandbox_sweep")).toBe("late");
    expect(state([{ job: "restore_test", lastOkAt: ago(7 * 24), lastFailedAt: null, lastDetail: null }], "restore_test")).toBe("ok");
  });

  it("is failing when the last run failed, even right after a success", () => {
    expect(state([{ job: "hourly_jobs", lastOkAt: ago(2), lastFailedAt: ago(1), lastDetail: "500" }], "hourly_jobs")).toBe("failing");
    expect(state([{ job: "hourly_jobs", lastOkAt: ago(0.5), lastFailedAt: ago(1), lastDetail: null }], "hourly_jobs")).toBe("ok");
    expect(state([{ job: "db_backup", lastOkAt: null, lastFailedAt: ago(1), lastDetail: "pg_dump failed" }], "db_backup")).toBe("failing");
  });

  it("calls a job that never reported unknown, and keeps it out of the readiness check", () => {
    const statuses = jobStatuses([{ job: "sandbox_sweep", lastOkAt: ago(3), lastFailedAt: null, lastDetail: null }], NOW);
    expect(statuses.find((s) => s.key === "db_backup")!.state).toBe("never");
    expect(jobsNeedingALook(statuses)).toEqual(["sandbox_sweep"]);
    expect(jobsNeedingALook(jobStatuses([], NOW))).toEqual([]);
  });
});
