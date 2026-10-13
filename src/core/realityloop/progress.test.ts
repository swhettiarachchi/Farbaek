import { describe, expect, it } from "vitest";
import { TASK_STATES, type TaskState } from "./task-machine";
import { TASK_STATE_LABELS, isTaskState, lifecycleProgress, stateTone } from "./progress";

const path = (...to: TaskState[]) => to.map((t) => ({ to: t }));
const view = (state: TaskState, ...to: TaskState[]) => lifecycleProgress(state, path(...to)).map((s) => `${s.key}:${s.status}:${s.note}`);

const HAPPY: TaskState[] = [
  "CONTEXT_ASSEMBLED",
  "CONTRACT_DRAFTED",
  "CONTRACT_APPROVED",
  "PLAN_PROPOSED",
  "POLICY_EVALUATED",
  "APPROVAL_PENDING",
  "EXECUTION_AUTHORIZED",
  "EXECUTING",
  "VERIFYING",
];

describe("lifecycleProgress", () => {
  it("shows a new task with every stage not yet verified", () => {
    expect(view("RECEIVED")).toEqual([
      "contract:unverified:in progress",
      "plan:unverified:not started",
      "policy:unverified:not started",
      "approval:unverified:not started",
      "execution:unverified:not started",
      "verification:unverified:not started",
    ]);
  });

  it("marks the approval stage while waiting for a person", () => {
    expect(view("APPROVAL_PENDING", ...HAPPY.slice(0, 6))).toEqual([
      "contract:verified:done",
      "plan:verified:done",
      "policy:verified:done",
      "approval:approval:waiting for approval",
      "execution:unverified:not started",
      "verification:unverified:not started",
    ]);
  });

  it("verifies every stage only when the task is verified", () => {
    expect(view("VERIFIED", ...HAPPY, "VERIFIED").every((s) => s.includes(":verified:"))).toBe(true);
    expect(view("VERIFYING", ...HAPPY).at(-1)).toBe("verification:unverified:in progress");
  });

  it("says when approval wasn't required", () => {
    const states: TaskState[] = ["CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "CONTRACT_APPROVED", "PLAN_PROPOSED", "POLICY_EVALUATED", "EXECUTION_AUTHORIZED", "EXECUTING"];
    expect(view("EXECUTING", ...states)[3]).toBe("approval:verified:not required");
  });

  it("fails the stage where the task stopped", () => {
    expect(view("BLOCKED", "CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "CONTRACT_APPROVED", "PLAN_PROPOSED", "POLICY_EVALUATED", "BLOCKED")[2]).toBe(
      "policy:failed:blocked by policy",
    );
    expect(view("REJECTED", "CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED", "REJECTED")[0]).toBe("contract:failed:rejected");
    expect(view("FAILED", ...HAPPY, "FAILED")[5]).toBe("verification:failed:failed");
    expect(view("FAILED", ...HAPPY.slice(0, 8), "FAILED")[4]).toBe("execution:failed:failed");
  });

  it("shows cancellation without calling it a failure", () => {
    expect(view("CANCELLED", "CANCELLED")[0]).toBe("contract:unverified:cancelled");
  });
});

describe("state labels and tones", () => {
  it("labels every state", () => {
    for (const s of TASK_STATES) expect(TASK_STATE_LABELS[s]).toMatch(/\w/);
  });

  it("maps tones sensibly", () => {
    expect(stateTone("VERIFIED")).toBe("verified");
    expect(stateTone("APPROVAL_PENDING")).toBe("approval");
    expect(stateTone("BLOCKED")).toBe("failed");
    expect(stateTone("CANCELLED")).toBe("unverified");
    expect(stateTone("EXECUTING")).toBe("info");
  });

  it("recognises task states", () => {
    expect(isTaskState("VERIFIED")).toBe(true);
    expect(isTaskState("verified")).toBe(false);
  });
});
