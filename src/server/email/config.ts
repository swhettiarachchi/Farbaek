/**
 * Email settings (ADR 0060). Email is on only when SMTP_PASSWORD is set: the
 * owner types it with scripts/vps/set-email-password.ps1, and no one else ever sees
 * it. The rest default to the Spacemail account Farbaek's sign-in emails
 * already use (ADR 0036), and each can be overridden.
 */
import type { SmtpConfig } from "./smtp";

export interface EmailConfig {
  smtp: SmtpConfig;
  fromName: string;
  fromAddress: string;
  /** Where links in emails point. */
  siteUrl: string;
}

type Env = Record<string, string | undefined>;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

export function readEmailConfig(env: Env = process.env): EmailConfig | null {
  const password = env.SMTP_PASSWORD?.trim();
  if (!password) return null;
  const host = env.SMTP_HOST?.trim() || "mail.spacemail.com";
  const port = Number(env.SMTP_PORT?.trim() || 465);
  // Implicit TLS only; a plain connection is for a local test server.
  const secure = !LOCAL_HOSTS.has(host);
  if (secure && port !== 465) return null;
  const user = env.SMTP_USER?.trim() || "hello@farbaek.com";
  return {
    smtp: { host, port, secure, user, password, heloName: "farbaek.com" },
    fromName: env.EMAIL_FROM_NAME?.trim() || "Farbaek",
    fromAddress: env.EMAIL_FROM_ADDRESS?.trim() || user,
    siteUrl: (env.NEXT_PUBLIC_SITE_URL?.trim() || "https://www.farbaek.com").replace(/\/+$/, ""),
  };
}

/** For the admin's and the office's connection lists: on or off, and why, never a value. */
export function emailStatus(env: Env = process.env): { on: boolean; detail: string } {
  if (!env.SMTP_PASSWORD?.trim()) return { on: false, detail: "SMTP_PASSWORD isn't set, so Farbaek sends no email of its own" };
  if (!readEmailConfig(env)) return { on: false, detail: "SMTP_PORT must be 465 (TLS)" };
  const host = env.SMTP_HOST?.trim() || "mail.spacemail.com";
  return { on: true, detail: `Sends through ${host.slice(0, 60)}` };
}
