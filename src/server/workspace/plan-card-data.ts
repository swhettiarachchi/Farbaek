/**
 * What the plan card needs beyond the task and contract: the likely share of
 * this period's AI usage a run would take, for each effort. Kept out of the
 * page so the clock is read here, not during render.
 */
import { estimateRunShare, shareOfPeriod } from "@/core/agent/prompt-start";
import { capShare, capUnitsFor, type CapChoice } from "@/core/agent/run-cap";
import { EFFORTS, type Effort } from "@/core/agent/routing";
import { routeModel } from "@/server/ai/routing";
import { currentGrant } from "@/core/billing/wallet";
import { resolveAiProvider } from "@/server/ai/config";
import type { WorkspaceSummary } from "./organizations";

export type RunEstimates = Record<Effort, { low: number; high: number; model: string } | null>;

/** This period's allowance in units (server-side only), or null when there's none or billing is unknown. */
export function periodUnits(ws: WorkspaceSummary, now = new Date()): number | null {
  if (ws.billingUnknown) return null;
  const trial = ws.trial ? { startedAt: new Date(ws.trial.startedAt), endsAt: new Date(ws.trial.endsAt) } : undefined;
  return currentGrant(ws.plan, trial, now)?.units ?? null;
}

export function runEstimates(ws: WorkspaceSummary, now = new Date()): RunEstimates {
  const family = resolveAiProvider().provider ?? "anthropic";
  const trial = ws.trial ? { startedAt: new Date(ws.trial.startedAt), endsAt: new Date(ws.trial.endsAt) } : undefined;
  const periodUnits = ws.billingUnknown ? null : (currentGrant(ws.plan, trial, now)?.units ?? null);
  const out = {} as RunEstimates;
  for (const effort of EFFORTS) {
    const model = routeModel({ plan: ws.plan, family, step: "write", effort }).model;
    const share = estimateRunShare({ model, effort, periodUnits });
    out[effort] = share ? { ...share, model } : null;
  }
  return out;
}

/**
 * A run's cap in units for the choice made on the plan card (ADR 0040),
 * worked out here from the workspace's own plan: the browser only says
 * which choice, never how many units.
 */
export function runCapUnits(ws: WorkspaceSummary, effort: Effort, choice: CapChoice, now = new Date()): number | null {
  const estimate = runEstimates(ws, now)[effort];
  return estimate ? capUnitsFor(choice, estimate.high, periodUnits(ws, now)) : null;
}

export type RunUsageView = { share: string | null; refunded: number; cap: string | null; capUsed: number | null } | null;

/** What a run has used, and against its cap when it has one, as the run page shows it. */
export function runUsageView(used: { settledUnits: number; refunded: number } | null, capUnits: number | null, ws: WorkspaceSummary, now = new Date()): RunUsageView {
  if (!used) return null;
  const units = periodUnits(ws, now);
  return {
    share: shareOfPeriod(used.settledUnits, units),
    refunded: used.refunded,
    cap: capUnits ? capShare(capUnits, units) : null,
    capUsed: capUnits ? Math.min(100, Math.round((used.settledUnits / capUnits) * 100)) : null,
  };
}
