import { describe, expect, it } from "vitest";
import { TRIAL } from "./catalog";
import {
  dueTrialReminders,
  evaluateTrialEligibility,
  expireTrialIfDue,
  resolveEffectivePlan,
  trialPhase,
  trialReminderSchedule,
  trialReminderToSend,
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

  it("anchor the last days to the end when staff extended the trial", () => {
    const extended = trialWindow(start, new Date(start.getTime() + 24 * DAY));
    expect(trialReminderSchedule(extended).map((r) => [r.kind, r.dueAt.toISOString()])).toEqual([
      ["day_7", "2026-10-20T09:30:00.000Z"],
      ["day_12", "2026-11-04T09:30:00.000Z"],
      ["day_13", "2026-11-05T09:30:00.000Z"],
      ["expiry", "2026-11-06T09:30:00.000Z"],
    ]);
  });
});

describe("which reminder a run sends", () => {
  const w = trialWindow(start);

  it("sends each one in its turn", () => {
    expect(trialReminderToSend(w, at(6 * DAY), new Set())).toEqual({ send: null, skip: [] });
    expect(trialReminderToSend(w, at(7 * DAY + 60_000), new Set()).send?.kind).toBe("day_7");
    expect(trialReminderToSend(w, at(12 * DAY), new Set(["day_7"]))).toMatchObject({ send: { kind: "day_12" }, skip: [] });
    expect(trialReminderToSend(w, at(14 * DAY), new Set(["day_7", "day_12", "day_13"])).send?.kind).toBe("expiry");
    expect(trialReminderToSend(w, at(15 * DAY), new Set(["day_7", "day_12", "day_13", "expiry"]))).toEqual({ send: null, skip: [] });
  });

  it("sends only the latest after a gap, and skips the rest", () => {
    // A first run on day 10, as in production when the job started.
    expect(trialReminderToSend(w, at(10 * DAY), new Set())).toMatchObject({ send: { kind: "day_7" }, skip: [] });
    expect(trialReminderToSend(w, at(13 * DAY + 3_600_000), new Set())).toEqual({
      send: { kind: "day_13", dueAt: at(13 * DAY) },
      skip: [
        { kind: "day_7", reason: "superseded" },
        { kind: "day_12", reason: "superseded" },
      ],
    });
  });

  it("doesn't send an expiry reminder more than three days late", () => {
    expect(trialReminderToSend(w, at(17 * DAY - 1), new Set(["day_7", "day_12", "day_13"])).send?.kind).toBe("expiry");
    expect(trialReminderToSend(w, at(30 * DAY), new Set())).toEqual({
      send: null,
      skip: [
        { kind: "day_7", reason: "superseded" },
        { kind: "day_12", reason: "superseded" },
        { kind: "day_13", reason: "superseded" },
        { kind: "expiry", reason: "too_late" },
      ],
    });
  });
});

describe("effective plan", () => {
  const trialing: BillingSnapshot = { state: "trialing", trial: trialWindow(start) };

  it("applies Pro features with trial caps during the trial", () => {
    const plan = resolveEffectivePlan(trialing, at(DAY));
    expect(plan).toMatchObject({ source: "trial", planId: "pro" });
    expect(plan.limits).toMatchObject({ seats: 3, agents: 3, integrations: 3, evaluationsPerMonth: 10_000, aiUnitsPerMonth: TRIAL.limits.aiUnitsTotal, sandboxHours: 2, historyDays: 30 });
  });

  it("falls back to Free the moment the trial ends, even before the job runs", () => {
    expect(resolveEffectivePlan(trialing, at(14 * DAY))).toMatchObject({ source: "free", planId: "free" });
  });

  it("keeps the trial while a checkout is pending", () => {
    expect(resolveEffectivePlan({ ...trialing, state: "checkout_pending" }, at(DAY))).toMatchObject({ source: "trial" });
  });

  it("keeps paid access through the paid-through date after cancelling", () => {
    const snap: BillingSnapshot = { state: "cancellation_scheduled", paidPlanId: "max", paidThrough: at(30 * DAY) };
    expect(resolveEffectivePlan(snap, at(29 * DAY))).toMatchObject({ source: "paid", planId: "max" });
    expect(resolveEffectivePlan(snap, at(30 * DAY))).toMatchObject({ source: "free" });
  });

  it("keeps paid access while past due, and drops to Free limits while suspended", () => {
    expect(resolveEffectivePlan({ state: "past_due", paidPlanId: "max_3x" }, at(0))).toMatchObject({ planId: "max_3x" });
    expect(resolveEffectivePlan({ state: "suspended", paidPlanId: "max_3x", suspendedReason: "payment" }, at(0))).toMatchObject({
      planId: "free",
      suspendedFrom: "max_3x",
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

describe("trialWindow with a stored end (staff extensions, ADR 0032)", () => {
  const begun = new Date("2026-10-01T00:00:00Z");
  const days = (n: number) => new Date(begun.getTime() + n * 86_400_000);

  it("uses an extension of up to 44 days, and falls back to 14 for anything else", () => {
    expect(trialWindow(begun).endsAt).toEqual(days(14));
    expect(trialWindow(begun, days(21)).endsAt).toEqual(days(21));
    expect(trialWindow(begun, days(44)).endsAt).toEqual(days(44));
    expect(trialWindow(begun, days(45)).endsAt).toEqual(days(14));
    expect(trialWindow(begun, days(10)).endsAt).toEqual(days(14));
    expect(trialWindow(begun, new Date("nonsense")).endsAt).toEqual(days(14));
    expect(trialWindow(begun, null).endsAt).toEqual(days(14));
  });
});
