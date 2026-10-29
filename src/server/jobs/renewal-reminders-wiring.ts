/**
 * The yearly renewal reminder job's dependencies on this server (ADR 0105):
 * the service-role database functions from migration v66, and the shared
 * email lookups. Null when email is off or there's no server key.
 */
import { z } from "zod";
import { YEARLY_PLAN_IDS } from "@/core/billing/catalog";
import { isPaidPlanId } from "@/core/billing/provider-state";
import { readEmailConfig } from "@/server/email/config";
import { confirmedEmail } from "@/server/email/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { RenewalReminderDeps } from "./renewal-reminders";

const Candidate = z.object({
  org_id: z.string().uuid(),
  org_name: z.string(),
  plan_id: z.string(),
  renews_at: z.string(),
});

export function renewalReminderDeps(): RenewalReminderDeps | null {
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
    async candidates(now) {
      const rows = z.array(Candidate).parse(await rpc("app_billing_renewal_candidates", { p_now: now.toISOString(), p_plans: YEARLY_PLAN_IDS }));
      return rows.flatMap((r) => (isPaidPlanId(r.plan_id) ? [{ orgId: r.org_id, orgName: r.org_name, planId: r.plan_id, renewsAt: new Date(r.renews_at) }] : []));
    },
    claim: async (orgId, renewsAt) => (await rpc("app_billing_claim_renewal_reminder", { p_org: orgId, p_period_end: renewsAt.toISOString() })) === true,
    finish: async (orgId, renewsAt, status, recipients, detail) => {
      await rpc("app_billing_finish_renewal_reminder", { p_org: orgId, p_period_end: renewsAt.toISOString(), p_status: status, p_recipients: recipients, p_detail: detail });
    },
    async recipients(orgId) {
      const { data, error } = await admin.from("organization_members").select("user_id").eq("org_id", orgId).in("role", ["owner", "admin"]);
      if (error) throw new Error(`organization_members: ${error.message}`);
      const out: string[] = [];
      for (const m of (data ?? []) as { user_id: string }[]) {
        const address = await confirmedEmail(admin, m.user_id);
        if (address) out.push(address);
      }
      return out;
    },
  };
}
