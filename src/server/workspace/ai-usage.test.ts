import { describe, expect, it } from "vitest";
import { getPlan } from "@/core/billing/catalog";
import { resolveEffectivePlan, trialWindow } from "@/core/billing/trial";
import type { WalletView } from "@/core/billing/wallet";
import { FREE_WHILE_TESTING, USAGE_OPERATIONS, isFreeWhileTesting } from "@/config/usage";
import { aiAvailability, reserveMetered, resolveMetering, settleAsFreeRetry, typicalUnits, unitsFor, type AiUsageDeps, type FreeUsageDeps, type UsageContext } from "./ai-usage";

const NOW = new Date("2026-10-14T10:00:00.000Z");
const free = resolveEffectivePlan({ state: "free" }, NOW);
const wallet = (available: number, percent = 25): WalletView => ({ available, current: { percent, resetsAt: "2026-11-01T00:00:00.000Z", period: "month" }, rollover: null, grants: [] });
const base = {
  writeReason: null,
  keyPresent: true,
  plan: free,
  wallet: wallet(3_000),
  fallback: { resetsAt: "2026-11-01T00:00:00.000Z", period: "month" as const },
  needs: 1_000,
  manual: "You can still write the plan yourself.",
};

describe("aiAvailability", () => {
  it("is on with usage left, and reports only the share used, never units", () => {
    expect(aiAvailability(base)).toEqual({ percent: 25, resetsAt: "2026-11-01T00:00:00.000Z", period: "month", disabledReason: null, provider: null });
  });

  it("gives an honest reason for each way it can be off", () => {
    expect(aiAvailability({ ...base, writeReason: "Read-only demo." }).disabledReason).toBe("Read-only demo.");
    expect(aiAvailability({ ...base, keyPresent: false }).disabledReason).toMatch(/isn't connected/);
    expect(aiAvailability({ ...base, plan: null }).disabledReason).toMatch(/could not be confirmed/);
    expect(aiAvailability({ ...base, wallet: null })).toMatchObject({ percent: null, disabledReason: expect.stringMatching(/couldn't be read/) });
    const low = aiAvailability({ ...base, wallet: wallet(999, 80) }).disabledReason;
    expect(low).toMatch(/isn't enough AI usage left this month/);
    expect(low).not.toMatch(/credit|unit/i);
    const trial = resolveEffectivePlan({ state: "trialing", trial: trialWindow(new Date("2026-10-10T00:00:00Z")) }, NOW);
    expect(aiAvailability({ ...base, plan: trial, wallet: wallet(0, 100) }).disabledReason).toMatch(/left in the trial/);
  });

  it("is on for free use with no plan and nothing left, but still off for the honest reasons (ADR 0212)", () => {
    const empty = { ...base, plan: null, wallet: null, free: true };
    expect(aiAvailability(empty)).toMatchObject({ percent: null, disabledReason: null });
    expect(aiAvailability({ ...base, wallet: wallet(0, 100), free: true }).disabledReason).toBeNull();
    expect(aiAvailability({ ...empty, writeReason: "Read-only demo." }).disabledReason).toBe("Read-only demo.");
    expect(aiAvailability({ ...empty, keyPresent: false, notConnectedReason: "Farbaek's AI is paused." }).disabledReason).toMatch(/^Farbaek's AI is paused\./);
  });
});

describe("Survey Studio's AI is free while it's tested (ADR 0212)", () => {
  it("names only Survey Studio's three operations, each one the ledger knows", () => {
    expect([...FREE_WHILE_TESTING].sort()).toEqual(["survey_assist", "survey_draft", "survey_read"]);
    for (const op of FREE_WHILE_TESTING) expect(USAGE_OPERATIONS).toContain(op);
    expect(USAGE_OPERATIONS.filter(isFreeWhileTesting)).toHaveLength(3);
  });

  function deps(billing: "pro" | null) {
    const calls: string[] = [];
    const d: UsageContext & AiUsageDeps & FreeUsageDeps = {
      billing: async () => (calls.push("billing"), billing ? { state: "active", paidPlanId: billing } : null),
      now: () => NOW,
      newEventId: () => "key-1",
      listUsageGrants: async () => [],
      reserveUsage: async () => (calls.push("allowance"), { ok: true, value: "paid-1" }),
      reserveFreeUsage: async (i) => (calls.push(`free:${i.operation}:${i.units}`), { ok: true, value: "free-1" }),
      settleUsage: async () => ({ ok: true, value: null }),
    };
    return { d, calls };
  }
  const input = { orgId: "o1", userId: "u1", taskId: null, units: 12.2, manual: "By hand." };

  it("reads no plan and reserves a free entry for a survey operation, routed as the trial", async () => {
    const { d, calls } = deps(null);
    const m = await resolveMetering(d, "o1", "survey_draft");
    expect(m).toMatchObject({ ok: true, value: { free: true, plan: { source: "trial" } } });
    if (!m.ok) return;
    expect(await reserveMetered(d, m.value, { ...input, operation: "survey_draft" })).toEqual({ ok: true, value: { entryId: "free-1", units: 13 } });
    expect(calls).toEqual(["free:survey_draft:13"]);
  });

  it("keeps every other operation on the workspace's plan and allowance, failing closed without a plan", async () => {
    const unknown = deps(null);
    expect(await resolveMetering(unknown.d, "o1", "contract_draft")).toMatchObject({ ok: false, code: "ENTITLEMENT_UNAVAILABLE" });
    const paid = deps("pro");
    const m = await resolveMetering(paid.d, "o1", "contract_draft");
    expect(m).toMatchObject({ ok: true, value: { free: false } });
    if (!m.ok) return;
    expect(await reserveMetered(paid.d, m.value, { ...input, operation: "contract_draft" })).toMatchObject({ ok: true, value: { entryId: "paid-1" } });
    expect(paid.calls).toEqual(["billing", "allowance"]);
    // A free metering can't be spent on an operation that isn't free.
    const { d, calls } = deps(null);
    const free = await resolveMetering(d, "o1", "survey_assist");
    if (!free.ok) throw new Error("expected free metering");
    expect(await reserveMetered(d, free.value, { ...input, operation: "agent_step" })).toMatchObject({ ok: false, code: "ENTITLEMENT_UNAVAILABLE" });
    expect(calls).toEqual([]);
  });

  it("says the free limit in plain words when the database refuses", async () => {
    const { d } = deps(null);
    d.reserveFreeUsage = async () => ({ ok: false, error: "FREE_DAILY_LIMIT" });
    const m = await resolveMetering(d, "o1", "survey_read");
    if (!m.ok) throw new Error("expected free metering");
    expect(await reserveMetered(d, m.value, { ...input, operation: "survey_read" })).toEqual({
      ok: false,
      code: "FREE_DAILY_LIMIT",
      message: "Survey Studio's free AI has reached today's limit while it's being tested. It's back tomorrow; everything without AI still works.",
    });
  });
});

describe("metering", () => {
  it("prices a call at its real tokens, cache included", () => {
    // Sonnet: 1,000 in ($0.002) + 500 out ($0.005) + 20,000 cache reads ($0.002) = $0.009.
    expect(unitsFor({ model: "claude-sonnet-5-5-20260901", inputTokens: 1_000, outputTokens: 500, cacheReadTokens: 20_000 })).toBe(90);
  });

  it("reserves less for a typical draft on a fast model than on a strong one", () => {
    expect(typicalUnits("contract_draft", "claude-haiku-5-5", 8_000)).toBeLessThan(typicalUnits("contract_draft", "claude-opus-5-5", 8_000) / 10);
  });
});

describe("free retries", () => {
  function deps(capReached: boolean) {
    const calls: Parameters<AiUsageDeps["settleUsage"]>[0][] = [];
    const d: AiUsageDeps = {
      listUsageGrants: async () => [],
      reserveUsage: async () => ({ ok: true, value: "e1" }),
      settleUsage: async (input) => {
        calls.push(input);
        return input.refundReason === "free_retry" && capReached ? { ok: false, error: "RETRY_CAP" } : { ok: true, value: null };
      },
    };
    return { d, calls };
  }
  const usage = { model: "claude-sonnet-5-5", inputTokens: 1_000, outputTokens: 500 };
  const plus = resolveEffectivePlan({ state: "active", paidPlanId: "plus" }, NOW);

  it("is refunded from the plan's retry hold-back while it lasts", async () => {
    const { d, calls } = deps(false);
    expect(await settleAsFreeRetry(d, { orgId: "o1", entryId: "e1", usage, plan: plus })).toEqual({ free: true, recorded: true });
    expect(calls).toEqual([expect.objectContaining({ status: "refunded", refundReason: "free_retry", retryCap: getPlan("plus").limits.retryUnitsPerMonth, units: 70 })]);
  });

  it("is settled normally once the hold-back is used, or on a plan without one", async () => {
    const capped = deps(true);
    expect(await settleAsFreeRetry(capped.d, { orgId: "o1", entryId: "e1", usage, plan: plus })).toEqual({ free: false, recorded: true });
    expect(capped.calls.map((c) => c.status)).toEqual(["refunded", "settled"]);
    const none = deps(false);
    // Free has no hold-back, so a retry there is settled like any call.
    expect(await settleAsFreeRetry(none.d, { orgId: "o1", entryId: "e1", usage, plan: free })).toEqual({ free: false, recorded: true });
    expect(none.calls.map((c) => c.status)).toEqual(["settled"]);
  });
});
