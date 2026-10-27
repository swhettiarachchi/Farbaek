/**
 * How a provider's subscription maps onto Farbaek's billing state (spec §23.4,
 * ADR 0100). Pure: the webhook processor re-fetches the subscription and
 * passes it here, so the order events arrive in never matters.
 */
import { PAID_PLAN_IDS, PLAN_ORDER, getPlan } from "./catalog";
import type { NormalizedSubscription, PaidPlanId } from "./provider";
import type { SubscriptionState } from "./trial";

export interface AppliedState {
  state: SubscriptionState;
  /** Null once a subscription has ended. */
  paidPlanId: PaidPlanId | null;
  /** Paid access runs to here when cancelling, and renews here otherwise. */
  paidThrough: Date | null;
  suspendedReason: "payment" | "paused" | null;
  cancelAtPeriodEnd: boolean;
  /** Paid usage periods follow this day of the month (`currentGrant`). */
  startedAt: Date;
}

export type StateChange = { kind: "apply"; value: AppliedState } | { kind: "none"; reason: "pending" | "failed" };

export function isPaidPlanId(value: unknown): value is PaidPlanId {
  return typeof value === "string" && value !== "enterprise" && (PAID_PLAN_IDS as readonly string[]).includes(value);
}

export function mapSubscription(sub: NormalizedSubscription, planId: PaidPlanId, now: Date): StateChange {
  const base = { paidPlanId: planId, paidThrough: sub.nextBillingDate, suspendedReason: null, cancelAtPeriodEnd: sub.cancelAtPeriodEnd, startedAt: sub.createdAt };
  const periodLeft = sub.nextBillingDate !== null && sub.nextBillingDate.getTime() > now.getTime();
  switch (sub.status) {
    // Not paid yet, or the mandate failed: whatever the workspace had stays.
    case "pending":
      return { kind: "none", reason: "pending" };
    case "failed":
      return { kind: "none", reason: "failed" };
    case "active":
      return { kind: "apply", value: { ...base, state: sub.cancelAtPeriodEnd && periodLeft ? "cancellation_scheduled" : "active" } };
    // A renewal failed: access stays while the person updates their card.
    case "past_due":
      return { kind: "apply", value: { ...base, state: "past_due" } };
    case "on_hold":
      return { kind: "apply", value: { ...base, state: "suspended", suspendedReason: "payment" } };
    case "paused":
      return { kind: "apply", value: { ...base, state: "suspended", suspendedReason: "paused" } };
    // The period was paid for, so access lasts to its end.
    case "cancelled":
      return periodLeft
        ? { kind: "apply", value: { ...base, state: "cancellation_scheduled", cancelAtPeriodEnd: true } }
        : { kind: "apply", value: { ...base, state: "expired", paidPlanId: null, paidThrough: null, cancelAtPeriodEnd: false } };
    case "expired":
      return { kind: "apply", value: { ...base, state: "expired", paidPlanId: null, paidThrough: null, cancelAtPeriodEnd: false } };
  }
}

/** Whether moving from one plan to another is an upgrade (charged now, prorated) or a downgrade (at the period's end). */
export function planChangeDirection(from: PaidPlanId, to: PaidPlanId): "upgrade" | "downgrade" | "same" {
  const a = PLAN_ORDER.indexOf(from);
  const b = PLAN_ORDER.indexOf(to);
  if (a === b) return "same";
  return b > a ? "upgrade" : "downgrade";
}

/** The exact words a person agrees to before checkout. Stored with a hash, so the record shows what they saw. */
export function checkoutConsentText(planId: PaidPlanId, onTrial: boolean): string {
  const plan = getPlan(planId);
  if (plan.pricing.kind !== "paid") throw new Error(`Not a paid plan: ${planId}`);
  const amount = (plan.pricing.monthlyCents / 100).toFixed(2);
  const trial = onTrial ? " Billing starts today, and my remaining trial days end now." : "";
  return `I agree to pay $${amount} USD a month, plus any applicable tax calculated at checkout, for Farbaek ${plan.name} until I cancel. I can cancel at any time in Billing, and my plan then runs to the end of the period I paid for.${trial}`;
}
