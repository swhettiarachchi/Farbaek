/**
 * Emails to the owner about the platform's daily AI limit (ADR 0068): one at
 * 80% of it and one when it's reached, at most once each per UTC day. If the
 * limit is already reached when the job first looks, only that one is sent.
 * The amounts are Farbaek's estimates from its rate card, said as such.
 */
import { USD_PER_UNIT } from "./rate-card";

export type SpendAlertKind = "ai_spend_80" | "ai_spend_100";
export const SPEND_ALERT_SHARE = 0.8;

export function spendAlertToSend(
  spentUnits: number,
  limitUnits: number | null,
  recorded: ReadonlySet<SpendAlertKind>,
): { send: SpendAlertKind | null; skip: SpendAlertKind[] } {
  if (limitUnits === null || limitUnits <= 0) return { send: null, skip: [] };
  if (spentUnits >= limitUnits) {
    return { send: recorded.has("ai_spend_100") ? null : "ai_spend_100", skip: recorded.has("ai_spend_80") ? [] : ["ai_spend_80"] };
  }
  if (spentUnits >= limitUnits * SPEND_ALERT_SHARE && !recorded.has("ai_spend_80")) return { send: "ai_spend_80", skip: [] };
  return { send: null, skip: [] };
}

const usd = (units: number) => `$${(units * USD_PER_UNIT).toFixed(2)}`;

export function spendAlertEmail(kind: SpendAlertKind, spentUnits: number, limitUnits: number, day: string): { subject: string; lines: string[] } {
  const share = Math.floor((spentUnits / limitUnits) * 100);
  const used = `Farbaek has used about ${usd(spentUnits)} of its ${usd(limitUnits)} AI limit for ${day} (UTC).`;
  const how = "The limit is AI_DAILY_LIMIT_USD on the server. These amounts are Farbaek's estimates from its rate card; the Anthropic Console shows what was actually billed.";
  return kind === "ai_spend_100"
    ? {
        subject: "Farbaek reached today's AI limit",
        lines: [used, "AI work is paused for every workspace until midnight UTC. Nothing else stops: sites, checks and sign-in keep working.", how],
      }
    : {
        subject: `Farbaek's AI use is at ${share}% of today's limit`,
        lines: [used, "At the limit, AI work pauses for every workspace until midnight UTC.", how],
      };
}
