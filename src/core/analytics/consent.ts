/**
 * A visitor's choice about analytics on Farbaek's public pages (ADR 0155).
 * Pure, so the rules are tested; the banner in
 * src/components/analytics/analytics-consent.tsx stores and applies it.
 *
 * Nothing loads until the visitor allows it. A choice lasts a year, then the
 * banner asks again. Inside Farbaek for Android, the signed-in app and Office
 * Space, analytics never loads, so the stores' privacy answers stay true.
 */

import { NOT_PUBLIC_PATHS } from "@/core/seo/crawl";

/** Where the browser keeps the choice: this device only. */
export const CONSENT_KEY = "farbaek-analytics";

export type AnalyticsChoice = "allowed" | "declined";

/** How long a choice counts before the banner asks again. */
export const CHOICE_DAYS = 365;

interface Stored {
  choice: AnalyticsChoice;
  at: string;
}

/** The stored value for a choice made now. */
export function storeChoice(choice: AnalyticsChoice, now: Date): string {
  return JSON.stringify({ choice, at: now.toISOString() } satisfies Stored);
}

/** The choice still in force, or null when there's none, it's unreadable or it has expired. */
export function readChoice(raw: string | null, now: Date): AnalyticsChoice | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Partial<Stored>;
    if (v.choice !== "allowed" && v.choice !== "declined") return null;
    const at = Date.parse(String(v.at));
    if (!Number.isFinite(at) || at > now.getTime()) return null;
    return now.getTime() - at <= CHOICE_DAYS * 86_400_000 ? v.choice : null;
  } catch {
    return null;
  }
}

/** Google Analytics' measurement IDs look like G-ABC123. Anything else stays off. */
export function validMeasurementId(id: string | null | undefined): id is string {
  return typeof id === "string" && /^G-[A-Z0-9]{4,16}$/.test(id);
}

/** Cookies Google Analytics sets: _ga, and _ga_<container>. */
export function isAnalyticsCookie(name: string): boolean {
  return name === "_ga" || name.startsWith("_ga_");
}

/**
 * Pages Google Analytics must never see, even on the public site: invite
 * links carry a token in the path, and the rest (sign-in links, account
 * deletion) are private. The same list robots.txt keeps crawlers out of.
 */
export function isPrivatePath(pathname: string | null): boolean {
  if (!pathname) return true;
  return NOT_PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** Whether the banner should ask: analytics is set up here, and there's no choice in force. */
export function shouldAsk(id: string | null, choice: AnalyticsChoice | null, inApp: boolean): boolean {
  return validMeasurementId(id) && !inApp && choice === null;
}

/** Whether this page may load Google Analytics. */
export function mayLoad(id: string | null, choice: AnalyticsChoice | null, inApp: boolean): boolean {
  return validMeasurementId(id) && !inApp && choice === "allowed";
}
