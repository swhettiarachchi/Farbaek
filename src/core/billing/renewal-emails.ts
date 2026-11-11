/**
 * The notice before a yearly plan renews (ADR 0105). Some US states require
 * one 15 to 45 days ahead of a yearly renewal; Farbaek sends it once, 30 to
 * 16 days before. It says the date, the amount and how to stop it, and
 * pushes nothing.
 *
 * The amount is what the subscription renews at, which is the price when the
 * person subscribed, not today's list price (ADR 0185). When it can't be
 * read, the notice says so in words rather than guess a number.
 */
import { formatUsd, getPlan, type PlanId } from "./catalog";
import { trialEndLabel } from "./trial-emails";

const short = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 59)}…` : one;
};

export function renewalReminderEmail(planId: PlanId, renewsAt: Date, workspace: string, amountCents: number | null): { subject: string; lines: string[] } {
  const plan = getPlan(planId);
  const amount = amountCents !== null && amountCents > 0 ? `for ${formatUsd(amountCents)} USD plus any applicable tax` : "at the price you pay now, plus any applicable tax";
  return {
    subject: `Your Farbaek ${plan.name} plan renews soon`,
    lines: [
      `${short(workspace)}'s ${plan.name} plan renews on ${trialEndLabel(renewsAt)} ${amount}, for another year.`,
      "To keep it, there's nothing to do. To stop it, cancel in Billing before then: the plan keeps working until that date, then the workspace moves to Free.",
    ],
  };
}
