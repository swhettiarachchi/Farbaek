import { describe, expect, it } from "vitest";
import { getPlan } from "./catalog";
import { resolveEffectivePlan, trialWindow } from "./trial";
import { currentGrant, grantResetsAt, paidPeriodEnd, paidPeriodStart, walletView, type GrantRow } from "./wallet";

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

describe("paid periods that follow the subscription", () => {
  const plus = { state: "active" as const, paidPlanId: "plus" as const };

  it("starts each period on the subscription's day, lasting one more period as rollover", () => {
    const anchor = new Date("2026-09-14T06:30:00Z");
    const g = currentGrant(resolveEffectivePlan(plus, now), undefined, now, anchor)!;
    expect(g).toMatchObject({ starts_at: "2026-10-14T06:30:00.000Z", expires_at: "2026-12-14T06:30:00.000Z", source_key: "plan:plus:2026-10-14" });
    expect(grantResetsAt({ kind: "plan", startsAt: g.starts_at, expiresAt: g.expires_at })).toBe("2026-11-14T06:30:00.000Z");
  });

  it("uses the period before when this month's day hasn't come yet, and the anchor itself at first", () => {
    expect(paidPeriodStart(new Date("2026-08-20T00:00:00Z"), now).toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(paidPeriodStart(new Date("2026-10-15T00:00:00Z"), now).toISOString()).toBe("2026-10-15T00:00:00.000Z");
    // Across a new year.
    expect(paidPeriodStart(new Date("2026-11-20T00:00:00Z"), new Date("2027-01-05T00:00:00Z")).toISOString()).toBe("2026-12-20T00:00:00.000Z");
  });

  it("resets on the 28th for subscriptions started on the 29th to 31st, so no month is skipped", () => {
    const anchor = new Date("2026-01-31T00:00:00Z");
    expect(paidPeriodStart(anchor, new Date("2026-02-10T00:00:00Z")).toISOString()).toBe("2026-01-31T00:00:00.000Z");
    expect(paidPeriodEnd(anchor).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(paidPeriodStart(anchor, new Date("2026-03-01T00:00:00Z")).toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(paidPeriodEnd(new Date("2026-02-28T00:00:00Z")).toISOString()).toBe("2026-03-28T00:00:00.000Z");
  });

  it("keeps the calendar month for paid plans until a subscription gives an anchor", () => {
    const g = currentGrant(resolveEffectivePlan(plus, now), undefined, now)!;
    expect(grantResetsAt({ kind: "plan", startsAt: g.starts_at, expiresAt: g.expires_at })).toBe("2026-11-01T00:00:00.000Z");
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

  it("matches the issued grant when the database writes its times as +00:00, so it's listed and counted once", () => {
    const issued = grant({ id: "issued", used: 811, startsAt: "2026-10-01 00:00:00+00", expiresAt: "2026-12-01 00:00:00+00" });
    const view = walletView([issued], spec, now);
    expect(view.grants.map((g) => [g.id, g.current])).toEqual([["issued", true]]);
    expect(view.available).toBe(10_000 - 811);
  });

  it("ignores expired grants", () => {
    const expired = grant({ id: "old", used: 0, startsAt: "2026-08-01T00:00:00.000Z", expiresAt: "2026-10-01T00:00:00.000Z" });
    expect(walletView([expired], spec, now)).toMatchObject({ available: 10_000, rollover: null });
  });
});
