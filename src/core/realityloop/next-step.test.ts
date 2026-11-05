import { describe, expect, it } from "vitest";
import { taskNextStep, type NextStepFacts } from "./next-step";
import { TASK_STATES } from "./task-machine";

const facts = (over: Partial<NextStepFacts>): NextStepFacts => ({
  state: "RECEIVED",
  hasChange: false,
  changeExpired: false,
  canApprove: true,
  canAct: true,
  run: "none",
  fix: "none",
  canBuild: false,
  sandboxed: true,
  checking: false,
  checks: 1,
  canFix: false,
  canUndo: false,
  ...over,
});

describe("a task's next step (ADR 0170)", () => {
  it("says something plain for every state, with no jargon", () => {
    for (const state of TASK_STATES) {
      const step = taskNextStep(facts({ state }));
      expect(step.title.length, state).toBeGreaterThan(0);
      expect(step.body.length, state).toBeGreaterThan(0);
      expect(`${step.title} ${step.body} ${step.action?.label ?? ""}`, state).not.toMatch(/contract|proposal|lifecycle|sandbox|policy|runner|ProofPack|—/i);
    }
  });

  it("leads to the card that matters", () => {
    expect(taskNextStep(facts({ state: "CONTRACT_DRAFTED" }))).toMatchObject({ tone: "action", action: { label: "Read the plan", target: "plan" } });
    expect(taskNextStep(facts({ state: "CONTRACT_APPROVED", canBuild: true }))).toMatchObject({ action: { label: "Start building", target: "change" } });
    expect(taskNextStep(facts({ state: "APPROVAL_PENDING", hasChange: true }))).toMatchObject({ title: "The agent finished. Check what changed, then approve", action: { label: "Review the change", target: "change" } });
    expect(taskNextStep(facts({ state: "APPROVAL_PENDING" }))).toMatchObject({ action: { target: "plan" } });
    expect(taskNextStep(facts({ state: "RECOVERY_PENDING" }))).toMatchObject({ action: { target: "undo" } });
  });

  it("tells a stopped change from a plan the rules stopped", () => {
    expect(taskNextStep(facts({ state: "BLOCKED", hasChange: true }))).toMatchObject({ title: "This change went outside the plan", action: { target: "change" } });
    expect(taskNextStep(facts({ state: "BLOCKED" }))).toMatchObject({ title: "A rule stopped this plan", action: { target: "plan" } });
  });

  it("doesn't ask for an approval that can't happen", () => {
    const waiting = { state: "APPROVAL_PENDING" as const, hasChange: true };
    expect(taskNextStep(facts({ ...waiting, changeExpired: true }))).toMatchObject({ tone: "problem", title: "This change ran out of time", action: { label: "See the change" } });
    expect(taskNextStep(facts({ ...waiting, canApprove: false }))).toMatchObject({ tone: "idle", title: "This change needs someone else's approval" });
  });

  it("knows a run is going, though the task's state doesn't move during one", () => {
    const approved = { state: "CONTRACT_APPROVED" as const, canBuild: true };
    expect(taskNextStep(facts({ ...approved, run: "working" }))).toMatchObject({ tone: "working", title: "The agent is working", action: { target: "run" } });
    expect(taskNextStep(facts({ ...approved, run: "waiting" }))).toMatchObject({ tone: "action", action: { label: "Open the run", target: "run" } });
  });

  it("isn't anyone's turn who can't act", () => {
    for (const state of TASK_STATES) {
      const step = taskNextStep(facts({ state, canAct: false, canBuild: true, hasChange: true, canFix: true, canUndo: true }));
      expect(step.tone, state).not.toBe("action");
      expect(step.action?.label ?? "", state).not.toMatch(/^(Start|Write|Run|Ask|Undo)\b/);
    }
    expect(taskNextStep(facts({ state: "CONTRACT_DRAFTED", canAct: false }))).toMatchObject({ title: "This task is waiting for someone", action: { label: "See the plan", target: "plan" } });
  });

  it("points at a fix that already exists, instead of offering another", () => {
    for (const state of ["FAILED", "PARTIALLY_VERIFIED"] as const) {
      expect(taskNextStep(facts({ state, canFix: true, fix: "open" })), state).toMatchObject({ body: expect.stringContaining("A fix is open"), action: { label: "See the fix", target: "fix" } });
      expect(taskNextStep(facts({ state, canFix: true, fix: "fixed" })), state).toMatchObject({ body: "A follow-up task fixed it.", action: { label: "See the fix" } });
    }
  });

  it("doesn't promise building when it can't start", () => {
    expect(taskNextStep(facts({ state: "CONTRACT_APPROVED", canBuild: false }))).toMatchObject({ tone: "idle", action: { label: "See why", target: "change" } });
  });

  it("tells checking apart: no sandbox, running, nothing to check, and ready to run", () => {
    const verifying = { state: "VERIFYING" as const };
    expect(taskNextStep(facts({ ...verifying, sandboxed: false, canUndo: true }))).toMatchObject({ tone: "idle", action: { target: "undo" } });
    expect(taskNextStep(facts({ ...verifying, sandboxed: false }))).toMatchObject({ action: { target: "project" } });
    expect(taskNextStep(facts({ ...verifying, checking: true }))).toMatchObject({ tone: "working", action: null });
    expect(taskNextStep(facts({ ...verifying, checks: 0 }))).toMatchObject({ tone: "idle", action: { target: "project" } });
    expect(taskNextStep(facts(verifying))).toMatchObject({ tone: "action", action: { target: "checks" } });
    // Running them again wouldn't help, so it doesn't send anyone back to them.
    const unproven = taskNextStep(facts({ ...verifying, lastCheckUnverified: true, canUndo: true }));
    expect(unproven).toMatchObject({ tone: "idle", title: expect.stringMatching(/can't prove/), action: { target: "undo" } });
  });

  it("offers a fix only when the agent can make one, and says 'done' only of a finished task", () => {
    expect(taskNextStep(facts({ state: "FAILED", canFix: true }))).toMatchObject({ action: { target: "fix" } });
    expect(taskNextStep(facts({ state: "FAILED", canUndo: true }))).toMatchObject({ action: { target: "undo" } });
    expect(taskNextStep(facts({ state: "PARTIALLY_VERIFIED" }))).toMatchObject({ tone: "problem", action: { target: "details" } });
    const done = TASK_STATES.filter((state) => taskNextStep(facts({ state })).tone === "done");
    expect(done.sort()).toEqual(["RECOVERED", "VERIFIED"]);
  });
});
