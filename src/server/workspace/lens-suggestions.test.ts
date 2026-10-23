import { describe, expect, it } from "vitest";
import type { ProposedChange } from "@/core/realityloop/change-proposal";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { LensMapOutcome, LensMapper } from "@/server/ai/lens-mapper";
import type { AiUsageDeps } from "./ai-usage";
import { suggestLensMapping, type LensSuggestionDeps } from "./lens-suggestions";
import type { ProposalDeps, StoredProposal } from "./proposals";
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
const USAGE = { model: "claude-haiku-5-5", inputTokens: 900, outputTokens: 120 };

function fakeMapper(result: LensMapOutcome | Error) {
  const m = {
    model: "claude-haiku-5-5",
    maxOutputTokens: 6_000,
    calls: 0,
    async map() {
      m.calls += 1;
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return m satisfies LensMapper & { calls: number };
}

function fakeDeps(over: { role?: OrgRole; proposal?: Partial<StoredProposal>; contractVersion?: number } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const deps: WriteDeps & AiUsageDeps & Pick<ProposalDeps, "approvedContract" | "loadProposal"> & LensSuggestionDeps = {
    role: async () => over.role ?? "member",
    billing: async () => ({ state: "free" }),
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
    approvedContract: async () => ({ version: over.contractVersion ?? 1, sha256: "c".repeat(64), body: contract }),
    loadProposal: async () => ({
      id: "prop-1",
      taskId: "t1",
      projectId: "p1",
      status: "pending",
      sha256: "a".repeat(64),
      changes: [change],
      policyOutcome: "REQUIRE_APPROVAL",
      contractVersion: 1,
      model: null,
      policy: null,
      expiresAt: "2026-10-25T10:00:00Z",
      ...over.proposal,
    }),
    fileRevision: async (_o, _p, path, revision) => (path === change.path && revision === 3 ? CART : null),
    recordLensSuggestion: async (input) => (calls.push({ name: "record", input }), { ok: true, value: null }),
    newEventId: () => "key-1",
    now: () => new Date("2026-10-23T10:00:00Z"),
  };
  return { deps, calls };
}

const source = (mapper: LensMapper) => ({ family: "anthropic" as const, create: () => mapper });
const input = { orgId: "o1", userId: "u1", proposalId: "prop-1" };

describe("suggestLensMapping", () => {
  it("reserves usage, asks the model, settles, and stores only valid mappings", async () => {
    const { deps, calls } = fakeDeps();
    const mapper = fakeMapper({
      ok: true,
      usage: USAGE,
      output: { mappings: [{ hunk: "f0h0", clause: "AC-1", reason: "Throws for 1.5." }, { hunk: "f7h0", clause: "ac-1", reason: "not sent" }] },
    });
    expect(await suggestLensMapping(deps, source(mapper), input)).toEqual({ ok: true, value: { mapped: 1, hunks: 1, model: "claude-haiku-5-5" } });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle", "record"]);
    expect(calls[0]!.input).toMatchObject({ operation: "lens_mapping", taskId: "t1" });
    expect(calls[1]!.input).toMatchObject({ status: "settled" });
    expect(calls[2]!.input).toEqual({ proposalId: "prop-1", actor: "u1", mappings: [{ hunk: "f0h0", clause: "ac-1", reason: "Throws for 1.5." }], model: "claude-haiku-5-5" });
  });

  it("refunds a refusal or a failure and stores nothing", async () => {
    for (const result of [{ ok: false as const, failure: "REFUSED" as const, usage: USAGE }, new Error("network")]) {
      const { deps, calls } = fakeDeps();
      const r = await suggestLensMapping(deps, source(fakeMapper(result)), input);
      expect(r).toMatchObject({ ok: false, message: expect.stringMatching(/wasn't counted/) });
      expect(calls.map((c) => [c.name, c.input.status])).toEqual([
        ["reserve", undefined],
        ["settle", "refunded"],
      ]);
    }
  });

  it("refuses viewers, closed or expired proposals and a changed contract before any model call", async () => {
    const cases: [Parameters<typeof fakeDeps>[0], string][] = [
      [{ role: "viewer" }, "FORBIDDEN"],
      [{ proposal: { status: "applied" } }, "PROPOSAL_CLOSED"],
      [{ proposal: { expiresAt: "2026-10-23T09:00:00Z" } }, "PROPOSAL_EXPIRED"],
      [{ contractVersion: 2 }, "CONTRACT_CHANGED"],
    ];
    for (const [over, code] of cases) {
      const { deps, calls } = fakeDeps(over);
      const mapper = fakeMapper({ ok: true, usage: USAGE, output: { mappings: [] } });
      expect(await suggestLensMapping(deps, source(mapper), input)).toMatchObject({ ok: false, code });
      expect(mapper.calls).toBe(0);
      expect(calls).toEqual([]);
    }
  });
});
