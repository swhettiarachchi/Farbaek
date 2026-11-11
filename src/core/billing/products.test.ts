import { describe, expect, it } from "vitest";
import { BILLABLE_PLANS, chargeCents, getPlan } from "./catalog";
import { PRICE_LIST_VERSION, currentPack, currentProduct } from "./products";
import { TOPUP_PACKS_CENTS } from "./topups";

describe("the price list (ADR 0185)", () => {
  it("names the prices its products were made at: change PRICE_LIST_VERSION whenever a price changes", () => {
    // The database keeps one product per plan and price list, so a new price recorded under the old list is refused.
    const prices = Object.fromEntries(BILLABLE_PLANS.filter((p) => p.pricing.kind === "paid").map((p) => [p.id, chargeCents(p)]));
    expect({ version: PRICE_LIST_VERSION, prices, packs: TOPUP_PACKS_CENTS }).toEqual({
      version: "2026-11-11.1",
      prices: { lite_monthly: 100, lite: 1200, maker_monthly: 199, maker: 2388, starter: 999, plus: 1999, pro: 5000, studio: 7999, max: 10000, max_2x: 20000, max_3x: 30000 },
      packs: [1000, 2500, 5000],
    });
  });
});

const row = (planId: string, amountCents: number, createdAt: string, productId = `pdt_${planId}_${amountCents}`) => ({ planId, amountCents, createdAt, productId });

describe("which product checkout charges (ADR 0185)", () => {
  // Production on 2026-11-11: every plan's product from price list 2026-10-18.1, Lite's at 99 cents and $11.88.
  const before = [row("lite_monthly", 99, "2026-10-29T08:00:00+00:00"), row("lite", 1188, "2026-10-29T08:00:01+00:00"), row("starter", 999, "2026-10-29T08:00:02+00:00")];

  it("finds no product for a plan whose price changed, so nobody is charged the old price", () => {
    expect([chargeCents(getPlan("lite_monthly")), chargeCents(getPlan("lite"))]).toEqual([100, 1200]);
    expect(currentProduct(before, "lite_monthly")).toBeNull();
    expect(currentProduct(before, "lite")).toBeNull();
  });

  it("keeps every other plan on the product it already has, whatever price list made it", () => {
    expect(currentProduct(before, "starter")?.productId).toBe("pdt_starter_999");
    expect(currentProduct(before, "maker")).toBeNull();
  });

  it("uses the new product once it's recorded at the new price, and the newest when there are two", () => {
    const after = [...before, row("lite_monthly", 100, "2026-11-11T10:00:00+00:00"), row("lite", 1200, "2026-11-11T10:00:01+00:00")];
    expect(currentProduct(after, "lite_monthly")?.productId).toBe("pdt_lite_monthly_100");
    expect(currentProduct(after, "lite")?.productId).toBe("pdt_lite_1200");
    const again = [...after, row("lite", 1200, "2026-11-12T09:00:00+00:00", "pdt_lite_again")];
    expect(currentProduct(again, "lite")?.productId).toBe("pdt_lite_again");
  });

  it("never picks another plan's product at the same price", () => {
    expect(currentProduct([row("lite_monthly", 999, "2026-11-11T10:00:00+00:00")], "starter")).toBeNull();
  });

  it("has no product for Free or a contract", () => {
    expect(currentProduct([row("free", 0, "2026-11-11T10:00:00+00:00")], "free")).toBeNull();
    expect(currentProduct([], "enterprise")).toBeNull();
  });

  it("buys a top-up pack with its newest product", () => {
    const packs = [
      { packCents: 1000, productId: "pdt_10_old", createdAt: "2026-10-29T08:00:00+00:00" },
      { packCents: 1000, productId: "pdt_10_new", createdAt: "2026-11-11T10:00:00+00:00" },
      { packCents: 2500, productId: "pdt_25", createdAt: "2026-10-29T08:00:00+00:00" },
    ];
    expect(currentPack(packs, 1000)?.productId).toBe("pdt_10_new");
    expect(currentPack(packs, 2500)?.productId).toBe("pdt_25");
    expect(currentPack(packs, 5000)).toBeNull();
  });
});
