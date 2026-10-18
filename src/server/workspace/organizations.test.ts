import { describe, expect, it } from "vitest";
import { mapCreateOrganizationError, summarizeOrganizations } from "./organizations";

const now = new Date("2026-10-15T09:30:00.000Z");

describe("summarizeOrganizations", () => {
  it("applies the trial while it runs", () => {
    const [ws] = summarizeOrganizations(
      [
        {
          id: "o1",
          name: "Alice Studio",
          created_at: "2026-10-13T09:30:00.000Z",
          billing_accounts: { state: "trialing", paid_plan_id: null, paid_through: null, suspended_reason: null },
          trials: { started_at: "2026-10-13T09:30:00.000Z", ends_at: "2026-10-27T09:30:00.000Z" },
        },
      ],
      now,
    );
    expect(ws).toMatchObject({ name: "Alice Studio", plan: { source: "trial", planId: "pro" }, billingUnknown: false });
    expect(ws!.trial).toMatchObject({ endsAt: "2026-10-27T09:30:00.000Z", phase: { phase: "active", daysRemaining: 12 } });
  });

  it("accepts embeds returned as arrays and moves an ended trial to Free", () => {
    const [ws] = summarizeOrganizations(
      [
        {
          id: "o1",
          name: "Old",
          created_at: "2026-09-01T00:00:00.000Z",
          billing_accounts: [{ state: "trialing", paid_plan_id: null, paid_through: null, suspended_reason: null }],
          trials: [{ started_at: "2026-09-01T00:00:00.000Z", ends_at: "2026-09-15T00:00:00.000Z" }],
        },
      ],
      now,
    );
    expect(ws!.plan.source).toBe("free");
    expect(ws!.trial!.phase).toEqual({ phase: "ended" });
  });

  it("falls back to Free and flags missing billing state", () => {
    const [ws] = summarizeOrganizations([{ id: "o1", name: "X", created_at: "2026-10-13T00:00:00Z", billing_accounts: null, trials: null }], now);
    expect(ws).toMatchObject({ plan: { planId: "free" }, trial: null, billingUnknown: true });
  });

  it("rejects unexpected shapes instead of guessing", () => {
    expect(() => summarizeOrganizations([{ id: 1 }], now)).toThrow();
  });
});

describe("mapCreateOrganizationError", () => {
  it("maps database errors to user-facing messages", () => {
    expect(mapCreateOrganizationError("EMAIL_NOT_VERIFIED").code).toBe("EMAIL_NOT_VERIFIED");
    expect(mapCreateOrganizationError("INVALID_NAME").code).toBe("INVALID_NAME");
    expect(mapCreateOrganizationError("something else").code).toBe("UNKNOWN");
    expect(mapCreateOrganizationError(undefined).message).toMatch(/Nothing was charged/);
  });
});
