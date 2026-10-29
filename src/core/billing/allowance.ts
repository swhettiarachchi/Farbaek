/**
 * How much each plan can include, from one formula, so allowances can't
 * drift from the cost research (reports/AI coding platform costs and
 * pricing.md, October 2026).
 *
 * Net profit is 57% of the price, after every fee and cost (the owner's
 * target, 2026-10-28, ADR 0103). Payments go through Dodo Payments, which
 * takes 4% + 40 cents, plus 1.5% for cards outside the US, 0.5% on
 * subscriptions and 3% for PayPal or Klarna: at worst 9% + 40 cents. So a
 * plan can spend 0.34 × price − $0.40 on everything it includes. From that
 * come, in order: a share of fixed costs, snapshot storage, the plan's
 * sandbox hours, and a 5% hold-back that pays for free retries. What's left
 * is AI usage, metered in units at provider list prices (rate-card.ts).
 */
import { USD_PER_UNIT, sampleSessionUnits, type ModelId } from "./rate-card";

export const ECONOMICS = {
  /** Net profit as a share of the price, after every fee and cost (ADR 0103). */
  margin: 0.57,
  /**
   * Dodo Payments' worst case per payment (dodopayments.com/pricing, read 2026-10-28): 4% + 40 cents, +1.5% outside
   * the US, +0.5% for subscriptions, +3% for PayPal or Klarna. Tax is added on top at checkout, and the currency
   * conversion fee is the customer's (Fees Inclusive off), so neither comes out of the price.
   */
  paymentPercent: 0.09,
  paymentFixedUsd: 0.4,
  /** About $80 a month of fixed costs (the server, email, domains, Dodo's $25 SWIFT payout) over an assumed 200 subscribers. */
  fixedShareUsd: 0.4,
  /** 2 GB of sandbox snapshot storage per subscriber. */
  snapshotUsd: 0.16,
  /** Vercel Sandbox at 2 vCPU / 4 GB and 25% CPU, per provisioned hour. */
  sandboxHourUsd: 0.149,
  /** Share of the AI budget held back to refund failed attempts. */
  retryHoldback: 0.05,
  /** What one more Lite or Maker account adds to running costs a month: site storage, backups and email (ADR 0105). */
  lightMarginalUsd: 0.05,
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

/**
 * Lite and Maker (ADR 0105). They pay for what they add on top of Free, whose
 * allowance Farbaek gives everyone anyway, plus their own small running cost;
 * the server's fixed costs are already carried by the monthly plans' share.
 * Free's units and sandbox hours come in as `base`.
 *
 * Billed yearly (`months` 12), the 40-cent fee is paid once a year, leaving
 * room for more AI usage. Billed monthly, the fee is paid every month: Maker
 * still keeps 57%, but a 99-cent charge can't, so monthly Lite adds no AI
 * usage at all (the owner accepted its lower margin, 2026-10-29).
 */
export function lightAllowance(chargeUsd: number, months: 1 | 12, base: { aiUnits: number; sandboxHours: number }, extraSandboxHours: number, retries: boolean): Allowance {
  const budget = costBudgetUsd(chargeUsd) / months - ECONOMICS.lightMarginalUsd;
  const sandboxUsd = extraSandboxHours * ECONOMICS.sandboxHourUsd;
  if (extraSandboxHours > 0 && budget - sandboxUsd <= 0) throw new Error(`A $${chargeUsd} charge can't add ${extraSandboxHours} sandbox hours at a ${ECONOMICS.margin * 100}% margin.`);
  const modelBudgetUsd = Math.max(0, budget - sandboxUsd);
  const retryUsd = retries ? modelBudgetUsd * ECONOMICS.retryHoldback : 0;
  return {
    costBudgetUsd: budget,
    sandboxUsd,
    modelBudgetUsd,
    aiUnits: base.aiUnits + Math.floor((modelBudgetUsd - retryUsd) / USD_PER_UNIT),
    retryUnits: Math.floor(retryUsd / USD_PER_UNIT),
    sandboxHours: base.sandboxHours + extraSandboxHours,
  };
}

/** Guidance only: about how many typical agent sessions an allowance covers on a model. */
export function sessionsGuide(aiUnits: number, model: ModelId = "claude-sonnet-5-5"): number {
  return Math.floor(aiUnits / sampleSessionUnits(model));
}
