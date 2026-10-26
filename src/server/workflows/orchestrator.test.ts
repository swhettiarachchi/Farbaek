import { describe, expect, it } from "vitest";
import { advanceWorkflow, resultFor, settleStep, type OrchestratorDeps } from "./orchestrator";

const person = { orgId: "o1", userId: "u-owner", role: "owner" as const, permissions: {} };

function fakes(over: { claims?: Awaited<ReturnType<OrchestratorDeps["claimNext"]>>[]; states?: Record<string, string>; person?: boolean; start?: "ok" | string; step?: { status: string } | null } = {}) {
  const claims = [...(over.claims ?? [{ result: "started", step: 1, taskId: "t1", capUnits: 1_000, approvedBy: "u-owner" }])];
  const log: string[] = [];
  const deps: OrchestratorDeps = {
    claimNext: async () => claims.shift() ?? { result: "busy", step: null, taskId: null, capUnits: null, approvedBy: null },
    stepResult: async (_w, step, result, detail) => {
      log.push(`result ${step} ${result}: ${detail}`);
    },
    attachRun: async (_w, step, run) => {
      log.push(`attach ${step} ${run}`);
    },
    taskState: async (_o, task) => over.states?.[task] ?? "CONTRACT_APPROVED",
    person: async () => (over.person === false ? null : person),
    startRun: async (_p, task, cap) => {
      log.push(`start ${task} cap ${cap}`);
      return over.start && over.start !== "ok" ? { ok: false, code: "PERMISSION_WITHHELD", message: over.start } : { ok: true, value: { runId: "run-1" } };
    },
    stepForTask: async () => (over.step === null ? null : { workflowId: "w1", orgId: "o1", step: 1, status: over.step?.status ?? "running" }),
  };
  return { deps, log };
}

describe("advanceWorkflow", () => {
  it("starts the claimed step's run, capped at its share, as the approver", async () => {
    const f = fakes();
    expect(await advanceWorkflow(f.deps, { id: "w1", orgId: "o1" })).toBe("started");
    expect(f.log).toEqual(["start t1 cap 1000", "attach 1 run-1"]);
  });

  it("passes on what the database said when nothing is due", async () => {
    const f = fakes({ claims: [{ result: "checkpoint", step: 1, taskId: null, capUnits: null, approvedBy: null }] });
    expect(await advanceWorkflow(f.deps, { id: "w1", orgId: "o1" })).toBe("checkpoint");
    expect(f.log).toEqual([]);
  });

  it("counts a step done by hand before its turn, and moves on", async () => {
    const f = fakes({
      claims: [
        { result: "started", step: 1, taskId: "t1", capUnits: 1_000, approvedBy: "u-owner" },
        { result: "started", step: 2, taskId: "t2", capUnits: 1_000, approvedBy: "u-owner" },
      ],
      states: { t1: "VERIFIED" },
    });
    expect(await advanceWorkflow(f.deps, { id: "w1", orgId: "o1" })).toBe("started");
    expect(f.log).toEqual(["result 1 verified: Verified before its turn.", "start t2 cap 1000", "attach 2 run-1"]);
  });

  it("stops the workflow with words when the run can't start, or the approver has left", async () => {
    const refused = fakes({ start: "An owner or admin turned off starting agent runs for you in this workspace." });
    expect(await advanceWorkflow(refused.deps, { id: "w1", orgId: "o1" })).toBe("failed");
    expect(refused.log.at(-1)).toBe("result 1 failed: Step 1 couldn't start: An owner or admin turned off starting agent runs for you in this workspace.");
    const gone = fakes({ person: false });
    await advanceWorkflow(gone.deps, { id: "w1", orgId: "o1" });
    expect(gone.log).toEqual(["result 1 failed: The person who approved this workflow isn't in the workspace any more, so its runs can't start."]);
  });
});

describe("settleStep", () => {
  it("maps the task's state to the step's result", () => {
    expect(resultFor("VERIFIED")?.result).toBe("verified");
    expect(resultFor("APPROVAL_PENDING")?.result).toBe("waiting");
    expect(resultFor("FAILED")?.result).toBe("failed");
    expect(resultFor("CONTRACT_APPROVED")?.detail).toBe("The agent's run ended without a change to apply.");
    expect(resultFor("VERIFYING")).toBeNull();
    expect(resultFor("EXECUTING")).toBeNull();
  });

  it("records a verified step and starts the next one", async () => {
    const f = fakes({ states: { t9: "VERIFIED" }, claims: [{ result: "started", step: 2, taskId: "t2", capUnits: 1_000, approvedBy: "u-owner" }] });
    expect(await settleStep(f.deps, "t9")).toBe("started");
    expect(f.log).toEqual(["result 1 verified: Verified.", "start t2 cap 1000", "attach 2 run-1"]);
  });

  it("waits for review, stops on failure, and leaves work in progress alone", async () => {
    const review = fakes({ states: { t9: "APPROVAL_PENDING" } });
    expect(await settleStep(review.deps, "t9")).toBe("waiting");
    expect(review.log).toEqual(["result 1 waiting: The change is waiting for review."]);
    const still = fakes({ states: { t9: "APPROVAL_PENDING" }, step: { status: "waiting" } });
    expect(await settleStep(still.deps, "t9")).toBe("waiting");
    expect(still.log).toEqual([]);
    const failed = fakes({ states: { t9: "FAILED" } });
    expect(await settleStep(failed.deps, "t9")).toBe("failed");
    const checking = fakes({ states: { t9: "VERIFYING" } });
    expect(await settleStep(checking.deps, "t9")).toBeNull();
    expect(await settleStep(fakes({ step: null }).deps, "t9")).toBeNull();
    expect(await settleStep(fakes({ step: { status: "verified" } }).deps, "t9")).toBeNull();
  });
});
