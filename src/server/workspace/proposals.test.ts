import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import type { ProposalOutput, ProposedChange } from "@/core/realityloop/change-proposal";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import { sha256Hex } from "@/core/trust/canonical-json";
import type { ChangeProposer, ProposalOutcome } from "@/server/ai/change-proposer";
import { reserveUnits } from "@/core/billing/rate-card";
import { proposalPromptTokens } from "@/server/ai/prompts";
import type { AiUsageDeps } from "./ai-usage";
import { applyProposal, autoApplyWithinLimits, discardProposal, proposeChange, type ProposalDeps, type StoredProposal } from "./proposals";
import type { OrgRole } from "./types";
import type { WriteDeps } from "./use-cases";
import type { ActiveRules } from "@/core/trust/workspace-rules";
import type { WithheldPermissions } from "@/core/workspace/permissions";

const fake = (...parts: string[]) => parts.join("");
const USAGE = { model: "claude-sonnet-5-5", inputTokens: 4000, outputTokens: 900 };
const REVIEW_ONLY = { mode: "review_only" as const, reason: "No isolated sandbox is connected yet." };

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
    model: "claude-sonnet-5-5",
    maxOutputTokens: 16_000,
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
  over: { state?: TaskState; mode?: "pair" | "build"; proposal?: Partial<StoredProposal> | null; createError?: string; applyError?: string; billing?: BillingSnapshot; evaluations?: number; role?: OrgRole; rules?: ActiveRules; permissions?: WithheldPermissions } = {},
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  let n = 0;
  const deps: WriteDeps & AiUsageDeps & ProposalDeps = {
    role: async () => over.role ?? "member",
    permissions: async () => over.permissions ?? {},
    billing: async () => over.billing ?? { state: "free" },
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t1", projectId: "p1", state: over.state ?? "CONTRACT_APPROVED", version: 4, eventIds: [], mode: over.mode ?? "build" }),
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
    approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: contract }),
    countEvaluations: async () => over.evaluations ?? 0,
    workspaceRules: async () => over.rules ?? null,
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
            contractVersion: 1,
            model: "claude-opus-5-5",
            policy: { outcome: "REQUIRE_APPROVAL", version: "e".repeat(64), findings: [] },
            expiresAt: "2026-10-15T10:00:00Z",
            ...over.proposal,
          },
    applyProposal: async (input) => (calls.push({ name: "apply", input }), over.applyError ? { ok: false, error: over.applyError } : { ok: true, value: input.files.length }),
    latestProofPackDigest: async () => "9".repeat(64),
    discardProposal: async (input) => (calls.push({ name: "discard", input }), { ok: true, value: null }),
    newEventId: () => `e${++n}`,
    now: () => new Date("2026-10-13T10:00:00Z"),
  };
  return { deps, calls };
}

const propose = (deps: Parameters<typeof proposeChange>[0], proposer: ChangeProposer, contextPaths = ["src/lib/cart.ts"]) =>
  proposeChange(deps, { family: "anthropic", create: (s) => Object.assign(proposer, { model: s.model }) }, { orgId: "o1", userId: "u1", taskId: "t1", contextPaths, notes: "", taskTitle: "Reject fractions", projectName: "Storefront" });

