/**
 * One way to subscribe (ADR 0197). Every Subscribe button links to
 * `/subscribe/<plan>`, whatever state the visitor is in; that page signs them
 * in, makes their first workspace if they have none, and hands over to
 * Billing's review step, which these rules settle.
 */
import { getPlan, yearlyVersionOf, type Plan } from "./catalog";
import type { PaidPlanId } from "./provider";
import { isPaidPlanId } from "./provider-state";

/** Where every Subscribe button goes. */
export function subscribePath(planId: PaidPlanId): string {
  return `/subscribe/${planId}`;
}

/** Billing's review step for a plan: the cart, with its consent box and the way to checkout. */
export function billingChoosePath(planId: PaidPlanId): string {
  return `/app/billing?choose=${planId}#billing-step`;
}

/** The plan a sign-in is for, when it will carry on to a subscribe link; null for anything else. */
export function planFromSubscribeNext(next: string): PaidPlanId | null {
  const match = /^\/subscribe\/([a-z0-9_]{1,20})$/.exec(next);
  const id = match?.[1];
  return isPaidPlanId(id) ? id : null;
}

/** A plan's name without its billing period: "Lite" for both Lite and Lite yearly. */
export function baseName(plan: Plan): string {
  return plan.yearlyOf ? getPlan(plan.yearlyOf).name : plan.name;
}

/** The monthly and yearly versions of a plan that has both (Lite and Maker, ADR 0105); null for every other plan. */
export function billingPeriods(planId: PaidPlanId): { monthly: PaidPlanId; yearly: PaidPlanId } | null {
  const plan = getPlan(planId);
  const monthly = plan.yearlyOf ?? plan.id;
  const yearly = yearlyVersionOf(monthly);
  return isPaidPlanId(monthly) && isPaidPlanId(yearly) ? { monthly, yearly } : null;
}

/** What Billing knows when someone arrives with `?choose=<plan>`. */
export type SubscribeState = {
  /** Checkout is open to this workspace. */
  open: boolean;
  /** An owner or admin, who may change the plan. */
  manager: boolean;
  /** Why nothing can be saved here right now (a workspace Farbaek paused, a server without its write key); null when it can. */
  blocked: string | null;
  /** The subscription as last read from its provider. */
  subscription: { planId: string; provider: "dodo" | "apple" | "google"; state: string } | null;
};

/** Where a chosen plan leads in Billing. Every answer is shown to the person; none is a silent dead end. */
export type SubscribeStep =
  /** The review step: price, what's included, consent, then checkout. */
  | { kind: "choose"; planId: PaidPlanId }
  /** Already paying through Dodo Payments: the change step, with its proration preview. */
  | { kind: "change"; planId: PaidPlanId }
  /** The plan they already have. */
  | { kind: "current"; planId: PaidPlanId }
  /** Billed through a store, so it changes there (ADR 0112, ADR 0154). */
  | { kind: "store"; planId: PaidPlanId; store: "apple" | "google" }
  /** Members other than owners and admins can't choose plans. */
  | { kind: "not_manager"; planId: PaidPlanId }
  /** An owner or admin, but nothing can be saved here right now. */
  | { kind: "blocked"; planId: PaidPlanId; reason: string }
  /** The plan is set to end: it's kept first, then changed. */
  | { kind: "cancelling"; planId: PaidPlanId }
  /** Checkout isn't open: the page already says so. */
  | { kind: "closed"; planId: PaidPlanId };

export function subscribeStep(choose: unknown, state: SubscribeState): SubscribeStep | null {
  if (!isPaidPlanId(choose)) return null;
  if (!state.open) return { kind: "closed", planId: choose };
  if (!state.manager) return { kind: "not_manager", planId: choose };
  if (state.blocked !== null) return { kind: "blocked", planId: choose, reason: state.blocked };
  const sub = state.subscription;
  if (!sub) return { kind: "choose", planId: choose };
  if (sub.provider !== "dodo") return sub.planId === choose ? { kind: "current", planId: choose } : { kind: "store", planId: choose, store: sub.provider };
  if (sub.state === "cancellation_scheduled") return { kind: "cancelling", planId: choose };
  if (sub.planId === choose) return { kind: "current", planId: choose };
  return { kind: "change", planId: choose };
}
