import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import { sha256Hex } from "@/core/trust/canonical-json";
import { agentProposal, agentTaskFiles, pairAgent, submitAgentProposal, type AgentIdentity, type AgentProposalStatus, type AgentStore } from "./service";
import { newPairingCode, normalizePairingCode, sha256 } from "./tokens";

const ORG = "11111111-1111-4111-8111-111111111111";
const TASK = "22222222-2222-4222-8222-222222222222";
const PROJECT = "33333333-3333-4333-8333-333333333333";
const CONTRACT_SHA = "c".repeat(64);

const contract: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "README names pnpm test.",
  scope: { organizationId: ORG, projectId: PROJECT, resources: ["README.md", "docs/"] },
  allowedOperations: ["files.edit", "files.create"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "README names pnpm test.", verification: "read_back" }],
  approvals: [],
  limits: {},
  requiredChecks: [],
  recovery: "Restore README.md.",
};

function fakeStore(over: Partial<AgentStore> = {}) {
  const calls: Record<string, unknown[]> = {};
  const record = (name: string, value: unknown) => (calls[name] ??= []).push(value);
  let n = 0;
  const store: AgentStore = {
    session: async () => null,
    rateLimit: async () => true,
    billing: async () => ({ state: "free" }),
    workspaceName: async () => "Alice Studio",
    pairingOrg: async (hash) => (hash === sha256("ABCDE23456") ? ORG : null),
    redeemPairing: async (i) => {
      record("redeem", i);
      return { ok: true, value: { agentId: "agent-1", orgId: ORG } };
    },
    readyTasks: async () => [],
    loadTask: async (_o, id) => (id === TASK ? { id: TASK, title: "Docs", projectId: PROJECT, state: "CONTRACT_APPROVED", version: 3 } : null),
    approvedContract: async () => ({ version: 2, sha256: CONTRACT_SHA, body: contract }),
    project: async () => ({ id: PROJECT, name: "Storefront", archived: false }),
    projectFiles: async () => [
      { path: "README.md", revision: 4, sha256: "a".repeat(64), sizeBytes: 900_000 },
      { path: "src/app.ts", revision: 1, sha256: "b".repeat(64), sizeBytes: 1_500_000 },
      { path: "src/z.ts", revision: 1, sha256: "d".repeat(64), sizeBytes: 10 },
    ],
    fileContents: async (_o, _p, files) => new Map(files.map((f) => [f.path, `content of ${f.path}`])),
    countEvaluations: async () => 0,
    createAgentProposal: async (i) => {
      record("create", i);
      return { ok: true, value: "proposal-1" };
    },
    revokeAgent: async () => ({ ok: true, value: null }),
    // Only agent-1's own proposal in ORG; the real store filters on both in the query.
    agentProposal: async (orgId, agentId, id) => (orgId === ORG && agentId === "agent-1" && id === OWN.id ? OWN : null),
    newEventId: () => `event-${++n}`,
    now: () => new Date("2026-10-18T12:00:00Z"),
    ...over,
  };
  return { store, calls };
}

const agent: AgentIdentity = { agentId: "agent-1", orgId: ORG, userId: "user-1", role: "member", name: "Office PC" };

const OWN: AgentProposalStatus = {
  id: "44444444-4444-4444-8444-444444444444",
  taskId: TASK,
  status: "applied",
  sha256: "e".repeat(64),
  createdAt: "2026-10-18T10:00:00Z",
  expiresAt: "2026-10-21T10:00:00Z",
  decidedAt: "2026-10-18T11:00:00Z",
  appliedSha256: "f".repeat(64),
  proofPack: { digest: "9".repeat(64), status: "verified" },
};

