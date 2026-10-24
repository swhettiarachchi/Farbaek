import { describe, expect, it } from "vitest";
import { ECONOMICS, allowanceFor, costBudgetUsd, sessionsGuide } from "./allowance";
import { PLANS, PLAN_ORDER, TRIAL, cheapestPlanWithFeature, formatUsd, getPlan, planAllowance, planSessionsGuide } from "./catalog";
import { USD_PER_UNIT, costUsd, sampleSessionUnits } from "./rate-card";

describe("plan catalog", () => {
  it("has the owner's eight prices", () => {
    const prices = Object.fromEntries(PLANS.map((p) => [p.id, p.pricing.kind === "paid" ? p.pricing.monthlyCents : p.pricing.kind]));
    expect(prices).toEqual({ free: "free", starter: 999, plus: 1_999, pro: 5_000, studio: 7_999, max: 10_000, max_2x: 20_000, max_3x: 30_000, enterprise: "contract" });
  });

  it("reproduces the cost budgets in the pricing research (40% margin after Paddle's 5% + 50 cents)", () => {
    // reports/AI coding platform costs and pricing.md, "Every plan can spend 55% of its price minus 50 cents".
    const budgets = { 9.99: 4.99, 19.99: 10.49, 50: 27.0, 79.99: 43.49, 100: 54.5, 200: 109.5, 300: 164.5 };
    for (const [price, budget] of Object.entries(budgets)) expect(costBudgetUsd(Number(price))).toBeCloseTo(budget, 2);
    const models = { 9.99: [5, 3.69], 19.99: [10, 8.45], 50: [25, 22.72], 100: [50, 46.5], 300: [150, 141.62] } as const;
    for (const [price, [hours, model]] of Object.entries(models)) expect(allowanceFor(Number(price), hours).modelBudgetUsd).toBeCloseTo(model, 1);
  });

  it("keeps the margin even when a subscriber uses everything", () => {
    for (const plan of PLANS) {
      const a = planAllowance(plan);
      if (!a || plan.pricing.kind !== "paid") continue;
      const price = plan.pricing.monthlyCents / 100;
      const cost = (plan.limits.aiUnitsPerMonth! + plan.limits.retryUnitsPerMonth!) * USD_PER_UNIT + a.sandboxUsd + ECONOMICS.fixedShareUsd + ECONOMICS.snapshotUsd;
      const fee = price * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
      expect((price - fee - cost) / price, plan.id).toBeGreaterThanOrEqual(0.4 - 1e-6);
    }
  });

  it("prices the research's sample session the same way", () => {
    // About $0.36 on Sonnet 5.5 and 2.4 cents on Haiku 5.5, with the 30% tokenizer allowance.
    expect(sampleSessionUnits("claude-sonnet-5-5") * USD_PER_UNIT).toBeCloseTo(0.357, 2);
    expect(sampleSessionUnits("claude-haiku-5-5") * USD_PER_UNIT).toBeCloseTo(0.024, 3);
    expect(costUsd("claude-opus-5-5", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(4);
    expect(costUsd("unknown-model", { inputTokens: 1_000_000, outputTokens: 0 })).toBe(10);
    expect(costUsd("claude-haiku-5-5", { inputTokens: 120_000, outputTokens: 0 })).toBeCloseTo(0.06, 5);
  });

  it("steps every allowance up with the price", () => {
    const paidPlans = PLAN_ORDER.map(getPlan);
    for (let i = 1; i < paidPlans.length; i++) {
      const lower = paidPlans[i - 1]!.limits;
      const higher = paidPlans[i]!.limits;
      for (const key of ["aiUnitsPerMonth", "sandboxHours", "seats", "workspaces", "evaluationsPerMonth"] as const) {
        expect(higher[key]!, `${paidPlans[i]!.id}.${key}`).toBeGreaterThanOrEqual(lower[key]!);
      }
      for (const f of paidPlans[i - 1]!.features) expect(paidPlans[i]!.features).toContain(f);
    }
    expect(planSessionsGuide(getPlan("plus"))).toBe(sessionsGuide(getPlan("plus").limits.aiUnitsPerMonth!));
    expect(planSessionsGuide(getPlan("plus"))).toBeGreaterThan(20);
  });

  it("never offers unlimited usage on self-serve plans", () => {
    for (const plan of PLANS.filter((p) => p.pricing.kind !== "contract")) {
      for (const value of Object.values(plan.limits)) expect(Number.isFinite(value)).toBe(true);
    }
  });

  it("points upgrade hints at the cheapest plan with the feature", () => {
    expect(cheapestPlanWithFeature("cloud_agent")).toBe("free");
    expect(cheapestPlanWithFeature("usage_rollover")).toBe("starter");
    expect(cheapestPlanWithFeature("security_checks")).toBe("plus");
    expect(cheapestPlanWithFeature("opus_models")).toBe("pro");
    expect(cheapestPlanWithFeature("fable_models")).toBe("max_2x");
  });

  it("gives the trial Pro features with a month of Starter's AI usage and 2 sandbox hours", () => {
    expect(TRIAL.lengthDays).toBe(14);
    expect(TRIAL.basePlan).toBe("pro");
    expect(TRIAL.limits.aiUnitsTotal).toBe(getPlan("starter").limits.aiUnitsPerMonth);
    expect(TRIAL.limits.sandboxHours).toBe(2);
    expect(TRIAL.reminderDays).toEqual([7, 12, 13]);
  });

  it("formats whole and fractional dollars", () => {
    expect(formatUsd(999)).toBe("$9.99");
    expect(formatUsd(5_000)).toBe("$50");
  });
});
