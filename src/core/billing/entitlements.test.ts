import { describe, expect, it } from "vitest";
import { ALWAYS_AVAILABLE_OPERATIONS, checkAlwaysAvailable, checkFeature, checkQuota, quotaAlertLevel } from "./entitlements";
import { resolveEffectivePlan, trialWindow } from "./trial";

const now = new Date("2026-10-13T12:00:00.000Z");
const free = resolveEffectivePlan({ state: "free" }, now);
const studio = resolveEffectivePlan({ state: "active", paidPlanId: "studio" }, now);
const trial = resolveEffectivePlan({ state: "trialing", trial: trialWindow(now) }, now);
const suspended = resolveEffectivePlan({ state: "suspended", paidPlanId: "max", suspendedReason: "payment" }, now);

describe("checkFeature", () => {
  it("allows included features and refuses others with an upgrade hint", () => {
    expect(checkFeature(free, "basic_policies")).toEqual({ allowed: true });
    expect(checkFeature(free, "shadow_mode")).toMatchObject({ allowed: false, code: "FEATURE_NOT_IN_PLAN", upgradeTo: "pro" });
  });

  it("gives trial organizations Pro features", () => {
    expect(checkFeature(trial, "shadow_mode")).toEqual({ allowed: true });
    expect(checkFeature(trial, "advanced_autonomy")).toMatchObject({ code: "FEATURE_NOT_IN_PLAN", upgradeTo: "max_3x" });
  });

  it("explains paused paid features while billing is suspended", () => {
    expect(checkFeature(suspended, "policy_builder")).toMatchObject({ allowed: false, code: "BILLING_SUSPENDED" });
    expect(checkFeature(suspended, "basic_policies")).toEqual({ allowed: true });
  });

  it("fails closed when the plan can't be read", () => {
    expect(checkFeature(null, "basic_policies")).toMatchObject({ allowed: false, code: "ENTITLEMENT_UNAVAILABLE" });
  });
});

describe("checkQuota", () => {
  it("allows usage up to the limit and refuses the unit beyond it", () => {
    expect(checkQuota(free, "evaluations", { used: 999 })).toEqual({ allowed: true });
    expect(checkQuota(free, "evaluations", { used: 1_000 })).toMatchObject({ allowed: false, code: "QUOTA_EXCEEDED", upgradeTo: "lite_monthly" });
  });

  it("checks multi-unit requests against the remaining allowance", () => {
    expect(checkQuota(studio, "agents", { used: 3, requested: 2 })).toEqual({ allowed: true });
    expect(checkQuota(studio, "agents", { used: 3, requested: 3 })).toMatchObject({ code: "QUOTA_EXCEEDED", upgradeTo: "max" });
  });

  it("says which limit was reached and how to get past it today", () => {
    const projects = checkQuota(trial, "workspaces", { used: trial.limits.workspaces! });
    expect(projects).toMatchObject({ code: "TRIAL_CAP_REACHED" });
    if (projects.allowed) return;
    expect(projects.message).toContain(`Your trial includes ${trial.limits.workspaces} projects`);
    expect(projects.message).toContain("Archive one you've finished");
    // Plans can't be bought yet, so the way forward never depends on buying one.
    expect(projects.message).not.toMatch(/choose a plan/i);
    const seats = checkQuota(studio, "seats", { used: studio.limits.seats! });
    expect(seats.allowed ? "" : seats.message).toMatch(/^Your Studio plan includes \d+ seats, and all are taken\./);
  });

  it("reports trial caps separately from plan quotas", () => {
    expect(checkQuota(trial, "seats", { used: 3 })).toMatchObject({ code: "TRIAL_CAP_REACHED" });
    expect(checkQuota(trial, "evaluations", { used: 9_999 })).toEqual({ allowed: true });
    expect(checkQuota(trial, "evaluations", { used: 10_000 })).toMatchObject({ code: "TRIAL_CAP_REACHED" });
  });

  it("fails closed on unknown plans and malformed usage", () => {
    expect(checkQuota(null, "agents", { used: 0 })).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(checkQuota(free, "agents", { used: -1 })).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(checkQuota(free, "agents", { used: Number.NaN })).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(checkQuota(free, "agents", { used: 0, requested: 0 })).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
  });
});

describe("always-available operations", () => {
  it("covers exports, billing, emergency pause and revocation", () => {
    expect(ALWAYS_AVAILABLE_OPERATIONS).toEqual(["audit.read", "project.export", "billing.manage", "agent.emergency_pause", "permission.revoke"]);
    expect(checkAlwaysAvailable("agent.emergency_pause")).toBe(true);
    expect(checkAlwaysAvailable("agent.run")).toBe(false);
  });
});

describe("quota alerts", () => {
  it("warns at 80% and reports 100%", () => {
    expect(quotaAlertLevel(1_599, 2_000)).toBe("ok");
    expect(quotaAlertLevel(1_600, 2_000)).toBe("warning");
    expect(quotaAlertLevel(2_000, 2_000)).toBe("reached");
    expect(quotaAlertLevel(10, null)).toBe("ok");
  });
});
