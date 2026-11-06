import { describe, expect, it } from "vitest";
import { costUnits } from "../billing/rate-card";
import { INPUT_MARGIN, affordableOutputTokens, capShare, capUnitsFor, worstStepUnits } from "./run-cap";

describe("capUnitsFor", () => {
  it("turns the chosen share of the period into units", () => {
    expect(capUnitsFor("top", 6, 10_000)).toBe(600);
    expect(capUnitsFor("double", 6, 10_000)).toBe(1_200);
    expect(capUnitsFor("top", 1, 50)).toBe(1);
  });

  it("has no run cap for the plan's limit, or without a known allowance", () => {
    expect(capUnitsFor("plan", 6, 10_000)).toBeNull();
    expect(capUnitsFor("top", 6, null)).toBeNull();
    expect(capUnitsFor("double", 0, 10_000)).toBeNull();
  });
});

describe("worstStepUnits", () => {
  it("covers a step that misses the cache and writes its whole output", () => {
    for (const model of ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"]) {
      const real = costUnits(model, { inputTokens: 40_000, outputTokens: 32_000 });
      const cached = costUnits(model, { inputTokens: 500, cacheReadTokens: 39_500, outputTokens: 32_000 });
      const worst = worstStepUnits(model, 40_000, 32_000);
      expect(worst).toBeGreaterThanOrEqual(real);
      expect(worst).toBeGreaterThanOrEqual(cached);
    }
  });

  it("allows for an input count that was estimated low", () => {
    const counted = 40_000;
    const actual = Math.floor(counted * INPUT_MARGIN);
    expect(worstStepUnits("claude-sonnet-5-5", counted, 32_000)).toBeGreaterThanOrEqual(costUnits("claude-sonnet-5-5", { inputTokens: actual, outputTokens: 32_000 }));
  });
});

describe("capShare", () => {
  it("reads like the rest of the usage display", () => {
    expect(capShare(600, 10_000)).toBe("6%");
    expect(capShare(30, 10_000)).toBe("0.3%");
    expect(capShare(600, null)).toBeNull();
  });
});

describe("affordableOutputTokens (ADR 0040)", () => {
  const FREE_PERIOD = 5_000;

  it("lets a Free plan's Fast run past its first step (its 4% cap is about one full reply)", () => {
    const cap = capUnitsFor("double", 2, FREE_PERIOD)!;
    expect(cap).toBe(200);
    // What really stopped a run: one step spent, a prompt of 30,000 tokens, and a full reply's worst case over the cap.
    const remaining = cap - 18;
    expect(worstStepUnits("claude-haiku-5-5", 30_000, 32_000)).toBeGreaterThan(remaining);
    const allowed = affordableOutputTokens("claude-haiku-5-5", 30_000, remaining, 32_000);
    expect(allowed).toBeGreaterThan(20_000);
    expect(worstStepUnits("claude-haiku-5-5", 30_000, allowed)).toBeLessThanOrEqual(remaining);
  });

  it("gives the longest reply that fits, the full one when there's room, and none when the prompt doesn't fit", () => {
    const remaining = worstStepUnits("claude-sonnet-5-5", 1_000, 5_000);
    const allowed = affordableOutputTokens("claude-sonnet-5-5", 1_000, remaining, 32_000);
    expect(worstStepUnits("claude-sonnet-5-5", 1_000, allowed)).toBeLessThanOrEqual(remaining);
    expect(worstStepUnits("claude-sonnet-5-5", 1_000, allowed + 1)).toBeGreaterThan(remaining);
    expect(affordableOutputTokens("claude-sonnet-5-5", 1_000, 1_000_000, 32_000)).toBe(32_000);
    expect(affordableOutputTokens("claude-sonnet-5-5", 100_000, 1, 32_000)).toBe(0);
  });
});
