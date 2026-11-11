/**
 * The yearly renewal reminder job (ADR 0105), run hourly by
 * farbaek-jobs.timer. For each workspace on Lite or Maker whose renewal is 30
 * to 16 days away, it claims the reminder for that date, emails the
 * workspace's owners and admins, and records what the mail server said. It
 * always goes out: it's about the account, not an update a person can turn
 * off. One workspace's failure never stops the others, and a failed one is
 * tried again on the next run.
 */
import { renewalReminderEmail } from "@/core/billing/renewal-emails";
import type { PaidPlanId } from "@/core/billing/provider";
import { renderEmail, sendEmail } from "@/server/email/compose";
import type { EmailConfig } from "@/server/email/config";
import { isPlainAddress } from "@/server/email/message";
import type { sendSmtp } from "@/server/email/smtp";
import { log } from "@/server/observability/log";

export interface RenewalCandidate {
  orgId: string;
  orgName: string;
  planId: PaidPlanId;
  renewsAt: Date;
}

export interface RenewalReminderDeps {
  config: EmailConfig;
  candidates(now: Date): Promise<RenewalCandidate[]>;
  claim(orgId: string, renewsAt: Date): Promise<boolean>;
  finish(orgId: string, renewsAt: Date, status: "accepted" | "failed" | "no_recipient", recipients: number, detail: string | null): Promise<void>;
  /** The confirmed addresses of the workspace's owners and admins. */
  recipients(orgId: string): Promise<string[]>;
  /** What the workspace's subscription to this plan renews at, in cents, from the product it's on; null when that can't be read (ADR 0185). */
  amountCents(orgId: string, planId: PaidPlanId): Promise<number | null>;
  send?: typeof sendSmtp;
}

export interface RenewalReminderRun {
  workspaces: number;
  accepted: number;
  failed: number;
  noRecipient: number;
}

const WHY = "You're getting this because you're an owner or admin of this workspace on Farbaek, and it's about its plan.";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export async function runRenewalReminders(deps: RenewalReminderDeps, now: Date): Promise<RenewalReminderRun> {
  const run: RenewalReminderRun = { workspaces: 0, accepted: 0, failed: 0, noRecipient: 0 };
  for (const c of await deps.candidates(now)) {
    run.workspaces += 1;
    let claimed = false;
    try {
      // A subscriber keeps the price they joined at, so the list price could be wrong: read what this one renews at.
      // Read before claiming, so a slow answer can't strand a claimed reminder that's never sent.
      const amount = await deps.amountCents(c.orgId, c.planId).catch(() => null);
      if (!(await deps.claim(c.orgId, c.renewsAt))) continue;
      claimed = true;
      const to = (await deps.recipients(c.orgId)).filter(isPlainAddress);
      if (to.length === 0) {
        await deps.finish(c.orgId, c.renewsAt, "no_recipient", 0, "No owner or admin has a confirmed address.");
        run.noRecipient += 1;
        continue;
      }
      const content = renewalReminderEmail(c.planId, c.renewsAt, c.orgName, amount);
      const refused: string[] = [];
      let accepted = 0;
      for (const address of to) {
        try {
          await sendEmail(deps.config, renderEmail(deps.config, address, content, { label: "See your plan", path: "/app/billing" }, WHY), { send: deps.send, now: () => now });
          accepted += 1;
        } catch (e) {
          refused.push(message(e));
        }
      }
      if (accepted > 0) {
        await deps.finish(c.orgId, c.renewsAt, "accepted", accepted, refused.length ? `${refused.length} of ${to.length} refused: ${refused[0]}` : null);
        run.accepted += 1;
        log("info", "email.sent", { kind: "renewal_reminder", org: c.orgId, recipients: accepted });
      } else {
        await deps.finish(c.orgId, c.renewsAt, "failed", 0, refused[0] ?? "Not sent.");
        run.failed += 1;
        log("warn", "email.failed", { kind: "renewal_reminder", org: c.orgId, error: refused[0] ?? "unknown" });
      }
    } catch (e) {
      log("warn", "renewal_reminders.workspace_failed", { org: c.orgId, error: message(e) });
      if (claimed) await deps.finish(c.orgId, c.renewsAt, "failed", 0, message(e)).catch(() => undefined);
      run.failed += 1;
    }
  }
  return run;
}
