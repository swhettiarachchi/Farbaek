/**
 * Trial and subscription lifecycle rules. Pure functions over server timestamps
 * (UTC). The trial clock never runs in the client; callers pass `now` from the
 * server.
 */
import { TRIAL, getPlan, type PlanId, type PlanLimits } from "./catalog";

const DAY_MS = 86_400_000;

export interface TrialEligibilityInput {
  emailVerified: boolean;
  organizationCreated: boolean;
  /** Backed by a unique constraint on trials.org_id. */
  organizationHasHadTrial: boolean;
  userHasHadTrial: boolean;
}

export type TrialIneligibleReason =
  | "EMAIL_NOT_VERIFIED"
  | "NO_ORGANIZATION"
  | "ORGANIZATION_ALREADY_TRIALED"
  | "USER_ALREADY_TRIALED";

export type TrialEligibility = { eligible: true } | { eligible: false; reason: TrialIneligibleReason };

export function evaluateTrialEligibility(input: TrialEligibilityInput): TrialEligibility {
  if (!input.emailVerified) return { eligible: false, reason: "EMAIL_NOT_VERIFIED" };
  if (!input.organizationCreated) return { eligible: false, reason: "NO_ORGANIZATION" };
  if (input.organizationHasHadTrial) return { eligible: false, reason: "ORGANIZATION_ALREADY_TRIALED" };
  if (input.userHasHadTrial) return { eligible: false, reason: "USER_ALREADY_TRIALED" };
  return { eligible: true };
}

export interface TrialWindow {
  startedAt: Date;
  /** Exactly startedAt + 14 days. UTC has no daylight-saving shifts. */
  endsAt: Date;
}

export function trialWindow(startedAt: Date): TrialWindow {
  return { startedAt, endsAt: new Date(startedAt.getTime() + TRIAL.lengthDays * DAY_MS) };
}

export type TrialPhase =
  | { phase: "active"; msRemaining: number; daysRemaining: number }
  | { phase: "ended" };

/** The trial ends at `endsAt` exactly: active while now < endsAt. */
export function trialPhase(window: TrialWindow, now: Date): TrialPhase {
  const msRemaining = window.endsAt.getTime() - now.getTime();
  if (msRemaining <= 0) return { phase: "ended" };
  return { phase: "active", msRemaining, daysRemaining: Math.ceil(msRemaining / DAY_MS) };
}

export type TrialReminderKind = "day_7" | "day_12" | "day_13" | "expiry";

export interface TrialReminder {
  kind: TrialReminderKind;
  dueAt: Date;
}

export function trialReminderSchedule(window: TrialWindow): TrialReminder[] {
  const reminders: TrialReminder[] = TRIAL.reminderDays.map((day) => ({
    kind: `day_${day}` as TrialReminderKind,
    dueAt: new Date(window.startedAt.getTime() + day * DAY_MS),
  }));
  reminders.push({ kind: "expiry", dueAt: window.endsAt });
  return reminders;
}

/** Reminders a scheduled job should send now. Sending is recorded separately with provider status. */
export function dueTrialReminders(window: TrialWindow, now: Date, alreadySent: ReadonlySet<TrialReminderKind>): TrialReminder[] {
  return trialReminderSchedule(window).filter((r) => r.dueAt.getTime() <= now.getTime() && !alreadySent.has(r.kind));
}

export type SubscriptionState =
  | "free"
  | "trialing"
  | "checkout_pending"
  | "active"
  | "past_due"
  | "cancellation_scheduled"
  | "suspended"
  | "expired";

export interface BillingSnapshot {
  state: SubscriptionState;
  /** The paid plan, when there is one. */
  paidPlanId?: Exclude<PlanId, "free">;
  trial?: TrialWindow;
  /** End of the paid-through period (cancellation_scheduled keeps access until then). */
  paidThrough?: Date;
  suspendedReason?: "payment" | "paused";
}

export interface EffectivePlan {
  source: "free" | "trial" | "paid";
  planId: PlanId;
  limits: PlanLimits;
  /** Set when paid features are paused (payment on hold or subscription paused). */
  suspendedFrom?: PlanId;
}

function freePlan(): EffectivePlan {
  return { source: "free", planId: "free", limits: getPlan("free").limits };
}

function trialPlan(): EffectivePlan {
  const team = getPlan(TRIAL.basePlan).limits;
  return {
    source: "trial",
    planId: TRIAL.basePlan,
    limits: {
      ...team,
      workspaces: TRIAL.limits.workspaces,
      seats: TRIAL.limits.seats,
      agents: TRIAL.limits.agents,
      integrations: TRIAL.limits.integrations,
      evaluationsPerMonth: TRIAL.limits.evaluationsTotal,
      historyDays: TRIAL.limits.historyDays,
      aiUnitsPerMonth: TRIAL.limits.aiUnitsTotal,
      retryUnitsPerMonth: getPlan("starter").limits.retryUnitsPerMonth,
      sandboxHours: TRIAL.limits.sandboxHours,
    },
  };
}

function paidPlan(planId: PlanId): EffectivePlan {
  return { source: "paid", planId, limits: getPlan(planId).limits };
}

/**
 * Which plan's entitlements apply right now. This is read-time logic; the
 * lifecycle job (`expireTrialIfDue`) persists the transitions.
 */
export function resolveEffectivePlan(snapshot: BillingSnapshot, now: Date): EffectivePlan {
  const trialActive = snapshot.trial !== undefined && trialPhase(snapshot.trial, now).phase === "active";

  switch (snapshot.state) {
    case "free":
    case "expired":
      return freePlan();
    case "trialing":
      return trialActive ? trialPlan() : freePlan();
    case "checkout_pending":
      // A started checkout changes nothing until the provider confirms payment.
      return trialActive ? trialPlan() : freePlan();
    case "active":
    case "past_due":
      return snapshot.paidPlanId ? paidPlan(snapshot.paidPlanId) : freePlan();
    case "cancellation_scheduled":
      if (snapshot.paidPlanId && snapshot.paidThrough && now.getTime() < snapshot.paidThrough.getTime()) {
        return paidPlan(snapshot.paidPlanId);
      }
      return freePlan();
    case "suspended":
      return { ...freePlan(), suspendedFrom: snapshot.paidPlanId };
  }
}

export type LifecycleEvent = { type: "trial.expired_to_free"; at: Date };

/**
 * Moves an ended trial to Free. There is no payment step here by design:
 * expiry never charges.
 */
export function expireTrialIfDue(
  snapshot: BillingSnapshot,
  now: Date,
): { snapshot: BillingSnapshot; events: LifecycleEvent[] } {
  if (snapshot.state !== "trialing" || !snapshot.trial) return { snapshot, events: [] };
  if (trialPhase(snapshot.trial, now).phase === "active") return { snapshot, events: [] };
  return {
    snapshot: { ...snapshot, state: "free" },
    events: [{ type: "trial.expired_to_free", at: snapshot.trial.endsAt }],
  };
}
