import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ECONOMICS, allowanceFor } from "./allowance";
import { ASSUMED_MIX, SUGGESTED_PLANS, aiBudgetYearlyUsd, chatTurnsGuide, paymentFeeUsd, planEconomics, scenario, variableCostUsd } from "./suggested-prices";
import { economicsDocument } from "./suggested-prices-doc";

describe("the suggested prices", () => {
  it("are the owner's five anchors, cheapest first", () => {
    expect(SUGGESTED_PLANS.map((p) => p.priceUsd)).toEqual([3.99, 20, 50, 100, 200]);
    expect(SUGGESTED_PLANS.map((p) => p.name)).toEqual(["Starter", "Plus", "Pro", "Business", "Scale"]);
  });

  it.each(SUGGESTED_PLANS)("$name keeps 57% net, and more in contribution, when a subscriber uses everything", (plan) => {
    const e = planEconomics(plan);
    expect(e.netMarginAtFullUse).toBeGreaterThanOrEqual(ECONOMICS.margin - 1e-9);
    expect(e.netMarginAtFullUse).toBeCloseTo(ECONOMICS.margin, 6);
    expect(e.contributionMarginAtFullUse).toBeGreaterThan(ECONOMICS.margin);
    expect(e.allowance.modelBudgetUsd).toBeGreaterThan(0);
  });

  it("includes more with every step up", () => {
    const budgets = SUGGESTED_PLANS.map((p) => planEconomics(p).allowance.aiUnits);
    for (let i = 1; i < budgets.length; i += 1) expect(budgets[i]!).toBeGreaterThan(budgets[i - 1]!);
    const hours = SUGGESTED_PLANS.map((p) => p.sandboxHours);
    for (let i = 1; i < hours.length; i += 1) expect(hours[i]!).toBeGreaterThanOrEqual(hours[i - 1]!);
  });

  it("can't promise test space a price doesn't pay for", () => {
    expect(() => allowanceFor(3.99, 5)).toThrow(/can't include/);
  });

  it("shows how little $3.99 leaves monthly, and how much more yearly", () => {
    const starter = SUGGESTED_PLANS[0]!;
    // 9% and 40 cents: about a fifth of the price.
    expect(paymentFeeUsd(3.99)).toBeCloseTo(0.7591, 4);
    expect(paymentFeeUsd(3.99) / 3.99).toBeGreaterThan(0.18);
    const monthly = planEconomics(starter).allowance.modelBudgetUsd;
    expect(monthly).toBeCloseTo(0.3966, 4);
    expect(aiBudgetYearlyUsd(starter)).toBeCloseTo(0.7633, 4);
    expect(aiBudgetYearlyUsd(starter)).toBeGreaterThan(monthly * 1.8);
  });

  it("costs less when less is used, and never less than the fee and storage", () => {
    for (const plan of SUGGESTED_PLANS) {
      const idle = variableCostUsd(plan, 0);
      expect(idle).toBeCloseTo(paymentFeeUsd(plan.priceUsd) + ECONOMICS.snapshotUsd, 9);
      expect(variableCostUsd(plan, 0.5)).toBeGreaterThan(idle);
      expect(variableCostUsd(plan, 1)).toBeGreaterThan(variableCostUsd(plan, 0.5));
      // Out-of-range use is held to none or all.
      expect(variableCostUsd(plan, -1)).toBe(idle);
      expect(variableCostUsd(plan, 7)).toBe(variableCostUsd(plan, 1));
    }
  });

  it("guides turns from the rate card: a fast model goes about twenty times as far as a standard one", () => {
    const units = planEconomics(SUGGESTED_PLANS[1]!).allowance.aiUnits;
    const fast = chatTurnsGuide(units, "gpt-6-luna");
    const standard = chatTurnsGuide(units, "claude-sonnet-5-5");
    expect(fast).toBeGreaterThan(standard * 15);
    expect(standard).toBeGreaterThan(0);
  });
});

describe("the scenarios", () => {
  it("add up: revenue is subscribers times the mix's prices", () => {
    const s = scenario(1_000);
    const perSubscriber = SUGGESTED_PLANS.reduce((sum, p) => sum + p.priceUsd * ASSUMED_MIX[p.key], 0);
    expect(s.monthlyRevenueUsd).toBeCloseTo(perSubscriber * 1_000, 6);
    expect(s.yearlyRevenueUsd).toBeCloseTo(s.monthlyRevenueUsd * 12, 6);
    expect(s.revenuePerSubscriberUsd).toBeCloseTo(perSubscriber, 9);
    expect(s.contributionUsd).toBeCloseTo(s.monthlyRevenueUsd - s.variableCostUsd, 6);
  });

  it("keep the same margin at any size, since every cost here follows the subscriber", () => {
    expect(scenario(100).contributionMargin).toBeCloseTo(scenario(50_000).contributionMargin, 9);
  });

  it("never fall below 57% contribution, whatever the mix and however much is used", () => {
    const mixes = [ASSUMED_MIX, { starter: 1, plus: 0, pro: 0, business: 0, scale: 0 }, { starter: 0, plus: 0, pro: 0, business: 0, scale: 1 }, { starter: 0.2, plus: 0.2, pro: 0.2, business: 0.2, scale: 0.2 }];
    for (const mix of mixes) for (const use of [0, 0.3, 0.6, 1]) expect(scenario(1_000, mix, use).contributionMargin).toBeGreaterThan(ECONOMICS.margin);
  });

  it("refuse a mix that doesn't add up, and say nothing for no subscribers", () => {
    expect(() => scenario(100, { starter: 0.5, plus: 0.2, pro: 0, business: 0, scale: 0 })).toThrow(/add up to 1/);
    expect(scenario(0).contributionMargin).toBe(0);
    expect(scenario(0).revenuePerSubscriberUsd).toBe(0);
  });
});

describe("the page to decide from", () => {
  const file = path.join(process.cwd(), "docs/farbaek/FARBAEK_SUBSCRIPTION_ECONOMICS.md");

  it("is exactly what the code says (WRITE_DOCS=1 rewrites it)", () => {
    const wanted = economicsDocument();
    if (process.env.WRITE_DOCS === "1") {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, wanted);
    }
    expect(existsSync(file), "docs/farbaek/FARBAEK_SUBSCRIPTION_ECONOMICS.md is missing: run with WRITE_DOCS=1").toBe(true);
    expect(readFileSync(file, "utf8").replace(/\r\n/g, "\n")).toBe(wanted);
  });

  it("says nothing here is sold, and never states a blank or broken number", () => {
    const page = economicsDocument();
    expect(page).toContain("Nothing here is sold");
    expect(page).not.toMatch(/NaN|undefined|Infinity/);
  });
});