describe("pairing codes and tokens", () => {
  it("makes typeable codes and accepts them with or without the dash", () => {
    const code = newPairingCode();
    expect(code).toMatch(/^[2-9A-HJ-NP-Z]{5}-[2-9A-HJ-NP-Z]{5}$/);
    expect(normalizePairingCode(code.toLowerCase())).toBe(code.replace("-", ""));
    expect(normalizePairingCode("abcde 23456")).toBe("ABCDE23456");
    for (const bad of ["ABCDE-2345", "ABCDE-2345O", "ABCDE-23451", 42]) expect(normalizePairingCode(bad)).toBeNull();
  });

  it("redeems a code for a new token and stores only the token's hash", async () => {
    const { store, calls } = fakeStore();
    const r = await pairAgent(store, { code: "abcde-23456", name: " Office PC ", platform: "windows", appVersion: "0.1.0" }, "client");
    expect(r).toMatchObject({ ok: true, value: { agentId: "agent-1", workspace: { id: ORG, name: "Alice Studio" } } });
    if (!r.ok) return;
    expect(r.value.token).toMatch(/^fa_[A-Za-z0-9_-]{43}$/);
    expect(calls.redeem![0]).toEqual({ codeSha256: sha256("ABCDE23456"), tokenSha256: sha256(r.value.token), name: "Office PC", platform: "windows", appVersion: "0.1.0", agentLimit: 1 });
  });

  it("refuses bad, unknown and rate-limited attempts", async () => {
    const { store } = fakeStore();
    expect(await pairAgent(store, { code: "nope", name: "PC", platform: "windows" }, "c")).toMatchObject({ ok: false, code: "INVALID_PAIRING", status: 400 });
    expect(await pairAgent(store, { code: "ZZZZZ-ZZZZZ", name: "PC", platform: "windows" }, "c")).toMatchObject({ ok: false, code: "PAIRING_CLOSED", status: 410 });
    expect(await pairAgent(store, { code: "ABCDE-23456", name: "", platform: "windows" }, "c")).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    const limited = fakeStore({ rateLimit: async (key) => key !== "agent:pair:c" });
    expect(await pairAgent(limited.store, { code: "ABCDE-23456", name: "PC", platform: "windows" }, "c")).toMatchObject({ ok: false, code: "RATE_LIMITED", status: 429 });
    const noBilling = fakeStore({ billing: async () => null });
    expect(await pairAgent(noBilling.store, { code: "ABCDE-23456", name: "PC", platform: "windows" }, "c")).toMatchObject({ ok: false, code: "ENTITLEMENT_UNAVAILABLE" });
  });
});

const body = async (over: Record<string, unknown> = {}) => {
  const content = "# Readme\nRun pnpm test.\n";
  return {
    contractVersion: 2,
    contractSha256: CONTRACT_SHA,
    plan: { summary: "README names pnpm test.", steps: ["Edited README.md"], risks: [], checks: ["pnpm test"] },
    changes: [{ path: "README.md", kind: "edit", baseRevision: 4, content, reason: "Name the command." }],
    notProposed: [{ path: "old.md", reason: "Deleted. A change proposal can't delete files." }],
    usage: { model: "claude-opus-5-5", inputTokens: 1200, outputTokens: 300 },
    mode: "review_only",
    sha: await sha256Hex(content),
    ...over,
  };
};

