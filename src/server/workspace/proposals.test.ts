import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import type { ProposalOutput, ProposedChange } from "@/core/realityloop/change-proposal";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { ChangeProposer, ProposalOutcome } from "@/server/ai/change-proposer";
import type { AiCreditDeps } from "./ai-credits";
import { applyProposal, discardProposal, proposeChange, type ProposalDeps, type StoredProposal } from "./proposals";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";

const fake = (...parts: string[]) => parts.join("");
const USAGE = { model: "claude-opus-5-5", inputTokens: 4000, outputTokens: 900 };

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "Cart rejects fractional quantities.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/lib"] },
  allowedOperations: ["files.edit", "files.create"],
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

const CART = "export function add(q: number) {\n  if (q < 1) throw new Error('min');\n  return q;\n}\n";
const FILES = { "src/lib/cart.ts": { revision: 3, content: CART }, "src/app/page.tsx": { revision: 1, content: "export default function Page() {}\n" } };

const output = (changes: ProposalOutput["changes"]): ProposalOutput => ({ summary: "Reject fractions.", steps: ["Check integers"], risks: [], checks: ["pnpm test"], changes });
const GOOD = output([{ path: "src/lib/cart.ts", kind: "edit", edits: [{ find: "q < 1", replace: "q < 1 || !Number.isInteger(q)" }], content: "", reason: "r" }]);

function fakeProposer(result: ProposalOutcome | Error) {
  const p = {
    model: "fake",
    briefs: [] as unknown[],
    async propose(brief: unknown) {
      p.briefs.push(brief);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return p satisfies ChangeProposer & { briefs: unknown[] };
}

function fakeDeps(
  over: { state?: TaskState; proposal?: Partial<StoredProposal> | null; createError?: string; applyError?: string; billing?: BillingSnapshot; evaluations?: number; role?: OrgRole } = {},
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  let n = 0;
  const deps: WriteDeps & AiCreditDeps & ProposalDeps = {
    role: async () => over.role ?? "member",
    billing: async () => over.billing ?? { state: "free" },
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t1", projectId: "p1", state: over.state ?? "CONTRACT_APPROVED", version: 4, eventIds: [] }),
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    countAiCredits: async () => 0,
    reserveAiCredits: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleAiCredits: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: contract }),
    countEvaluations: async () => over.evaluations ?? 0,
    projectFiles: async () => Object.entries(FILES).map(([path, f]) => ({ path, revision: f.revision, sizeBytes: f.content.length })),
    fileContent: async (_o, _p, path) => {
      const f = FILES[path as keyof typeof FILES];
      return f ? { revision: f.revision, sha256: await sha256Hex(f.content), content: f.content } : null;
    },
    createProposal: async (input) => (calls.push({ name: "create", input }), over.createError ? { ok: false, error: over.createError } : { ok: true, value: "prop-1" }),
    loadProposal: async () =>
      over.proposal === null
        ? null
        : {
            id: "prop-1",
            taskId: "t1",
            projectId: "p1",
            status: "pending",
            sha256: "a".repeat(64),
            changes: [
              { path: "src/lib/cart.ts", kind: "edit", baseRevision: 3, content: "x", sha256: "b".repeat(64), reason: "" },
              { path: "src/lib/new.ts", kind: "create", baseRevision: 0, content: "y", sha256: "d".repeat(64), reason: "" },
            ] as ProposedChange[],
            policyOutcome: "REQUIRE_APPROVAL",
            ...over.proposal,
          },
    applyProposal: async (input) => (calls.push({ name: "apply", input }), over.applyError ? { ok: false, error: over.applyError } : { ok: true, value: input.files.length }),
    discardProposal: async (input) => (calls.push({ name: "discard", input }), { ok: true, value: null }),
    newEventId: () => `e${++n}`,
    now: () => new Date("2026-10-13T10:00:00Z"),
  };
  return { deps, calls };
}

const propose = (deps: Parameters<typeof proposeChange>[0], proposer: ChangeProposer, contextPaths = ["src/lib/cart.ts"]) =>
  proposeChange(deps, proposer, { orgId: "o1", userId: "u1", taskId: "t1", contextPaths, notes: "", taskTitle: "Reject fractions", projectName: "Storefront" });

