import { describe, expect, it } from "vitest";
import {
  PLANS,
  TRIAL,
  annualMonthlyEquivalentCents,
  annualSavingsCents,
  cheapestPlanWithFeature,
  formatUsd,
  getPlan,
} from "./catalog";

describe("plan catalog", () => {
  it("matches the owner's published monthly and annual prices", () => {
    const prices = Object.fromEntries(
      PLANS.filter((p) => p.pricing.kind === "paid").map((p) => [
        p.id,
        p.pricing.kind === "paid" ? [p.pricing.monthlyCents, p.pricing.annualCents] : null,
      ]),
    );
    expect(prices).toEqual({
      developer: [1_900, 18_000],
      team: [7_900, 75_600],
      business: [24_900, 238_800],
    });
  });

  it("keeps annual totals, savings and monthly equivalents mathematically consistent", () => {
    const expected = {
      developer: { yearlyAtMonthly: 22_800, savings: 4_800, equivalent: 1_500 },
      team: { yearlyAtMonthly: 94_800, savings: 19_200, equivalent: 6_300 },
      business: { yearlyAtMonthly: 298_800, savings: 60_000, equivalent: 19_900 },
    } as const;

    for (const [id, want] of Object.entries(expected)) {
      const plan = getPlan(id as keyof typeof expected);
      if (plan.pricing.kind !== "paid") throw new Error("expected a paid plan");
      expect(plan.pricing.monthlyCents * 12).toBe(want.yearlyAtMonthly);
      expect(annualSavingsCents(plan)).toBe(want.savings);
      expect(annualMonthlyEquivalentCents(plan)).toBe(want.equivalent);
      expect(plan.pricing.annualCents).toBe(want.yearlyAtMonthly - want.savings);
    }
  });

  it("never offers unlimited usage on self-serve plans", () => {
    for (const plan of PLANS.filter((p) => p.pricing.kind !== "contract")) {
      for (const value of Object.values(plan.limits)) {
        expect(value).toBeTypeOf("number");
        expect(Number.isFinite(value)).toBe(true);
      }
    }
  });

  it("makes each plan include every feature of the plan below it", () => {
    const order = ["free", "developer", "team", "business"] as const;
    for (let i = 1; i < order.length; i++) {
      const lower = getPlan(order[i - 1]!);
      const higher = getPlan(order[i]!);
      for (const f of lower.features) expect(higher.features).toContain(f);
    }
  });

  it("points upgrade hints at the cheapest plan with the feature", () => {
    expect(cheapestPlanWithFeature("basic_policies")).toBe("free");
    expect(cheapestPlanWithFeature("developer_api")).toBe("developer");
    expect(cheapestPlanWithFeature("shadow_mode")).toBe("team");
    expect(cheapestPlanWithFeature("evidence_exports")).toBe("business");
  });

  it("defines the trial exactly as specified", () => {
    expect(TRIAL.lengthDays).toBe(14);
    expect(TRIAL.basePlan).toBe("team");
    expect(TRIAL.limits).toMatchObject({
      agents: 5,
      seats: 3,
      integrations: 3,
      evaluationsTotal: 10_000,
      historyDays: 30,
      aiCreditsTotal: 100,
    });
    expect(TRIAL.reminderDays).toEqual([7, 12, 13]);
  });

  it("formats whole and fractional dollar amounts", () => {
    expect(formatUsd(1_900)).toBe("$19");
    expect(formatUsd(238_800)).toBe("$2,388");
    expect(formatUsd(1_550)).toBe("$15.50");
  });
});