describe("agent proposals", () => {
  it("creates an ordinary proposal for the paired person, tagged with the agent", async () => {
    const { store, calls } = fakeStore();
    const r = await submitAgentProposal(store, agent, TASK, await body());
    expect(r).toMatchObject({ ok: true, value: { proposalId: "proposal-1", status: "pending", violations: [] } });
    const created = calls.create![0] as Record<string, unknown> & { steps: Record<string, string>[]; changes: { sha256: string }[]; plan: { risks: string[] } };
    expect(created).toMatchObject({ agentId: "agent-1", actor: "user-1", taskId: TASK, contractVersion: 2, expectedTaskVersion: 3, evaluationLimit: 1_000 });
    expect(created.changes[0]!.sha256).toBe((await body()).sha);
    expect(created.steps.map((s) => `${s.event_type}:${s.actor_kind}:${s.actor_id}`)).toEqual(["propose_plan:agent:agent:agent-1", "evaluate_policy:system:farbaek", "require_approval:system:farbaek"]);
    expect(created.plan.risks).toEqual(["Left out old.md: Deleted. A change proposal can't delete files."]);
  });

  it("blocks a change outside the contract through the normal policy, instead of trusting the app", async () => {
    const { store, calls } = fakeStore();
    const r = await submitAgentProposal(store, agent, TASK, await body({ changes: [{ path: "src/app.ts", kind: "edit", baseRevision: 1, content: "x", reason: "r" }] }));
    expect(r).toMatchObject({ ok: true, value: { status: "blocked", policy: { outcome: "BLOCK" } } });
    expect((calls.create![0] as { violations: unknown[] }).violations).not.toEqual([]);
  });

  it("refuses viewers, stale contracts, stale files, secrets and bad paths", async () => {
    const { store, calls } = fakeStore();
    expect(await submitAgentProposal(store, { ...agent, role: "viewer" }, TASK, await body())).toMatchObject({ ok: false, code: "FORBIDDEN", status: 403 });
    expect(await submitAgentProposal(store, { ...agent, role: null }, TASK, await body())).toMatchObject({ ok: false, code: "UNAUTHENTICATED", status: 401 });
    expect(await submitAgentProposal(store, agent, TASK, await body({ contractVersion: 1 }))).toMatchObject({ ok: false, code: "CONTRACT_CHANGED" });
    expect(await submitAgentProposal(store, agent, TASK, await body({ changes: [{ path: "README.md", kind: "edit", baseRevision: 3, content: "x", reason: "r" }] }))).toMatchObject({ ok: false, code: "FILE_CHANGED" });
    expect(await submitAgentProposal(store, agent, TASK, await body({ changes: [{ path: "README.md", kind: "create", baseRevision: 0, content: "x", reason: "r" }] }))).toMatchObject({ ok: false, code: "FILE_CHANGED" });
    expect(await submitAgentProposal(store, agent, TASK, await body({ changes: [{ path: "docs/k.md", kind: "create", baseRevision: 0, content: "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB", reason: "r" }] }))).toMatchObject({ ok: false, code: "SECRET_IN_CONTENT" });
    expect(await submitAgentProposal(store, agent, TASK, await body({ changes: [{ path: "../x", kind: "create", baseRevision: 0, content: "x", reason: "r" }] }))).toMatchObject({ ok: false, code: "INVALID_PATH" });
    expect(await submitAgentProposal(store, agent, TASK, await body({ changes: [{ path: ".env", kind: "create", baseRevision: 0, content: "A=1", reason: "r" }] }))).toMatchObject({ ok: false, code: "INVALID_PATH" });
    expect(await submitAgentProposal(store, agent, "44444444-4444-4444-8444-444444444444", await body())).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await submitAgentProposal(store, agent, TASK, { changes: "all of them" })).toMatchObject({ ok: false, code: "INVALID_REQUEST", status: 400 });
    expect(calls.create).toBeUndefined();
  });

  it("refuses when the task isn't waiting for a change or the evaluations are used up", async () => {
    const busy = fakeStore({ loadTask: async () => ({ id: TASK, title: "Docs", projectId: PROJECT, state: "APPROVAL_PENDING", version: 5 }) });
    expect(await submitAgentProposal(busy.store, agent, TASK, await body())).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    const spent = fakeStore({ countEvaluations: async () => 2_000 });
    expect(await submitAgentProposal(spent.store, agent, TASK, await body())).toMatchObject({ ok: false, code: "EVALUATION_LIMIT" });
  });
});

describe("file pages", () => {
  it("pages project files by size and count, and follows the cursor", async () => {
    const { store } = fakeStore();
    const first = await agentTaskFiles(store, agent, TASK, null, 2 * 1024 * 1024);
    expect(first).toMatchObject({ ok: true, value: { files: [{ path: "README.md", revision: 4, content: "content of README.md" }], next: "README.md", total: 3 } });
    const second = await agentTaskFiles(store, agent, TASK, "README.md", 2 * 1024 * 1024);
    expect(second).toMatchObject({ ok: true, value: { files: [{ path: "src/app.ts" }, { path: "src/z.ts" }], next: null } });
  });
});

describe("proposal status (ADR 0042)", () => {
  it("tells an agent where its own proposal stands, ProofPack included", async () => {
    const { store } = fakeStore();
    expect(await agentProposal(store, agent, OWN.id)).toEqual({ ok: true, value: OWN });
  });

  it("finds nothing for another agent's proposal, another workspace or an unknown id", async () => {
    const { store } = fakeStore();
    expect(await agentProposal(store, { ...agent, agentId: "agent-2" }, OWN.id)).toMatchObject({ ok: false, status: 404, code: "NOT_FOUND" });
    expect(await agentProposal(store, { ...agent, orgId: "55555555-5555-4555-8555-555555555555" }, OWN.id)).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await agentProposal(store, agent, "proposal-2")).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });

  it("refuses once the person who paired it has left the workspace", async () => {
    const { store } = fakeStore();
    expect(await agentProposal(store, { ...agent, role: null }, OWN.id)).toMatchObject({ ok: false, status: 401, code: "UNAUTHENTICATED" });
  });
});
