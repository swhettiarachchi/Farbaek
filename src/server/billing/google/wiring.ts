/**
 * Google Play purchases on this server (ADR 0154, ADR 0186). The payments
 * profile and the five subscriptions are in place, so selling opens by
 * itself once the service account's key is saved (scripts/vps/set-google-play.ps1),
 * unless GOOGLE_PLAY_BILLING=off. Until then the Android app sells nothing,
 * as ADR 0150 has it, and the actions say plans can't be bought there yet.
 */
import { z } from "zod";
import { ANDROID_APP_PACKAGE } from "@/core/billing/store-client";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createGooglePlayClient } from "./client";
import type { ApplyOutcome, BindOutcome, GoogleDeps, GooglePurchaseRow } from "./service";
import { subscriptionRef } from "./service";
import { googleAccessTokens, googleServiceAccount } from "./token";

export function googlePlayOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.GOOGLE_PLAY_BILLING?.trim() !== "off";
}

/** On, with a usable service account: what the Billing page asks before offering Google Play. */
export function googlePlayReady(env: Record<string, string | undefined> = process.env): boolean {
  return googlePlayOn(env) && googleServiceAccount(env) !== null;
}

const Row = z.object({
  token_sha256: z.string(),
  purchase_token: z.string(),
  org_id: z.string(),
  product_id: z.string(),
  mode: z.enum(["test", "live"]),
  status: z.enum(["active", "superseded", "ended"]),
  acknowledged: z.boolean(),
  last_synced_at: z.string().nullable(),
});
const COLUMNS = "token_sha256, purchase_token, org_id, product_id, mode, status, acknowledged, last_synced_at";
const APPLY = ["applied", "unchanged", "stale", "other_subscription"] as const;
const BIND = ["bound", "successor", "bound_here", "bound_elsewhere", "needs_successor", "paid_elsewhere", "no_intent"] as const;

function toRow(data: unknown): GooglePurchaseRow {
  const r = Row.parse(data);
  return {
    tokenSha256: r.token_sha256,
    purchaseToken: r.purchase_token,
    orgId: r.org_id,
    productId: r.product_id,
    mode: r.mode,
    status: r.status,
    acknowledged: r.acknowledged,
    lastSyncedAt: r.last_synced_at ? new Date(r.last_synced_at) : null,
  };
}

export function googlePlayDeps(env: Record<string, string | undefined> = process.env): GoogleDeps | null {
  const admin = createSupabaseAdminClient();
  const account = googleServiceAccount(env);
  if (!admin || !account) return null;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as unknown;
  };
  return {
    client: createGooglePlayClient({ packageName: ANDROID_APP_PACKAGE, accessToken: googleAccessTokens(account) }),
    async openIntent(i) {
      await rpc("app_google_open_intent", { p_org: i.orgId, p_actor: i.actor, p_product: i.productId });
    },
    async bind(i): Promise<BindOutcome> {
      const r = await rpc("app_google_bind_purchase", {
        p_org: i.orgId,
        p_actor: i.actor,
        p_token: i.purchaseToken,
        p_token_sha256: i.tokenSha256,
        p_product: i.productId,
        p_mode: i.mode,
        p_predecessor_sha256: i.predecessorSha256,
        p_started_at: i.startedAt.toISOString(),
      });
      return z.enum(BIND).parse(r);
    },
    async purchase(sha) {
      const { data, error } = await admin.from("google_play_purchases").select(COLUMNS).eq("token_sha256", sha).maybeSingle();
      if (error) throw new Error(`google_play_purchases: ${error.message}`);
      return data ? toRow(data) : null;
    },
    async apply(i): Promise<ApplyOutcome> {
      const r = await rpc("app_billing_apply_subscription", {
        p_org: i.orgId,
        p_provider: "google",
        p_mode: i.mode,
        p_subscription_id: subscriptionRef(i.tokenSha256),
        p_customer_id: null,
        p_state: i.plan.state,
        p_plan: i.plan.planId,
        p_paid_through: i.plan.paidThrough?.toISOString() ?? null,
        p_suspended_reason: i.plan.suspendedReason,
        p_cancel_at_period_end: i.plan.cancelAtPeriodEnd,
        p_started_at: i.plan.startedAt.toISOString(),
        p_synced_at: i.syncedAt.toISOString(),
        p_source: i.source,
      });
      return z.enum(APPLY).parse(r);
    },
    async markChecked(i) {
      await rpc("app_google_mark_checked", {
        p_token_sha256: i.tokenSha256,
        p_status: i.status,
        p_synced_at: i.syncedAt.toISOString(),
        p_next_check_at: i.nextCheckAt.toISOString(),
        p_detail: i.detail,
      });
    },
    async markAcknowledged(sha) {
      await rpc("app_google_mark_acknowledged", { p_token_sha256: sha });
    },
    async due(limit) {
      const { data, error } = await admin
        .from("google_play_purchases")
        .select(COLUMNS)
        .eq("status", "active")
        .lte("next_check_at", new Date().toISOString())
        .order("next_check_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`google_play_purchases: ${error.message}`);
      return (data ?? []).map(toRow);
    },
    async voidedSince() {
      const { data, error } = await admin.from("google_play_sync").select("voided_since").maybeSingle();
      if (error) throw new Error(`google_play_sync: ${error.message}`);
      const at = (data as { voided_since?: unknown } | null)?.voided_since;
      return typeof at === "string" ? new Date(at) : null;
    },
    async setVoidedSince(at) {
      await rpc("app_google_set_voided_since", { p_at: at.toISOString() });
    },
    now: () => new Date(),
  };
}
