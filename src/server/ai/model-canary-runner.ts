/**
 * Runs a Model Change Canary (ADR 0090) in the background: each of
 * Farbaek's sample tasks is proposed by the current model and by the
 * candidate, judged with the same contract checks and policy a real
 * proposal gets, and the report is recorded with its hash. Nothing here
 * switches a model; an owner decides from the report.
 */
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { compareRuns, estimateCanary, sideUnits, type CanaryReport, type CanarySide, type CanaryTaskReport } from "@/core/ai/model-canary";
import { buildChanges, checkProposal } from "@/core/realityloop/change-proposal";
import { canonicalHash, sha256Hex } from "@/core/trust/canonical-json";
import { evaluateChangePolicy } from "@/core/trust/policy";
import { CANARY_SUITE, type CanaryTask } from "@/content/canary-suite";
import type { ChangeProposer, ProposalBrief } from "./change-proposer";
import type { DraftFailure } from "./contract-drafter";
import { proposalPromptTokens } from "./prompts";

export interface CanaryRunDeps {
  proposer(model: string): ChangeProposer;
  finish(input: { id: string; status: "finished"; report: CanaryReport; sha256: string } | { id: string; status: "failed"; failure: string }): Promise<void>;
  now(): Date;
  /** Milliseconds, for timing each call. */
  clock(): number;
}

const FAILURE_WORDS: Record<DraftFailure, string> = {
  REFUSED: "The model declined the request.",
  INCOMPLETE: "The output was cut off or didn't match the proposal shape.",
  PROVIDER_BUSY: "Anthropic was busy or timed out.",
  PROVIDER_ERROR: "The call failed.",
};

/** What a canary would cost at most, at list price: both models, every sample task, full output. */
export function estimateSuite(current: string, candidate: string, suite: readonly CanaryTask[] = CANARY_SUITE): { units: number; usd: number } {
  return estimateCanary(suite.map((t) => proposalPromptTokens(briefFor(t))), current, candidate);
}

export function briefFor(task: CanaryTask): ProposalBrief {
  return {
    contract: task.contract,
    taskTitle: task.title,
    projectName: task.projectName,
    paths: task.files.map((f) => f.path),
    files: task.files.filter((f) => task.context.includes(f.path)),
    notes: task.notes,
  };
}

async function side(deps: CanaryRunDeps, model: string, task: CanaryTask): Promise<CanarySide> {
  const started = deps.clock();
  let outcome: Awaited<ReturnType<ChangeProposer["propose"]>>;
  try {
    outcome = await deps.proposer(model).propose(briefFor(task));
  } catch {
    outcome = { ok: false, failure: "PROVIDER_ERROR", usage: null };
  }
  const ms = Math.max(0, deps.clock() - started);
  const usage = outcome.usage;
  const base = {
    model,
    answeredBy: usage?.model ?? null,
    inputTokens: usage?.inputTokens ?? 0,
    outputTokens: usage?.outputTokens ?? 0,
    units: usage ? sideUnits(usage.model ?? model, usage) : 0,
    ms,
  };
  if (!outcome.ok) return { ...base, ok: false, failure: FAILURE_WORDS[outcome.failure], files: [], violations: 0, outcome: null };

  const context = await Promise.all(task.files.filter((f) => task.context.includes(f.path)).map(async (f) => ({ ...f, revision: 1, sha256: await sha256Hex(f.content) })));
  const { changes } = await buildChanges(outcome.output, context, new Set(task.files.map((f) => f.path)), WORKSPACE_LIMITS.maxFileBytes);
  if (changes.length === 0) return { ...base, ok: false, failure: "Nothing in the proposal could be applied.", files: [], violations: 0, outcome: null };
  const violations = checkProposal(task.contract, changes);
  const policy = await evaluateChangePolicy({ files: changes, contractViolations: violations, rules: null });
  return { ...base, ok: true, failure: null, files: changes.map((c) => c.path).sort(), violations: violations.length, outcome: policy.outcome };
}

/** Runs every task on both models, one call at a time, and records the report or why it stopped. Never throws. */
export async function runCanary(
  deps: CanaryRunDeps,
  run: { id: string; tier: string; current: string; candidate: string },
  suite: readonly CanaryTask[] = CANARY_SUITE,
): Promise<"finished" | "failed"> {
  try {
    const startedAt = deps.now().toISOString();
    const tasks: CanaryTaskReport[] = [];
    for (const task of suite) {
      const current = await side(deps, run.current, task);
      const candidate = await side(deps, run.candidate, task);
      tasks.push({ taskId: task.id, title: task.title, current, candidate });
    }
    const report = compareRuns({ tier: run.tier, current: run.current, candidate: run.candidate, tasks, startedAt, finishedAt: deps.now().toISOString() });
    await deps.finish({ id: run.id, status: "finished", report, sha256: await canonicalHash(report) });
    return "finished";
  } catch (e) {
    await deps
      .finish({ id: run.id, status: "failed", failure: `The canary stopped: ${e instanceof Error ? e.message.slice(0, 200) : "unknown error"}.` })
      .catch(() => undefined);
    return "failed";
  }
}
