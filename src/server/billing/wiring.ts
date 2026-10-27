/**
 * Payments on this server (ADR 0100): the Dodo client and the service-role
 * database functions from migration v62. Null when payments aren't connected
 * or there's no server key, so every caller shows the honest reason instead.
 */
import { z } from "zod";
import { PLAN_CATALOG_VERSION } from "@/core/billing/catalog";
import type { NormalizedSubscription, PaidPlanId, ProviderEvent, ProviderMode } from "@/core/billing/provider";
import { isPaidPlanId, type AppliedState } from "@/core/billing/provider-state";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { SubscriptionState } from "@/core/billing/trial";
import { readBillingConfig, type BillingConfig } from "./config";
import { sendBillingNotice } from "./notices";
import { createDodoClient, type Fetch } from "./providers/dodo/client";
import type { BillingAccount, BillingDeps } from "./use-cases";
import type { ApplyResult, ClaimedEvent, WebhookDeps } from "./webhooks";

type Admin = NonNullable<ReturnType<typeof createSupabaseAdminClient>>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATES = ["free", "trialing", "checkout_pending", "active", "past_due", "cancellation_scheduled", "suspended", "expired"] as const;

const Claimed = z.object({
  id: z.string().uuid(),
  mode: z.enum(["test", "live"]),
  type: z.string(),
  subscription_id: z.string().nullable(),
  org_id: z.string().uuid().nullable(),
  attempts: z.number().int(),
});

const Account = z.object({
  state: z.enum(STATES),
  paid_plan_id: z.string().nullable(),
  paid_through: z.string().nullable(),
  provider_subscription_id: z.string().nullable(),
  provider_customer_id: z.string().nullable(),
});

const APPLY_RESULTS = ["applied", "unchanged", "stale", "other_subscription"] as const;

function shared(config: BillingConfig, admin: Admin) {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }

  async function planForProduct(productId: string): Promise<PaidPlanId | null> {
    const { data, error } = await admin.from("billing_products").select("plan_id").eq("provider", config.provider).eq("mode", config.mode).eq("product_id", productId).maybeSingle();
    if (error) throw new Error(`billing_products: ${error.message}`);
    const plan = (data as { plan_id?: unknown } | null)?.plan_id;
    return isPaidPlanId(plan) ? plan : null;
  }

  async function apply(orgId: string, sub: NormalizedSubscription, state: AppliedState, syncedAt: Date, source: string): Promise<ApplyResult> {
    const before = await admin.from("billing_accounts").select("state").eq("org_id", orgId).maybeSingle();
    const previous = (before.data as { state?: SubscriptionState } | null)?.state ?? null;
    const result = await rpc("app_billing_apply_subscription", {
      p_org: orgId,
      p_provider: config.provider,
      p_mode: config.mode,
      p_subscription_id: sub.id,
      p_customer_id: sub.customerId,
      p_state: state.state,
      p_plan: state.paidPlanId,
      p_paid_through: state.paidThrough?.toISOString() ?? null,
      p_suspended_reason: state.suspendedReason,
      p_cancel_at_period_end: state.cancelAtPeriodEnd,
      p_started_at: state.startedAt.toISOString(),
      p_synced_at: syncedAt.toISOString(),
      p_source: source.slice(0, 80),
    });
    const applied = z.enum(APPLY_RESULTS).parse(result);
    // The owners and admins hear about a change of state, whichever path made it.
    if (applied === "applied" && previous !== state.state) await sendBillingNotice(admin, orgId, previous, state);
    return applied;
  }

  return { rpc, planForProduct, apply };
}

