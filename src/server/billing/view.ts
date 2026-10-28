/**
 * What the Billing page shows about payments (ADR 0100): whether checkout is
 * open to this workspace, its subscription as last read from the provider,
 * and a checkout started in the last day. Read with the server key after the
 * page has checked membership; browsers can't read these tables.
 */
import { z } from "zod";
import { getPlan } from "@/core/billing/catalog";
import type { PaidPlanId } from "@/core/billing/provider";
import { isPaidPlanId } from "@/core/billing/provider-state";
import type { SubscriptionState } from "@/core/billing/trial";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { checkoutOpenFor, readBillingConfig } from "./config";

export const LIVE_SUBSCRIPTION_STATES: ReadonlySet<SubscriptionState> = new Set(["active", "past_due", "cancellation_scheduled", "suspended"]);

export interface BillingView {
  /** Checkout works for this workspace: live for everyone, or test mode on the allowlist, with a server key. */
  open: boolean;
  /** Which kind of payments are open, when they are. */
  mode: "test" | "live" | null;
  /** The provider's subscription as last applied, when there is one. */
  subscription: {
    state: SubscriptionState;
    planId: PaidPlanId;
    planName: string;
    paidThrough: string | null;
    suspendedReason: "payment" | "paused" | null;
    hasCustomer: boolean;
  } | null;
  /** A checkout started in the last 24 hours and not yet confirmed. */
  openCheckout: { planId: PaidPlanId; startedAt: string } | null;
  /** Top-ups (ADR 0102): the monthly limit, and this month's paid top-ups plus checkouts open in the last day. */
  topups: { capCents: number | null; spentCents: number; openCents: number } | null;
}

const CLOSED: BillingView = { open: false, mode: null, subscription: null, openCheckout: null, topups: null };

const Account = z.object({
  state: z.string(),
  paid_plan_id: z.string().nullable(),
  paid_through: z.string().nullable(),
  suspended_reason: z.enum(["payment", "paused"]).nullable(),
  provider_subscription_id: z.string().nullable(),
  provider_customer_id: z.string().nullable(),
  topup_cap_cents: z.number().int().nullable().optional(),
});

export async function loadBillingView(orgId: string, demo: boolean): Promise<BillingView> {
  const config = readBillingConfig();
  const admin = createSupabaseAdminClient();
  if (demo || !admin || !checkoutOpenFor(config, orgId)) return CLOSED;

  const [account, checkout] = await Promise.all([
    admin.from("billing_accounts").select("state, paid_plan_id, paid_through, suspended_reason, provider_subscription_id, provider_customer_id, topup_cap_cents").eq("org_id", orgId).maybeSingle(),
    admin
      .from("billing_checkouts")
      .select("plan_id, created_at")
      .eq("org_id", orgId)
      .eq("status", "open")
      .gt("created_at", new Date(Date.now() - 86_400_000).toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (account.error || checkout.error) return { ...CLOSED, open: true, mode: config!.mode };

  const a = account.data ? Account.safeParse(account.data) : null;
  const state = a?.success ? (a.data.state as SubscriptionState) : null;
  const subscription =
    a?.success && state && LIVE_SUBSCRIPTION_STATES.has(state) && a.data.provider_subscription_id && isPaidPlanId(a.data.paid_plan_id)
      ? {
          state,
          planId: a.data.paid_plan_id,
          planName: getPlan(a.data.paid_plan_id).name,
          paidThrough: a.data.paid_through,
          suspendedReason: a.data.suspended_reason,
          hasCustomer: Boolean(a.data.provider_customer_id),
        }
      : null;
  const c = checkout.data as { plan_id?: unknown; created_at?: unknown } | null;
  const openCheckout = !subscription && c && isPaidPlanId(c.plan_id) && typeof c.created_at === "string" ? { planId: c.plan_id, startedAt: c.created_at } : null;
  return { open: true, mode: config!.mode, subscription, openCheckout, topups: subscription && a?.success ? await topupSummary(admin, orgId, a.data.topup_cap_cents ?? null) : null };
}

/** This calendar month's paid top-ups, and checkouts opened in the last day: the same count the database checks the limit with. */
async function topupSummary(admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>, orgId: string, capCents: number | null): Promise<BillingView["topups"]> {
  const now = new Date();
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
  const { data, error } = await admin.from("billing_topups").select("status, pack_cents, created_at, paid_at").eq("org_id", orgId).gte("created_at", new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString());
  if (error) return { capCents, spentCents: 0, openCents: 0 };
  const rows = (data ?? []) as { status: string; pack_cents: number; created_at: string; paid_at: string | null }[];
  const dayAgo = now.getTime() - 86_400_000;
  return {
    capCents,
    spentCents: rows.filter((t) => t.status === "paid" && t.paid_at !== null && Date.parse(t.paid_at) >= Date.parse(month)).reduce((n, t) => n + t.pack_cents, 0),
    openCents: rows.filter((t) => t.status === "open" && new Date(t.created_at).getTime() > dayAgo).reduce((n, t) => n + t.pack_cents, 0),
  };
}
