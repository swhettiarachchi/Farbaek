import { describe, expect, it } from "vitest";
import { getPlan } from "./catalog";
import { allowanceFor } from "./allowance";
import { TOPUP_PACKS_CENTS, isTopupPack, topupConsentText, topupSharePercent, topupUnits } from "./topups";

describe("top-ups", () => {
  it("add usage at the plan's own rate", () => {
    const pro = getPlan("pro");
    // $50 of top-up on Pro ($50 a month) is about one month of Pro's AI usage.
    expect(topupUnits("pro", 5000)).toBe(pro.limits.aiUnitsPerMonth);
    expect(topupUnits("pro", 1000)).toBe(Math.floor(pro.limits.aiUnitsPerMonth! / 5));
    expect(topupSharePercent("pro", 1000)).toBe(20);
    expect(topupSharePercent("starter", 1000)).toBe(100);
  });

  it("never give more than the plan's own budget would for the same money", () => {
    for (const id of ["starter", "plus", "pro", "studio", "max", "max_2x", "max_3x"] as const) {
      const plan = getPlan(id);
      if (plan.pricing.kind !== "paid") continue;
      const budget = allowanceFor(plan.pricing.monthlyCents / 100, plan.limits.sandboxHours ?? 0);
      for (const cents of TOPUP_PACKS_CENTS) {
        expect(topupUnits(id, cents)).toBeLessThanOrEqual(Math.floor((cents / plan.pricing.monthlyCents) * budget.aiUnits));
        expect(topupUnits(id, cents)).toBeGreaterThan(0);
      }
    }
  });

  it("know their packs", () => {
    expect(isTopupPack(1000)).toBe(true);
    expect(isTopupPack(2500)).toBe(true);
    expect(isTopupPack(999)).toBe(false);
    expect(isTopupPack("1000")).toBe(false);
  });

  it("state the amount, the currency choice, the fee and how long it lasts", () => {
    const text = topupConsentText("pro", 2500);
    expect(text).toContain("$25.00 USD once");
    expect(text).toContain("conversion fee of up to 4%");
    expect(text).toContain("about 50% of a month of Farbaek Pro AI usage");
    expect(text).toContain("lasts 12 months");
    expect(text.length).toBeLessThanOrEqual(1000);
    expect(text).not.toContain("—");
  });
});
