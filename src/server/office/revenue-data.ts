/**
 * What the office's Revenue section reads (ADR 0106): live subscriptions,
 * this month's paid top-ups and the trials that ended in the last 90 days,
 * with the server key. Read only; the sums are worked out in
 * core/billing/revenue.ts.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { computeRevenue, type Revenue } from "@/core/billing/revenue";

const LIMIT = 10_000;

const Account = z.object({
  org_id: z.string(),
  state: z.string(),
  paid_plan_id: z.string().nullable(),
  provider_mode: z.enum(["test", "live"]).nullable(),
  cancel_at_period_end: z.boolean(),
});
const Topup = z.object({ pack_cents: z.number().int(), mode: z.enum(["test", "live"]), paid_at: z.string().nullable() });
const Trial = z.object({ org_id: z.string(), ends_at: z.string() });

/** Null when a table can't be read, so the page says so instead of showing a wrong number. */
export async function loadRevenue(admin: SupabaseClient, aiUsd: number, now = new Date()): Promise<Revenue | null> {
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 86_400_000).toISOString();
  const [accounts, topups, trials] = await Promise.all([
    admin.from("billing_accounts").select("org_id, state, paid_plan_id, provider_mode, cancel_at_period_end").eq("provider_mode", "live").limit(LIMIT),
    admin.from("billing_topups").select("pack_cents, mode, paid_at").eq("mode", "live").eq("status", "paid").gte("paid_at", monthStart).limit(LIMIT),
    admin.from("trials").select("org_id, ends_at").gte("ends_at", ninetyDaysAgo).lte("ends_at", now.toISOString()).limit(LIMIT),
  ]);
  if (accounts.error || topups.error || trials.error) return null;
  const a = z.array(Account).safeParse(accounts.data ?? []);
  const t = z.array(Topup).safeParse(topups.data ?? []);
  const tr = z.array(Trial).safeParse(trials.data ?? []);
  if (!a.success || !t.success || !tr.success) return null;
  return computeRevenue({
    accounts: a.data.map((r) => ({ orgId: r.org_id, planId: r.paid_plan_id, state: r.state, mode: r.provider_mode, cancelAtPeriodEnd: r.cancel_at_period_end })),
    topups: t.data.map((r) => ({ packCents: r.pack_cents, mode: r.mode, paidAt: r.paid_at })),
    trials: tr.data.map((r) => ({ orgId: r.org_id, endsAt: r.ends_at })),
    aiUsd,
    now,
  });
}
