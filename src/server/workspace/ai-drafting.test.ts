import { describe, expect, it } from "vitest";
import { reserveUnits } from "@/core/billing/rate-card";
import { trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { GrantRow } from "@/core/billing/wallet";
import type { ContractDraft } from "@/core/realityloop/contract-draft";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { ContractDrafter, DraftOutcome } from "@/server/ai/contract-drafter";
import { contractPromptTokens } from "@/server/ai/prompts";
import { draftContractWithAi, type AiUsageDeps } from "./ai-drafting";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-14T10:00:00.000Z");
// 900 in and 600 out on Sonnet is 78 units.
const USAGE = { model: "claude-sonnet-5-5", inputTokens: 900, outputTokens: 600 };
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
    model: "claude-sonnet-5-5",
    maxOutputTokens: 8_000,
    calls: 0,
    async draft() {
      d.calls++;
      if (outcome instanceof Error) throw outcome;
      return outcome;
    },
  };
  return d;
}

function fakeDeps(over: { role?: OrgRole | null; billing?: BillingSnapshot | null; state?: TaskState; grants?: GrantRow[] | Error; reserveError?: string; settleFails?: boolean } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const deps: WriteDeps & AiUsageDeps = {
    role: async () => (over.role === undefined ? "member" : over.role),
    billing: async () => (over.billing === undefined ? { state: "free" } : over.billing),
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t1", projectId: "p1", state: over.state ?? "RECEIVED", version: 0, eventIds: [] }),
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => {
      if (over.grants instanceof Error) throw over.grants;
      return over.grants ?? [];
    },
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), over.reserveError ? { ok: false, error: over.reserveError } : { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), over.settleFails ? { ok: false, error: "boom" } : { ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => NOW,
  };
  return { deps, calls };
}

const run = (deps: WriteDeps & AiUsageDeps, drafter: ContractDrafter) => draftContractWithAi(deps, drafter, { orgId: "o1", userId: "u1", taskId: "t1", brief: BRIEF });
const FREE_GRANT: GrantRow = { id: "g1", kind: "free", units: 5_000, used: 1_000, startsAt: "2026-10-01T00:00:00.000Z", expiresAt: "2026-11-01T00:00:00.000Z" };

describe("draftContractWithAi", () => {
  it("reserves room for the prompt and the longest answer, then settles to the real cost", async () => {
    const { deps, calls } = fakeDeps({ grants: [FREE_GRANT] });
    const result = await run(deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }));
    expect(result).toMatchObject({ ok: true, value: { model: "claude-sonnet-5-5", usage: { percent: 20 } } });
    if (result.ok) expect(result.value.form).toMatchObject({ allowed: "files.edit", acceptance: "assertion: The headline fits at 375px." });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    const units = reserveUnits("claude-sonnet-5-5", contractPromptTokens(BRIEF), 8_000);
    // 8,000 output tokens on Sonnet alone is 800 units; the prompt adds a little.
    expect(units).toBeGreaterThan(800);
    expect(units).toBeLessThan(900);
    expect(calls[0]!.input).toMatchObject({ operation: "contract_draft", units, taskId: "t1", key: "key-1", grant: { kind: "free", units: 5_000, source_key: "free:2026-10" } });
    expect(calls[1]!.input).toEqual({ orgId: "o1", entryId: "entry-1", status: "settled", units: 78, usage: USAGE, refundReason: null, retryCap: null });
  });

  it("issues the whole trial's grant while the trial runs", async () => {
    const window = trialWindow(new Date("2026-10-10T00:00:00Z"));
    const trial = fakeDeps({ billing: { state: "trialing", trial: window } });
    await run(trial.deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }));
    expect(trial.calls[0]!.input).toMatchObject({ grant: { kind: "trial", starts_at: window.startedAt.toISOString(), expires_at: window.endsAt.toISOString() } });
  });

  it("refuses without calling the model when the wallet can't hold the reservation", async () => {
    const drafter = fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE });
    expect(await run(fakeDeps({ reserveError: "QUOTA_EXCEEDED" }).deps, drafter)).toMatchObject({
      code: "QUOTA_EXCEEDED",
      message: expect.stringContaining("isn't enough AI usage left this month"),
    });
    const trial = fakeDeps({ billing: { state: "trialing", trial: trialWindow(new Date("2026-10-10T00:00:00Z")) }, reserveError: "QUOTA_EXCEEDED" });
    expect(await run(trial.deps, drafter)).toMatchObject({ code: "TRIAL_CAP_REACHED", message: expect.stringContaining("in the trial") });
    expect(drafter.calls).toBe(0);
  });

  it("refunds in full when the model refuses, is busy or returns nothing usable", async () => {
    for (const [failure, code] of [
      ["REFUSED", "AI_REFUSED"],
      ["INCOMPLETE", "AI_INCOMPLETE"],
      ["PROVIDER_BUSY", "AI_BUSY"],
      ["PROVIDER_ERROR", "AI_UNAVAILABLE"],
    ] as const) {
      const { deps, calls } = fakeDeps();
      const result = await run(deps, fakeDrafter({ ok: false, failure, usage: failure === "REFUSED" ? USAGE : null }));
      expect(result).toMatchObject({ ok: false, code, message: expect.stringContaining("It didn't count toward your AI usage.") });
      expect(calls.at(-1)!.input).toMatchObject({ status: "refunded", refundReason: "failed", units: failure === "REFUSED" ? 78 : 0 });
    }
  });

  it("refunds when the drafter throws", async () => {
    const { deps, calls } = fakeDeps();
    expect(await run(deps, fakeDrafter(new Error("network")))).toMatchObject({ code: "AI_UNAVAILABLE" });
    expect(calls.at(-1)!.input).toMatchObject({ status: "refunded" });
  });

  it("says so when a refund couldn't be recorded", async () => {
    const result = await run(fakeDeps({ settleFails: true }).deps, fakeDrafter({ ok: false, failure: "PROVIDER_BUSY", usage: null }));
    expect(result).toMatchObject({ ok: false, message: expect.stringContaining("may still count") });
    expect(result.ok || result.message.includes("didn't count toward your AI usage")).toBe(false);
  });

  it("still returns the draft when settling or reading usage fails after success", async () => {
    expect(await run(fakeDeps({ settleFails: true }).deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }))).toMatchObject({ ok: true });
    expect(await run(fakeDeps({ grants: new Error("down") }).deps, fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE }))).toMatchObject({
      ok: true,
      value: { usage: { percent: null } },
    });
  });

  it("refuses viewers, missing billing state and tasks past planning before spending anything", async () => {
    const drafter = fakeDrafter({ ok: true, draft: DRAFT, usage: USAGE });
    expect(await run(fakeDeps({ role: "viewer" }).deps, drafter)).toMatchObject({ code: "FORBIDDEN" });
    expect(await run(fakeDeps({ billing: null }).deps, drafter)).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(await run(fakeDeps({ state: "EXECUTING" }).deps, drafter)).toMatchObject({ code: "INVALID_TRANSITION" });
    expect(drafter.calls).toBe(0);
  });
});
