/**
 * The owner's revenue numbers (ADR 0106), worked out from Farbaek's own
 * records: live subscriptions at their list price, paid top-ups, trials and
 * this month's AI list cost. Pure, so the office page and its tests agree.
 *
 * Every figure is an estimate and says so: Farbaek charges list prices, but
 * Dodo Payments adds tax, converts currencies and takes its fee, and only its
 * payouts are exact. Fees here are Dodo's worst case (ECONOMICS), so the real
 * margin is at least what's shown. Fixed costs (the server, email) aren't in.
 */
import { ECONOMICS } from "./allowance";
import { PLANS, chargeCents, getPlan, isYearly, type PlanId } from "./catalog";
import { isPaidPlanId } from "./provider-state";

export interface RevenueAccount {
  orgId: string;
  planId: string | null;
  state: string;
  mode: "test" | "live" | null;
  cancelAtPeriodEnd: boolean;
}

export interface RevenueTopup {
  packCents: number;
  mode: "test" | "live";
  paidAt: string | null;
}

export interface RevenueTrial {
  orgId: string;
  endsAt: string;
}

/** States in which a subscription is still being paid for. */
const PAYING = new Set(["active", "past_due", "cancellation_scheduled"]);

export interface PlanRevenue {
  planId: PlanId;
  name: string;
  workspaces: number;
  /** Monthly-equivalent list price of these subscriptions, in cents: a yearly plan counts a twelfth of its charge. */
  monthlyCents: number;
}

export interface Revenue {
  /** Monthly recurring revenue at list price, in cents. */
  mrrCents: number;
  payingWorkspaces: number;
  byPlan: PlanRevenue[];
  /** Live top-ups paid since the start of this month (UTC), in cents. */
  topupsCents: number;
  topupsCount: number;
  cancellationsScheduled: number;
  pastDue: number;
  /** Trials that ended in the last 90 days, and how many of those workspaces pay now. */
  trials: { ended: number; converted: number };
  /** This month's revenue against Dodo's worst-case fees and the AI list cost, or null with no revenue yet. */
  margin: { revenueCents: number; feesCents: number; aiCents: number; share: number } | null;
}

/** Dodo's worst-case fee on one charge, in cents (ECONOMICS: 9% + 40 cents). */
export function worstFeeCents(chargeCentsValue: number): number {
  return Math.round(chargeCentsValue * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd * 100);
}

export function computeRevenue(input: { accounts: RevenueAccount[]; topups: RevenueTopup[]; trials: RevenueTrial[]; aiUsd: number; now: Date }): Revenue {
  const monthStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1);
  const paying = input.accounts.filter((a) => a.mode === "live" && PAYING.has(a.state) && isPaidPlanId(a.planId));

  const payingOrgs = new Set(paying.map((a) => a.orgId));
  const byPlan = new Map<PlanId, PlanRevenue>();
  let feesCents = 0;
  for (const a of paying) {
    const plan = getPlan(a.planId as PlanId);
    if (plan.pricing.kind !== "paid") continue;
    const yearly = isYearly(plan.id);
    const monthly = yearly ? Math.round(chargeCents(plan) / 12) : plan.pricing.monthlyCents;
    const row = byPlan.get(plan.id) ?? { planId: plan.id, name: plan.name, workspaces: 0, monthlyCents: 0 };
    row.workspaces += 1;
    row.monthlyCents += monthly;
    byPlan.set(plan.id, row);
    // A yearly plan pays its fee once a year: a twelfth of it belongs to each month.
    feesCents += yearly ? Math.round(worstFeeCents(chargeCents(plan)) / 12) : worstFeeCents(plan.pricing.monthlyCents);
  }

  const topups = input.topups.filter((t) => t.mode === "live" && t.paidAt !== null && Date.parse(t.paidAt) >= monthStart);
  const topupsCents = topups.reduce((n, t) => n + t.packCents, 0);
  feesCents += topups.reduce((n, t) => n + worstFeeCents(t.packCents), 0);

  const ninetyDaysAgo = input.now.getTime() - 90 * 86_400_000;
  const ended = input.trials.filter((t) => {
    const at = Date.parse(t.endsAt);
    return at <= input.now.getTime() && at >= ninetyDaysAgo;
  });

  const order = (id: PlanId) => PLANS.findIndex((p) => p.id === id);
  const plans = [...byPlan.values()].sort((a, b) => order(a.planId) - order(b.planId));
  const mrrCents = plans.reduce((n, p) => n + p.monthlyCents, 0);
  const revenueCents = mrrCents + topupsCents;
  const aiCents = Math.round(input.aiUsd * 100);

  return {
    mrrCents,
    payingWorkspaces: paying.length,
    byPlan: plans,
    topupsCents,
    topupsCount: topups.length,
    cancellationsScheduled: paying.filter((a) => a.cancelAtPeriodEnd || a.state === "cancellation_scheduled").length,
    pastDue: paying.filter((a) => a.state === "past_due").length,
    trials: { ended: ended.length, converted: ended.filter((t) => payingOrgs.has(t.orgId)).length },
    margin: revenueCents > 0 ? { revenueCents, feesCents, aiCents, share: (revenueCents - feesCents - aiCents) / revenueCents } : null,
  };
}
