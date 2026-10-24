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
import { randomBytes } from "node:crypto";
import { VERIFICATION_RESULT_WORDS, type VerificationResult } from "@/core/realityloop/verification";
import { log } from "@/server/observability/log";
import type { EmailConfig } from "./config";
import { buildMessage, isPlainAddress, type EmailMessage } from "./message";
import { sendSmtp } from "./smtp";

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
  send?: typeof sendSmtp;
  now?: () => Date;
}

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
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

function render(config: EmailConfig, to: string, taskId: string, content: { subject: string; lines: string[] }, why: string): EmailMessage {
  const url = `${config.siteUrl}/app/tasks/${encodeURIComponent(taskId)}`;
  const text = [...content.lines, "", `Open the task: ${url}`, "", why].join("\n");
  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#121317;font-size:16px;line-height:1.55;max-width:560px">',
    ...content.lines.map((l) => `<p style="margin:0 0 14px">${escape(l)}</p>`),
    `<p style="margin:22px 0"><a href="${escape(url)}" style="display:inline-block;background:#121317;color:#fbfbfc;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:500">Open the task</a></p>`,
    `<p style="margin:22px 0 0;color:#636975;font-size:13px">${escape(why)}</p>`,
    "</div>",
  ].join("");
  return { fromName: config.fromName, fromAddress: config.fromAddress, to, subject: content.subject, text, html };
}

export function createNotifier(deps: NotifierDeps): Notifier {
  const send = deps.send ?? sendSmtp;
  const now = deps.now ?? (() => new Date());

  async function deliver(kind: string, userId: string, taskId: string, content: { subject: string; lines: string[] } | null, why: string) {
    const config = deps.config;
    if (!config || !content) return;
    try {
      const to = await deps.emailOf(userId);
      if (!to || !isPlainAddress(to)) return;
      const message = render(config, to, taskId, content, why);
      const id = randomBytes(12).toString("hex");
      const data = buildMessage(message, { date: now(), messageId: `<${id}@farbaek.com>`, boundary: `farbaek-${id}` });
      await send(config.smtp, { from: config.fromAddress, to }, data);
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
