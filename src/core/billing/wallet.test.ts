import { describe, expect, it } from "vitest";
import { getPlan } from "./catalog";
import { resolveEffectivePlan, trialWindow } from "./trial";
import { currentGrant, walletView, type GrantRow } from "./wallet";

const now = new Date("2026-10-18T09:00:00Z");

describe("which grant a period issues", () => {
  it("gives a paid plan the calendar month, lasting one more month as rollover", () => {
    const snap = { state: "active" as const, paidPlanId: "plus" as const };
    const g = currentGrant(resolveEffectivePlan(snap, now), undefined, now)!;
    expect(g).toEqual({
      kind: "plan",
      units: getPlan("plus").limits.aiUnitsPerMonth,
      starts_at: "2026-10-01T00:00:00.000Z",
      expires_at: "2026-12-01T00:00:00.000Z",
      source_key: "plan:plus:2026-10",
    });
  });

  it("gives Free the month with no rollover, and the trial its whole window", () => {
    const free = { state: "free" as const };
    expect(currentGrant(resolveEffectivePlan(free, now), undefined, now)).toMatchObject({ kind: "free", expires_at: "2026-11-01T00:00:00.000Z", source_key: "free:2026-10" });
    const window = trialWindow(new Date("2026-10-10T00:00:00Z"));
    const trial = { state: "trialing" as const, trial: window };
    expect(currentGrant(resolveEffectivePlan(trial, now), window, now)).toMatchObject({ kind: "trial", starts_at: window.startedAt.toISOString(), expires_at: window.endsAt.toISOString() });
  });
});

describe("what people see", () => {
  const spec = { kind: "plan" as const, units: 10_000, starts_at: "2026-10-01T00:00:00.000Z", expires_at: "2026-12-01T00:00:00.000Z", source_key: "plan:plus:2026-10" };
  const grant = (over: Partial<GrantRow>): GrantRow => ({ id: "g", kind: "plan", units: 10_000, used: 0, startsAt: spec.starts_at, expiresAt: spec.expires_at, ...over });

  it("shows this month's share and when it resets, before and after first use", () => {
    expect(walletView([], spec, now)).toEqual({
      available: 10_000,
      current: { percent: 0, resetsAt: "2026-11-01T00:00:00.000Z", period: "month" },
      rollover: null,
      grants: [{ id: "plan:plus:2026-10", kind: "plan", startsAt: spec.starts_at, expiresAt: spec.expires_at, percentLeft: 100, current: true }],
    });
    expect(walletView([grant({ used: 3_400 })], spec, now).current).toMatchObject({ percent: 34 });
  });

  it("shows what rolled over as a share of a month, with its expiry, and counts it as available", () => {
    const last = grant({ id: "last", used: 7_200, startsAt: "2026-09-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z" });
    const view = walletView([last, grant({ used: 0 })], spec, now);
    expect(view.rollover).toEqual({ percentOfMonth: 28, expiresAt: "2026-11-01T00:00:00.000Z" });
    expect(view.available).toBe(12_800);
    expect(view.current?.percent).toBe(0);
    // Listed in the order they're spent: last month's first.
    expect(view.grants.map((g) => [g.id, g.percentLeft, g.current])).toEqual([
      ["last", 28, false],
      ["g", 100, true],
    ]);
  });

  it("ignores expired grants", () => {
    const expired = grant({ id: "old", used: 0, startsAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" });
    expect(walletView([expired], spec, now)).toMatchObject({ available: 10_000, rollover: null });
  });
});
