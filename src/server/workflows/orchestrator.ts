/**
 * Runs governed workflows forward (ADR 0092). Every call is safe to repeat:
 * the database claims each step under a lock, so the hooks (a run ending,
 * checks finishing) and the hourly sweep can all call in without starting a
 * step twice. A step's run starts as the person who approved the workflow,
 * through the same checks as any run; a refusal stops the workflow with
 * words, and nothing is retried on its own.
 */
import { WORKFLOW_PLAN_CHANGED } from "@/core/realityloop/workflow";
import type { WriteResult } from "@/server/workspace/use-cases";
import type { RunPerson } from "@/server/cloud-agent/executor";

export type StepResult = "verified" | "waiting" | "failed";

export interface OrchestratorDeps {
  /** Whether every step is still the plan that was approved (ADR 0092). Null when the workflow can't be read. */
  stillAsApproved(workflowId: string, orgId: string): Promise<boolean | null>;
  /** Stops the workflow, with the reason people will read. */
  halt(workflowId: string, reason: string): Promise<void>;
  claimNext(workflowId: string): Promise<{ result: string; step: number | null; taskId: string | null; capUnits: number | null; approvedBy: string | null }>;
  stepResult(workflowId: string, step: number, result: StepResult, detail: string | null): Promise<void>;
  attachRun(workflowId: string, step: number, runId: string): Promise<void>;
  taskState(orgId: string, taskId: string): Promise<string | null>;
  /** The approver as a run's person now: their role and permissions, or null when they've left. */
  person(orgId: string, userId: string): Promise<RunPerson | null>;
  startRun(person: RunPerson, taskId: string, capUnits: number): Promise<WriteResult<{ runId: string }>>;
  /** The workflow step a task belongs to, if any. */
  stepForTask(taskId: string): Promise<{ workflowId: string; orgId: string; step: number; status: string } | null>;
}

/**
 * Starts every step that's due: the next step, or all the steps of a team
 * (ADR 0128), each on its own run. Returns what happened, in the database's
 * words ("started", "busy", "checkpoint", "finished"…).
 */
export async function advanceWorkflow(deps: OrchestratorDeps, workflow: { id: string; orgId: string }): Promise<string> {
  // Runs act as the person who approved, so they only run what that person approved (ADR 0175).
  const asApproved = await deps.stillAsApproved(workflow.id, workflow.orgId);
  if (asApproved === false) {
    await deps.halt(workflow.id, WORKFLOW_PLAN_CHANGED);
    return "halted";
  }
  if (asApproved === null) return "busy";
  let started = false;
  for (let i = 0; i < 9; i++) {
    const c = await deps.claimNext(workflow.id);
    if (c.result !== "started" || c.step === null || !c.taskId || c.capUnits === null) return started && c.result === "busy" ? "started" : c.result;
    // Done by hand before its turn: count it and move on.
    if ((await deps.taskState(workflow.orgId, c.taskId)) === "VERIFIED") {
      await deps.stepResult(workflow.id, c.step, "verified", "Verified before its turn.");
      continue;
    }
    const person = c.approvedBy ? await deps.person(workflow.orgId, c.approvedBy) : null;
    if (!person) {
      await deps.stepResult(workflow.id, c.step, "failed", "The person who approved this workflow isn't in the workspace any more, so its runs can't start.");
      return "failed";
    }
    const run = await deps.startRun(person, c.taskId, c.capUnits);
    if (!run.ok) {
      await deps.stepResult(workflow.id, c.step, "failed", `Step ${c.step} couldn't start: ${run.message}`);
      return "failed";
    }
    await deps.attachRun(workflow.id, c.step, run.value.runId);
    // Keep claiming: a teammate in the same stage starts now too.
    started = true;
  }
  return started ? "started" : "busy";
}

/** What a step's task state means for the workflow, or null when it's still in progress. */
export function resultFor(state: string | null): { result: StepResult; detail: string } | null {
  switch (state) {
    case "VERIFIED":
      return { result: "verified", detail: "Verified." };
    case "APPROVAL_PENDING":
      return { result: "waiting", detail: "The change is waiting for review." };
    case "FAILED":
      return { result: "failed", detail: "The step's checks failed." };
    case "PARTIALLY_VERIFIED":
      return { result: "failed", detail: "Only some of the step's checks passed." };
    case "BLOCKED":
      return { result: "failed", detail: "The rules stopped the step's change." };
    case "CONTRACT_APPROVED":
      return { result: "failed", detail: "The agent's run ended without a change to apply." };
    case "CANCELLED":
    case "REJECTED":
    case "EXPIRED":
      return { result: "failed", detail: "The step's task was closed." };
    default:
      // Running, applying or checking: nothing to record yet.
      return null;
  }
}

/** After a run ends or a task's checks finish: records how the step went, then carries on if it can. */
export async function settleStep(deps: OrchestratorDeps, taskId: string): Promise<string | null> {
  const step = await deps.stepForTask(taskId);
  if (!step || (step.status !== "running" && step.status !== "waiting")) return null;
  const outcome = resultFor(await deps.taskState(step.orgId, taskId));
  if (!outcome) return null;
  // A waiting step stays waiting until its change is applied and checked.
  if (outcome.result === "waiting" && step.status === "waiting") return "waiting";
  await deps.stepResult(step.workflowId, step.step, outcome.result, outcome.detail);
  if (outcome.result !== "verified") return outcome.result;
  return advanceWorkflow(deps, { id: step.workflowId, orgId: step.orgId });
}
