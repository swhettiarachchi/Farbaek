/**
 * The notice before a yearly plan renews (ADR 0105). Some US states require
 * one 15 to 45 days ahead of a yearly renewal; Farbaek sends it once, 30 to
 * 16 days before. It says the date, the amount and how to stop it, and
 * pushes nothing.
 */
import { chargeCents, formatUsd, getPlan, type PlanId } from "./catalog";
import { trialEndLabel } from "./trial-emails";

const short = (s: string) => {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > 60 ? `${one.slice(0, 59)}…` : one;
};

export function renewalReminderEmail(planId: PlanId, renewsAt: Date, workspace: string): { subject: string; lines: string[] } {
  const plan = getPlan(planId);
  return {
    subject: `Your Farbaek ${plan.name} plan renews soon`,
    lines: [
      `${short(workspace)}'s ${plan.name} plan renews on ${trialEndLabel(renewsAt)} for ${formatUsd(chargeCents(plan))} USD plus any applicable tax, for another year.`,
      "To keep it, there's nothing to do. To stop it, cancel in Billing before then: the plan keeps working until that date, then the workspace moves to Free.",
    ],
  };
}
