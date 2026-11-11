import { describe, expect, it } from "vitest";
import { APPLE_PRODUCTS, webNetUsd } from "./apple";
import { getPlan } from "./catalog";
import {
  GOOGLE_PLAY_PRODUCTS,
  googlePlayManageUrl,
  googlePlayNetUsd,
  googlePlayPredecessor,
  googlePlayProduct,
  googlePlayProductForPlan,
  nextGooglePlayCheck,
  readGooglePlaySubscription,
  type GooglePlaySubscription,
} from "./google-play";

const NOW = new Date("2026-11-03T12:00:00Z");
const day = 86_400_000;
const sub = (over: Partial<GooglePlaySubscription> = {}, item: NonNullable<GooglePlaySubscription["lineItems"]>[number] = {}): GooglePlaySubscription => ({
  subscriptionState: "SUBSCRIPTION_STATE_ACTIVE",
  startTime: new Date(NOW.getTime() - 40 * day).toISOString(),
  acknowledgementState: "ACKNOWLEDGEMENT_STATE_PENDING",
  lineItems: [{ productId: "farbaek_starter_monthly", expiryTime: new Date(NOW.getTime() + 28 * day).toISOString(), autoRenewingPlan: { autoRenewEnabled: true }, ...item }],
  ...over,
});

describe("plans bought through Google Play (ADR 0154)", () => {
  it("keeps at least what each plan keeps on the web, so its usage keeps the 57% margin", () => {
    for (const p of GOOGLE_PLAY_PRODUCTS) {
      expect(googlePlayNetUsd(p.usdCents), p.productId).toBeGreaterThanOrEqual(webNetUsd(p.planId));
      expect(getPlan(p.planId).pricing).toMatchObject({ kind: "paid", interval: "month" });
    }
    // At 30% the margin would be gone: Google's subscription fee is 15% from the first payment.
    expect(googlePlayNetUsd(googlePlayProduct("farbaek_starter_monthly")!.usdCents, 0.3)).toBeLessThan(webNetUsd("starter"));
  });

  it("sells the same plans at the same US prices as the App Store, with ids Play accepts", () => {
    // Lite is $1 on Google Play and the web (ADR 0185). The App Store's Lite is still $0.99 until App Store Connect
    // lets its price change: when apple.ts says 100 too, this exception goes.
    const apple = APPLE_PRODUCTS.map((p) => [p.planId, p.planId === "lite_monthly" && p.usdCents === 99 ? 100 : p.usdCents]);
    expect(GOOGLE_PLAY_PRODUCTS.map((p) => [p.planId, p.usdCents])).toEqual(apple);
    expect(googlePlayProduct("farbaek_lite_monthly")!.usdCents).toBe(100);
    for (const p of GOOGLE_PLAY_PRODUCTS) expect(p.productId).toMatch(/^[a-z0-9][a-z0-9_.]{0,99}$/);
    expect(googlePlayProductForPlan("plus")!.productId).toBe("farbaek_plus_monthly");
    expect(googlePlayProduct("com.farbaek.app.pro.monthly")).toBeNull();
    expect(googlePlayManageUrl("farbaek_pro_monthly")).toBe("https://play.google.com/store/account/subscriptions?sku=farbaek_pro_monthly&package=com.farbaek.app");
  });

  it("reads Google's answer as the workspace's billing state", () => {
    const read = (s: GooglePlaySubscription) => readGooglePlaySubscription(s, NOW);
    expect(read(sub())).toMatchObject({ kind: "apply", productId: "farbaek_starter_monthly", plan: { state: "active", planId: "starter", cancelAtPeriodEnd: false } });
    expect(read(sub({}, { autoRenewingPlan: { autoRenewEnabled: false } }))).toMatchObject({ plan: { state: "cancellation_scheduled", cancelAtPeriodEnd: true } });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" }))).toMatchObject({ plan: { state: "cancellation_scheduled" } });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_CANCELED" }, { expiryTime: new Date(NOW.getTime() - day).toISOString() }))).toMatchObject({
      plan: { state: "expired", planId: null, paidThrough: null },
    });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }))).toMatchObject({ plan: { state: "past_due" } });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_ON_HOLD" }))).toMatchObject({ plan: { state: "suspended", suspendedReason: "payment" } });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_PAUSED" }))).toMatchObject({ plan: { state: "suspended", suspendedReason: "paused" } });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }))).toMatchObject({ plan: { state: "expired" } });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED", canceledStateContext: { replacementCancellation: {} } }))).toEqual({ kind: "replaced", productId: "farbaek_starter_monthly" });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }))).toEqual({ kind: "pending", productId: "farbaek_starter_monthly" });
    expect(read(sub({ subscriptionState: "SUBSCRIPTION_STATE_PENDING_PURCHASE_CANCELED" })).kind).toBe("ignore");
    expect(read(sub({}, { productId: "someone_elses_plan" })).kind).toBe("ignore");
    expect(read(sub({ lineItems: [] })).kind).toBe("ignore");
    expect(read(sub({ lineItems: [{ productId: "farbaek_lite_monthly" }, { productId: "farbaek_pro_monthly" }] })).kind).toBe("ignore");
    const started = read(sub());
    expect(started.kind === "apply" && started.plan.startedAt).toEqual(new Date(NOW.getTime() - 40 * day));
  });

  it("names the token a plan change or a resubscribe replaced", () => {
    expect(googlePlayPredecessor(sub({ linkedPurchaseToken: "old.token" }))).toBe("old.token");
    expect(googlePlayPredecessor(sub({ outOfAppPurchaseContext: { expiredPurchaseToken: "lapsed.token" } }))).toBe("lapsed.token");
    expect(googlePlayPredecessor(sub())).toBeNull();
  });

  it("asks Google again on a schedule, since nothing is pushed", () => {
    const at = (s: GooglePlaySubscription, acknowledged: boolean) => nextGooglePlayCheck(readGooglePlaySubscription(s, NOW), acknowledged, NOW).getTime() - NOW.getTime();
    const minutes = (n: number) => n * 60_000;
    // Until acknowledged, every hourly run.
    expect(at(sub(), false)).toBe(minutes(50));
    // A live plan: just after it renews, and at least daily.
    expect(at(sub(), true)).toBe(day);
    expect(at(sub({}, { expiryTime: new Date(NOW.getTime() + minutes(30)).toISOString() }), true)).toBe(minutes(40));
    expect(at(sub({}, { expiryTime: new Date(NOW.getTime() - minutes(5)).toISOString() }), true)).toBe(minutes(10));
    expect(at(sub({ subscriptionState: "SUBSCRIPTION_STATE_IN_GRACE_PERIOD" }), true)).toBe(minutes(360));
    expect(at(sub({ subscriptionState: "SUBSCRIPTION_STATE_PENDING" }), false)).toBe(minutes(15));
    expect(at(sub({ subscriptionState: "SUBSCRIPTION_STATE_EXPIRED" }), true)).toBe(30 * day);
  });
});
