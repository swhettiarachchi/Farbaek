import { describe, expect, it } from "vitest";
import type { ProposedChange } from "@/core/realityloop/change-proposal";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { SecondCheckOutput } from "@/core/trust/second-check";
import type { SecondChecker, SecondCheckOutcome } from "@/server/ai/second-checker";
import type { AiUsageDeps } from "./ai-usage";
import type { ProposalDeps, StoredProposal } from "./proposals";
import { runSecondCheck, type SecondCheckDeps } from "./second-check";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "Cart rejects fractional quantities.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "Fractions throw.", verification: "test" }],
  approvals: [],
  limits: {},
  requiredChecks: [],
  recovery: "Restore the previous revision.",
};

const CART = "export function add(q: number) {\n  return q;\n}\n";
const change: ProposedChange = { path: "src/lib/cart.ts", kind: "edit", baseRevision: 3, content: CART.replace("{\n", "{\n  if (!Number.isInteger(q)) throw new Error('whole');\n"), sha256: "b".repeat(64), reason: "Guard q." };
const ANSWER: SecondCheckOutput = { verdict: "consistent", summary: "Matches the contract.", findings: [{ topic: "tests", severity: "note", path: "src/lib/nope.ts", detail: "Invented path." }], uncertainty: "" };

/** A labelled fake checker: it never calls a model. */
function fakeChecker(model: string, result: SecondCheckOutcome | Error) {
  const c = {
    model,
    maxOutputTokens: 8_000,
    calls: 0,
    async check() {
      c.calls += 1;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return c satisfies SecondChecker & { calls: number };
}

function fakeDeps(over: { role?: OrgRole; proposal?: Partial<StoredProposal>; billing?: "free" | "pro" } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & AiUsageDeps & Pick<ProposalDeps, "approvedContract" | "loadProposal"> & SecondCheckDeps = {
    role: async () => over.role ?? "member",
    billing: async () => (over.billing === "pro" ? { state: "active", paidPlanId: "pro" } : { state: "free" }),
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
    approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: contract }),
    loadProposal: async () => ({
      id: "prop-1",
      taskId: "t1",
      projectId: "p1",
      status: "pending",
      sha256: "a".repeat(64),
      changes: [change],
      policyOutcome: "REQUIRE_APPROVAL",
      contractVersion: 1,
      model: "claude-sonnet-5-5",
      policy: null,
      expiresAt: "2026-10-25T10:00:00Z",
      plan: { summary: "Guard the quantity.", steps: [], risks: [], checks: [] },
      violations: [],
      ...over.proposal,
    }),
    fileRevision: async (_o, _p, path, revision) => (path === change.path && revision === 3 ? CART : null),
    recordSecondCheck: async (input) => (calls.push({ name: "record", input }), { ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => new Date("2026-10-23T10:00:00Z"),
  };
  return { deps, calls };
}

const input = { orgId: "o1", userId: "u1", proposalId: "prop-1" };
const ok = (model: string): SecondCheckOutcome => ({ ok: true, output: ANSWER, usage: { model, inputTokens: 2_000, outputTokens: 300 } });

describe("runSecondCheck", () => {
  it("uses OpenAI when the server has it, meters it, and keeps findings only on files that were sent", async () => {
    const { deps, calls } = fakeDeps();
    const openai = fakeChecker("gpt-6.1-terra", ok("gpt-6.1-terra"));
    const claude = fakeChecker("claude-haiku-5-5", ok("claude-haiku-5-5"));
    const r = await runSecondCheck(deps, { openai, claude: () => claude }, input);
    expect(r).toMatchObject({ ok: true, value: { verdict: "consistent", model: "gpt-6.1-terra", independent: true, truncated: [] } });
    expect(r.ok && r.value.findings[0]!.path).toBeNull();
    expect(claude.calls).toBe(0);
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle", "record"]);
    expect(calls[0]!.input).toMatchObject({ operation: "second_check", taskId: "t1" });
    expect(calls[2]!.input).toMatchObject({ proposalId: "prop-1", actor: "u1", result: { model: "gpt-6.1-terra", independent: true } });
  });

  it("without OpenAI, uses a different Claude model from the one that wrote it", async () => {
    const { deps } = fakeDeps({ billing: "pro" });
    const asked: string[] = [];
    const r = await runSecondCheck(deps, { openai: null, claude: (model) => (asked.push(model), fakeChecker(model, ok(model))) }, input);
    expect(asked).toHaveLength(1);
    expect(asked[0]).not.toBe("claude-sonnet-5-5");
    expect(r).toMatchObject({ ok: true, value: { independent: true } });
  });

  it("says when the plan's only model also wrote the change", async () => {
    const { deps } = fakeDeps({ proposal: { model: "claude-haiku-5-5" } });
    const r = await runSecondCheck(deps, { openai: null, claude: (model) => fakeChecker(model, ok(model)) }, input);
    expect(r).toMatchObject({ ok: true, value: { model: "claude-haiku-5-5", independent: false } });
  });

  it("refunds a refusal or a failure and records nothing", async () => {
    for (const result of [{ ok: false as const, failure: "REFUSED" as const, usage: { model: "gpt-6.1-terra", inputTokens: 10, outputTokens: 1 } }, new Error("network")]) {
      const { deps, calls } = fakeDeps();
      const r = await runSecondCheck(deps, { openai: fakeChecker("gpt-6.1-terra", result), claude: () => fakeChecker("x", ok("x")) }, input);
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/wasn't counted/) });
      expect(calls.map((c) => [c.name, c.input.status])).toEqual([
        ["reserve", undefined],
        ["settle", "refunded"],
      ]);
    }
  });

  it("refuses viewers, decided or expired changes and a changed contract before any model call", async () => {
    for (const [over, code] of [
      [{ role: "viewer" as const }, "FORBIDDEN"],
      [{ proposal: { status: "applied" as const } }, "PROPOSAL_CLOSED"],
      [{ proposal: { expiresAt: "2026-10-23T09:00:00Z" } }, "PROPOSAL_EXPIRED"],
      [{ proposal: { contractVersion: 2 } }, "CONTRACT_CHANGED"],
    ] as const) {
      const { deps, calls } = fakeDeps(over);
      const openai = fakeChecker("gpt-6.1-terra", ok("gpt-6.1-terra"));
      expect(await runSecondCheck(deps, { openai, claude: () => openai }, input)).toMatchObject({ ok: false, code });
      expect(openai.calls).toBe(0);
      expect(calls).toEqual([]);
    }
  });
});
