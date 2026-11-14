import { describe, expect, it } from "vitest";
import { getPlan, SELF_SERVE_PLANS } from "./catalog";
import { isPaidPlanId } from "./provider-state";
import { baseName, billingChoosePath, billingPeriods, planFromSubscribeNext, subscribePath, subscribeStep, type SubscribeState } from "./subscribe";

const open: SubscribeState = { open: true, manager: true, blocked: null, subscription: null };
const paying = (planId: string, provider: "dodo" | "apple" | "google" = "dodo", state = "active") => ({ ...open, subscription: { planId, provider, state } });

describe("subscribe links", () => {
  it("gives every paid self-serve plan one address, and Billing's review step", () => {
    for (const plan of SELF_SERVE_PLANS) {
      if (!isPaidPlanId(plan.id)) continue;
      expect(subscribePath(plan.id)).toBe(`/subscribe/${plan.id}`);
      expect(planFromSubscribeNext(subscribePath(plan.id))).toBe(plan.id);
    }
    expect(billingChoosePath("pro")).toBe("/app/billing?choose=pro#billing-step");
  });

  it("reads the plan back only from an exact subscribe path", () => {
    expect(planFromSubscribeNext("/subscribe/lite")).toBe("lite");
    for (const next of ["/app", "/subscribe/free", "/subscribe/enterprise", "/subscribe/nope", "/subscribe/pro/x", "/subscribe/pro?x=1", "//subscribe/pro", "/subscribe/", "/subscribe/PRO"]) {
      expect(planFromSubscribeNext(next)).toBeNull();
    }
  });
});

describe("billing periods", () => {
  it("pairs Lite and Maker with their yearly versions, from either side", () => {
    const lite = billingPeriods("lite_monthly");
    expect(lite).not.toBeNull();
    expect(getPlan(lite!.monthly).pricing).toMatchObject({ interval: "month" });
    expect(getPlan(lite!.yearly).pricing).toMatchObject({ interval: "year" });
    expect(billingPeriods(lite!.yearly)).toEqual(lite);
    expect(billingPeriods("maker_monthly")).not.toBeNull();
  });

  it("has nothing to switch for plans billed one way", () => {
    expect(billingPeriods("pro")).toBeNull();
    expect(billingPeriods("max_3x")).toBeNull();
  });

  it("names a plan without its period", () => {
    const lite = billingPeriods("lite_monthly")!;
    expect(baseName(getPlan(lite.yearly))).toBe(getPlan(lite.monthly).name);
    expect(baseName(getPlan("pro"))).toBe("Pro");
  });
});

describe("where a chosen plan leads in Billing", () => {
  it("ignores anything that isn't a paid plan", () => {
    for (const choose of [undefined, "", "free", "enterprise", "nope", ["pro"], 5]) expect(subscribeStep(choose, open)).toBeNull();
  });

  it("opens the review step for a workspace that doesn't pay yet", () => {
    expect(subscribeStep("pro", open)).toEqual({ kind: "choose", planId: "pro" });
  });

  it("says so when checkout isn't open, before anything else", () => {
    expect(subscribeStep("pro", { ...paying("pro"), open: false, manager: false })).toEqual({ kind: "closed", planId: "pro" });
  });

  it("explains that only owners and admins choose plans", () => {
    expect(subscribeStep("pro", { ...open, manager: false, blocked: "Paused" })).toEqual({ kind: "not_manager", planId: "pro" });
  });

  it("gives an owner the real reason when nothing can be saved, never 'ask an owner'", () => {
    expect(subscribeStep("pro", { ...open, blocked: "Farbaek has paused this workspace." })).toEqual({ kind: "blocked", planId: "pro", reason: "Farbaek has paused this workspace." });
  });

  it("asks to keep a plan that is set to end before switching it", () => {
    expect(subscribeStep("max", paying("pro", "dodo", "cancellation_scheduled"))).toEqual({ kind: "cancelling", planId: "max" });
    expect(subscribeStep("pro", paying("pro", "dodo", "cancellation_scheduled"))).toEqual({ kind: "cancelling", planId: "pro" });
  });

  it("turns another plan into a change for someone already paying through Dodo Payments", () => {
    expect(subscribeStep("max", paying("pro"))).toEqual({ kind: "change", planId: "max" });
    expect(subscribeStep("max", paying("pro", "dodo", "past_due"))).toEqual({ kind: "change", planId: "max" });
  });

  it("recognises the plan they already have", () => {
    expect(subscribeStep("pro", paying("pro"))).toEqual({ kind: "current", planId: "pro" });
    expect(subscribeStep("pro", paying("pro", "apple"))).toEqual({ kind: "current", planId: "pro" });
  });

  it("sends store-billed plans back to their store", () => {
    expect(subscribeStep("max", paying("pro", "apple"))).toEqual({ kind: "store", planId: "max", store: "apple" });
    expect(subscribeStep("max", paying("pro", "google", "cancellation_scheduled"))).toEqual({ kind: "store", planId: "max", store: "google" });
  });
});
