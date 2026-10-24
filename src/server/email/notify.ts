/**
 * Notifications by email (ADR 0060): Farbaek tells the person who started
 * something when it finishes, so they don't have to keep the page open.
 *
 *   - A cloud build finished (ready to review) or stopped.
 *   - A change's checks finished, passed or not, or couldn't run.
 *
 * Only to the person's own confirmed address, only for what they started,
 * and never in the way of the work: a failure to send is logged and
 * dropped. With no email settings, nothing is sent.
 */
import { VERIFICATION_RESULT_WORDS, type VerificationResult } from "@/core/realityloop/verification";
import { log } from "@/server/observability/log";
import { renderEmail, sendEmail, type EmailContent } from "./compose";
import type { EmailConfig } from "./config";
import { isPlainAddress } from "./message";
import type { sendSmtp } from "./smtp";

export interface RunNotice {
  userId: string;
  taskId: string;
  taskTitle: string;
  status: "finished" | "failed" | "cancelled";
  outcome: string;
}

export interface ChecksNotice {
  userId: string;
  taskId: string;
  taskTitle: string;
  /** The checks' result, or null when they couldn't run. */
  result: VerificationResult | null;
  reason?: string;
}

export interface Notifier {
  buildFinished(n: RunNotice): Promise<void>;
  checksFinished(n: ChecksNotice): Promise<void>;
}

export interface NotifierDeps {
  config: EmailConfig | null;
  /** The person's confirmed email address, or null. */
  emailOf(userId: string): Promise<string | null>;
  /** Whether the person wants this kind of email (ADR 0063); off in their settings means no. */
  wants?(userId: string, kind: EmailPreference): Promise<boolean>;
  send?: typeof sendSmtp;
  now?: () => Date;
}

/** The kinds of email a person can turn off in Settings (ADR 0063). */
export type EmailPreference = "work_updates" | "trial_reminders";

/** A title kept to one short line for a subject. */
const short = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 90 ? `${one.slice(0, 89)}…` : one;
};

/** What a build's email says. A cancelled build sends nothing: the person stopped it. */
export function runEmail(n: RunNotice): { subject: string; lines: string[] } | null {
  if (n.status === "cancelled") return null;
  return {
    subject: n.status === "finished" ? `Ready to review: ${short(n.taskTitle)}` : `Build stopped: ${short(n.taskTitle)}`,
    lines: [n.outcome],
  };
}

/** What a check run's email says. */
export function checksEmail(n: ChecksNotice): { subject: string; lines: string[] } {
  const title = short(n.taskTitle);
  if (!n.result) return { subject: `Checks didn't run: ${title}`, lines: [n.reason ?? "The checks couldn't run against the applied files."] };
  const words = VERIFICATION_RESULT_WORDS[n.result];
  const subject = n.result === "verified" ? `Checks passed: ${title}` : `${words.title}: ${title}`;
  const next = n.result === "verified" ? "It's verified, so it can be published without an override." : "Open the task to see the check run, then fix it or undo it.";
  return { subject, lines: [words.detail.replace(" See the check run below.", ""), next] };
}

export function createNotifier(deps: NotifierDeps): Notifier {
  async function deliver(kind: string, userId: string, taskId: string, content: EmailContent | null, why: string) {
    const config = deps.config;
    if (!config || !content) return;
    try {
      if (deps.wants && !(await deps.wants(userId, "work_updates"))) return;
      const to = await deps.emailOf(userId);
      if (!to || !isPlainAddress(to)) return;
      const message = renderEmail(config, to, content, { label: "Open the task", path: `/app/tasks/${encodeURIComponent(taskId)}` }, why);
      await sendEmail(config, message, { send: deps.send, now: deps.now });
      log("info", "email.sent", { kind, task: taskId });
    } catch (e) {
      // Never the address or the password: the kind, the task and the reason are enough to look into it.
      log("warn", "email.failed", { kind, task: taskId, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
    }
  }

  return {
    buildFinished: (n) => deliver("build_finished", n.userId, n.taskId, runEmail(n), "You're getting this because you started this build on Farbaek."),
    checksFinished: (n) => deliver("checks_finished", n.userId, n.taskId, checksEmail(n), "You're getting this because these checks ran for a change you applied or started on Farbaek."),
  };
}
