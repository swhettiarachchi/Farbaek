/**
 * How usage is shown to people: a percentage of each limit and when it
 * resets, the way Claude shows its usage. Raw counts of metered units (AI
 * credits, governed evaluations, sandbox minutes) stay internal; people see
 * how much of their allowance they've used.
 *
 * Countable things (seats, projects, agents) aren't meters and keep their
 * "1 of 3" form elsewhere.
 */

export type MeterState = "ok" | "nearly" | "reached";

export interface UsageMeter {
  id: "ai" | "evaluations" | "sandbox";
  label: string;
  /** 0 to 100, or null when the limit is set by contract. */
  percent: number | null;
  state: MeterState;
  /** When the window ends (ISO). The trial window ends with the trial. */
  resetsAt: string;
  period: "trial" | "month";
  /** What stops at the limit, and what keeps working. */
  atLimit: string;
  /** AI usage carried over from last month, as a share of this month's allowance, and when it expires. */
  rollover?: { percentOfMonth: number; expiresAt: string };
}

/**
 * Percent of the limit used. Any use shows at least 1%, and 100% means the
 * limit is reached: just under the limit shows 99%, never a rounded 100%.
 */
export function percentUsed(used: number, limit: number | null): number | null {
  if (limit === null) return null;
  if (!Number.isFinite(used) || used <= 0) return 0;
  if (limit <= 0 || used >= limit) return 100;
  return Math.min(99, Math.max(1, Math.ceil((used / limit) * 100)));
}

export function meterState(percent: number | null): MeterState {
  if (percent === null) return "ok";
  if (percent >= 100) return "reached";
  return percent >= 80 ? "nearly" : "ok";
}

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * "Resets in 3 hr 15 min", "Resets Sun 12:30 PM", "Resets Nov 1", or for a
 * trial "Ends with the trial on Oct 28". Formatted in the viewer's time zone
 * and locale, so call it in the browser.
 */
export function resetText(resetsAt: Date, period: "trial" | "month", now: Date, locale?: string, timeZone?: string): string {
  const ms = resetsAt.getTime() - now.getTime();
  const tz = timeZone ? { timeZone } : {};
  if (period === "trial") {
    return `Ends with the trial on ${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", ...tz }).format(resetsAt)}`;
  }
  if (ms <= 0) return "Resets now";
  if (ms < HOUR) return `Resets in ${Math.max(1, Math.ceil(ms / 60_000))} min`;
  if (ms < DAY) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / 60_000);
    return minutes > 0 ? `Resets in ${hours} hr ${minutes} min` : `Resets in ${hours} hr`;
  }
  if (ms < 7 * DAY) {
    const day = new Intl.DateTimeFormat(locale, { weekday: "short", ...tz }).format(resetsAt);
    const at = new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit", ...tz }).format(resetsAt);
    return `Resets ${day} ${at}`;
  }
  return `Resets ${new Intl.DateTimeFormat(locale, { month: "short", day: "numeric", ...tz }).format(resetsAt)}`;
}

/** The sentence an AI action shows once usage is high, or null below 80%. */
export function usageNote(percent: number | null): string | null {
  if (percent === null || percent < 80) return null;
  if (percent >= 100) return "You've reached your AI usage limit.";
  return `You've used ${percent}% of your AI usage.`;
}

