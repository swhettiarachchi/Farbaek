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
  /** Checkout works for this workspace (test mode, on the allowlist, with a server key). */
  open: boolean;
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
}

const CLOSED: BillingView = { open: false, subscription: null, openCheckout: null };

const Account = z.object({
  state: z.string(),
  paid_plan_id: z.string().nullable(),
  paid_through: z.string().nullable(),
  suspended_reason: z.enum(["payment", "paused"]).nullable(),
  provider_subscription_id: z.string().nullable(),
  provider_customer_id: z.string().nullable(),
});

export async function loadBillingView(orgId: string, demo: boolean): Promise<BillingView> {
  const config = readBillingConfig();
  const admin = createSupabaseAdminClient();
  if (demo || !admin || !checkoutOpenFor(config, orgId)) return CLOSED;

  const [account, checkout] = await Promise.all([
    admin.from("billing_accounts").select("state, paid_plan_id, paid_through, suspended_reason, provider_subscription_id, provider_customer_id").eq("org_id", orgId).maybeSingle(),
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
  if (account.error || checkout.error) return { ...CLOSED, open: true };

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
  return { open: true, subscription, openCheckout };
}
