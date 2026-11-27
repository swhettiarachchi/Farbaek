/**
 * What Build's workspace says of a plan (stage 202, ADR 0219; stage 286, ADR 0294).
 *
 * The workspace is where most plans are approved since Build starts in one place, and an approval covers the whole plan.
 * So every part of the plan that the plan's own page shows is here too: nothing is approved that was not put in front of
 * the person. A new part of a plan that people approve goes into this function, the plan block and its test together.
 */
import { sayOperation } from "@/components/app/contract-view";
import type { IntentContract } from "@/core/realityloop/contract";
import type { WorkbenchPlan } from "./types";

export type PlanWords = Omit<WorkbenchPlan, "approved" | "approve">;

const said = (lines: readonly string[]) => lines.map((line) => line.trim()).filter(Boolean);

export function planWords(contract: IntentContract, kept: readonly string[]): PlanWords {
  return {
    outcome: contract.outcome,
    changes: contract.allowedOperations.length ? contract.allowedOperations.map(sayOperation).join(", ") : "Nothing yet: the plan allows no changes.",
    resources: contract.scope.resources,
    checks: contract.acceptanceCriteria.map((a) => a.statement),
    requiredChecks: said(contract.requiredChecks),
    kept: [...kept],
    recovery: contract.recovery,
    assumptions: said(contract.assumptions),
    questions: contract.openQuestions,
  };
}
