import { describe, expect, it } from "vitest";
import { APPLE_PRODUCTS, appleNetUsd, appleProduct, appleSubscription, webNetUsd, type AppleTransaction } from "./apple";
import { getPlan } from "./catalog";

const NOW = new Date("2026-10-29T12:00:00Z");
const day = 86_400_000;
const tx = (over: Partial<AppleTransaction> = {}): AppleTransaction => ({
  transactionId: "2000000000000002",
  originalTransactionId: "2000000000000001",
  bundleId: "com.farbaek.app",
  productId: "com.farbaek.app.starter.monthly",
  purchaseDate: NOW.getTime() - 2 * day,
  originalPurchaseDate: NOW.getTime() - 40 * day,
  expiresDate: NOW.getTime() + 28 * day,
  environment: "Sandbox",
  ...over,
});

describe("plans bought through Apple (ADR 0112)", () => {
  it("keeps at least what each plan keeps on the web, so its usage keeps the 57% margin", () => {
    for (const p of APPLE_PRODUCTS) {
      expect(appleNetUsd(p.usdCents), p.productId).toBeGreaterThanOrEqual(webNetUsd(p.planId));
      expect(getPlan(p.planId).pricing).toMatchObject({ kind: "paid", interval: "month" });
    }
  });

  it("would lose the margin without the Small Business Program, which go-live requires", () => {
    const starter = appleProduct("com.farbaek.app.starter.monthly")!;
    expect(appleNetUsd(starter.usdCents, 0.3)).toBeLessThan(webNetUsd("starter"));
  });

  it("costs the same as the web for the cheap plans, and only a little more for the rest", () => {
    expect(appleProduct("com.farbaek.app.lite.monthly")!.usdCents).toBe(99);
    expect(appleProduct("com.farbaek.app.maker.monthly")!.usdCents).toBe(199);
    for (const p of APPLE_PRODUCTS) {
      const plan = getPlan(p.planId);
      const web = plan.pricing.kind === "paid" ? plan.pricing.monthlyCents : 0;
      expect(p.usdCents, p.productId).toBeLessThanOrEqual(Math.ceil(web * 1.1));
    }
    expect(APPLE_PRODUCTS.map((p) => p.productId.split(".")[3])).toEqual(["lite", "maker", "starter", "plus", "pro"]);
    expect(appleProduct("com.other.app.pro")).toBeNull();
  });

  it("reads Apple's records as the workspace's billing state", () => {
    expect(appleSubscription(tx(), { originalTransactionId: "1", autoRenewStatus: 1 }, NOW)).toMatchObject({ state: "active", planId: "starter", cancelAtPeriodEnd: false });
    expect(appleSubscription(tx(), null, NOW).state).toBe("active");
    expect(appleSubscription(tx(), { originalTransactionId: "1", autoRenewStatus: 0 }, NOW)).toMatchObject({ state: "cancellation_scheduled", cancelAtPeriodEnd: true });
    const lapsed = tx({ expiresDate: NOW.getTime() - day });
    expect(appleSubscription(lapsed, { originalTransactionId: "1", autoRenewStatus: 1, isInBillingRetryPeriod: true, gracePeriodExpiresDate: NOW.getTime() + 3 * day }, NOW)).toMatchObject({
      state: "past_due",
      paidThrough: new Date(NOW.getTime() + 3 * day),
    });
    expect(appleSubscription(lapsed, { originalTransactionId: "1", autoRenewStatus: 1, isInBillingRetryPeriod: true }, NOW)).toMatchObject({ state: "suspended", suspendedReason: "payment" });
    expect(appleSubscription(lapsed, { originalTransactionId: "1", autoRenewStatus: 1 }, NOW)).toMatchObject({ state: "expired", planId: null, paidThrough: null });
    expect(appleSubscription(tx({ revocationDate: NOW.getTime() - 1000 }), null, NOW).state).toBe("expired");
    expect(appleSubscription(tx(), null, NOW).startedAt).toEqual(new Date(NOW.getTime() - 40 * day));
  });
});
