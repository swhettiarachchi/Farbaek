import { describe, expect, it } from "vitest";
import { getPlan } from "@/core/billing/catalog";
import { resolveEffectivePlan, trialWindow } from "@/core/billing/trial";
import type { WalletView } from "@/core/billing/wallet";
import { aiAvailability, settleAsFreeRetry, typicalUnits, unitsFor, type AiUsageDeps } from "./ai-usage";

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
  manual: "You can still write the contract yourself.",
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
