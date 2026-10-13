import { describe, expect, it } from "vitest";
import { resolveEffectivePlan, trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { ContractDraft } from "@/core/realityloop/contract-draft";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { ContractDrafter, DraftOutcome } from "@/server/ai/contract-drafter";
import { aiDraftAvailability, draftContractWithAi, type AiCreditDeps } from "./ai-drafting";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-14T10:00:00.000Z");
const USAGE = { model: "claude-opus-5-5", inputTokens: 900, outputTokens: 600 };
const BRIEF = { taskTitle: "Fix the hero", projectName: "Storefront", projectDescription: null, notes: {} };

const DRAFT: ContractDraft = {
  outcome: "The hero headline fits on one line at 375px.",
  resources: ["src/components"],
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: ["No other page changes."],
  acceptanceCriteria: [{ statement: "The headline fits at 375px.", verification: "assertion" }],
  requiredChecks: ["pnpm test"],
  assumptions: [],
  openQuestions: [],
  recovery: "Revert the commit.",
  maxRecords: null,
};

/** A labelled fake drafter: it never calls a provider. */
function fakeDrafter(outcome: DraftOutcome | Error): ContractDrafter & { calls: number } {
  const d = {
    model: "fake-model",
    calls: 0,
    async draft() {
      d.calls++;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return d;
}

function fakeDeps(over: { role?: OrgRole | null; billing?: BillingSnapshot | null; state?: TaskState; used?: number; reserveError?: string; settleFails?: boolean } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const deps: WriteDeps & AiCreditDeps = {
    role: async () => (over.role === undefined ? "member" : over.role),
    billing: async () => (over.billing === undefined ? { state: "free" } : over.billing),
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t1", projectId: "p1", state: over.state ?? "RECEIVED", version: 0, eventIds: [] }),
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    countAiCredits: async (orgId, period) => (calls.push({ name: "count", input: { orgId, period } }), over.used ?? 0),
    reserveAiCredits: async (input) => (calls.push({ name: "reserve", input }), over.reserveError ? { ok: false, error: over.reserveError } : { ok: true, value: "entry-1" }),
    settleAiCredits: async (input) => (calls.push({ name: "settle", input }), over.settleFails ? { ok: false, error: "boom" } : { ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => NOW,
  };
  return { deps, calls };
}

const run = (deps: WriteDeps & AiCreditDeps, drafter: ContractDrafter) => draftContractWithAi(deps, drafter, { orgId: "o1", userId: "u1", taskId: "t1", brief: BRIEF });

describe("draftContractWithAi", () => {
  it("reserves one credit, drafts, settles with provider usage and returns editor fields", async () => {
    const { deps, calls } = fakeDeps({ used: 3 });
    const result = await run(deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }));
    expect(result).toMatchObject({ ok: true, value: { model: "claude-opus-5-5", credits: { used: 4, limit: 20 } } });
    if (result.ok) expect(result.value.form).toMatchObject({ allowed: "files.edit", acceptance: "assertion: The headline fits at 375px." });
    expect(calls.map((c) => c.name)).toEqual(["count", "reserve", "settle"]);
    expect(calls[1]!.input).toMatchObject({ operation: "contract_draft", credits: 1, limit: 20, taskId: "t1", key: "key-1" });
    expect(calls[2]!.input).toEqual({ orgId: "o1", entryId: "entry-1", status: "settled", usage: USAGE });
  });

  it("uses the Free calendar month, or the whole trial while it runs", async () => {
    const free = fakeDeps();
    await run(free.deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }));
    expect((free.calls[0]!.input as { period: { start: Date } }).period.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");

    const window = trialWindow(new Date("2026-10-10T00:00:00Z"));
    const trial = fakeDeps({ billing: { state: "trialing", trial: window } });
    await run(trial.deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }));
    expect(trial.calls[0]!.input).toMatchObject({ period: { start: window.startedAt, end: window.endsAt } });
    expect(trial.calls[1]!.input).toMatchObject({ limit: 100 });
  });

  it("refuses when credits are used up, without calling the model", async () => {
    const drafter = fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE });
    const { deps, calls } = fakeDeps({ used: 20 });
    expect(await run(deps, drafter)).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED", message: expect.stringContaining("all 20 AI credits") });
    expect(drafter.calls).toBe(0);
    expect(calls.map((c) => c.name)).toEqual(["count"]);

    const trial = fakeDeps({ billing: { state: "trialing", trial: trialWindow(new Date("2026-10-10T00:00:00Z")) }, used: 100 });
    expect(await run(trial.deps, drafter)).toMatchObject({ code: "TRIAL_CAP_REACHED", message: expect.stringContaining("in the trial") });
  });

  it("maps a database quota refusal (a concurrent request won the last credit)", async () => {
    const drafter = fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE });
    expect(await run(fakeDeps({ reserveError: "QUOTA_EXCEEDED" }).deps, drafter)).toMatchObject({ code: "QUOTA_EXCEEDED" });
    expect(drafter.calls).toBe(0);
  });

  it("refunds the credit when the model refuses, is busy or returns nothing usable", async () => {
    for (const [failure, code] of [
      ["REFUSED", "AI_REFUSED"],
      ["INCOMPLETE", "AI_INCOMPLETE"],
      ["PROVIDER_BUSY", "AI_BUSY"],
      ["PROVIDER_ERROR", "AI_UNAVAILABLE"],
    ] as const) {
      const { deps, calls } = fakeDeps();
      const result = await run(deps, fakeDrafter({ ok: false, failure, usage: failure === "REFUSED" ? USAGE : null }));
      expect(result).toMatchObject({ ok: false, code, message: expect.stringContaining("No credit was used.") });
      expect(calls.at(-1)!.input).toMatchObject({ status: "refunded" });
    }
  });

  it("refunds when the drafter throws", async () => {
    const { deps, calls } = fakeDeps();
    expect(await run(deps, fakeDrafter(new Error("network")))).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(calls.at(-1)!.input).toMatchObject({ status: "refunded" });
  });

  it("says so when a refund couldn't be recorded", async () => {
    const result = await run(fakeDeps({ settleFails: true }).deps, fakeDrafter({ ok: false, failure: "PROVIDER_BUSY", usage: null }));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("may still show as used") });
    expect(result.ok || result.message.includes("No credit was used")).toBe(false);
  });

  it("still returns the draft when settling fails after success", async () => {
    expect(await run(fakeDeps({ settleFails: true }).deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }))).toMatchObject({ ok: true });
  });

  it("refuses viewers, missing billing state and tasks past planning before spending anything", async () => {
    const drafter = fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE });
    expect(await run(fakeDeps({ role: "viewer" }).deps, drafter)).toMatchObject({ code: "FORBIDDEN" });
    expect(await run(fakeDeps({ billing: null }).deps, drafter)).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(await run(fakeDeps({ state: "EXECUTING" }).deps, drafter)).toMatchObject({ code: "INVALID_TRANSITION" });
    expect(drafter.calls).toBe(0);
  });
});

describe("aiDraftAvailability", () => {
  const free = resolveEffectivePlan({ state: "free" }, NOW);
  const base = { writeReason: null, keyPresent: true, used: 5, plan: free, period: "month" as const };

  it("is on with credits left, and reports the allowance", () => {
    expect(aiDraftAvailability(base)).toEqual({ cost: 1, used: 5, limit: 20, period: "month", disabledReason: null });
  });

  it("gives an honest reason for each way it can be off", () => {
    expect(aiDraftAvailability({ ...base, writeReason: "Read-only demo." }).disabledReason).toBe("Read-only demo.");
    expect(aiDraftAvailability({ ...base, keyPresent: false }).disabledReason).toMatch(/isn't connected/);
    expect(aiDraftAvailability({ ...base, used: null }).disabledReason).toMatch(/couldn't be read/);
    expect(aiDraftAvailability({ ...base, plan: null }).disabledReason).toMatch(/could not be confirmed/);
    expect(aiDraftAvailability({ ...base, used: 20 }).disabledReason).toMatch(/all 20 AI credits/);
  });
});
