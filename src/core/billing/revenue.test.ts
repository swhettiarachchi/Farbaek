import { describe, expect, it } from "vitest";
import { computeRevenue, worstFeeCents, type RevenueAccount } from "./revenue";

const NOW = new Date("2026-11-20T12:00:00Z");
const acct = (orgId: string, planId: string | null, over: Partial<RevenueAccount> = {}): RevenueAccount => ({ orgId, planId, state: "active", mode: "live", cancelAtPeriodEnd: false, ...over });

describe("revenue from Farbaek's own records (ADR 0106)", () => {
  it("counts live paying subscriptions at list price, a yearly plan as a twelfth of its charge", () => {
    const r = computeRevenue({
      accounts: [
        acct("a", "starter"),
        acct("b", "starter", { state: "past_due" }),
        acct("c", "lite"), // yearly: $11.88 / 12 = 99 cents
        acct("d", "maker_monthly", { state: "cancellation_scheduled", cancelAtPeriodEnd: true }),
        acct("e", "pro", { mode: "test" }), // a test card never counts
        acct("f", "max", { state: "free" }),
        acct("g", null, { state: "trialing" }),
        acct("h", "enterprise"),
      ],
      topups: [],
      trials: [],
      aiUsd: 0,
      now: NOW,
    });
    expect(r.payingWorkspaces).toBe(4);
    expect(r.mrrCents).toBe(999 + 999 + 99 + 199);
    expect(r.byPlan.map((p) => [p.planId, p.workspaces, p.monthlyCents])).toEqual([
      ["lite", 1, 99],
      ["maker_monthly", 1, 199],
      ["starter", 2, 1998],
    ]);
    expect(r.cancellationsScheduled).toBe(1);
    expect(r.pastDue).toBe(1);
  });

  it("adds this month's live top-ups, and sets revenue against worst-case fees and the AI list cost", () => {
    const r = computeRevenue({
      accounts: [acct("a", "pro")],
      topups: [
        { packCents: 2500, mode: "live", paidAt: "2026-11-03T00:00:00Z" },
        { packCents: 1000, mode: "live", paidAt: "2026-10-30T00:00:00Z" }, // last month
        { packCents: 5000, mode: "test", paidAt: "2026-11-04T00:00:00Z" },
        { packCents: 1000, mode: "live", paidAt: null },
      ],
      trials: [],
      aiUsd: 12.34,
      now: NOW,
    });
    expect([r.topupsCents, r.topupsCount]).toEqual([2500, 1]);
    expect(worstFeeCents(5000)).toBe(490);
    const fees = worstFeeCents(5000) + worstFeeCents(2500);
    expect(r.margin).toEqual({ revenueCents: 7500, feesCents: fees, aiCents: 1234, share: (7500 - fees - 1234) / 7500 });
  });

  it("spreads a yearly plan's fee over twelve months, and shows no margin before there's revenue", () => {
    const yearly = computeRevenue({ accounts: [acct("a", "maker")], topups: [], trials: [], aiUsd: 1, now: NOW });
    expect(yearly.margin?.feesCents).toBe(Math.round(worstFeeCents(2388) / 12));
    expect(computeRevenue({ accounts: [], topups: [], trials: [], aiUsd: 5, now: NOW }).margin).toBeNull();
  });

  it("counts trials that ended in the last 90 days, and how many of those workspaces pay now", () => {
    const r = computeRevenue({
      accounts: [acct("paid", "lite_monthly"), acct("test", "pro", { mode: "test" })],
      topups: [],
      trials: [
        { orgId: "paid", endsAt: "2026-11-10T00:00:00Z" },
        { orgId: "test", endsAt: "2026-11-01T00:00:00Z" },
        { orgId: "free", endsAt: "2026-09-01T00:00:00Z" },
        { orgId: "old", endsAt: "2026-07-01T00:00:00Z" }, // over 90 days ago
        { orgId: "running", endsAt: "2026-11-30T00:00:00Z" }, // still on its trial
      ],
      aiUsd: 0,
      now: NOW,
    });
    expect(r.trials).toEqual({ ended: 3, converted: 1 });
  });
});
