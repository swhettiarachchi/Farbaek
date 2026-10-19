/**
 * What the plan card needs beyond the task and contract: the likely share of
 * this period's AI usage a run would take, for each effort. Kept out of the
 * page so the clock is read here, not during render.
 */
import { estimateRunShare } from "@/core/agent/prompt-start";
import { EFFORTS, route, type Effort } from "@/core/agent/routing";
import { currentGrant } from "@/core/billing/wallet";
import { resolveAiProvider } from "@/server/ai/config";
import type { WorkspaceSummary } from "./organizations";

export type RunEstimates = Record<Effort, { low: number; high: number; model: string } | null>;

export function runEstimates(ws: WorkspaceSummary, now = new Date()): RunEstimates {
  const family = resolveAiProvider().provider ?? "anthropic";
  const trial = ws.trial ? { startedAt: new Date(ws.trial.startedAt), endsAt: new Date(ws.trial.endsAt) } : undefined;
  const periodUnits = ws.billingUnknown ? null : (currentGrant(ws.plan, trial, now)?.units ?? null);
  const out = {} as RunEstimates;
  for (const effort of EFFORTS) {
    const model = route({ plan: ws.plan, family, step: "write", effort }).model;
    const share = estimateRunShare({ model, effort, periodUnits });
    out[effort] = share ? { ...share, model } : null;
  }
  return out;
}
