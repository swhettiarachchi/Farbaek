/**
 * The trial reminder job's dependencies on this server (ADR 0063): the
 * service-role database functions from migration v36, and the shared email
 * lookups. Null when email is off or there's no server key.
 */
import { z } from "zod";
import { trialWindow, type TrialReminderKind } from "@/core/billing/trial";
import { readBillingConfig } from "@/server/billing/config";
import { readEmailConfig } from "@/server/email/config";
import { confirmedEmail, wantsEmail } from "@/server/email/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { TrialReminderDeps } from "./trial-reminders";

const KINDS = ["day_7", "day_12", "day_13", "expiry"] as const;

const Candidate = z.object({
  org_id: z.string().uuid(),
  org_name: z.string(),
  started_at: z.string(),
  ends_at: z.string(),
  recorded: z.array(z.string()).nullable(),
  owners: z.array(z.string().uuid()).nullable(),
});

export function trialReminderDeps(): TrialReminderDeps | null {
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
    plansOnSale: readBillingConfig()?.mode === "live",
    async candidates(now) {
      const rows = z.array(Candidate).parse(await rpc("app_trial_reminder_candidates", { p_now: now.toISOString() }));
      return rows.map((r) => ({
        orgId: r.org_id,
        orgName: r.org_name,
        window: trialWindow(new Date(r.started_at), new Date(r.ends_at)),
        recorded: new Set((r.recorded ?? []).filter((k): k is TrialReminderKind => (KINDS as readonly string[]).includes(k))),
        owners: r.owners ?? [],
      }));
    },
    claim: async (orgId, kind) => (await rpc("app_claim_trial_reminder", { p_org: orgId, p_kind: kind })) === true,
    finish: async (orgId, kind, status, recipients, detail) => {
      await rpc("app_finish_trial_reminder", { p_org: orgId, p_kind: kind, p_status: status, p_recipients: recipients, p_detail: detail });
    },
    skip: async (orgId, kind, reason) => {
      await rpc("app_skip_trial_reminder", { p_org: orgId, p_kind: kind, p_reason: reason });
    },
    emailOf: (userId) => confirmedEmail(admin, userId),
    wants: (userId, kind) => wantsEmail(admin, userId, kind),
  };
}
