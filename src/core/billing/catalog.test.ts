import { describe, expect, it } from "vitest";
import { ECONOMICS, allowanceFor, costBudgetUsd, sessionsGuide } from "./allowance";
import { BILLABLE_PLANS, PLANS, PLAN_ORDER, SELF_SERVE_PLANS, TRIAL, YEARLY_PLAN_IDS, chargeCents, chargeLine, cheapestPlanWithFeature, formatUsd, getPlan, isLight, isYearly, yearlyVersionOf, planAllowance, planSessionsGuide, priceWords } from "./catalog";
import { isPaidPlanId as isPaidPlan } from "./provider-state";
import { topupSharePercent, topupUnits } from "./topups";
import { USD_PER_UNIT, costUsd, sampleSessionUnits } from "./rate-card";

describe("plan catalog", () => {
  it("has the owner's prices, with Lite and Maker monthly first and also yearly", () => {
    const prices = Object.fromEntries(PLANS.map((p) => [p.id, p.pricing.kind === "paid" ? p.pricing.monthlyCents : p.pricing.kind]));
    expect(prices).toEqual({ free: "free", lite: 99, lite_monthly: 99, maker: 199, maker_monthly: 199, starter: 999, plus: 1_999, pro: 5_000, studio: 7_999, max: 10_000, max_2x: 20_000, max_3x: 30_000, enterprise: "contract" });
    expect(YEARLY_PLAN_IDS).toEqual(["lite", "maker"]);
    expect(PLANS.filter((p) => p.pricing.kind === "paid" && !isYearly(p.id)).every((p) => p.pricing.kind === "paid" && p.pricing.interval === "month")).toBe(true);
    expect([chargeCents(getPlan("lite")), chargeCents(getPlan("maker")), chargeCents(getPlan("starter")), chargeCents(getPlan("free"))]).toEqual([1188, 2388, 999, 0]);
    expect(priceWords(getPlan("lite"))).toEqual({ price: "$0.99", per: "a month", billed: "Billed $11.88 a year" });
    expect(priceWords(getPlan("lite_monthly"))).toEqual({ price: "$0.99", per: "a month", billed: null });
    expect([chargeCents(getPlan("lite_monthly")), chargeLine(getPlan("maker_monthly"))]).toEqual([99, "$1.99 a month"]);
    expect([yearlyVersionOf("lite_monthly"), yearlyVersionOf("maker_monthly"), yearlyVersionOf("starter")]).toEqual(["lite", "maker", null]);
    expect([getPlan("lite_monthly").name, getPlan("lite").name]).toEqual(["Lite", "Lite yearly"]);
    // The cards show Lite and Maker once; Office Space makes a product for every way to pay.
    expect(SELF_SERVE_PLANS.map((p) => p.id).slice(0, 4)).toEqual(["free", "lite_monthly", "maker_monthly", "starter"]);
    expect(BILLABLE_PLANS.map((p) => p.id)).toEqual(expect.arrayContaining(["lite", "lite_monthly", "maker", "maker_monthly"]));
    expect(priceWords(getPlan("starter"))).toEqual({ price: "$9.99", per: "a month", billed: null });
    expect([chargeLine(getPlan("maker")), chargeLine(getPlan("pro"))]).toEqual(["$23.88 a year", "$50 a month"]);
  });

  it("keeps 57% of a yearly charge on what Lite and Maker add to Free, at Dodo's worst-case fee (ADR 0105)", () => {
    const free = getPlan("free").limits;
    for (const id of YEARLY_PLAN_IDS) {
      const plan = getPlan(id);
      const year = chargeCents(plan) / 100;
      const fee = year * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
      // Everything the plan adds, for twelve months: AI and retries over Free's, extra sandbox hours, and its own running cost.
      const monthly = (plan.limits.aiUnitsPerMonth! - free.aiUnitsPerMonth! + plan.limits.retryUnitsPerMonth!) * USD_PER_UNIT + (plan.limits.sandboxHours! - free.sandboxHours!) * ECONOMICS.sandboxHourUsd + ECONOMICS.lightMarginalUsd;
      const margin = (year - fee - 12 * monthly) / year;
      expect(margin, id).toBeGreaterThanOrEqual(0.57 - 1e-6);
      expect(margin, id).toBeLessThan(0.575);
    }
    // At a monthly charge the fee alone would break the rule: 99 cents can't keep 57%.
    expect(0.99 - (0.99 * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd)).toBeLessThan(0.99 * 0.57);
    expect(getPlan("lite").limits.aiUnitsPerMonth! / free.aiUnitsPerMonth!).toBeCloseTo(1.5, 1);
    expect(getPlan("maker").limits.aiUnitsPerMonth! / free.aiUnitsPerMonth!).toBeCloseTo(1.84, 1);
    expect([getPlan("lite").limits.sandboxHours, getPlan("maker").limits.sandboxHours]).toEqual([1, 2]);
    expect([getPlan("lite").limits.retryUnitsPerMonth, getPlan("maker").limits.retryUnitsPerMonth! > 0]).toEqual([0, true]);
  });

  it("lets Lite and Maker be paid monthly: Maker keeps 57%, Lite adds no AI usage because 99 cents can't (the owner's call, 2026-10-29)", () => {
    const free = getPlan("free").limits;
    const monthlyMargin = (id: "lite_monthly" | "maker_monthly") => {
      const plan = getPlan(id);
      const price = chargeCents(plan) / 100;
      const fee = price * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
      const cost = (plan.limits.aiUnitsPerMonth! - free.aiUnitsPerMonth! + plan.limits.retryUnitsPerMonth!) * USD_PER_UNIT + (plan.limits.sandboxHours! - free.sandboxHours!) * ECONOMICS.sandboxHourUsd + ECONOMICS.lightMarginalUsd;
      return (price - fee - cost) / price;
    };
    expect(monthlyMargin("maker_monthly")).toBeGreaterThanOrEqual(0.57 - 1e-6);
    // Lite monthly is Free's AI usage plus what costs nothing: the most a 99-cent charge can keep at the worst-case fee.
    expect(getPlan("lite_monthly").limits.aiUnitsPerMonth).toBe(free.aiUnitsPerMonth);
    expect(monthlyMargin("lite_monthly")).toBeCloseTo(0.455, 2);
    // Paid monthly, everything but AI usage is the same as paid yearly.
    for (const [m, y] of [["lite_monthly", "lite"], ["maker_monthly", "maker"]] as const) {
      const { aiUnitsPerMonth: am, retryUnitsPerMonth: rm, ...restM } = getPlan(m).limits;
      const { aiUnitsPerMonth: ay, retryUnitsPerMonth: ry, ...restY } = getPlan(y).limits;
      expect(restM, m).toEqual(restY);
      expect(am!, m).toBeLessThan(ay!);
      expect(rm!, m).toBeLessThanOrEqual(ry!);
      expect(getPlan(m).features).toEqual(getPlan(y).features);
    }
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
      if (!a || plan.pricing.kind !== "paid" || isLight(plan.id)) continue;
      const price = plan.pricing.monthlyCents / 100;
      const cost = (plan.limits.aiUnitsPerMonth! + plan.limits.retryUnitsPerMonth!) * USD_PER_UNIT + a.sandboxUsd + ECONOMICS.fixedShareUsd + ECONOMICS.snapshotUsd;
      const fee = price * ECONOMICS.paymentPercent + ECONOMICS.paymentFixedUsd;
      expect((price - fee - cost) / price, plan.id).toBeGreaterThanOrEqual(0.57 - 1e-6);
    }
  });

  it("keeps the margin on top-ups too, at the worst-case fee for a one-time payment", () => {
    // A top-up pays Dodo's fee without the subscription surcharge, and adds AI usage at the plan's own rate (ADR 0102).
    for (const plan of PLANS) {
      if (plan.pricing.kind !== "paid" || !isPaidPlan(plan.id)) continue;
      for (const cents of [1000, 2500, 5000]) {
        const price = cents / 100;
        // Lite and Maker buy at Starter's rate (ADR 0105): their own would include Free's allowance.
        const units = topupUnits(plan.id, cents);
        if (!isLight(plan.id)) expect(units).toBe(Math.floor((cents / plan.pricing.monthlyCents) * plan.limits.aiUnitsPerMonth!));
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
    // The plans on the cards, in order; the yearly versions are checked against their monthly plans above.
    const paidPlans = PLAN_ORDER.map(getPlan).filter((p) => !p.yearlyOf);
    expect(paidPlans.map((p) => p.id)).toEqual(SELF_SERVE_PLANS.map((p) => p.id));
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
    expect(cheapestPlanWithFeature("usage_alerts")).toBe("lite_monthly");
    expect(cheapestPlanWithFeature("usage_rollover")).toBe("lite_monthly");
    expect(cheapestPlanWithFeature("free_retries")).toBe("maker_monthly");
    expect(cheapestPlanWithFeature("security_checks")).toBe("plus");
    // Publishing a site needs only the rules check, which every plan runs (ADR 0168).
    expect(cheapestPlanWithFeature("site_publishing")).toBe("free");
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

  it("prices Lite and Maker top-ups at Starter's rate and shows the share of their own month", () => {
    expect(topupUnits("lite", 1000)).toBe(topupUnits("starter", 1000));
    expect(topupUnits("maker", 2500)).toBe(topupUnits("starter", 2500));
    expect(topupUnits("lite_monthly", 1000)).toBe(topupUnits("starter", 1000));
    expect(topupSharePercent("lite", 1000)).toBe(Math.round((topupUnits("starter", 1000) / getPlan("lite").limits.aiUnitsPerMonth!) * 100));
    expect(topupSharePercent("starter", 1000)).toBe(100);
  });

  it("formats whole and fractional dollars", () => {
    expect(formatUsd(999)).toBe("$9.99");
    expect(formatUsd(5_000)).toBe("$50");
  });
});
