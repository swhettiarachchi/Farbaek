/**
 * The Model Change Canary (ADR 0090): Farbaek's own sample tasks, proposed
 * by the current model and by a candidate, compared side by side. It never
 * uses customer work. The report says what differed; it decides nothing.
 */
import { RATE_CARD, USD_PER_UNIT, costUnits, reserveUnits, type ModelId } from "../billing/rate-card";

export const CANARY_REPORT_SCHEMA = "farbaek.model-canary/v1";
/** The most a proposal call may write: the Anthropic proposer's own limit, so the estimate never runs low. */
export const CANARY_MAX_OUTPUT_TOKENS = 16_000;

/** The exact rate-card model, or null when Farbaek has no price for it. */
export function pricedModel(model: string): ModelId | null {
  return (Object.keys(RATE_CARD) as ModelId[]).find((m) => m === model) ?? null;
}

/**
 * The most a canary could cost, at list price, with every call using its
 * full output allowance. An unpriced candidate is priced as the most
 * expensive model, so the estimate never runs low.
 */
export function estimateCanary(promptTokens: readonly number[], current: string, candidate: string): { units: number; usd: number } {
  const units = promptTokens.reduce((n, p) => n + reserveUnits(current, p, CANARY_MAX_OUTPUT_TOKENS) + reserveUnits(candidate, p, CANARY_MAX_OUTPUT_TOKENS), 0);
  return { units, usd: units * USD_PER_UNIT };
}

export interface CanarySide {
  model: string;
  /** The model that answered, as the provider reported it; it can differ after a refusal fallback. */
  answeredBy: string | null;
  ok: boolean;
  /** Why it produced no usable proposal, in words. */
  failure: string | null;
  files: string[];
  violations: number;
  outcome: string | null;
  inputTokens: number;
  outputTokens: number;
  units: number;
  ms: number;
}

export interface CanaryTaskReport {
  taskId: string;
  title: string;
  current: CanarySide;
  candidate: CanarySide;
}

export interface CanaryTotals {
  valid: number;
  violations: number;
  units: number;
  ms: number;
}

export interface CanaryReport {
  schema: typeof CANARY_REPORT_SCHEMA;
  family: "anthropic";
  tier: string;
  current: string;
  candidate: string;
  tasks: CanaryTaskReport[];
  totals: { current: CanaryTotals; candidate: CanaryTotals };
  differences: string[];
  startedAt: string;
  finishedAt: string;
}

export function sideUnits(model: string, usage: { inputTokens: number; outputTokens: number }): number {
  return costUnits(model, { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens });
}

function totals(sides: CanarySide[]): CanaryTotals {
  return {
    valid: sides.filter((s) => s.ok).length,
    violations: sides.reduce((n, s) => n + s.violations, 0),
    units: sides.reduce((n, s) => n + s.units, 0),
    ms: sides.reduce((n, s) => n + s.ms, 0),
  };
}

const sameFiles = (a: string[], b: string[]) => a.length === b.length && [...a].sort().every((f, i) => f === [...b].sort()[i]);

function percent(candidate: number, current: number): string | null {
  if (current <= 0) return null;
  const change = Math.round(((candidate - current) / current) * 100);
  if (Math.abs(change) < 5) return null;
  return change > 0 ? `${change}% more` : `${-change}% less`;
}

/** The report, with its differences in plain sentences. */
export function compareRuns(input: { tier: string; current: string; candidate: string; tasks: CanaryTaskReport[]; startedAt: string; finishedAt: string }): CanaryReport {
  const current = totals(input.tasks.map((t) => t.current));
  const candidate = totals(input.tasks.map((t) => t.candidate));
  const n = input.tasks.length;
  const differences: string[] = [];
  if (candidate.valid !== current.valid) {
    differences.push(`The candidate gave a usable proposal for ${candidate.valid} of ${n} tasks; the current model for ${current.valid}.`);
  }
  const otherFiles = input.tasks.filter((t) => t.current.ok && t.candidate.ok && !sameFiles(t.current.files, t.candidate.files)).length;
  if (otherFiles) differences.push(`On ${otherFiles} ${otherFiles === 1 ? "task" : "tasks"}, the candidate changed different files.`);
  if (candidate.violations !== current.violations) {
    differences.push(`The candidate's proposals broke the contract ${candidate.violations} ${candidate.violations === 1 ? "time" : "times"}; the current model's ${current.violations}.`);
  }
  const otherOutcome = input.tasks.filter((t) => t.current.ok && t.candidate.ok && t.current.outcome !== t.candidate.outcome).length;
  if (otherOutcome) differences.push(`On ${otherOutcome} ${otherOutcome === 1 ? "task" : "tasks"}, the policy decided differently about the candidate's proposal.`);
  const cost = percent(candidate.units, current.units);
  if (cost) differences.push(`The candidate cost ${cost} at list price.`);
  const time = percent(candidate.ms, current.ms);
  if (time) differences.push(`The candidate took ${time} time.`);
  if (differences.length === 0) differences.push("No difference worth noting: the same usable proposals, files, contract checks and policy outcomes, at about the same cost and time.");
  return {
    schema: CANARY_REPORT_SCHEMA,
    family: "anthropic",
    tier: input.tier,
    current: input.current,
    candidate: input.candidate,
    tasks: input.tasks,
    totals: { current, candidate },
    differences,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
  };
}
