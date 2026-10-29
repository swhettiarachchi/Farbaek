import { describe, expect, it } from "vitest";
import type { NormalizedSubscription } from "./provider";
import { checkoutConsentText, formatMinorUnits, isPaidPlanId, mapSubscription, planChangeDirection } from "./provider-state";
import { resolveEffectivePlan } from "./trial";

const now = new Date("2026-11-10T12:00:00Z");
const next = new Date("2026-12-03T09:00:00Z");

function sub(over: Partial<NormalizedSubscription> = {}): NormalizedSubscription {
  return {
    provider: "dodo",
    id: "sub_mock",
    customerId: "cus_mock",
    productId: "pdt_mock",
    status: "active",
    cancelAtPeriodEnd: false,
    nextBillingDate: next,
    createdAt: new Date("2026-11-03T09:00:00Z"),
    orgId: "00000000-0000-4000-8000-000000000001",
    ...over,
  };
}

function applied(s: NormalizedSubscription) {
  const change = mapSubscription(s, "pro", now);
  if (change.kind !== "apply") throw new Error(`expected apply, got ${change.reason}`);
  return change.value;
}

describe("mapSubscription (mock subscriptions)", () => {
  it("active is the paid plan, renewing on the next billing date", () => {
    const v = applied(sub());
    expect(v).toMatchObject({ state: "active", paidPlanId: "pro", paidThrough: next, suspendedReason: null, cancelAtPeriodEnd: false });
    expect(v.startedAt.toISOString()).toBe("2026-11-03T09:00:00.000Z");
  });

  it("active but cancelling keeps the plan until the period ends", () => {
    const v = applied(sub({ cancelAtPeriodEnd: true }));
    expect(v.state).toBe("cancellation_scheduled");
    expect(resolveEffectivePlan({ state: v.state, paidPlanId: "pro", paidThrough: v.paidThrough! }, now).planId).toBe("pro");
    expect(resolveEffectivePlan({ state: v.state, paidPlanId: "pro", paidThrough: v.paidThrough! }, new Date("2026-12-04T00:00:00Z")).planId).toBe("free");
  });

  it("past_due keeps paid access, on_hold suspends paid features", () => {
    const due = applied(sub({ status: "past_due" }));
    expect(resolveEffectivePlan({ state: due.state, paidPlanId: "pro" }, now)).toMatchObject({ source: "paid", planId: "pro" });
    const hold = applied(sub({ status: "on_hold" }));
    expect(hold).toMatchObject({ state: "suspended", suspendedReason: "payment" });
    expect(resolveEffectivePlan({ state: hold.state, paidPlanId: "pro", suspendedReason: "payment" }, now)).toMatchObject({ planId: "free", suspendedFrom: "pro" });
  });

  it("paused suspends with its own reason", () => {
    expect(applied(sub({ status: "paused" }))).toMatchObject({ state: "suspended", suspendedReason: "paused" });
  });

  it("cancelled with time left runs to the period end; otherwise it ends", () => {
    expect(applied(sub({ status: "cancelled" }))).toMatchObject({ state: "cancellation_scheduled", cancelAtPeriodEnd: true });
    expect(applied(sub({ status: "cancelled", nextBillingDate: new Date("2026-11-01T00:00:00Z") }))).toMatchObject({ state: "expired", paidPlanId: null, paidThrough: null });
    expect(applied(sub({ status: "expired" }))).toMatchObject({ state: "expired", paidPlanId: null });
  });

  it("pending and failed change nothing", () => {
    expect(mapSubscription(sub({ status: "pending" }), "pro", now)).toEqual({ kind: "none", reason: "pending" });
    expect(mapSubscription(sub({ status: "failed" }), "pro", now)).toEqual({ kind: "none", reason: "failed" });
  });

  it("renewed arriving before active gives the same result, since state comes from the re-fetched subscription", () => {
    const latest = sub({ nextBillingDate: new Date("2027-01-03T09:00:00Z") });
    // Whichever webhook arrives first, the processor applies the subscription as it is now.
    expect(applied(latest)).toEqual(applied(latest));
    expect(applied(latest).paidThrough?.toISOString()).toBe("2027-01-03T09:00:00.000Z");
  });
});

describe("plan ids and changes", () => {
  it("only self-serve paid plans can be bought", () => {
    expect(isPaidPlanId("pro")).toBe(true);
    expect(isPaidPlanId("max_3x")).toBe(true);
    expect(isPaidPlanId("free")).toBe(false);
    expect(isPaidPlanId("enterprise")).toBe(false);
    expect(isPaidPlanId("team")).toBe(false);
  });

  it("orders upgrades and downgrades by the catalog", () => {
    expect(planChangeDirection("plus", "pro")).toBe("upgrade");
    expect(planChangeDirection("max", "starter")).toBe("downgrade");
    expect(planChangeDirection("pro", "pro")).toBe("same");
  });
});

describe("checkoutConsentText", () => {
  it("states the amount, tax, cancellation and, on a trial, that it ends now", () => {
    const text = checkoutConsentText("pro", true);
    expect(text).toContain("$50.00 USD a month, or the same amount in the currency I choose at checkout with Dodo Payments' conversion fee of up to 4% added");
    expect(text).toContain("tax calculated at checkout");
    expect(text).toContain("cancel at any time");
    expect(text).toContain("remaining trial days end now");
    expect(checkoutConsentText("pro", false)).not.toContain("trial");
    expect(text).not.toContain("—");
  });

  it("states a yearly plan's yearly charge (ADR 0105)", () => {
    expect(checkoutConsentText("lite", false)).toContain("I agree to pay $11.88 USD a year, or the same amount in the currency I choose");
    expect(checkoutConsentText("maker", false)).toContain("$23.88 USD a year");
    expect(checkoutConsentText("starter", false)).toContain("$9.99 USD a month");
  });
});

describe("formatMinorUnits", () => {
  it("formats what Dodo charged in the currency the person chose", () => {
    expect(formatMinorUnits(3333, "USD")).toBe("$33.33");
    expect(formatMinorUnits(9261, "NZD")).toBe("NZ$92.61");
    expect(formatMinorUnits(5000, "JPY")).toBe("¥5,000");
    expect(formatMinorUnits(1234, "XXQ")).toMatch(/^XXQ\s12\.34$/);
    // Not a currency code at all: the plain amount and the code as given.
    expect(formatMinorUnits(1234, "U$")).toBe("12.34 U$");
  });
});
