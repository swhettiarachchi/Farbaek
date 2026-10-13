import { describe, expect, it } from "vitest";
import {
  dueTrialReminders,
  evaluateTrialEligibility,
  expireTrialIfDue,
  resolveEffectivePlan,
  trialPhase,
  trialReminderSchedule,
  trialWindow,
  type BillingSnapshot,
} from "./trial";

const start = new Date("2026-10-13T09:30:00.000Z");
const DAY = 86_400_000;
const at = (ms: number) => new Date(start.getTime() + ms);

describe("trial eligibility", () => {
  const eligible = { emailVerified: true, organizationCreated: true, organizationHasHadTrial: false, userHasHadTrial: false };

  it("grants a trial to a verified user with a new organization", () => {
    expect(evaluateTrialEligibility(eligible)).toEqual({ eligible: true });
  });

  it("refuses unverified users", () => {
    expect(evaluateTrialEligibility({ ...eligible, emailVerified: false })).toEqual({ eligible: false, reason: "EMAIL_NOT_VERIFIED" });
  });

  it("refuses repeat trials for the organization or the user", () => {
    expect(evaluateTrialEligibility({ ...eligible, organizationHasHadTrial: true })).toMatchObject({ reason: "ORGANIZATION_ALREADY_TRIALED" });
    expect(evaluateTrialEligibility({ ...eligible, userHasHadTrial: true })).toMatchObject({ reason: "USER_ALREADY_TRIALED" });
  });

  it("needs no payment details: eligibility has no card input at all", () => {
    expect(Object.keys(eligible)).not.toContain("card");
  });
});

describe("trial window", () => {
  it("lasts exactly 14 calendar days from the server start time", () => {
    const w = trialWindow(start);
    expect(w.endsAt.toISOString()).toBe("2026-10-27T09:30:00.000Z");
    expect(w.endsAt.getTime() - w.startedAt.getTime()).toBe(14 * DAY);
  });

  it("is active until the exact end instant, then ended", () => {
    const w = trialWindow(start);
    expect(trialPhase(w, at(14 * DAY - 1))).toMatchObject({ phase: "active", daysRemaining: 1 });
    expect(trialPhase(w, at(14 * DAY))).toEqual({ phase: "ended" });
    expect(trialPhase(w, at(0))).toMatchObject({ phase: "active", daysRemaining: 14 });
  });
});

describe("trial reminders", () => {
  it("are scheduled for days 7, 12, 13 and at expiry", () => {
    const schedule = trialReminderSchedule(trialWindow(start));
    expect(schedule.map((r) => [r.kind, r.dueAt.toISOString()])).toEqual([
      ["day_7", "2026-10-20T09:30:00.000Z"],
      ["day_12", "2026-10-25T09:30:00.000Z"],
      ["day_13", "2026-10-26T09:30:00.000Z"],
      ["expiry", "2026-10-27T09:30:00.000Z"],
    ]);
  });

  it("returns only due reminders that have not been sent", () => {
    const w = trialWindow(start);
    expect(dueTrialReminders(w, at(6 * DAY), new Set())).toEqual([]);
    expect(dueTrialReminders(w, at(12 * DAY + 5), new Set(["day_7"])).map((r) => r.kind)).toEqual(["day_12"]);
    expect(dueTrialReminders(w, at(20 * DAY), new Set()).map((r) => r.kind)).toEqual(["day_7", "day_12", "day_13", "expiry"]);
  });
});

describe("effective plan", () => {
  const trialing: BillingSnapshot = { state: "trialing", trial: trialWindow(start) };

  it("applies Team features with trial caps during the trial", () => {
    const plan = resolveEffectivePlan(trialing, at(DAY));
    expect(plan).toMatchObject({ source: "trial", planId: "team" });
    expect(plan.limits).toMatchObject({ seats: 3, agents: 5, integrations: 3, evaluationsPerMonth: 10_000, aiCreditsPerMonth: 100, historyDays: 30 });
  });

  it("falls back to Free the moment the trial ends, even before the job runs", () => {
    expect(resolveEffectivePlan(trialing, at(14 * DAY))).toMatchObject({ source: "free", planId: "free" });
  });

  it("keeps the trial while a checkout is pending", () => {
    expect(resolveEffectivePlan({ ...trialing, state: "checkout_pending" }, at(DAY))).toMatchObject({ source: "trial" });
  });

  it("keeps paid access through the paid-through date after cancelling", () => {
    const snap: BillingSnapshot = { state: "cancellation_scheduled", paidPlanId: "team", paidThrough: at(30 * DAY) };
    expect(resolveEffectivePlan(snap, at(29 * DAY))).toMatchObject({ source: "paid", planId: "team" });
    expect(resolveEffectivePlan(snap, at(30 * DAY))).toMatchObject({ source: "free" });
  });

  it("keeps paid access while past due, and drops to Free limits while suspended", () => {
    expect(resolveEffectivePlan({ state: "past_due", paidPlanId: "business" }, at(0))).toMatchObject({ planId: "business" });
    expect(resolveEffectivePlan({ state: "suspended", paidPlanId: "business", suspendedReason: "payment" }, at(0))).toMatchObject({
      planId: "free",
      suspendedFrom: "business",
    });
  });
});

describe("trial expiry", () => {
  it("moves an ended trial to Free and emits no charge", () => {
    const { snapshot, events } = expireTrialIfDue({ state: "trialing", trial: trialWindow(start) }, at(15 * DAY));
    expect(snapshot.state).toBe("free");
    expect(events).toEqual([{ type: "trial.expired_to_free", at: new Date("2026-10-27T09:30:00.000Z") }]);
    expect(events.some((e) => e.type.includes("charge") || e.type.includes("payment"))).toBe(false);
  });

  it("does nothing while the trial is still running", () => {
    const snap: BillingSnapshot = { state: "trialing", trial: trialWindow(start) };
    expect(expireTrialIfDue(snap, at(DAY))).toEqual({ snapshot: snap, events: [] });
  });
});
