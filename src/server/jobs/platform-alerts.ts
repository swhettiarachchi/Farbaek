/**
 * Alerts to the owner about the platform (ADR 0068), run hourly with the
 * other jobs: today, the daily AI limit at 80% and when it's reached. Each is
 * claimed before it's sent, so two runs can't both send it, and the record
 * says what the mail server answered: "accepted" is as far as anyone can tell.
 */
import { spendAlertEmail, spendAlertToSend, type SpendAlertKind } from "@/core/billing/spend-alert";
import type { EmailMessage } from "@/server/email/message";
import type { EmailConfig } from "@/server/email/config";

export interface PlatformAlertDeps {
  config: EmailConfig;
  /** Who gets the alerts: ALERT_EMAIL, or hello@ by default. */
  to: string;
  limitUnits: number | null;
  unitsToday(): Promise<number>;
  /** Kinds already sent, skipped, in progress or failed for good today. */
  recorded(day: string): Promise<ReadonlySet<SpendAlertKind>>;
  claim(day: string, kind: SpendAlertKind): Promise<boolean>;
  finish(day: string, kind: SpendAlertKind, status: "accepted" | "failed", detail: string | null): Promise<void>;
  skip(day: string, kind: SpendAlertKind, detail: string): Promise<void>;
  /** Throws when the mail server doesn't accept the message. */
  send(message: EmailMessage): Promise<void>;
}

export interface PlatformAlertRun {
  day: string;
  share: number | null;
  sent: SpendAlertKind | null;
  status: "accepted" | "failed" | "not_claimed" | null;
  skipped: SpendAlertKind[];
}

export async function runPlatformAlerts(deps: PlatformAlertDeps, now: Date): Promise<PlatformAlertRun> {
  const day = now.toISOString().slice(0, 10);
  const spent = await deps.unitsToday();
  const share = deps.limitUnits ? Math.floor((spent / deps.limitUnits) * 100) : null;
  const { send, skip } = spendAlertToSend(spent, deps.limitUnits, await deps.recorded(day));
  for (const kind of skip) await deps.skip(day, kind, "The limit was already reached when the job looked.");
  if (!send || deps.limitUnits === null) return { day, share, sent: null, status: null, skipped: skip };
  if (!(await deps.claim(day, send))) return { day, share, sent: send, status: "not_claimed", skipped: skip };

  const { subject, lines } = spendAlertEmail(send, spent, deps.limitUnits, day);
  const escape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const message: EmailMessage = {
    fromName: deps.config.fromName,
    fromAddress: deps.config.fromAddress,
    to: deps.to,
    subject,
    text: lines.join("\n\n"),
    html: `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#121317;font-size:16px;line-height:1.55;max-width:560px">${lines.map((l) => `<p style="margin:0 0 14px">${escape(l)}</p>`).join("")}</div>`,
  };
  try {
    await deps.send(message);
    await deps.finish(day, send, "accepted", null);
    return { day, share, sent: send, status: "accepted", skipped: skip };
  } catch (e) {
    await deps.finish(day, send, "failed", (e instanceof Error ? e.message : String(e)).slice(0, 300));
    return { day, share, sent: send, status: "failed", skipped: skip };
  }
}
