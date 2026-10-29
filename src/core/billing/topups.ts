/**
 * AI usage top-ups (ADR 0102): more of a paid plan's AI usage, bought in
 * packs at the plan's own rate, lasting 12 months, never past the monthly
 * limit an owner or admin sets. Lite and Maker buy at Starter's rate (ADR
 * 0105). Pure; the database enforces the limit.
 */
import { getPlan, isYearly } from "./catalog";
import type { PaidPlanId } from "./provider";
import type { SubscriptionState } from "./trial";

/** Pack prices in US cents. */
export const TOPUP_PACKS_CENTS = [1000, 2500, 5000] as const;
export type TopupPack = (typeof TOPUP_PACKS_CENTS)[number];

/** How long a top-up lasts. */
export const TOPUP_MONTHS = 12;

/** The most a monthly limit can be, in US cents. */
export const TOPUP_CAP_MAX_CENTS = 100_000;

/** Plans that can top up: a paid subscription that's still running, even with a payment due or a cancellation scheduled. */
export const TOPUP_STATES: ReadonlySet<SubscriptionState> = new Set(["active", "past_due", "cancellation_scheduled"]);

export function isTopupPack(value: unknown): value is TopupPack {
  return typeof value === "number" && (TOPUP_PACKS_CENTS as readonly number[]).includes(value);
}

/**
 * Units a pack adds: the plan's own rate (its monthly AI usage per dollar of
 * its price), so a top-up keeps the plan's margin. The plan's price already
 * paid for its sandbox time and fixed costs, so this rate is conservative.
 * Lite and Maker use Starter's rate: their own allowance includes Free's,
 * which their price doesn't pay for, so their rate would lose money.
 */
export function topupUnits(planId: PaidPlanId, cents: number): number {
  const rate = getPlan(isYearly(planId) ? "starter" : planId);
  if (rate.pricing.kind !== "paid" || rate.limits.aiUnitsPerMonth === null) return 0;
  return Math.floor((cents / rate.pricing.monthlyCents) * rate.limits.aiUnitsPerMonth);
}

/** About what share of a month of the plan's AI usage a pack adds, as a whole percent, for display: units are never shown. */
export function topupSharePercent(planId: PaidPlanId, cents: number): number {
  const plan = getPlan(planId);
  if (plan.pricing.kind !== "paid") return 0;
  if (isYearly(planId)) return plan.limits.aiUnitsPerMonth ? Math.round((topupUnits(planId, cents) / plan.limits.aiUnitsPerMonth) * 100) : 0;
  return Math.round((cents / plan.pricing.monthlyCents) * 100);
}

/** The exact words a person agrees to before a top-up checkout. Stored with a hash. */
export function topupConsentText(planId: PaidPlanId, cents: number): string {
  const plan = getPlan(planId);
  const dollars = (cents / 100).toFixed(2);
  return `I agree to pay $${dollars} USD once, or the same amount in the currency I choose at checkout with Dodo Payments' conversion fee of up to 4% added, plus any applicable tax calculated at checkout, for about ${topupSharePercent(planId, cents)}% of a month of Farbaek ${plan.name} AI usage. It lasts ${TOPUP_MONTHS} months and is used after my plan's own usage.`;
}
