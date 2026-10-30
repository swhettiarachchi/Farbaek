import { describe, expect, it } from "vitest";
import { handoffDigest, type HandoffReport } from "@/core/agent/handoff";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import { agentFinishHandoff, agentHandoffs, requestHandoff, type HandoffDetail, type HandoffStore } from "./handoffs";
import type { AgentIdentity } from "./service";

const lease = { capabilities: ["read", "propose", "model", "mesh"], projects: null, actionsPerHour: 600, expiresAt: null } as unknown as AgentIdentity["lease"];
const desk: AgentIdentity = { agentId: "a1", orgId: "o1", userId: "u1", role: "member", name: "Desk", lease };
const DETAIL: HandoffDetail = {
  id: "h1",
  taskId: "t1",
  taskTitle: "Fix the cart",
  projectId: "p1",
  projectName: "Shop",
  note: null,
  checks: ["npm test"],
  proposal: { id: "pr1", sha256: "b".repeat(64) },
  status: "opened",
  createdAt: "2026-10-30T10:00:00.000Z",
  expiresAt: "2026-10-31T10:00:00.000Z",
  change: null,
};
const REPORT: HandoffReport = { checks: [{ command: "npm test", exitCode: 0, durationMs: 900, timedOut: false, outputSha256: null, output: "", skipped: null }], proposalSha256: "b".repeat(64), notCopied: 0, platform: "windows" };
const contract = (requiredChecks: string[]): IntentContract => ({
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "Totals are right.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["src/cart.ts"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: [],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: [],
  openQuestions: [],
  acceptanceCriteria: [],
  approvals: [],
  limits: {},
  requiredChecks,
  recovery: "Restore the previous revision.",
});

/** A labelled fake store: it records what the service asked of the database. */
function fakeStore(over: Partial<HandoffStore> = {}) {
  const asked: unknown[] = [];
  const store: HandoffStore = {
    openFor: async () => [DETAIL, { ...DETAIL, id: "h2", projectId: "p-outside" }],
    detail: async () => DETAIL,
    latestPendingProposal: async () => ({ id: "pr1", projectId: "p1" }),
    request: async (i) => (asked.push(i), { ok: true, value: "h9" }),
    cancel: async () => ({ ok: true, value: null }),
    open: async () => ({ ok: true, value: null }),
    finish: async (i) => (asked.push(i), { ok: true, value: null }),
    ...over,
  };
  return { store, asked };
}

describe("handoffs (ADR 0139)", () => {
  it("lists only handoffs inside the agent's lease", async () => {
    const { store } = fakeStore();
    const r = await agentHandoffs(store, { ...desk, lease: { ...lease, projects: ["p1"] } });
    expect(r.ok && r.value.map((h) => h.id)).toEqual(["h1"]);
  });

  it("works the digest out from the report it received, and refuses a report for another version of the change", async () => {
    const f = fakeStore();
    const r = await agentFinishHandoff(f.store, desk, "h1", { status: "done", report: REPORT });
    expect(r).toEqual({ ok: true, value: { digest: await handoffDigest("h1", REPORT) } });
    expect(f.asked[0]).toMatchObject({ status: "done", digest: await handoffDigest("h1", REPORT), report: REPORT });
    expect(await agentFinishHandoff(fakeStore().store, desk, "h1", { status: "done", report: { ...REPORT, proposalSha256: "c".repeat(64) } })).toMatchObject({ ok: false, code: "INVALID_REQUEST", message: expect.stringMatching(/different version/) });
    expect(await agentFinishHandoff(fakeStore().store, desk, "h1", { status: "done", report: { ...REPORT, checks: [] } })).toMatchObject({ ok: false, code: "INVALID_REQUEST" });
    expect(await agentFinishHandoff(fakeStore().store, { ...desk, role: null }, "h1", { status: "failed", reason: "x" })).toMatchObject({ ok: false, code: "UNAUTHENTICATED" });
  });

  it("hands over the contract's checks with the change waiting, and refuses viewers and tasks with nothing to check", async () => {
    const checks = (required: string[]) => ({
      loadTask: async () => ({ id: "t1", title: "Fix the cart", projectId: "p1", state: "APPROVAL_PENDING" as const, version: 3 }),
      approvedContract: async () => ({ version: 1, sha256: "c".repeat(64), body: contract(required) }),
      projectFiles: async () => [],
      fileContents: async () => new Map<string, string>(),
    });
    const person = { orgId: "o1", userId: "u1", role: "member" as const, permissions: {} };
    const f = fakeStore();
    expect(await requestHandoff({ handoffs: f.store, checks: checks(["npm test", "npm run build"]) }, person, { taskId: "t1", agentId: "a1", note: "  On the real data " })).toEqual({ ok: true, value: { handoffId: "h9" } });
    expect(f.asked[0]).toEqual({ orgId: "o1", actor: "u1", taskId: "t1", agentId: "a1", proposalId: "pr1", checks: ["npm test", "npm run build"], note: "On the real data" });
    expect(await requestHandoff({ handoffs: f.store, checks: checks(["npm test"]) }, { ...person, role: "viewer" }, { taskId: "t1", agentId: "a1", note: null })).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await requestHandoff({ handoffs: f.store, checks: checks([]) }, person, { taskId: "t1", agentId: "a1", note: null })).toMatchObject({ ok: false, message: expect.stringMatching(/nothing for your computer to run/) });
    const open = fakeStore({ request: async () => ({ ok: false, error: "HANDOFF_OPEN" }) });
    expect(await requestHandoff({ handoffs: open.store, checks: checks(["npm test"]) }, person, { taskId: "t1", agentId: "a1", note: null })).toMatchObject({ ok: false, message: "This task is already waiting on that computer." });
  });
});