export function billingWebhookDeps(fetchImpl?: Fetch): WebhookDeps | null {
  const config = readBillingConfig();
  const admin = createSupabaseAdminClient();
  if (!config || !admin) return null;
  const { rpc, planForProduct, apply } = shared(config, admin);
  return {
    config,
    provider: createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: config.mode, fetch: fetchImpl }),
    async record(event: ProviderEvent, mode: ProviderMode) {
      const id = await rpc("app_billing_record_webhook", {
        p_provider: event.provider,
        p_mode: mode,
        p_webhook_id: event.webhookId,
        p_type: event.type,
        p_payload: event.payload,
        p_subscription_id: event.subscriptionId && /^[A-Za-z0-9_-]{1,200}$/.test(event.subscriptionId) ? event.subscriptionId : null,
        p_org: event.orgId && UUID.test(event.orgId) ? event.orgId : null,
        p_event_at: event.eventAt.toISOString(),
      });
      return typeof id === "string" ? id : null;
    },
    async claim(limit, id): Promise<ClaimedEvent[]> {
      const rows = z.array(Claimed).parse((await rpc("app_billing_claim_webhooks", { p_limit: limit, p_id: id })) ?? []);
      return rows.map((r) => ({ id: r.id, mode: r.mode, type: r.type, subscriptionId: r.subscription_id, orgId: r.org_id, attempts: r.attempts }));
    },
    async finish(id, status, error, orgId) {
      return String(await rpc("app_billing_finish_webhook", { p_id: id, p_status: status, p_error: error, p_org: orgId && UUID.test(orgId) ? orgId : null }));
    },
    planForProduct,
    async orgForSubscription(subscriptionId) {
      const { data, error } = await admin.from("billing_accounts").select("org_id").eq("provider_subscription_id", subscriptionId).maybeSingle();
      if (error) throw new Error(`billing_accounts: ${error.message}`);
      const org = (data as { org_id?: unknown } | null)?.org_id;
      return typeof org === "string" ? org : null;
    },
    apply,
    now: () => new Date(),
  };
}

export function billingDeps(fetchImpl?: Fetch): BillingDeps | null {
  const config = readBillingConfig();
  const admin = createSupabaseAdminClient();
  if (!config || !admin) return null;
  const { planForProduct, apply } = shared(config, admin);
  return {
    config,
    provider: createDodoClient({ apiKey: config.apiKey, baseUrl: config.baseUrl, mode: config.mode, fetch: fetchImpl }),
    async account(orgId): Promise<BillingAccount | null> {
      const { data, error } = await admin
        .from("billing_accounts")
        .select("state, paid_plan_id, paid_through, provider_subscription_id, provider_customer_id")
        .eq("org_id", orgId)
        .maybeSingle();
      if (error) throw new Error(`billing_accounts: ${error.message}`);
      if (!data) return null;
      const a = Account.parse(data);
      return {
        state: a.state,
        planId: isPaidPlanId(a.paid_plan_id) ? a.paid_plan_id : null,
        subscriptionId: a.provider_subscription_id,
        customerId: a.provider_customer_id,
        paidThrough: a.paid_through ? new Date(a.paid_through) : null,
      };
    },
    async productFor(planId) {
      const { data, error } = await admin
        .from("billing_products")
        .select("product_id, amount_cents")
        .eq("provider", config.provider)
        .eq("mode", config.mode)
        .eq("plan_id", planId)
        .eq("interval", "month")
        .eq("catalog_version", PLAN_CATALOG_VERSION)
        .maybeSingle();
      if (error) throw new Error(`billing_products: ${error.message}`);
      const row = data as { product_id?: unknown; amount_cents?: unknown } | null;
      return row && typeof row.product_id === "string" && typeof row.amount_cents === "number" ? { productId: row.product_id, amountCents: row.amount_cents } : null;
    },
    planForProduct,
    async recordCheckout(input) {
      const { error } = await admin.rpc("app_billing_start_checkout", {
        p_org: input.orgId,
        p_actor: input.actorId,
        p_provider: config.provider,
        p_mode: config.mode,
        p_session_id: input.sessionId,
        p_plan: input.planId,
        p_product: input.productId,
        p_amount_cents: input.amountCents,
        p_consent_text: input.consentText,
      });
      if (!error) return { ok: true };
      if (error.message.includes("FORBIDDEN")) return { ok: false, code: "FORBIDDEN" };
      if (error.message.includes("ALREADY_SUBSCRIBED")) return { ok: false, code: "ALREADY_SUBSCRIBED" };
      return { ok: false, code: "UNKNOWN" };
    },
    apply,
    now: () => new Date(),
  };
}
