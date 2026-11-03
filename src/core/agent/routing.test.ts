import { describe, expect, it } from "vitest";
import { resolveEffectivePlan, trialWindow, type BillingSnapshot } from "../billing/trial";
import { allowedModels, maxTier, route, type Effort, type StepKind } from "./routing";

const NOW = new Date("2026-10-18T09:00:00Z");
const plan = (snapshot: BillingSnapshot) => resolveEffectivePlan(snapshot, NOW);
const free = plan({ state: "free" });
const plus = plan({ state: "active", paidPlanId: "plus" });
const pro = plan({ state: "active", paidPlanId: "pro" });
const max2x = plan({ state: "active", paidPlanId: "max_2x" });
const trial = plan({ state: "trialing", trial: trialWindow(new Date("2026-10-10T00:00:00Z")) });

const pick = (p: typeof free, step: StepKind, effort: Effort, extra: { failures?: number; pinned?: string } = {}) => route({ plan: p, family: "anthropic", step, effort, ...extra });

describe("which models a plan includes", () => {
  it("steps up with the plan: fast on Free, Sonnet from Starter, Opus from Pro and in the trial, Fable from Max 2x", () => {
    expect([free, plus, pro, trial, max2x].map(maxTier)).toEqual(["fast", "standard", "strong", "strong", "frontier"]);
    expect(allowedModels(free, "anthropic")).toEqual(["claude-haiku-5-5"]);
    expect(allowedModels(pro, "anthropic")).toEqual(["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"]);
    expect(allowedModels(max2x, "gemini")).toEqual(["gemini-3.5-flash-lite", "gemini-3.8-flash", "gemini-4-argon"]);
  });
});

describe("a site's first build or a design upgrade (ADR 0158)", () => {
  it("writes with the standard model on Free, only when writing at Balanced or Deep", () => {
    const design = (p: typeof free, step: StepKind, effort: Effort) => route({ plan: p, family: "anthropic", step, effort, designPass: true });
    expect(design(free, "write", "balanced")).toMatchObject({ model: "claude-sonnet-5-5", note: null });
    expect(design(free, "write", "deep").model).toBe("claude-sonnet-5-5");
    expect(design(free, "write", "fast").model).toBe("claude-haiku-5-5");
    expect(design(free, "read", "balanced").model).toBe("claude-haiku-5-5");
    expect(pick(free, "write", "balanced").model).toBe("claude-haiku-5-5");
    // Paid plans route as before.
    expect(design(pro, "write", "deep").model).toBe("claude-opus-5-5");
    expect(design(plus, "write", "balanced").model).toBe("claude-sonnet-5-5");
  });
});

describe("Auto routing", () => {
  it("reads and plans on the fast model and writes on the standard one when Balanced", () => {
    expect(pick(pro, "read", "balanced").model).toBe("claude-haiku-5-5");
    expect(pick(pro, "plan", "balanced").model).toBe("claude-haiku-5-5");
    expect(pick(pro, "write", "balanced")).toMatchObject({ model: "claude-sonnet-5-5", thinking: "medium", note: null });
  });

  it("steps up after two failures, within the plan", () => {
    expect(pick(pro, "write", "balanced", { failures: 2 }).model).toBe("claude-opus-5-5");
    expect(pick(plus, "write", "balanced", { failures: 2 }).model).toBe("claude-sonnet-5-5");
  });

  it("uses the strongest model the plan includes when Deep, and only fast models when Fast", () => {
    expect(pick(plus, "write", "deep").model).toBe("claude-sonnet-5-5");
    expect(pick(pro, "write", "deep")).toMatchObject({ model: "claude-opus-5-5", thinking: "high" });
    expect(pick(max2x, "write", "deep").model).toBe("claude-fable-5-1");
    expect(pick(max2x, "write", "fast")).toMatchObject({ model: "claude-haiku-5-5", thinking: "low" });
  });

  it("keeps Free on the fast model, and says why", () => {
    expect(pick(free, "write", "deep")).toMatchObject({ model: "claude-haiku-5-5", note: expect.stringMatching(/Free uses fast models/) });
    expect(pick(free, "read", "balanced").note).toBeNull();
  });

  it("honours a pinned model only on Pro and up, and only one the plan includes", () => {
    expect(pick(pro, "read", "balanced", { pinned: "claude-opus-5-5" })).toMatchObject({ model: "claude-opus-5-5", note: null });
    expect(pick(pro, "write", "balanced", { pinned: "claude-fable-5-1" })).toMatchObject({ model: "claude-sonnet-5-5", note: expect.stringMatching(/isn't included/) });
    expect(pick(plus, "write", "balanced", { pinned: "claude-opus-5-5" })).toMatchObject({ model: "claude-sonnet-5-5", note: expect.stringMatching(/from the Pro plan up/) });
    expect(pick(max2x, "write", "balanced", { pinned: "gpt-anything" }).model).toBe("claude-sonnet-5-5");
  });

  it("routes Gemini the same way", () => {
    expect(route({ plan: pro, family: "gemini", step: "read", effort: "balanced" }).model).toBe("gemini-3.5-flash-lite");
    expect(route({ plan: pro, family: "gemini", step: "write", effort: "deep" }).model).toBe("gemini-4-argon");
  });
});

describe("Farbaek's runtime switches (ADR 0090)", () => {
  it("route a tier to its switched model, for Anthropic only, within the plan", () => {
    const overrides = { standard: "claude-opus-5-5" as const };
    expect(route({ plan: pro, family: "anthropic", step: "write", effort: "balanced", overrides })).toMatchObject({ model: "claude-opus-5-5", tier: "standard" });
    expect(route({ plan: pro, family: "anthropic", step: "read", effort: "balanced", overrides }).model).toBe("claude-haiku-5-5");
    expect(allowedModels(plus, "anthropic", overrides)).toEqual(["claude-haiku-5-5", "claude-opus-5-5"]);
    expect(route({ plan: pro, family: "gemini", step: "write", effort: "balanced", overrides }).model).toBe("gemini-3.8-flash");
  });
});
