import { describe, expect, it } from "vitest";
import { nextAction, unapprovedSteps, WorkflowDraftSchema, workflowHash, type WorkflowStepView, type WorkflowView } from "./workflow";

const step = (position: number, over: Partial<WorkflowStepView> = {}): WorkflowStepView => ({
  position,
  title: `Step ${position}`,
  notes: "",
  checkpoint: false,
  taskId: `t${position}`,
  runId: null,
  status: "pending",
  detail: null,
  contract: { status: "approved", sha256: String(position).repeat(64), version: 1 },
  startedAt: null,
  finishedAt: null,
  ...over,
});
const view = (over: Partial<WorkflowView> = {}): WorkflowView => ({
  id: "w1",
  projectId: "p1",
  title: "Checkout",
  status: "draft",
  waitingReason: null,
  haltedReason: null,
  ceilingUnits: 30_000,
  approvedBy: null,
  approvedAt: null,
  approvedSha256: null,
  createdAt: "2026-10-26T00:00:00Z",
  steps: [step(1), step(2)],
  ...over,
});

describe("governed workflows", () => {
  it("accepts 2 to 8 titled steps and a ceiling", () => {
    expect(WorkflowDraftSchema.safeParse({ title: "Checkout", steps: [{ title: "Cart" }, { title: "Page", checkpoint: true }], ceilingUnits: 30_000 }).success).toBe(true);
    const one = WorkflowDraftSchema.safeParse({ title: "Checkout", steps: [{ title: "Cart" }], ceilingUnits: 30_000 });
    expect(one.success ? null : one.error.issues[0]!.message).toBe("A workflow has at least 2 steps.");
    expect(WorkflowDraftSchema.safeParse({ title: "Checkout", steps: [{ title: "Ca" }, { title: "Page" }], ceilingUnits: 30_000 }).success).toBe(false);
    expect(WorkflowDraftSchema.safeParse({ title: "Checkout", steps: [{ title: "Cart" }, { title: "Page" }], ceilingUnits: 10 }).success).toBe(false);
  });

  it("binds the approval to the exact steps, contracts and ceiling", async () => {
    const base = await workflowHash(view());
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(await workflowHash(view({ steps: [step(2), step(1)] }))).toBe(base);
    expect(await workflowHash(view({ ceilingUnits: 40_000 }))).not.toBe(base);
    expect(await workflowHash(view({ steps: [step(1), step(2, { contract: { status: "approved", sha256: "f".repeat(64), version: 2 } })] }))).not.toBe(base);
    expect(await workflowHash(view({ steps: [step(1), step(2, { checkpoint: true })] }))).not.toBe(base);
  });

  it("says what happens next", () => {
    expect(unapprovedSteps(view({ steps: [step(1), step(2, { contract: null })] }))).toHaveLength(1);
    expect(nextAction(view({ steps: [step(1), step(2, { contract: null })] }))).toBe("Draft and approve the contract for 1 step, then an owner or admin approves the workflow.");
    expect(nextAction(view())).toMatch(/approves the workflow to start it/);
    expect(nextAction(view({ status: "running", steps: [step(1, { status: "running" }), step(2)] }))).toBe("The agent is working on step 1: Step 1.");
    expect(nextAction(view({ status: "waiting", waitingReason: "checkpoint", steps: [step(1, { status: "verified", checkpoint: true }), step(2)] }))).toBe("Step 1 is verified, and it's a checkpoint. Look at it, then continue.");
    expect(nextAction(view({ status: "waiting", waitingReason: "review", steps: [step(1, { status: "waiting" }), step(2)] }))).toMatch(/^Step 1's change is waiting for review/);
    expect(nextAction(view({ status: "halted", haltedReason: "The checks failed." }))).toBe("Stopped: The checks failed. Fix it on the step's task, or cancel the workflow.");
  });
});
