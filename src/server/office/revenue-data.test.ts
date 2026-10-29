import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { loadRevenue } from "./revenue-data";

const NOW = new Date("2026-11-20T12:00:00Z");

/** A stand-in for the server-key client: each table returns its rows, and the filters it was asked for are recorded. */
function fakeAdmin(tables: Record<string, { data?: unknown[]; error?: { message: string } }>) {
  const asked: Record<string, string[]> = {};
  const admin = {
    from(table: string) {
      asked[table] = [];
      const chain = {
        select: () => chain,
        eq: (c: string, v: unknown) => (asked[table]!.push(`${c}=${String(v)}`), chain),
        gte: (c: string, v: unknown) => (asked[table]!.push(`${c}>=${String(v)}`), chain),
        lte: (c: string, v: unknown) => (asked[table]!.push(`${c}<=${String(v)}`), chain),
        limit: async () => ({ data: tables[table]?.data ?? [], error: tables[table]?.error ?? null }),
      };
      return chain;
    },
  };
  return { admin: admin as unknown as SupabaseClient, asked };
}

describe("loadRevenue (ADR 0106)", () => {
  it("reads only live subscriptions and paid live top-ups from this month, and sums them", async () => {
    const { admin, asked } = fakeAdmin({
      billing_accounts: { data: [{ org_id: "o1", state: "active", paid_plan_id: "starter", provider_mode: "live", cancel_at_period_end: false }] },
      billing_topups: { data: [{ pack_cents: 1000, mode: "live", paid_at: "2026-11-02T00:00:00Z" }] },
      trials: { data: [{ org_id: "o1", ends_at: "2026-11-01T00:00:00Z" }] },
    });
    const r = await loadRevenue(admin, 2, NOW);
    expect(asked.billing_accounts).toEqual(["provider_mode=live"]);
    expect(asked.billing_topups).toEqual(["mode=live", "status=paid", "paid_at>=2026-11-01T00:00:00.000Z"]);
    expect(r).toMatchObject({ mrrCents: 999, payingWorkspaces: 1, topupsCents: 1000, trials: { ended: 1, converted: 1 } });
    expect(r?.margin?.aiCents).toBe(200);
  });

  it("returns null, never zero, when a table can't be read or a row doesn't parse", async () => {
    expect(await loadRevenue(fakeAdmin({ billing_topups: { error: { message: "down" } } }).admin, 0, NOW)).toBeNull();
    expect(await loadRevenue(fakeAdmin({ billing_accounts: { data: [{ org_id: "o1" }] } }).admin, 0, NOW)).toBeNull();
  });
});
