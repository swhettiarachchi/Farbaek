/**
 * What a trial reminder says (ADR 0063). The words come from the trial's real
 * end, never the reminder's name, so a reminder sent late still says how long
 * is actually left. They match the Billing page and push nothing. They point
 * to the plans only when live payments are on (ADR 0104); otherwise they say
 * no plan can be bought.
 */
import { TRIAL, getPlan } from "./catalog";
import { trialPhase, type TrialReminderKind, type TrialWindow } from "./trial";

const WHEN = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });

/** "Tue 27 Oct 2026, 09:30 UTC": the server doesn't know the person's time zone, so it says which one it uses. */
export function trialEndLabel(endsAt: Date): string {
  const p = Object.fromEntries(WHEN.formatToParts(endsAt).map((x) => [x.type, x.value]));
  return `${p.weekday} ${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute} UTC`;
}

const short = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 59)}…` : one;
};

export function trialReminderEmail(kind: TrialReminderKind, window: TrialWindow, now: Date, workspace: string, plansOnSale = false): { subject: string; lines: string[] } {
  const plan = getPlan(TRIAL.basePlan).name;
  const name = short(workspace);
  const ends = trialEndLabel(window.endsAt);
  const phase = trialPhase(window, now);
  if (kind === "expiry" || phase.phase === "ended") {
    return {
      subject: "Your Farbaek trial has ended",
      lines: [
        `The ${plan} trial for ${name} ended ${ends}. The workspace is on Free now, and nothing was charged.`,
        plansOnSale ? `Choose a plan on the Billing page to get ${plan}'s features back, or see what Free includes.` : "See what Free includes on the Billing page.",
      ],
    };
  }
  const left = `${phase.daysRemaining} ${phase.daysRemaining === 1 ? "day" : "days"} left`;
  return {
    subject: `Your Farbaek trial: ${left}`,
    lines: [
      `The ${plan} trial for ${name} has ${left}. It ends ${ends}.`,
      plansOnSale
        ? "Then the workspace moves to Free automatically, and nothing is charged unless you choose a plan."
        : "Then the workspace moves to Free automatically and nothing is charged. Payments aren't connected yet, so no plan can be bought.",
      plansOnSale ? "Compare the plans and what Free includes on the Billing page." : "See what Free includes on the Billing page.",
    ],
  };
}
