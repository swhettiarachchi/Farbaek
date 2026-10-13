import { describe, expect, it } from "vitest";
import { InMemoryUsageLedger, billingPeriod, type EvaluationRequest } from "./usage";

const t = new Date("2026-10-13T10:00:00.000Z");
const req = (over: Partial<EvaluationRequest> = {}): EvaluationRequest => ({
  orgId: "org_a",
  idempotencyKey: "key_1",
  authenticated: true,
  outcome: "ALLOW",
  at: t,
  ...over,
});
const october = billingPeriod(null, t);

describe("evaluation metering", () => {
  it("counts an idempotent retry once", async () => {
    const ledger = new InMemoryUsageLedger();
    expect(await ledger.recordEvaluation(req())).toEqual({ counted: true });
    expect(await ledger.recordEvaluation(req())).toEqual({ counted: false, reason: "DUPLICATE" });
    expect(await ledger.countEvaluations("org_a", october)).toBe(1);
  });

  it("counts BLOCK outcomes", async () => {
    const ledger = new InMemoryUsageLedger();
    await ledger.recordEvaluation(req({ outcome: "BLOCK" }));
    expect(await ledger.countEvaluations("org_a", october)).toBe(1);
  });

  it("does not count failed authentication", async () => {
    const ledger = new InMemoryUsageLedger();
    expect(await ledger.recordEvaluation(req({ authenticated: false }))).toEqual({ counted: false, reason: "UNAUTHENTICATED" });
    expect(await ledger.countEvaluations("org_a", october)).toBe(0);
  });

  it("scopes idempotency keys and counts to one organization", async () => {
    const ledger = new InMemoryUsageLedger();
    await ledger.recordEvaluation(req({ orgId: "org_a" }));
    expect(await ledger.recordEvaluation(req({ orgId: "org_b" }))).toEqual({ counted: true });
    expect(await ledger.countEvaluations("org_a", october)).toBe(1);
    expect(await ledger.countEvaluations("org_b", october)).toBe(1);
  });

  it("rejects empty keys instead of merging them", async () => {
    const ledger = new InMemoryUsageLedger();
    expect(await ledger.recordEvaluation(req({ idempotencyKey: " " }))).toEqual({ counted: false, reason: "INVALID_KEY" });
  });

  it("only counts events inside the period", async () => {
    const ledger = new InMemoryUsageLedger();
    await ledger.recordEvaluation(req({ idempotencyKey: "sep", at: new Date("2026-09-30T23:59:59.999Z") }));
    await ledger.recordEvaluation(req({ idempotencyKey: "oct", at: new Date("2026-10-01T00:00:00.000Z") }));
    await ledger.recordEvaluation(req({ idempotencyKey: "nov", at: new Date("2026-11-01T00:00:00.000Z") }));
    expect(await ledger.countEvaluations("org_a", october)).toBe(1);
  });
});

describe("billing periods", () => {
  it("uses the UTC calendar month on Free", () => {
    expect(october.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(october.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("anchors paid periods to the subscription start", () => {
    const anchor = new Date("2026-08-15T09:00:00.000Z");
    const p = billingPeriod(anchor, new Date("2026-10-15T08:59:59.999Z"));
    expect([p.start.toISOString(), p.end.toISOString()]).toEqual(["2026-09-15T09:00:00.000Z", "2026-10-15T09:00:00.000Z"]);
    const q = billingPeriod(anchor, new Date("2026-10-15T09:00:00.000Z"));
    expect(q.start.toISOString()).toBe("2026-10-15T09:00:00.000Z");
  });

  it("clamps month-end anchors without drifting", () => {
    const anchor = new Date("2026-01-31T00:00:00.000Z");
    const feb = billingPeriod(anchor, new Date("2026-02-28T12:00:00.000Z"));
    expect([feb.start.toISOString(), feb.end.toISOString()]).toEqual(["2026-02-28T00:00:00.000Z", "2026-03-31T00:00:00.000Z"]);
    const apr = billingPeriod(anchor, new Date("2026-04-30T00:00:00.000Z"));
    expect(apr.start.toISOString()).toBe("2026-04-30T00:00:00.000Z");
  });

  it("refuses a time before the anchor", () => {
    expect(() => billingPeriod(new Date("2026-10-13T00:00:00Z"), new Date("2026-10-12T00:00:00Z"))).toThrow();
  });
});
