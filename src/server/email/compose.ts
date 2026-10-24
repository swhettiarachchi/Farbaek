/**
 * One layout for every email Farbaek sends (ADR 0060, ADR 0063): a few plain
 * lines, one button to the page it's about, why the person is getting it, and
 * where to choose which emails they get.
 */
import { randomBytes } from "node:crypto";
import type { EmailConfig } from "./config";
import { buildMessage, type EmailMessage } from "./message";
import { sendSmtp } from "./smtp";

export interface EmailContent {
  subject: string;
  lines: string[];
}

/** The settings card where a person turns emails off. */
export const EMAIL_SETTINGS_PATH = "/app/settings#email";

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function renderEmail(config: EmailConfig, to: string, content: EmailContent, link: { label: string; path: string }, why: string): EmailMessage {
  const url = `${config.siteUrl}${link.path}`;
  const settings = `${config.siteUrl}${EMAIL_SETTINGS_PATH}`;
  const text = [...content.lines, "", `${link.label}: ${url}`, "", why, `Choose which emails you get: ${settings}`].join("\n");
  const html = [
    '<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#121317;font-size:16px;line-height:1.55;max-width:560px">',
    ...content.lines.map((l) => `<p style="margin:0 0 14px">${escape(l)}</p>`),
    `<p style="margin:22px 0"><a href="${escape(url)}" style="display:inline-block;background:#121317;color:#fbfbfc;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:500">${escape(link.label)}</a></p>`,
    `<p style="margin:22px 0 0;color:#636975;font-size:13px">${escape(why)} <a href="${escape(settings)}" style="color:#636975">Choose which emails you get</a>.</p>`,
    "</div>",
  ].join("");
  return { fromName: config.fromName, fromAddress: config.fromAddress, to, subject: content.subject, text, html };
}

/** Builds and sends one message. Throws when the mail server doesn't accept it. */
export async function sendEmail(config: EmailConfig, message: EmailMessage, deps: { send?: typeof sendSmtp; now?: () => Date } = {}): Promise<void> {
  const id = randomBytes(12).toString("hex");
  const data = buildMessage(message, { date: (deps.now ?? (() => new Date()))(), messageId: `<${id}@farbaek.com>`, boundary: `farbaek-${id}` });
  await (deps.send ?? sendSmtp)(config.smtp, { from: config.fromAddress, to: message.to }, data);
}
