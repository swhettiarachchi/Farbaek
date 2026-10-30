import { describe, expect, it } from "vitest";
import type { BillingSnapshot } from "@/core/billing/trial";
import { workflowHash, type WorkflowView } from "@/core/realityloop/workflow";
import type { OrgRole } from "@/server/workspace/types";
import { WORKFLOWS_NOT_IN_PLAN, approveWorkflow, createWorkflow, type WorkflowWriteDeps } from "./use-cases";

const MAX_3X: BillingSnapshot = { state: "active", paidPlanId: "max_3x" };
const view = (over: Partial<WorkflowView> = {}): WorkflowView => ({
  id: "w1",
  projectId: "p1",
  title: "Checkout",
  status: "draft",
  waitingReason: null,
  haltedReason: null,
  ceilingUnits: 30_000,
  approvedBy: null,
  approvedAt: null,
  approvedSha256: null,
  createdAt: "2026-10-26T00:00:00Z",
  steps: [1, 2].map((p) => ({ position: p, stage: p, title: `Step ${p}`, notes: "", checkpoint: false, taskId: `t${p}`, runId: null, status: "pending" as const, detail: null, contract: { status: "approved", sha256: String(p).repeat(64), version: 1 }, startedAt: null, finishedAt: null })),
  ...over,
});

function fakes(over: { role?: OrgRole; billing?: BillingSnapshot; view?: WorkflowView | null } = {}) {
  const calls: unknown[] = [];
  const deps: WorkflowWriteDeps = {
    role: async () => over.role ?? "owner",
    billing: async () => over.billing ?? MAX_3X,
    now: () => new Date("2026-10-26T10:00:00Z"),
    read: async () => (over.view === undefined ? view() : over.view),
    create: async (i) => {
      calls.push(i);
      return { ok: true, value: "w-new" };
    },
    approve: async (i) => {
      calls.push(i);
      return { ok: true, value: null };
    },
    continue: async () => ({ ok: true, value: null }),
    cancel: async () => ({ ok: true, value: null }),
  };
  return { deps, calls };
}

const draft = { title: "Checkout", steps: [{ title: "Cart model" }, { title: "Checkout page", checkpoint: true }], ceilingUnits: 30_000 };

describe("workflow use cases", () => {
  it("creates a workflow on a plan that includes it, from a valid draft", async () => {
    const f = fakes({ role: "member" });
    expect(await createWorkflow(f.deps, { orgId: "o1", userId: "u1", projectId: "p1", draft })).toEqual({ ok: true, value: "w-new" });
    expect(f.calls[0]).toMatchObject({ title: "Checkout", ceilingUnits: 30_000, steps: [{ title: "Cart model", checkpoint: false, notes: "" }, { title: "Checkout page", checkpoint: true }] });
    expect(await createWorkflow(fakes({ billing: { state: "free" } }).deps, { orgId: "o1", userId: "u1", projectId: "p1", draft })).toMatchObject({ code: "FEATURE_NOT_IN_PLAN", message: WORKFLOWS_NOT_IN_PLAN });
    expect(await createWorkflow(fakes({ role: "viewer" }).deps, { orgId: "o1", userId: "u1", projectId: "p1", draft })).toMatchObject({ code: "FORBIDDEN" });
    expect(await createWorkflow(fakes().deps, { orgId: "o1", userId: "u1", projectId: "p1", draft: { ...draft, steps: [{ title: "Only one" }] } })).toMatchObject({ code: "INVALID_WORKFLOW", message: "A workflow has at least 2 steps." });
  });

  it("approves only for an owner or admin, with every contract approved, bound by the workflow's hash", async () => {
    const f = fakes();
    expect(await approveWorkflow(f.deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ ok: true });
    expect(f.calls[0]).toEqual({ workflowId: "w1", actor: "u1", sha256: await workflowHash(view()) });
    expect(await approveWorkflow(fakes({ role: "member" }).deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ code: "FORBIDDEN" });
    const missing = view({ steps: view().steps.map((s, i) => (i === 1 ? { ...s, contract: { status: "draft", sha256: "9".repeat(64), version: 1 } } : s)) });
    expect(await approveWorkflow(fakes({ view: missing }).deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ code: "CONTRACTS_NOT_APPROVED", message: "Approve the contract for step 2 first." });
    expect(await approveWorkflow(fakes({ view: view({ status: "running" }) }).deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ code: "WORKFLOW_CLOSED" });
    expect(await approveWorkflow(fakes({ view: null }).deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ code: "NOT_FOUND" });
  });
  it("refuses a team whose agents could change the same files, and approves one with separate files (ADR 0128)", async () => {
    const team = (a: string[], b: string[]) =>
      view({ steps: view().steps.map((s, i) => ({ ...s, stage: 1, contract: { status: "approved", sha256: String(i + 1).repeat(64), version: 1, paths: i === 0 ? a : b } })) });
    expect(await approveWorkflow(fakes({ view: team(["src"], ["src/checkout"]) }).deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({
      code: "INVALID_WORKFLOW",
      message: "Steps 1 and 2 run at the same time, but both could change src. Give their contracts separate files, or run one after the other.",
    });
    expect(await approveWorkflow(fakes({ view: team([], ["src/x"]) }).deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ message: expect.stringMatching(/anything in the project/) });
    const f = fakes({ view: team(["src/cart"], ["src/checkout"]) });
    expect(await approveWorkflow(f.deps, { orgId: "o1", userId: "u1", workflowId: "w1" })).toMatchObject({ ok: true });
    expect(f.calls).toHaveLength(1);
  });
});
