/**
 * The owner's suggested prices (the brief of 2026-11-22: $3.99, $20, $50, $100 and $200 a month), worked through the same
 * formula today's plans use (allowance.ts), so the answer to "what can each price include and still keep 57%?" is
 * arithmetic, not opinion.
 *
 * A suggestion, not the catalog: nothing here is sold. No live plan or price changes until the owner says so (the plan
 * names, the hours of test space and the seats below are suggestions to decide on).
 *
 * Two margins, kept apart on purpose:
 * - **Contribution margin** is what the brief asks for: the price, less what one more subscriber costs (the payment fee,
 *   their storage, their test space and their AI usage).
 * - **Net margin** also takes a share of fixed costs (the server, email, domains). allowance.ts sizes every allowance so
 *   that net margin is 57% even when a subscriber uses all of it. Contribution margin is therefore never below 57%.
 */
import { ECONOMICS, allowanceFor, costBudgetUsd, type Allowance } from "./allowance";
import { USD_PER_UNIT, costUsd, type ModelId, type TokenUsage } from "./rate-card";

export interface SuggestedPlan {
  key: "starter" | "plus" | "pro" | "business" | "scale";
  name: string;
  priceUsd: number;
  /** Hours of test space a month. A suggestion; the formula refuses a number the price can't pay for. */
  sandboxHours: number;
  /** People who share the plan's allowance. A suggestion. */
  seats: number;
  who: string;
}

export const SUGGESTED_PLANS: readonly SuggestedPlan[] = [
  { key: "starter", name: "Starter", priceUsd: 3.99, sandboxHours: 0, seats: 1, who: "Everyday questions and writing." },
  { key: "plus", name: "Plus", priceUsd: 20, sandboxHours: 2, seats: 1, who: "Daily use, research, and a first site or app." },
  { key: "pro", name: "Pro", priceUsd: 50, sandboxHours: 10, seats: 1, who: "Building for a living: the agent, stronger models, more test space." },
  { key: "business", name: "Business", priceUsd: 100, sandboxHours: 25, seats: 5, who: "A small team sharing projects and one allowance." },
  { key: "scale", name: "Scale", priceUsd: 200, sandboxHours: 60, seats: 15, who: "A larger team, or agents that run most days." },
];

/** The payment provider's worst case on one monthly charge (allowance.ts has the source and the date). */
export function paymentFeeUsd(chargeUsd: number): number {
  return chargeUsd * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
}

export interface PlanEconomics {
  plan: SuggestedPlan;
  allowance: Allowance;
  paymentFeeUsd: number;
  /** What one subscriber costs in a month when they use everything the plan includes. */
  variableAtFullUseUsd: number;
  contributionMarginAtFullUse: number;
  netMarginAtFullUse: number;
}

/** What one subscriber costs at a share of full use: the fee and storage always, test space and AI by how much is used. */
export function variableCostUsd(plan: SuggestedPlan, use: number): number {
  const a = allowanceFor(plan.priceUsd, plan.sandboxHours);
  return paymentFeeUsd(plan.priceUsd) + ECONOMICS.snapshotUsd + (a.sandboxUsd + a.modelBudgetUsd) * Math.min(1, Math.max(0, use));
}

export function planEconomics(plan: SuggestedPlan): PlanEconomics {
  const allowance = allowanceFor(plan.priceUsd, plan.sandboxHours);
  const variable = variableCostUsd(plan, 1);
  return {
    plan,
    allowance,
    paymentFeeUsd: paymentFeeUsd(plan.priceUsd),
    variableAtFullUseUsd: variable,
    contributionMarginAtFullUse: (plan.priceUsd - variable) / plan.priceUsd,
    netMarginAtFullUse: (plan.priceUsd - variable - ECONOMICS.fixedShareUsd) / plan.priceUsd,
  };
}

/**
 * One message and its answer, for guidance only: a question with some of the conversation before it (1,500 tokens in)
 * and a few paragraphs back (500 out). Real turns vary widely; files, pictures, web research and long answers cost more.
 */
export const SAMPLE_CHAT_TURN: TokenUsage = { inputTokens: 1_500, cacheWriteTokens: 0, cacheReadTokens: 0, outputTokens: 500 };

/** About how many sample chat turns an allowance covers on one model. Guidance, never a promise. */
export function chatTurnsGuide(aiUnits: number, model: ModelId): number {
  return Math.floor((aiUnits * USD_PER_UNIT) / costUsd(model, SAMPLE_CHAT_TURN));
}

/**
 * The same price charged once a year: the provider's fixed fee is paid once instead of twelve times. It matters most for
 * the smallest plan, where 40 cents is a tenth of the price. Returns the money for AI each month.
 */
export function aiBudgetYearlyUsd(plan: SuggestedPlan): number {
  const monthly = costBudgetUsd(plan.priceUsd * 12) / 12 - ECONOMICS.fixedShareUsd - ECONOMICS.snapshotUsd - plan.sandboxHours * ECONOMICS.sandboxHourUsd;
  return Math.max(0, monthly);
}

export type PlanMix = Record<SuggestedPlan["key"], number>;

/** An assumption for the scenarios below, not a measurement: most subscribers on the two smallest plans. */
export const ASSUMED_MIX: PlanMix = { starter: 0.45, plus: 0.35, pro: 0.12, business: 0.05, scale: 0.03 };
/** An assumption: on average people use six tenths of what their plan includes. */
export const ASSUMED_USE = 0.6;

export interface Scenario {
  subscribers: number;
  monthlyRevenueUsd: number;
  yearlyRevenueUsd: number;
  revenuePerSubscriberUsd: number;
  variableCostUsd: number;
  contributionUsd: number;
  contributionMargin: number;
}

/** Revenue and contribution for a number of subscribers, a mix of plans and a share of full use. Arithmetic on assumptions. */
export function scenario(subscribers: number, mix: PlanMix = ASSUMED_MIX, use: number = ASSUMED_USE): Scenario {
  const total = Object.values(mix).reduce((sum, share) => sum + share, 0);
  if (Math.abs(total - 1) > 1e-9) throw new Error("A plan mix's shares must add up to 1.");
  let revenue = 0;
  let variable = 0;
  for (const plan of SUGGESTED_PLANS) {
    const count = subscribers * mix[plan.key];
    revenue += count * plan.priceUsd;
    variable += count * variableCostUsd(plan, use);
  }
  return {
    subscribers,
    monthlyRevenueUsd: revenue,
    yearlyRevenueUsd: revenue * 12,
    revenuePerSubscriberUsd: subscribers > 0 ? revenue / subscribers : 0,
    variableCostUsd: variable,
    contributionUsd: revenue - variable,
    contributionMargin: revenue > 0 ? (revenue - variable) / revenue : 0,
  };
}
