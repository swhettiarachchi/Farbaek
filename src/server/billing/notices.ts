/**
 * What a workspace's owners and admins are told when its plan changes state
 * (spec §23.3, "notify the user"; ADR 0100). Only real changes of state send
 * one: a renewal that keeps a plan active sends nothing. The words say what
 * happened, when, and what to do, with no figures Farbaek doesn't know.
 */
import type { AppliedState } from "@/core/billing/provider-state";
import type { SubscriptionState } from "@/core/billing/trial";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPlan } from "@/core/billing/catalog";
import { renderEmail, sendEmail } from "@/server/email/compose";
import { readEmailConfig } from "@/server/email/config";
import { confirmedEmail } from "@/server/email/wiring";
import { log } from "@/server/observability/log";

export interface BillingNotice {
  subject: string;
  lines: string[];
  link: { label: string; path: string };
}

const day = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : null);

export function billingNotice(previous: SubscriptionState | null, next: AppliedState, workspace: string): BillingNotice | null {
  if (previous === next.state) return null;
  const plan = next.paidPlanId ? getPlan(next.paidPlanId).name : null;
  const until = day(next.paidThrough);
  const billing = { label: "Open Billing", path: "/app/billing" };
  switch (next.state) {
    case "active":
      if (!plan) return null;
      return previous === "cancellation_scheduled"
        ? { subject: `${workspace} keeps ${plan}`, lines: [`${workspace} keeps ${plan}. Its cancellation is undone${until ? `, and it renews on ${until}` : ""}.`], link: billing }
        : {
            subject: `${workspace} is on ${plan}`,
            lines: [`${workspace} is on ${plan} now${until ? `, renewing on ${until}` : ""}. Its limits apply from now on.`, "Receipts and invoices are in Dodo Payments' portal, from Billing."],
            link: billing,
          };
    case "past_due":
      return {
        subject: `${workspace}: a payment didn't go through`,
        lines: [`The last payment for ${workspace}${plan ? `'s ${plan} plan` : ""} didn't go through. ${plan ?? "Paid"} features keep working for now.`, "Update the payment method from Billing to keep them."],
        link: { label: "Update payment method", path: "/app/billing" },
      };
    case "suspended":
      return {
        subject: `${workspace}: paid features are paused`,
        lines: [
          next.suspendedReason === "paused"
            ? `${workspace}'s subscription is paused, so its paid features are paused too.`
            : `${workspace}'s paid features are paused until a payment goes through.`,
          "Your projects and data are kept, and exports, billing and safety controls still work.",
        ],
        link: billing,
      };
    case "cancellation_scheduled":
      return {
        subject: `${workspace}: ${plan ?? "your plan"} is cancelled`,
        lines: [`${plan ?? "The plan"} keeps working${until ? ` until ${until}` : " to the end of the period you paid for"}. Then ${workspace} moves to Free and nothing more is charged.`, "Changed your mind? Keep the plan from Billing."],
        link: billing,
      };
    case "expired":
      return {
        subject: `${workspace} is on Free`,
        lines: [`${workspace}'s paid plan has ended, so it's on Free now. Nothing more is charged.`, "Your projects and data are kept. Choose a plan again from Billing at any time."],
        link: billing,
      };
    default:
      return null;
  }
}

/**
 * Emails the notice to the workspace's owners and admins at their confirmed
 * addresses. Billing changes always go out: they're about the account, not
 * updates a person can turn off. Never throws; a failed email is logged.
 */
export async function sendBillingNotice(admin: SupabaseClient, orgId: string, previous: SubscriptionState | null, next: AppliedState): Promise<number> {
  const config = readEmailConfig();
  if (!config) return 0;
  try {
    const [org, members] = await Promise.all([
      admin.from("organizations").select("name").eq("id", orgId).maybeSingle(),
      admin.from("organization_members").select("user_id").eq("org_id", orgId).in("role", ["owner", "admin"]),
    ]);
    const name = typeof (org.data as { name?: unknown } | null)?.name === "string" ? (org.data as { name: string }).name : "Your workspace";
    const notice = billingNotice(previous, next, name);
    if (!notice || members.error) return 0;
    let sent = 0;
    for (const m of (members.data ?? []) as { user_id: string }[]) {
      const to = await confirmedEmail(admin, m.user_id);
      if (!to) continue;
      await sendEmail(config, renderEmail(config, to, { subject: notice.subject, lines: notice.lines }, notice.link, `You're getting this because you're an owner or admin of ${name}, and it's about its plan.`));
      sent += 1;
    }
    return sent;
  } catch (e) {
    log("warn", "billing.notice_failed", { org: orgId, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    return 0;
  }
}
