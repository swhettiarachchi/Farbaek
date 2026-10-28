import { describe, expect, it } from "vitest";
import { ECONOMICS, allowanceFor, costBudgetUsd, sessionsGuide } from "./allowance";
import { PLANS, PLAN_ORDER, TRIAL, cheapestPlanWithFeature, formatUsd, getPlan, planAllowance, planSessionsGuide } from "./catalog";
import { USD_PER_UNIT, costUsd, sampleSessionUnits } from "./rate-card";

describe("plan catalog", () => {
  it("has the owner's eight prices", () => {
    const prices = Object.fromEntries(PLANS.map((p) => [p.id, p.pricing.kind === "paid" ? p.pricing.monthlyCents : p.pricing.kind]));
    expect(prices).toEqual({ free: "free", starter: 999, plus: 1_999, pro: 5_000, studio: 7_999, max: 10_000, max_2x: 20_000, max_3x: 30_000, enterprise: "contract" });
  });

  it("spends at most 34% of the price minus 40 cents, for a 57% net margin after Dodo's worst-case 9% + 40 cents (ADR 0103)", () => {
    expect(ECONOMICS.margin).toBe(0.57);
    const budgets = { 9.99: 2.9966, 19.99: 6.3966, 50: 16.6, 79.99: 26.7966, 100: 33.6, 200: 67.6, 300: 101.6 };
    for (const [price, budget] of Object.entries(budgets)) expect(costBudgetUsd(Number(price))).toBeCloseTo(budget, 3);
    // Then fixed costs ($0.40), snapshots ($0.16) and the plan's sandbox hours ($0.149 each).
    const models = { 9.99: [5, 1.6916], 19.99: [10, 4.3466], 50: [25, 12.315], 100: [50, 25.59], 300: [150, 78.69] } as const;
    for (const [price, [hours, model]] of Object.entries(models)) expect(allowanceFor(Number(price), hours).modelBudgetUsd).toBeCloseTo(model, 3);
  });

  it("keeps the margin even when a subscriber uses everything", () => {
    for (const plan of PLANS) {
      const a = planAllowance(plan);
      if (!a || plan.pricing.kind !== "paid") continue;
      const price = plan.pricing.monthlyCents / 100;
      const cost = (plan.limits.aiUnitsPerMonth! + plan.limits.retryUnitsPerMonth!) * USD_PER_UNIT + a.sandboxUsd + ECONOMICS.fixedShareUsd + ECONOMICS.snapshotUsd;
      const fee = price * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
      expect((price - fee - cost) / price, plan.id).toBeGreaterThanOrEqual(0.57 - 1e-6);
    }
  });

  it("keeps the margin on top-ups too, at the worst-case fee for a one-time payment", () => {
    // A top-up pays Dodo's fee without the subscription surcharge, and adds AI usage at the plan's own rate (ADR 0102).
    for (const plan of PLANS) {
      if (plan.pricing.kind !== "paid") continue;
      for (const cents of [1000, 2500, 5000]) {
        const price = cents / 100;
        const units = Math.floor((cents / plan.pricing.monthlyCents) * plan.limits.aiUnitsPerMonth!);
        const fee = price * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
        expect((price - fee - units * USD_PER_UNIT) / price, `${plan.id} ${cents}`).toBeGreaterThanOrEqual(0.57);
      }
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
    expect(planSessionsGuide(getPlan("plus"))).toBeGreaterThan(10);
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