describe("proposeChange", () => {
  it("asks for a small step in Pair mode, and keeps a Pair change to 3 files, naming the rest (ADR 0131)", async () => {
    const { deps, calls } = fakeDeps({ mode: "pair" });
    const four = output(["a", "b", "c", "d"].map((n) => ({ path: `src/lib/${n}.ts`, kind: "create" as const, edits: [], content: `export const ${n} = 1;
`, reason: "r" })));
    const proposer = fakeProposer({ ok: true, output: four, usage: USAGE });
    const r = await propose(deps, proposer);
    expect((proposer.briefs[0] as { notes: string }).notes).toMatch(/^Pair mode: make the smallest reviewable next step, changing at most 3 files./);
    expect(r).toMatchObject({ ok: true, value: { dropped: [{ path: "src/lib/d.ts", reason: "pair_step" }] } });
    expect(calls.find((c) => c.name === "create")!.input.changes.map((c: { path: string }) => c.path)).toEqual(["src/lib/a.ts", "src/lib/b.ts", "src/lib/c.ts"]);
  });

  it("reserves room for its prompt, shows the model only the chosen files, and records who decided each step", async () => {
    const { deps, calls } = fakeDeps();
    const proposer = fakeProposer({ ok: true, output: GOOD, usage: USAGE });
    expect(await propose(deps, proposer)).toMatchObject({
      ok: true,
      value: { proposalId: "prop-1", status: "pending", dropped: [], violations: [], policy: { outcome: "REQUIRE_APPROVAL" } },
    });
    expect((proposer.briefs[0] as { files: { path: string }[] }).files.map((f) => f.path)).toEqual(["src/lib/cart.ts"]);
    expect(calls.map((c) => c.name)).toEqual(["reserve", "create", "settle"]);
    expect(calls[0]!.input).toMatchObject({ operation: "change_proposal", units: reserveUnits("claude-haiku-5-5", proposalPromptTokens(proposer.briefs[0] as never), 16_000), grant: { kind: "free", source_key: "free:2026-10" } });
    // Free writes code on the fast model; paid plans use Sonnet (routing.test.ts).
    expect(proposer.model).toBe("claude-haiku-5-5");
    const create = calls[1]!.input;
    expect(create.steps.map((s: { event_type: string; actor_kind?: string }) => [s.event_type, s.actor_kind ?? "user"])).toEqual([
      ["propose_plan", "agent"],
      ["evaluate_policy", "system"],
      ["require_approval", "system"],
    ]);
    expect(create.changes[0]).toMatchObject({ path: "src/lib/cart.ts", baseRevision: 3 });
    expect(create.sha256).toMatch(/^[0-9a-f]{64}$/);
    // Settled to the real cost: 4,000 in and 900 out on Sonnet is 170 units.
    expect(calls[2]!.input).toMatchObject({ status: "settled", units: 170, usage: USAGE, refundReason: null });
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
    expect(result).toMatchObject({ ok: false, code: "NO_APPLICABLE_CHANGES", message: expect.stringMatching(/isn't in the current file.*It didn't count toward your AI usage/) });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "settle"]);
    expect(calls[1]!.input).toMatchObject({ status: "refunded", refundReason: "failed" });
  });

  it("refunds refusals, provider errors and a file changing during the call", async () => {
    expect(await propose(fakeDeps().deps, fakeProposer({ ok: false, failure: "REFUSED", usage: USAGE }))).toMatchObject({ code: "AI_REFUSED" });
    expect(await propose(fakeDeps().deps, fakeProposer(new Error("boom")))).toMatchObject({ code: "AI_UNAVAILABLE" });
    const { deps, calls } = fakeDeps({ createError: "FILE_CHANGED" });
    expect(await propose(deps, fakeProposer({ ok: true, output: GOOD, usage: USAGE }))).toMatchObject({ code: "FILE_CHANGED", message: expect.stringContaining("It didn't count toward your AI usage") });
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
    applyProposal(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256, files, execution: REVIEW_ONLY });

  it("applies the accepted content, skips rejected new files, and binds the approval to a hash", async () => {
    const { deps, calls } = fakeDeps({ state: "APPROVAL_PENDING" });
    const result = await apply(deps, [
      { path: "src/lib/cart.ts", content: "accepted" },
      { path: "src/lib/new.ts", content: "" },
    ]);
    // The task id comes back, so the caller can start its checks (ADR 0059).
    expect(result).toMatchObject({ ok: true, value: { written: 1, appliedSha256: expect.stringMatching(/^[0-9a-f]{64}$/), taskId: expect.any(String) } });
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

  it("refuses an expired proposal before writing anything, and applies one still inside its window", async () => {
    const expired = fakeDeps({ state: "APPROVAL_PENDING", proposal: { expiresAt: "2026-10-13T10:00:00Z" } });
    expect(await apply(expired.deps, [{ path: "src/lib/cart.ts", content: "x" }])).toMatchObject({ code: "PROPOSAL_EXPIRED" });
    expect(expired.calls.filter((c) => c.name === "apply")).toEqual([]);
    const open = fakeDeps({ state: "APPROVAL_PENDING", proposal: { expiresAt: "2026-10-13T10:00:01Z" } });
    expect(await apply(open.deps, [{ path: "src/lib/cart.ts", content: "x" }])).toMatchObject({ ok: true });
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
    expect(create.evaluationLimit).toBe(1_000);
  });

  it("refuses a proposal when the evaluation allowance is used up, before using AI", async () => {
    const proposer = fakeProposer({ ok: true, output: GOOD, usage: USAGE });
    const { deps, calls } = fakeDeps({ evaluations: 2_000 });
    expect(await propose(deps, proposer)).toMatchObject({ ok: false, code: "EVALUATION_LIMIT" });
    expect(calls).toEqual([]);
    expect(proposer.briefs).toHaveLength(0);
  });

  it("lets only an owner or admin apply an escalated proposal", async () => {
    const files = [{ path: "src/lib/cart.ts", content: "accepted" }];
    const apply = (role: OrgRole) =>
      applyProposal(fakeDeps({ state: "APPROVAL_PENDING", role, proposal: { policyOutcome: "ESCALATE" } }).deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256: "a".repeat(64), files, execution: REVIEW_ONLY });
    expect(await apply("member")).toMatchObject({ code: "APPROVER_ROLE_REQUIRED" });
    expect(await apply("admin")).toMatchObject({ ok: true });
  });

  it("needs the approve permission for a person's approval, and leaves owners and admins alone", async () => {
    const files = [{ path: "src/lib/cart.ts", content: "accepted" }];
    const apply = (deps: Parameters<typeof applyProposal>[0], f: typeof files) => applyProposal(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256: "a".repeat(64), files: f, execution: REVIEW_ONLY });
    const withheld = fakeDeps({ state: "APPROVAL_PENDING", permissions: { approve: false } });
    expect(await apply(withheld.deps, files)).toMatchObject({ ok: false, code: "PERMISSION_WITHHELD", message: "An owner or admin turned off approving changes for you in this workspace." });
    expect(withheld.calls.some((c) => c.name === "apply")).toBe(false);
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING", permissions: { publish: false } }).deps, files)).toMatchObject({ ok: true });
    expect(await apply(fakeDeps({ state: "APPROVAL_PENDING", role: "admin", permissions: { approve: false } }).deps, files)).toMatchObject({ ok: true });
  });
});

