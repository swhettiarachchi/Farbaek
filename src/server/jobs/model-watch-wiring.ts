/**
 * The daily model check's dependencies on this server (ADR 0090): Anthropic's
 * Models API, the routing with today's switches, the v57 functions, and
 * email when it's on. Null without an Anthropic key or the server key.
 */
import { z } from "zod";
import { tierModels } from "@/core/agent/routing";
import { listAnthropicModels } from "@/server/ai/model-catalog";
import { hasAnthropicKey } from "@/server/ai/config";
import { sendEmail } from "@/server/email/compose";
import { readEmailConfig } from "@/server/email/config";
import { platformModels, refreshPlatformState } from "@/server/platform/state";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { alertEmail } from "./platform-alerts-wiring";
import type { ModelWatchDeps } from "./model-watch";

export async function modelWatchDeps(): Promise<ModelWatchDeps | null> {
  if (!hasAnthropicKey()) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  await refreshPlatformState(true);

  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await admin!.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }

  const config = readEmailConfig();
  return {
    list: async () => (await listAnthropicModels()) ?? [],
    configured: () => tierModels("anthropic", platformModels()),
    async lastCheckedAt() {
      const { data, error } = await admin.from("model_checks").select("checked_at").order("checked_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw new Error(`model_checks: ${error.message}`);
      return z.object({ checked_at: z.string() }).nullable().parse(data)?.checked_at ?? null;
    },
    record: async (listed, findings) => {
      await rpc("app_record_model_check", { p_listed: listed.map((m) => ({ id: m.id, name: m.displayName, created_at: m.createdAt })), p_findings: findings });
    },
    email: config
      ? {
          config,
          to: alertEmail(),
          claim: async (day, kind) => (await rpc("app_claim_platform_alert", { p_day: day, p_kind: kind })) === true,
          finish: async (day, kind, status, detail) => {
            await rpc("app_finish_platform_alert", { p_day: day, p_kind: kind, p_status: status, p_detail: detail });
          },
          send: (message) => sendEmail(config, message),
        }
      : null,
  };
}
