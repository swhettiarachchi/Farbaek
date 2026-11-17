import { describe, expect, it } from "vitest";
import { TERMINAL_STATES } from "@/core/realityloop/task-machine";
import { pickTask, threadStage, type ThreadTask } from "./thread";

const task = (id: string, state: ThreadTask["state"], updatedAt: string): ThreadTask => ({ id, title: id, state, updatedAt });

describe("the task the workspace opens on", () => {
  const tasks = [task("old-done", "VERIFIED", "2026-11-10T10:00:00Z"), task("going", "CONTRACT_DRAFTED", "2026-11-12T10:00:00Z"), task("newest-done", "VERIFIED", "2026-11-15T10:00:00Z")];

  it("is none when the project has no tasks", () => {
    expect(pickTask([])).toBeNull();
  });

  it("is the one asked for, when it belongs to the project", () => {
    expect(pickTask(tasks, "old-done")?.id).toBe("old-done");
  });

  it("ignores a task that isn't this project's", () => {
    expect(pickTask(tasks, "someone-elses")?.id).toBe("going");
  });

  it("prefers work still going over newer finished work", () => {
    expect(pickTask(tasks)?.id).toBe("going");
  });

  it("falls back to the newest when everything is finished", () => {
    expect(pickTask([tasks[0]!, tasks[2]!])?.id).toBe("newest-done");
  });

  it("doesn't reorder the list it was given", () => {
    const before = tasks.map((t) => t.id);
    pickTask(tasks);
    expect(tasks.map((t) => t.id)).toEqual(before);
  });
});

describe("where the open task stands", () => {
  const base = { state: "CONTRACT_DRAFTED" as const, hasPlan: true, planApproved: false, runLive: false, changePending: false };

  it("waits for approval when a plan is drafted", () => {
    expect(threadStage(base)).toBe("plan_waiting");
  });

  it("says when the plan couldn't be drafted", () => {
    expect(threadStage({ ...base, hasPlan: false })).toBe("plan_missing");
  });

  it("is ready only in the one state a run can start from", () => {
    expect(threadStage({ ...base, state: "CONTRACT_APPROVED", planApproved: true })).toBe("ready");
    expect(threadStage({ ...base, state: "VERIFIED", planApproved: true })).toBe("settled");
  });

  it("doesn't call work finished while it is still being applied or checked", () => {
    for (const state of ["EXECUTING", "VERIFYING", "APPROVAL_PENDING", "REVIEW_REQUIRED"] as const) expect(threadStage({ ...base, state, planApproved: true })).toBe("under_way");
    for (const state of TERMINAL_STATES) if (state !== "CANCELLED") expect(threadStage({ ...base, state, planApproved: true }), state).toBe("settled");
  });

  it("never offers an ended request's plan for approval", () => {
    for (const state of TERMINAL_STATES) expect(threadStage({ ...base, state, hasPlan: true, planApproved: false }), state).not.toBe("plan_waiting");
  });

  it("is running whenever an agent is on it, whatever else is true", () => {
    expect(threadStage({ ...base, state: "CONTRACT_APPROVED", planApproved: true, runLive: true })).toBe("running");
    expect(threadStage({ ...base, runLive: true, changePending: true })).toBe("running");
  });

  it("puts a waiting change ahead of starting again", () => {
    expect(threadStage({ ...base, state: "CONTRACT_APPROVED", planApproved: true, changePending: true })).toBe("change_waiting");
  });

  it("is cancelled when cancelled, even with a run recorded", () => {
    expect(threadStage({ ...base, state: "CANCELLED", runLive: true })).toBe("cancelled");
  });
});