describe("ProofPack on apply", () => {
  it("records an unverified, chained ProofPack bound to this proposal and approval", async () => {
    const { deps, calls } = fakeDeps({ state: "APPROVAL_PENDING" });
    const result = await applyProposal(deps, {
      orgId: "o1",
      userId: "u1",
      proposalId: "prop-1",
      reviewedSha256: "a".repeat(64),
      files: [{ path: "src/lib/cart.ts", content: "accepted" }],
      execution: REVIEW_ONLY,
    });
    expect(result).toMatchObject({ ok: true, value: { proofPackDigest: expect.stringMatching(/^[0-9a-f]{64}$/) } });
    const sent = calls.find((c) => c.name === "apply")!.input;
    expect(sent.proofpackStatus).toBe("unverified");
    expect(sent.proofpack).toMatchObject({
      _type: "https://in-toto.io/Statement/v1",
      subject: [{ name: "src/lib/cart.ts" }],
      predicate: {
        status: "unverified",
        proposal: { id: "prop-1", sha256: "a".repeat(64) },
        approval: { approvedBy: "u1", appliedSha256: result.ok ? result.value.appliedSha256 : "" },
        contract: { version: 1, sha256: "c".repeat(64) },
        previous: "9".repeat(64),
        execution: REVIEW_ONLY,
      },
    });
    expect(sent.proofpackDigest).toBe(result.ok ? result.value.proofPackDigest : "");
  });

  it("refuses to apply when the approved contract changed since the proposal", async () => {
    const { deps } = fakeDeps({ state: "APPROVAL_PENDING", proposal: { contractVersion: 7 } });
    const r = await applyProposal(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256: "a".repeat(64), files: [{ path: "src/lib/cart.ts", content: "x" }], execution: REVIEW_ONLY });
    expect(r).toMatchObject({ ok: false, code: "CONTRACT_CHANGED" });
  });
});

