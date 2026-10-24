/**
 * The platform alert job's dependencies on this server (ADR 0068): the
 * service-role functions from migration v40, the daily AI limit, and email.
 * Null when email is off or there's no server key.
 */
import { z } from "zod";
import type { SpendAlertKind } from "@/core/billing/spend-alert";
import { CONTACT } from "@/config/contact";
import { platformDailyAiUnits } from "@/server/ai/config";
import { sendEmail } from "@/server/email/compose";
import { readEmailConfig } from "@/server/email/config";
import { isPlainAddress } from "@/server/email/message";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { PlatformAlertDeps } from "./platform-alerts";

const KINDS: readonly SpendAlertKind[] = ["ai_spend_80", "ai_spend_100"];
const Recorded = z.array(z.object({ kind: z.string(), status: z.string(), attempts: z.number() }));

/** Where alerts go: ALERT_EMAIL when it's a plain address, otherwise hello@. */
export function alertEmail(read: (name: string) => string | undefined = (name) => process.env[name]): string {
  const value = read("ALERT_EMAIL")?.trim();
  return value && isPlainAddress(value) ? value : CONTACT.hello;
}

export function platformAlertDeps(): PlatformAlertDeps | null {
  const config = readEmailConfig();
  if (!config) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;

  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await admin!.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }

  return {
    config,
    to: alertEmail(),
    limitUnits: platformDailyAiUnits(),
    unitsToday: async () => Number(await rpc("app_platform_ai_units_today", {})),
    async recorded(day) {
      const rows = Recorded.parse(await rpc("app_platform_alerts_on", { p_day: day }));
      // A failed alert with tries left isn't settled: the claim retries it.
      return new Set(rows.filter((r) => r.status !== "failed" || r.attempts >= 3).map((r) => r.kind).filter((k): k is SpendAlertKind => (KINDS as readonly string[]).includes(k)));
    },
    claim: async (day, kind) => (await rpc("app_claim_platform_alert", { p_day: day, p_kind: kind })) === true,
    finish: async (day, kind, status, detail) => {
      await rpc("app_finish_platform_alert", { p_day: day, p_kind: kind, p_status: status, p_detail: detail });
    },
    skip: async (day, kind, detail) => {
      await rpc("app_skip_platform_alert", { p_day: day, p_kind: kind, p_detail: detail });
    },
    send: (message) => sendEmail(config, message),
  };
}
