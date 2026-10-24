/**
 * The usage wallet's database calls (migration 15), shared by the web app's
 * writes and the agent API. Reserving and settling go through the
 * service-role-only functions; reading grants here is scoped to one
 * organization in the query, for callers that have no user session (the
 * agent API). The web app reads grants through Row Level Security instead.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { GrantRow } from "@/core/billing/wallet";
import { platformDailyAiUnits } from "@/server/ai/config";
import type { AiUsageDeps } from "./ai-usage";
import type { RpcResult } from "./use-cases";

// bigint columns arrive as numbers or numeric strings depending on the client.
export const UsageGrantRowSchema = z.object({
  id: z.string(),
  kind: z.enum(["plan", "trial", "free", "topup", "adjustment"]),
  units: z.coerce.number().int().nonnegative(),
  used: z.coerce.number().int().nonnegative(),
  starts_at: z.string(),
  expires_at: z.string(),
});

export const GRANT_COLUMNS = "id, kind, units, used, starts_at, expires_at";

export function grantFromRow(g: z.infer<typeof UsageGrantRowSchema>): GrantRow {
  return { id: g.id, kind: g.kind, units: g.units, used: g.used, startsAt: g.starts_at, expiresAt: g.expires_at };
}

export function createUsageRpcs(admin: SupabaseClient): Pick<AiUsageDeps, "reserveUsage" | "settleUsage"> {
  async function rpc<T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return { ok: false, error: error.message };
    const parsed = schema.safeParse(data);
    return parsed.success ? { ok: true, value: parsed.data } : { ok: false, error: "UNEXPECTED_RESPONSE" };
  }
  return {
    reserveUsage: (i) =>
      rpc(
        "app_reserve_usage",
        // The platform's daily AI limit rides on every reservation (ADR 0065).
        { p_org: i.orgId, p_actor: i.actor, p_key: i.key, p_operation: i.operation, p_task: i.taskId, p_units: i.units, p_grant: i.grant, p_platform_daily_units: platformDailyAiUnits() },
        z.string(),
      ),
    settleUsage: (i) =>
      rpc(
        "app_settle_usage",
        {
          p_org: i.orgId,
          p_entry: i.entryId,
          p_status: i.status,
          p_units: i.units,
          p_model: i.usage?.model.slice(0, 100) || null,
          p_input_tokens: i.usage?.inputTokens ?? null,
          p_output_tokens: i.usage?.outputTokens ?? null,
          p_cache_write_tokens: i.usage?.cacheWriteTokens ?? null,
          p_cache_read_tokens: i.usage?.cacheReadTokens ?? null,
          p_refund_reason: i.refundReason,
          p_retry_cap: i.retryCap,
        },
        z.null().or(z.literal("")).transform(() => null),
      ),
  };
}

/** Wallet calls for the server key: grants are read for one organization only. */
export function createServerUsageDeps(admin: SupabaseClient): AiUsageDeps {
  return {
    ...createUsageRpcs(admin),
    async listUsageGrants(orgId) {
      const { data, error } = await admin.from("usage_grants").select(GRANT_COLUMNS).eq("org_id", orgId).gt("expires_at", new Date().toISOString()).order("expires_at");
      if (error) throw new Error(`Couldn't load AI usage: ${error.message}`);
      return z.array(UsageGrantRowSchema).parse(data).map(grantFromRow);
    },
  };
}
