/**
 * App Store purchases on this server (ADR 0112): off until APPLE_IAP=on,
 * which the owner sets once Apple's Paid Apps Agreement, the Small Business
 * Program and the products are in place (docs/mobile/ios.md). Until then the
 * app doesn't offer them and the endpoints say they aren't open.
 */
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { verifyAppleJws } from "./jws";
import type { AppleAccount, AppleDeps, ApplyOutcome } from "./service";

export function appleIapOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.APPLE_IAP?.trim() === "on";
}

const Account = z.object({ provider: z.enum(["dodo", "apple"]).nullable(), state: z.string(), provider_subscription_id: z.string().nullable() });
const APPLY = ["applied", "unchanged", "stale", "other_subscription"] as const;

export function appleDeps(): AppleDeps | null {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as unknown;
  };
  return {
    verify: (jws) => verifyAppleJws(jws),
    async account(orgId): Promise<AppleAccount | null> {
      const { data, error } = await admin.from("billing_accounts").select("provider, state, provider_subscription_id").eq("org_id", orgId).maybeSingle();
      if (error) throw new Error(`billing_accounts: ${error.message}`);
      if (!data) return null;
      const a = Account.parse(data);
      return { provider: a.provider, state: a.state, subscriptionId: a.provider_subscription_id };
    },
    async orgForSubscription(original) {
      const { data, error } = await admin.from("billing_accounts").select("org_id").eq("provider", "apple").eq("provider_subscription_id", original).maybeSingle();
      if (error) throw new Error(`billing_accounts: ${error.message}`);
      return data ? z.string().parse((data as { org_id: unknown }).org_id) : null;
    },
    async apply(i): Promise<ApplyOutcome> {
      const r = await rpc("app_billing_apply_subscription", {
        p_org: i.orgId,
        p_provider: "apple",
        p_mode: i.mode,
        p_subscription_id: i.originalTransactionId,
        p_customer_id: null,
        p_state: i.sub.state,
        p_plan: i.sub.planId,
        p_paid_through: i.sub.paidThrough?.toISOString() ?? null,
        p_suspended_reason: i.sub.suspendedReason,
        p_cancel_at_period_end: i.sub.cancelAtPeriodEnd,
        p_started_at: i.sub.startedAt.toISOString(),
        p_synced_at: i.signedAt.toISOString(),
        p_source: i.source,
      });
      return z.enum(APPLY).parse(r);
    },
    async recordNotification(i) {
      const r = await rpc("app_apple_record_notification", { p_uuid: i.uuid, p_type: i.type, p_subtype: i.subtype, p_environment: i.environment, p_original: i.originalTransactionId });
      return z.enum(["new", "done", "retry"]).parse(r);
    },
    async finishNotification(uuid, status, detail, orgId) {
      await rpc("app_apple_finish_notification", { p_uuid: uuid, p_status: status, p_detail: detail, p_org: orgId });
    },
    now: () => new Date(),
  };
}