describe("autonomy level 2 (ADR 0046)", () => {
  const SANDBOXED = { mode: "sandboxed" as const, provider: "Vercel Sandbox" };
  const LIMITS = { level: 2 as const, maxFiles: 3, allowCreates: false };
  const allowed = { policyOutcome: "ALLOW_WITHIN_LIMITS", changes: [{ path: "src/lib/cart.ts", kind: "edit" as const, baseRevision: 3, content: "x", sha256: "b".repeat(64), reason: "" }] };

  it("applies a proposal the workspace allowed, exactly as proposed, approved by policy", async () => {
    const { deps, calls } = fakeDeps({ state: "APPROVAL_PENDING", proposal: allowed });
    expect(await autoApplyWithinLimits(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", execution: SANDBOXED })).toMatchObject({ ok: true });
    const apply = calls.find((c) => c.name === "apply")!.input;
    expect(apply.files).toEqual([{ path: "src/lib/cart.ts", content: "x" }]);
    expect(apply.steps[0]).toMatchObject({ event_type: "grant_approval", actor_kind: "system" });
    expect(apply.proofpack.predicate.approval).toMatchObject({ approvedBy: "u1", by: "policy", autonomyLevel: 2 });
  });

  it("names level 3 in the ProofPack when level 3 allowed it", async () => {
    const level3 = { ...allowed, policy: { outcome: "ALLOW_WITHIN_LIMITS", version: "e".repeat(64), findings: [], autonomyLevel: 3 as const } };
    const { deps, calls } = fakeDeps({ state: "APPROVAL_PENDING", proposal: level3 });
    expect(await autoApplyWithinLimits(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", execution: SANDBOXED })).toMatchObject({ ok: true });
    expect(calls.find((c) => c.name === "apply")!.input.proofpack.predicate.approval).toMatchObject({ by: "policy", autonomyLevel: 3 });
  });

  it("refuses to apply on its own anything the policy didn't allow, or anything but the proposal's own content", async () => {
    const plain = fakeDeps({ state: "APPROVAL_PENDING" });
    expect(await autoApplyWithinLimits(plain.deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", execution: SANDBOXED })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const edited = fakeDeps({ state: "APPROVAL_PENDING", proposal: allowed });
    expect(
      await applyProposal(edited.deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", reviewedSha256: "a".repeat(64), files: [{ path: "src/lib/cart.ts", content: "changed" }], execution: SANDBOXED, by: "policy" }),
    ).toMatchObject({ ok: false, code: "INVALID_PROPOSAL" });
    expect([...plain.calls, ...edited.calls].some((c) => c.name === "apply")).toBe(false);
  });

  it("proposes and applies on its own when the workspace allows it and checks can run", async () => {
    const { deps, calls } = fakeDeps();
    const created = () => calls.some((c) => c.name === "create");
    deps.approvedContract = async () => ({ version: 1, sha256: "c".repeat(64), body: { ...contract, requiredChecks: ["pnpm test"] } });
    deps.loadTask = async () => ({ id: "t1", projectId: "p1", state: created() ? "APPROVAL_PENDING" : "CONTRACT_APPROVED", version: 4, eventIds: [] });
    deps.loadProposal = async () => ({
      id: "prop-1",
      taskId: "t1",
      projectId: "p1",
      status: "pending",
      sha256: "a".repeat(64),
      changes: calls.find((c) => c.name === "create")!.input.changes,
      policyOutcome: calls.find((c) => c.name === "create")!.input.policy.outcome,
      contractVersion: 1,
      model: null,
      policy: null,
      expiresAt: "2026-10-15T10:00:00Z",
    });
    const run = (autonomy: typeof LIMITS | null, execution: typeof SANDBOXED | typeof REVIEW_ONLY) =>
      proposeChange(deps, { family: "anthropic", create: (s) => Object.assign(fakeProposer({ ok: true, output: GOOD, usage: USAGE }), { model: s.model }) }, { orgId: "o1", userId: "u1", taskId: "t1", contextPaths: ["src/lib/cart.ts"], notes: "", taskTitle: "T", projectName: "P", autonomy, execution });
    expect(await run(LIMITS, SANDBOXED)).toMatchObject({ ok: true, value: { status: "applied", policy: { outcome: "ALLOW_WITHIN_LIMITS" } } });
    expect(calls.map((c) => c.name)).toEqual(["reserve", "create", "settle", "apply"]);
  });

  it("keeps the proposal waiting when no sandbox can check it", async () => {
    const { deps, calls } = fakeDeps();
    deps.approvedContract = async () => ({ version: 1, sha256: "c".repeat(64), body: { ...contract, requiredChecks: ["pnpm test"] } });
    const r = await proposeChange(deps, { family: "anthropic", create: (s) => Object.assign(fakeProposer({ ok: true, output: GOOD, usage: USAGE }), { model: s.model }) }, { orgId: "o1", userId: "u1", taskId: "t1", contextPaths: ["src/lib/cart.ts"], notes: "", taskTitle: "T", projectName: "P", autonomy: LIMITS, execution: REVIEW_ONLY });
    expect(r).toMatchObject({ ok: true, value: { status: "pending", policy: { outcome: "REQUIRE_APPROVAL" } } });
    expect(calls.some((c) => c.name === "apply")).toBe(false);
  });
});
