/**
 * The trial reminder job (ADR 0063), run hourly by farbaek-jobs.timer. For
 * each workspace on a trial it records the reminders it skips, claims the one
 * to send, emails the workspace's owners who want trial reminders, and records
 * what the mail server said. "Accepted" is as far as anyone can tell: no mail
 * server confirms delivery. One workspace's failure never stops the others.
 */
import { trialReminderEmail } from "@/core/billing/trial-emails";
import { trialReminderToSend, type TrialReminderKind, type TrialWindow } from "@/core/billing/trial";
import { renderEmail, sendEmail } from "@/server/email/compose";
import type { EmailConfig } from "@/server/email/config";
import { isPlainAddress } from "@/server/email/message";
import type { EmailPreference } from "@/server/email/notify";
import type { sendSmtp } from "@/server/email/smtp";
import { log } from "@/server/observability/log";

export interface TrialReminderCandidate {
  orgId: string;
  orgName: string;
  window: TrialWindow;
  /** Kinds already sent, skipped or failed for good. */
  recorded: ReadonlySet<TrialReminderKind>;
  owners: string[];
}

export interface TrialReminderDeps {
  config: EmailConfig;
  candidates(now: Date): Promise<TrialReminderCandidate[]>;
  claim(orgId: string, kind: TrialReminderKind): Promise<boolean>;
  finish(orgId: string, kind: TrialReminderKind, status: "accepted" | "failed" | "no_recipient", recipients: number, detail: string | null): Promise<void>;
  skip(orgId: string, kind: TrialReminderKind, reason: "superseded" | "too_late"): Promise<void>;
  emailOf(userId: string): Promise<string | null>;
  wants(userId: string, kind: EmailPreference): Promise<boolean>;
  send?: typeof sendSmtp;
  /** Live payments are on, so the emails can point to the plans (ADR 0104). */
  plansOnSale?: boolean;
}

export interface TrialReminderRun {
  workspaces: number;
  accepted: number;
  failed: number;
  noRecipient: number;
  skipped: number;
}

const WHY = "You're getting this because you own this workspace on Farbaek.";
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

export async function runTrialReminders(deps: TrialReminderDeps, now: Date): Promise<TrialReminderRun> {
  const run: TrialReminderRun = { workspaces: 0, accepted: 0, failed: 0, noRecipient: 0, skipped: 0 };
  for (const c of await deps.candidates(now)) {
    run.workspaces += 1;
    const plan = trialReminderToSend(c.window, now, c.recorded);
    let claimed: TrialReminderKind | null = null;
    try {
      for (const s of plan.skip) {
        await deps.skip(c.orgId, s.kind, s.reason);
        run.skipped += 1;
      }
      if (!plan.send || !(await deps.claim(c.orgId, plan.send.kind))) continue;
      claimed = plan.send.kind;

      const to: string[] = [];
      for (const owner of c.owners) {
        if (!(await deps.wants(owner, "trial_reminders"))) continue;
        const address = await deps.emailOf(owner);
        if (address && isPlainAddress(address)) to.push(address);
      }
      if (to.length === 0) {
        await deps.finish(c.orgId, claimed, "no_recipient", 0, "No owner with a confirmed address wants trial reminders.");
        run.noRecipient += 1;
        continue;
      }

      const content = trialReminderEmail(claimed, c.window, now, c.orgName, deps.plansOnSale ?? false);
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
        await deps.finish(c.orgId, claimed, "accepted", accepted, refused.length ? `${refused.length} of ${to.length} refused: ${refused[0]}` : null);
        run.accepted += 1;
        log("info", "email.sent", { kind: `trial_${claimed}`, org: c.orgId, recipients: accepted });
      } else {
        await deps.finish(c.orgId, claimed, "failed", 0, refused[0] ?? "Not sent.");
        run.failed += 1;
        log("warn", "email.failed", { kind: `trial_${claimed}`, org: c.orgId, error: refused[0] ?? "unknown" });
      }
    } catch (e) {
      // A database or lookup error: what was claimed is marked failed, so a later run can try again.
      log("warn", "trial_reminders.workspace_failed", { org: c.orgId, error: message(e) });
      if (claimed) await deps.finish(c.orgId, claimed, "failed", 0, message(e)).catch(() => undefined);
      run.failed += 1;
    }
  }
  return run;
}
