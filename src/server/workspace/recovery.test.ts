import { describe, expect, it } from "vitest";
import { trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { ProposedChange } from "@/core/realityloop/change-proposal";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { ProposalDeps, StoredProposal } from "./proposals";
import { previewRecovery, recoverChange, type RecoveryDeps } from "./recovery";
import type { OrgRole, RecoverySource } from "./types";
import type { WriteDeps } from "./use-cases";

const H = (c: string) => c.repeat(64);
const NOW = new Date("2026-10-13T10:00:00Z");
const TRIAL: BillingSnapshot = { state: "trialing", trial: trialWindow(new Date("2026-10-10T00:00:00Z")) };

const SOURCE: RecoverySource = {
  applied: [
    { path: "src/price.ts", kind: "edit", baseRevision: 2, baseSha256: H("1"), appliedRevision: 3, appliedSha256: H("2") },
    { path: "src/vat.ts", kind: "create", baseRevision: 0, baseSha256: null, appliedRevision: 1, appliedSha256: H("3") },
  ],
  current: { "src/price.ts": { revision: 3, sha256: H("2") }, "src/vat.ts": { revision: 1, sha256: H("3") } },
  proofPackDigest: H("f"),
};

function fakeDeps(over: { state?: TaskState; role?: OrgRole; billing?: BillingSnapshot; source?: RecoverySource | null; proposal?: Partial<StoredProposal>; rpcError?: string; earlier?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records the recovery input
  const calls: any[] = [];
  let n = 0;
  const deps: WriteDeps & Pick<ProposalDeps, "loadProposal"> & RecoveryDeps = {
    role: async () => over.role ?? "member",
    billing: async () => over.billing ?? TRIAL,
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t1", projectId: "p1", state: over.state ?? "VERIFYING", version: 9, eventIds: [] }),
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async () => ({ ok: true, value: "t1" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async () => ({ ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    loadProposal: async () => ({
      id: "prop-1",
      taskId: "t1",
      projectId: "p1",
      status: "applied",
      sha256: H("b"),
      changes: [
        { path: "src/price.ts", kind: "edit", baseRevision: 2, content: "x", sha256: H("2"), reason: "" },
        { path: "src/vat.ts", kind: "create", baseRevision: 0, content: "y", sha256: H("3"), reason: "" },
      ] as ProposedChange[],
      policyOutcome: "REQUIRE_APPROVAL",
      contractVersion: 1,
      model: null,
      policy: { outcome: "REQUIRE_APPROVAL", version: H("e"), findings: [] },
      ...over.proposal,
    }),
    recoverySource: async () => (over.source === undefined ? SOURCE : over.source),
    findRecovery: async () => (over.earlier ? { id: "r0", restored: 2, status: "recovered", digest: H("9") } : null),
    recoverChange: async (input) => {
      calls.push(input);
      if (over.rpcError) return { ok: false, error: over.rpcError };
      return { ok: true, value: { id: "r1", restored: input.operations.length, status: input.status, digest: input.receiptDigest, replayed: false } };
    },
    newEventId: () => `e${++n}`,
    now: () => NOW,
  };
  return { deps, calls };
}

async function plan(source = SOURCE) {
  return (await previewRecovery({ taskId: "t1", proposalId: "prop-1", source })).planSha256;
}

const recover = async (deps: Parameters<typeof recoverChange>[0], paths = ["src/price.ts", "src/vat.ts"], planSha256?: string) =>
  recoverChange(deps, { orgId: "o1", userId: "u1", proposalId: "prop-1", planSha256: planSha256 ?? (await plan()), paths });

describe("recoverChange", () => {
  it("undoes every file, stops verification first, and records the plan, policy and receipt", async () => {
    const { deps, calls } = fakeDeps();
    expect(await recover(deps)).toMatchObject({ ok: true, value: { restored: 2, status: "recovered", replayed: false } });
    const input = calls[0];
    expect(input.operations).toEqual([
      { path: "src/price.ts", action: "restore", from_sha256: H("2"), to_sha256: H("1") },
      { path: "src/vat.ts", action: "remove", from_sha256: H("3"), to_sha256: null },
    ]);
    expect(input.steps.map((s: { event_type: string; actor_kind?: string }) => [s.event_type, s.actor_kind ?? "user"])).toEqual([
      ["interrupt", "user"],
      ["plan_recovery", "user"],
      ["recover", "system"],
    ]);
    expect(input.expectedTaskVersion).toBe(9);
    expect(input.policy.outcome).toBe("REQUIRE_APPROVAL");
    expect(input.receipt.predicate).toMatchObject({ status: "recovered", proofPack: H("f"), plan: { sha256: input.planSha256 }, operationSha256: input.operationSha256 });
    expect(input.receipt.predicate.approval).toEqual({ approvedBy: "u1", approvedAt: NOW.toISOString() });
  });

  it("leaves the task in recovery pending when only some files are undone", async () => {
    const { deps, calls } = fakeDeps();
    expect(await recover(deps, ["src/price.ts"])).toMatchObject({ ok: true, value: { status: "partially_recovered" } });
    expect(calls[0].steps.map((s: { event_type: string }) => s.event_type)).toEqual(["interrupt", "plan_recovery"]);
    expect(calls[0].receipt.predicate.left).toEqual([{ path: "src/vat.ts", reason: "not_selected" }]);
  });

  it("refuses a plan that changed since the person reviewed it", async () => {
    const { deps, calls } = fakeDeps({ source: { ...SOURCE, current: { ...SOURCE.current, "src/price.ts": { revision: 4, sha256: H("7") } } } });
    expect(await recover(deps)).toMatchObject({ ok: false, code: "RECOVERY_CHANGED" });
    expect(calls).toEqual([]);
  });

  it("never offers a file that changed after the apply", async () => {
    const changed: RecoverySource = { ...SOURCE, current: { ...SOURCE.current, "src/price.ts": { revision: 4, sha256: H("7") } } };
    const { deps } = fakeDeps({ source: changed });
    expect(await recover(deps, ["src/price.ts"], await plan(changed))).toMatchObject({ ok: false, code: "INVALID_RECOVERY" });
  });

  it("returns the first result for a repeated confirmation", async () => {
    const { deps, calls } = fakeDeps({ earlier: true });
    expect(await recover(deps)).toEqual({ ok: true, value: { id: "r0", restored: 2, status: "recovered", digest: H("9"), replayed: true } });
    expect(calls).toEqual([]);
  });

  it("is part of Plus and up and the trial, not Free", async () => {
    const { deps } = fakeDeps({ billing: { state: "free" } });
    expect(await recover(deps)).toMatchObject({ ok: false, code: "FEATURE_NOT_IN_PLAN", message: expect.stringMatching(/from the Plus plan up/) });
  });

  it("needs a contributor, and an owner or admin when the change was escalated", async () => {
    expect(await recover(fakeDeps({ role: "viewer" }).deps)).toMatchObject({ ok: false, code: "FORBIDDEN" });
    const escalated = { proposal: { policyOutcome: "ESCALATE", policy: { outcome: "ESCALATE", version: H("e"), findings: [] } } };
    expect(await recover(fakeDeps(escalated).deps)).toMatchObject({ ok: false, code: "APPROVER_ROLE_REQUIRED" });
    expect(await recover(fakeDeps({ ...escalated, role: "admin" }).deps)).toMatchObject({ ok: true });
  });

  it("escalates undoing sensitive files", async () => {
    const source: RecoverySource = {
      applied: [{ path: "package.json", kind: "edit", baseRevision: 1, baseSha256: H("1"), appliedRevision: 2, appliedSha256: H("2") }],
      current: { "package.json": { revision: 2, sha256: H("2") } },
      proofPackDigest: null,
    };
    expect(await recover(fakeDeps({ source }).deps, ["package.json"], await plan(source))).toMatchObject({ ok: false, code: "APPROVER_ROLE_REQUIRED" });
    const { deps, calls } = fakeDeps({ source, role: "owner" });
    expect(await recover(deps, ["package.json"], await plan(source))).toMatchObject({ ok: true });
    expect(calls[0].policy.outcome).toBe("ESCALATE");
  });

  it("refuses unapplied changes and closed tasks", async () => {
    expect(await recover(fakeDeps({ proposal: { status: "pending" } }).deps)).toMatchObject({ ok: false, code: "NOT_RECOVERABLE" });
    expect(await recover(fakeDeps({ state: "VERIFIED" }).deps)).toMatchObject({ ok: false, code: "NOT_RECOVERABLE" });
    expect(await recover(fakeDeps({ source: null }).deps)).toMatchObject({ ok: false, code: "NOT_RECOVERABLE" });
  });

  it("from recovery pending, finishes without interrupting again", async () => {
    const { deps, calls } = fakeDeps({ state: "RECOVERY_PENDING" });
    await recover(deps);
    expect(calls[0].steps.map((s: { event_type: string }) => s.event_type)).toEqual(["recover"]);
  });

  it("reports database refusals honestly", async () => {
    expect(await recover(fakeDeps({ rpcError: "FILE_CHANGED" }).deps)).toMatchObject({ ok: false, code: "FILE_CHANGED", message: expect.stringMatching(/changed since you reviewed/) });
    expect(await recover(fakeDeps({ rpcError: "RECOVERY_UNVERIFIED" }).deps)).toMatchObject({ ok: false, code: "RECOVERY_UNVERIFIED" });
  });
});
