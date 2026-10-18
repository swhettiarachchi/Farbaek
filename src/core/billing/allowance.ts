/**
 * How much each plan can include, from one formula, so allowances can't
 * drift from the cost research (reports/AI coding platform costs and
 * pricing.md, October 2026).
 *
 * Profit is 40% of the price after payment fees. Paddle (the processor that
 * works for a Sri Lanka-based seller) takes 5% + $0.50, so a plan can spend
 * 0.55 × price − $0.50 on everything it includes. From that come, in order:
 * a share of fixed costs, snapshot storage, the plan's sandbox hours, and a
 * 5% hold-back that pays for free retries. What's left is AI usage, metered
 * in units at provider list prices (rate-card.ts).
 */
import { USD_PER_UNIT, sampleSessionUnits, type ModelId } from "./rate-card";

export const ECONOMICS = {
  /** Profit as a share of the price. */
  margin: 0.4,
  /** Paddle: 5% + $0.50 per payment, sales tax included. */
  paymentPercent: 0.05,
  paymentFixedUsd: 0.5,
  /** About $80 a month of fixed costs (Vercel Pro, Supabase Pro, email, payout wire) over an assumed 200 subscribers. */
  fixedShareUsd: 0.4,
  /** 2 GB of sandbox snapshot storage per subscriber. */
  snapshotUsd: 0.16,
  /** Vercel Sandbox at 2 vCPU / 4 GB and 25% CPU, per provisioned hour. */
  sandboxHourUsd: 0.149,
  /** Share of the AI budget held back to refund failed attempts. */
  retryHoldback: 0.05,
} as const;

export interface Allowance {
  /** What the plan may spend in total per month (USD). */
  costBudgetUsd: number;
  sandboxUsd: number;
  modelBudgetUsd: number;
  /** AI usage people can spend each month, in units. */
  aiUnits: number;
  /** Units that free retries may give back each month. */
  retryUnits: number;
  sandboxHours: number;
}

export function costBudgetUsd(priceUsd: number): number {
  return priceUsd * (1 - ECONOMICS.margin - ECONOMICS.paymentPercent) - ECONOMICS.paymentFixedUsd;
}

/** The allowance a monthly price pays for, with a given number of sandbox hours. */
export function allowanceFor(priceUsd: number, sandboxHours: number): Allowance {
  const budget = costBudgetUsd(priceUsd);
  const sandboxUsd = sandboxHours * ECONOMICS.sandboxHourUsd;
  const modelBudgetUsd = budget - ECONOMICS.fixedShareUsd - ECONOMICS.snapshotUsd - sandboxUsd;
  if (modelBudgetUsd <= 0) throw new Error(`A $${priceUsd} plan can't include ${sandboxHours} sandbox hours at a ${ECONOMICS.margin * 100}% margin.`);
  const retryUsd = modelBudgetUsd * ECONOMICS.retryHoldback;
  return {
    costBudgetUsd: budget,
    sandboxUsd,
    modelBudgetUsd,
    aiUnits: Math.floor((modelBudgetUsd - retryUsd) / USD_PER_UNIT),
    retryUnits: Math.floor(retryUsd / USD_PER_UNIT),
    sandboxHours,
  };
}

/** Guidance only: about how many typical agent sessions an allowance covers on a model. */
export function sessionsGuide(aiUnits: number, model: ModelId = "claude-sonnet-5-5"): number {
  return Math.floor(aiUnits / sampleSessionUnits(model));
}