describe("proposeChange", () => {
  it("spends 3 credits, shows the model only the chosen files, and records who decided each step", async () => {
    const { deps, calls } = fakeDeps();
    const proposer = fakeProposer({ ok: true, output: GOOD, usage: USAGE });
    expect(await propose(deps, proposer)).toMatchObject({
      ok: true,
      value: { proposalId: "prop-1", status: "pending", dropped: [], violations: [], policy: { outcome: "REQUIRE_APPROVAL" } },
    });
    expect((proposer.briefs[0] as { files: { path: string }[] }).files.map((f) => f.path)).toEqual(["src/lib/cart.ts"]);
    expect(calls.map((c) => c.name)).toEqual(["reserve", "create", "settle"]);
    expect(calls[0]!.input).toMatchObject({ operation: "change_proposal", credits: 3 });
    const create = calls[1]!.input;
    expect(create.steps.map((s: { event_type: string; actor_kind?: string }) => [s.event_type, s.actor_kind ?? "user"])).toEqual([
      ["propose_plan", "agent"],
      ["evaluate_policy", "system"],
      ["require_approval", "system"],
    ]);
    expect(create.changes[0]).toMatchObject({ path: "src/lib/cart.ts", baseRevision: 3 });
    expect(create.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(calls[2]!.input).toMatchObject({ status: "settled", usage: USAGE });
  });

  it("blocks the task when a change breaks the contract, and still charges for the work", async () => {
    const { deps, calls } = fakeDeps();
    const outside = output([{ path: "src/app/page.tsx", kind: "edit", edits: [{ find: "Page()", replace: "Page(): null" }], content: "", reason: "r" }]);
    const result = await propose(deps, fakeProposer({ ok: true, output: outside, usage: USAGE }), ["src/app/page.tsx"]);
    expect(result).toMatchObject({ ok: true, value: { status: "blocked", violations: [{ kind: "OUT_OF_SCOPE_PATH" }] } });
    expect(calls[1]!.input.steps.at(-1)).toMatchObject({ event_type: "block", to: "BLOCKED" });
    expect(calls.at(-1)!.input).toMatchObject({ status: "settled" });
  });

  it("refunds when nothing in the proposal can be applied, saying why", async () => {
    const { deps, calls } = fakeDeps();
    const miss = output([{ path: "src/lib/cart.ts", kind: "edit", edits: [{ find: "not in the file", replace: "x" }], content: "", reason: "r" }]);
    const result = await propose(deps, fakeProposer({ ok: true, output: miss, usage: USAGE }));
    expect(result).toMatchObject({ ok: false, code: "NO_APPLICABLE_CHANGES", message: expect.stringMatching(/isn't in the current file.*No credit was used/) });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    expect(calls[1]!.input).toMatchObject({ status: "refunded" });
  });

  it("refunds refusals, provider errors and a file changing during the call", async () => {
    expect(await propose(fakeDeps().deps, fakeProposer({ ok: false, failure: "REFUSED", usage: USAGE }))).toMatchObject({ code: "AI_REFUSED" });
    expect(await propose(fakeDeps().deps, fakeProposer(new Error("boom")))).toMatchObject({ code: "AI_UNAVAILABLE" });
    const { deps, calls } = fakeDeps({ createError: "FILE_CHANGED" });
    expect(await propose(deps, fakeProposer({ ok: true, output: GOOD, usage: USAGE }))).toMatchObject({ code: "FILE_CHANGED", message: expect.stringContaining("No credit was used") });
    expect(calls.at(-1)!.input).toMatchObject({ status: "refunded" });
  });

  it("checks the task and the chosen files before spending anything", async () => {
    const proposer = fakeProposer({ ok: true, output: GOOD, usage: USAGE });
    expect(await propose(fakeDeps({ state: "CONTRACT_DRAFTED" }).deps, proposer)).toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await propose(fakeDeps().deps, proposer, [])).toMatchObject({ code: "NO_CONTEXT" });
    expect(await propose(fakeDeps().deps, proposer, ["src/gone.ts"])).toMatchObject({ code: "NO_CONTEXT" });
    expect(await propose(fakeDeps().deps, proposer, Array.from({ length: 21 }, (_, i) => `f${i}.ts`))).toMatchObject({ code: "NO_CONTEXT" });
    expect(proposer.briefs).toHaveLength(0);
  });
});

describe("applyProposal", () => {
  const apply = (deps: Parameters<typeof applyProposal>[0], files: { path: string; content: string }[], reviewedSha256 = "a".repeat(64)) =>
    applyProposal(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256, files });

  it("applies the accepted content, skips rejected new files, and binds the approval to a hash", async () => {
    const { deps, calls } = fakeDeps({ state: "APPROVAL_PENDING" });
    const result = await apply(deps, [
      { path: "src/lib/cart.ts", content: "accepted" },
      { path: "src/lib/new.ts", content: "" },
    ]);
    expect(result).toMatchObject({ ok: true, value: { written: 1, appliedSha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    expect(calls[0]!.input.files).toEqual([{ path: "src/lib/cart.ts", content: "accepted" }]);
    expect(calls[0]!.input.steps.map((s: { event_type: string; actor_kind?: string }) => [s.event_type, s.actor_kind ?? "user"])).toEqual([
      ["grant_approval", "user"],
      ["start_execution", "system"],
      ["begin_verification", "system"],
    ]);
  });

  it("refuses a different proposal than the one reviewed, closed proposals and unknown paths", async () => {
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING" }).deps, [{ path: "src/lib/cart.ts", content: "x" }], "f".repeat(64))).toMatchObject({ code: "PROPOSAL_CHANGED" });
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING", proposal: { status: "applied" } }).deps, [{ path: "src/lib/cart.ts", content: "x" }])).toMatchObject({ code: "PROPOSAL_CLOSED" });
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING" }).deps, [{ path: "src/other.ts", content: "x" }])).toMatchObject({ code: "INVALID_PROPOSAL" });
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING" }).deps, [{ path: "src/lib/new.ts", content: "" }])).toMatchObject({ code: "NOTHING_TO_APPLY" });
  });

  it("blocks secrets in accepted content and explains a stale file", async () => {
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING" }).deps, [{ path: "src/lib/cart.ts", content: fake("-----BEGIN ", "PRIVATE KEY-----") }])).toMatchObject({ code: "SECRET_IN_CONTENT" });
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING", applyError: "FILE_CHANGED" }).deps, [{ path: "src/lib/cart.ts", content: "x" }])).toMatchObject({
      code: "FILE_CHANGED",
      message: expect.stringContaining("propose again"),
    });
  });
});

describe("discardProposal", () => {
  it("returns the task to the approved contract", async () => {
    const { deps, calls } = fakeDeps({ state: "APPROVAL_PENDING" });
    expect(await discardProposal(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1" })).toEqual({ ok: true, value: null });
    expect(calls[0]!.input.steps).toMatchObject([{ event_type: "discard_plan", from: "APPROVAL_PENDING", to: "CONTRACT_APPROVED" }]);
    expect(await discardProposal(fakeDeps({ state: "BLOCKED", proposal: { status: "blocked" } }).deps, { orgId: "o1", userId: "u1", proposalId: "prop-1" })).toMatchObject({ ok: true });
    expect(await discardProposal(fakeDeps({ proposal: { status: "discarded" } }).deps, { orgId: "o1", userId: "u1", proposalId: "prop-1" })).toMatchObject({ code: "PROPOSAL_CLOSED" });
  });
});

describe("policy and metering", () => {
  it("records the policy decision and the evaluation allowance with the proposal", async () => {
    const { deps, calls } = fakeDeps();
    const pkg = output([{ path: "src/lib/cart.ts", kind: "edit", edits: [{ find: "q < 1", replace: "q < 2" }], content: "", reason: "r" }]);
    await propose(deps, fakeProposer({ ok: true, output: pkg, usage: USAGE }));
    const create = calls.find((c) => c.name === "create")!.input;
    expect(create.policy).toMatchObject({ outcome: "REQUIRE_APPROVAL", policyVersion: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(create.evaluationLimit).toBe(2_000);
  });

  it("refuses a proposal when the evaluation allowance is used up, before spending credits", async () => {
    const proposer = fakeProposer({ ok: true, output: GOOD, usage: USAGE });
    const { deps, calls } = fakeDeps({ evaluations: 2_000 });
    expect(await propose(deps, proposer)).toMatchObject({ ok: false, code: "EVALUATION_LIMIT" });
    expect(calls).toEqual([]);
    expect(proposer.briefs).toHaveLength(0);
  });

  it("lets only an owner or admin apply an escalated proposal", async () => {
    const files = [{ path: "src/lib/cart.ts", content: "accepted" }];
    const apply = (role: OrgRole) =>
      applyProposal(fakeDeps({ state: "APPROVAL_PENDING", role, proposal: { policyOutcome: "ESCALATE" } }).deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256: "a".repeat(64), files });
    expect(await apply("member")).toMatchObject({ code: "APPROVER_ROLE_REQUIRED" });
    expect(await apply("admin")).toMatchObject({ ok: true });
  });
});
