import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import { parseRuleSet, ruleSetHash, type ActiveRules } from "@/core/trust/workspace-rules";
import type { PolicyDraftOutcome, PolicyDrafter } from "@/server/ai/policy-drafter";
import type { AiUsageDeps } from "./ai-usage";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";
import { activateRules, draftRules, RULES_MANAGERS_ONLY, RULES_NOT_IN_PLAN, testDraftRules, type RulesDeps } from "./workspace-rules";

const PRO: BillingSnapshot = { state: "active", paidPlanId: "pro" };
const USAGE = { model: "claude-sonnet-5-5", inputTokens: 900, outputTokens: 300 };
const doc = { schema: "farbaek.workspace-rules/v1", rules: [{ id: "r1", paths: ["src/billing/"], effect: "owner_approval", reason: "Billing needs an owner." }] };
const hashOf = async (d: unknown) => {
  const p = parseRuleSet(d);
  if (!p.ok) throw new Error("parse");
  return ruleSetHash(p.set);
};

function fakeDeps(over: { role?: OrgRole; billing?: BillingSnapshot; activateError?: string; current?: ActiveRules | null; historyFails?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & AiUsageDeps & RulesDeps = {
    role: async () => over.role ?? "owner",
    billing: async () => over.billing ?? PRO,
    countActiveProjects: async () => 0,
    loadTask: async () => null,
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    activeRules: async () => over.current ?? null,
    history: async () => {
      if (over.historyFails) throw new Error("down");
      return [
        {
          proposalId: "p1",
          taskId: "t1",
          createdAt: "2026-10-20T09:00:00Z",
          status: "applied",
          files: [{ path: "src/billing/plan.ts", kind: "edit" }],
          violations: 0,
          fromAgent: false,
          hasChecks: true,
          evidence: "verified",
        },
      ];
    },
    autonomy: async () => null,
    sandboxConnected: () => true,
    projectPaths: async () => ["src/billing/plan.ts", "src/app/page.tsx"],
    activateRules: async (input) => (calls.push({ name: "activate", input }), over.activateError ? { ok: false, error: over.activateError } : { ok: true, value: 3 }),
    newEventId: () => "key-1",
    now: () => new Date("2026-10-25T10:00:00Z"),
  };
  return { deps, calls };
}

function fakeDrafter(result: PolicyDraftOutcome | Error) {
  const d = {
    model: "claude-sonnet-5-5",
    maxOutputTokens: 4_000,
    requests: [] as unknown[],
    async draft(request: unknown) {
      d.requests.push(request);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return d satisfies PolicyDrafter & { requests: unknown[] };
}
const source = (drafter: PolicyDrafter) => ({ family: "anthropic" as const, create: () => drafter });
const input = { orgId: "o1", userId: "u1", request: "Billing code needs an owner to approve." };

describe("drafting rules with AI", () => {
  it("meters the call, sends the request with the workspace's folders, and keeps only valid patterns", async () => {
    const { deps, calls } = fakeDeps();
    const drafter = fakeDrafter({
      ok: true,
      usage: USAGE,
      output: { rules: [{ paths: ["src/billing/", "../etc"], effect: "owner_approval", reason: "Billing needs an owner." }], ambiguities: [], unsupported: ["Two approvals."] },
    });
    const r = await draftRules(deps, source(drafter), input);
    expect(r).toMatchObject({ ok: true, value: { rules: [{ paths: ["src/billing/"], effect: "owner_approval" }], unsupported: ["Two approvals."], dropped: [expect.stringContaining("../etc")] } });
    expect(drafter.requests[0]).toEqual({ request: input.request, folders: ["src/", "src/app/", "src/billing/"] });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    expect(calls[0]!.input).toMatchObject({ operation: "policy_draft", taskId: null });
  });

  it("refunds a failed draft and points to writing rules by hand", async () => {
    const { deps, calls } = fakeDeps();
    const r = await draftRules(deps, source(fakeDrafter({ ok: false, failure: "REFUSED", usage: USAGE })), input);
    expect(r).toMatchObject({ ok: false, code: "AI_REFUSED", message: expect.stringContaining("by hand") });
    expect(calls.map((c) => [c.name, c.input.status])).toEqual([
      ["reserve", undefined],
      ["settle", "refunded"],
    ]);
  });

  it("needs the plan, and a request of a sentence or two", async () => {
    const free = fakeDeps({ billing: { state: "free" } });
    expect(await draftRules(free.deps, source(fakeDrafter(new Error("x"))), input)).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: RULES_NOT_IN_PLAN });
    const { deps } = fakeDeps();
    expect(await draftRules(deps, source(fakeDrafter(new Error("x"))), { ...input, request: "x" })).toMatchObject({ ok: false, code: "INVALID_RULES" });
    expect(await draftRules(fakeDeps({ role: "viewer" }).deps, source(fakeDrafter(new Error("x"))), input)).toMatchObject({ ok: false, code: "FORBIDDEN" });
  });
});

describe("testing and activating", () => {
  it("tests a draft against past changes without changing anything", async () => {
    const { deps, calls } = fakeDeps();
    const r = await testDraftRules(deps, { orgId: "o1", userId: "u1", document: doc });
    expect(r).toMatchObject({ ok: true, value: { changes: 1, stricter: 1, sha256: await hashOf(doc) } });
    expect(calls).toEqual([]);
  });

  it("activates the exact set that was tested, tests it again, and stores the result", async () => {
    const { deps, calls } = fakeDeps();
    const sha256 = await hashOf(doc);
    expect(await activateRules(deps, { orgId: "o1", userId: "u1", document: doc, sha256 })).toEqual({ ok: true, value: { version: 3 } });
    expect(calls[0]!.input).toMatchObject({ sha256, compiled: [{ id: "r1", effect: "owner_approval", regex: ["^src/billing/.*$"] }], tested: { sha256, stricter: 1 } });
  });

  it("refuses a set that changed since it was tested", async () => {
    const { deps, calls } = fakeDeps();
    expect(await activateRules(deps, { orgId: "o1", userId: "u1", document: doc, sha256: "0".repeat(64) })).toMatchObject({ ok: false, code: "RULES_NOT_TESTED" });
    expect(calls).toEqual([]);
  });

  it("is for owners and admins, and needs the plan unless every rule is turned off", async () => {
    const sha256 = await hashOf(doc);
    expect(await activateRules(fakeDeps({ role: "member" }).deps, { orgId: "o1", userId: "u1", document: doc, sha256 })).toMatchObject({ ok: false, code: "FORBIDDEN", message: RULES_MANAGERS_ONLY });
    const lapsed = fakeDeps({ billing: { state: "free" } });
    expect(await activateRules(lapsed.deps, { orgId: "o1", userId: "u1", document: doc, sha256 })).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN" });
    const off = { schema: "farbaek.workspace-rules/v1", rules: [] };
    expect(await activateRules(lapsed.deps, { orgId: "o1", userId: "u1", document: off, sha256: await hashOf(off) })).toEqual({ ok: true, value: { version: 3 } });
  });

  it("doesn't activate what it couldn't test, and passes the database's refusal on", async () => {
    const sha256 = await hashOf(doc);
    const down = fakeDeps({ historyFails: true });
    expect(await activateRules(down.deps, { orgId: "o1", userId: "u1", document: doc, sha256 })).toMatchObject({ ok: false, code: "UNKNOWN" });
    expect(down.calls).toEqual([]);
    const refused = fakeDeps({ activateError: "INVALID_RULES" });
    expect(await activateRules(refused.deps, { orgId: "o1", userId: "u1", document: doc, sha256 })).toMatchObject({ ok: false, code: "INVALID_RULES" });
    expect(await activateRules(fakeDeps().deps, { orgId: "o1", userId: "u1", document: { rules: [{ id: "r1" }] }, sha256 })).toMatchObject({ ok: false, code: "INVALID_RULES" });
  });
});
