import { describe, expect, it, vi } from "vitest";
import { trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { OrgRole } from "./types";
import { EMPTY_CONTRACT_FORM, type ContractFormValues } from "@/core/realityloop/contract-form";
import { approveContract, archiveProject, cancelTask, codeFromDatabaseError, createProject, createTask, saveContract, type WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-14T10:00:00.000Z");

function fakeDeps(over: {
  role?: OrgRole | null;
  billing?: BillingSnapshot | null;
  projects?: number;
  task?: { id: string; projectId?: string; state: TaskState; version: number; eventIds: string[] } | null;
  rpcError?: string;
} = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const deps: WriteDeps = {
    role: async () => (over.role === undefined ? "owner" : over.role),
    billing: async () => (over.billing === undefined ? { state: "free" } : over.billing),
    countActiveProjects: async () => over.projects ?? 0,
    loadTask: async () =>
      over.task === undefined ? { id: "t1", projectId: "p1", state: "RECEIVED", version: 0, eventIds: [] } : over.task && { projectId: "p1", ...over.task },
    createProject: async (input) => (calls.push({ name: "createProject", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: "p1" }),
    createTask: async (input) => (calls.push({ name: "createTask", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: "t1" }),
    applyTransition: async (input) => (calls.push({ name: "applyTransition", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: 1 }),
    saveContract: async (input) => (calls.push({ name: "saveContract", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: input.basedOn + 1 }),
    approveContract: async (input) => (calls.push({ name: "approveContract", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: null }),
    newEventId: (() => {
      let n = 0;
      return () => `evt-${++n}`;
    })(),
    now: () => NOW,
  };
  return { deps, calls };
}

describe("createProject", () => {
  it("creates a project within the plan limit and passes that limit to the database", async () => {
    const { deps, calls } = fakeDeps();
    expect(await createProject(deps, { orgId: "o1", userId: "u1", name: "  Storefront  " })).toEqual({ ok: true, value: "p1" });
    expect(calls).toEqual([{ name: "createProject", input: { orgId: "o1", actor: "u1", name: "Storefront", description: null, limit: 1 } }]);
  });

  it("refuses at the Free plan limit without calling the database", async () => {
    const { deps, calls } = fakeDeps({ projects: 1 });
    expect(await createProject(deps, { orgId: "o1", userId: "u1", name: "Second" })).toMatchObject({ ok: false, code: "QUOTA_EXCEEDED" });
    expect(calls).toEqual([]);
  });

  it("uses trial caps during the trial", async () => {
    const trial: BillingSnapshot = { state: "trialing", trial: trialWindow(new Date("2026-10-13T00:00:00Z")) };
    const { deps, calls } = fakeDeps({ billing: trial, projects: 4 });
    expect(await createProject(deps, { orgId: "o1", userId: "u1", name: "Fifth" })).toMatchObject({ ok: true });
    expect(calls[0]?.input).toMatchObject({ limit: 5 });
    const capped = fakeDeps({ billing: trial, projects: 5 });
    expect(await createProject(capped.deps, { orgId: "o1", userId: "u1", name: "Sixth" })).toMatchObject({ code: "TRIAL_CAP_REACHED" });
  });

  it("fails closed when billing state can't be read", async () => {
    const { deps, calls } = fakeDeps({ billing: null });
    expect(await createProject(deps, { orgId: "o1", userId: "u1", name: "X" })).toMatchObject({ code: "ENTITLEMENT_UNAVAILABLE" });
    expect(calls).toEqual([]);
  });

  it("refuses viewers and non-members", async () => {
    expect(await createProject(fakeDeps({ role: "viewer" }).deps, { orgId: "o1", userId: "u1", name: "X" })).toMatchObject({ code: "FORBIDDEN" });
    expect(await createProject(fakeDeps({ role: null }).deps, { orgId: "o1", userId: "u1", name: "X" })).toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates names and maps database errors", async () => {
    expect(await createProject(fakeDeps().deps, { orgId: "o1", userId: "u1", name: " " })).toMatchObject({ code: "INVALID_NAME" });
    expect(await createProject(fakeDeps({ rpcError: "DUPLICATE_NAME" }).deps, { orgId: "o1", userId: "u1", name: "X" })).toMatchObject({
      code: "DUPLICATE_NAME",
    });
  });
});

describe("createTask", () => {
  it("creates a task for a contributor", async () => {
    const { deps, calls } = fakeDeps();
    expect(await createTask(deps, { orgId: "o1", userId: "u1", projectId: "p1", title: "Fix the bug" })).toEqual({ ok: true, value: "t1" });
    expect(calls[0]).toEqual({ name: "createTask", input: { orgId: "o1", actor: "u1", projectId: "p1", title: "Fix the bug" } });
  });

  it("rejects blank or overlong titles", async () => {
    expect(await createTask(fakeDeps().deps, { orgId: "o1", userId: "u1", projectId: "p1", title: "" })).toMatchObject({ code: "INVALID_TITLE" });
    expect(await createTask(fakeDeps().deps, { orgId: "o1", userId: "u1", projectId: "p1", title: "x".repeat(201) })).toMatchObject({
      code: "INVALID_TITLE",
    });
  });

  it("refuses viewers", async () => {
    expect(await createTask(fakeDeps({ role: "viewer" }).deps, { orgId: "o1", userId: "u1", projectId: "p1", title: "x" })).toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("cancelTask", () => {
  it("applies the transition the state machine decides", async () => {
    const { deps, calls } = fakeDeps({ task: { id: "t1", state: "EXECUTING", version: 7, eventIds: [] } });
    expect(await cancelTask(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedVersion: 7 })).toEqual({ ok: true, value: 1 });
    expect(calls[0]).toEqual({
      name: "applyTransition",
      input: { taskId: "t1", actor: "u1", eventId: "evt-1", eventType: "cancel", from: "EXECUTING", to: "CANCELLED", expectedVersion: 7 },
    });
  });

  it("refuses to cancel a finished task", async () => {
    const { deps, calls } = fakeDeps({ task: { id: "t1", state: "VERIFIED", version: 10, eventIds: [] } });
    expect(await cancelTask(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedVersion: 10 })).toMatchObject({ code: "INVALID_TRANSITION" });
    expect(calls).toEqual([]);
  });

  it("reports a stale page as a version conflict", async () => {
    const { deps } = fakeDeps({ task: { id: "t1", state: "RECEIVED", version: 2, eventIds: [] } });
    expect(await cancelTask(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedVersion: 1 })).toMatchObject({ code: "VERSION_CONFLICT" });
  });

  it("returns not found for tasks outside the workspace", async () => {
    expect(await cancelTask(fakeDeps({ task: null }).deps, { orgId: "o1", userId: "u1", taskId: "t9", expectedVersion: 0 })).toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("codeFromDatabaseError", () => {
  it("recognises the codes raised by the app_* functions", () => {
    expect(codeFromDatabaseError("QUOTA_EXCEEDED")).toBe("QUOTA_EXCEEDED");
    expect(codeFromDatabaseError("VERSION_CONFLICT")).toBe("VERSION_CONFLICT");
    expect(codeFromDatabaseError("connection reset")).toBe("UNKNOWN");
  });

  it("records what really happened when the person can only be told something vague", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      expect(codeFromDatabaseError("upstream request timeout")).toBe("UNKNOWN");
      expect(warn.mock.calls.flat().join("")).toContain("upstream request timeout");
      warn.mockClear();
      expect(codeFromDatabaseError("FILE_CHANGED")).toBe("FILE_CHANGED");
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

const FORM: ContractFormValues = {
  ...EMPTY_CONTRACT_FORM,
  outcome: "Rewrite 100 product descriptions.",
  resources: "products",
  allowed: "products.update",
  protectedFields: "price",
  acceptance: "Descriptions are under 160 characters.",
  recovery: "Restore from the snapshot.",
};

describe("saveContract", () => {
  it("drafts the first contract from Received, through the state machine", async () => {
    const { deps, calls } = fakeDeps();
    expect(await saveContract(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 0, basedOn: 0, form: FORM })).toEqual({ ok: true, value: 1 });
    const input = calls[0]?.input as { steps: { event_type: string; from: string; to: string }[]; body: { version: number; scope: { projectId: string } }; sha256: string };
    expect(input.steps.map((s) => [s.event_type, s.from, s.to])).toEqual([
      ["assemble_context", "RECEIVED", "CONTEXT_ASSEMBLED"],
      ["draft_contract", "CONTEXT_ASSEMBLED", "CONTRACT_DRAFTED"],
    ]);
    expect(input.body.version).toBe(1);
    expect(input.body.scope.projectId).toBe("p1");
    expect(input.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("revises an approved contract back to drafted", async () => {
    const { deps, calls } = fakeDeps({ task: { id: "t1", state: "CONTRACT_APPROVED", version: 3, eventIds: [] } });
    expect(await saveContract(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 3, basedOn: 1, form: FORM })).toEqual({ ok: true, value: 2 });
    const input = calls[0]?.input as { steps: { event_type: string; to: string }[] };
    expect(input.steps).toMatchObject([{ event_type: "revise_contract", to: "CONTRACT_DRAFTED" }]);
  });

  it("refuses once the task is past planning", async () => {
    const { deps, calls } = fakeDeps({ task: { id: "t1", state: "EXECUTING", version: 9, eventIds: [] } });
    expect(await saveContract(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 9, basedOn: 1, form: FORM })).toMatchObject({ code: "INVALID_TRANSITION" });
    expect(calls).toEqual([]);
  });

  it("explains an incomplete contract without calling the database", async () => {
    const { deps, calls } = fakeDeps();
    const result = await saveContract(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 0, basedOn: 0, form: { ...FORM, recovery: "" } });
    expect(result).toMatchObject({ ok: false, code: "INVALID_CONTRACT", message: "Recovery is required." });
    expect(calls).toEqual([]);
  });

  it("rejects a stale page and viewers", async () => {
    expect(await saveContract(fakeDeps().deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 4, basedOn: 0, form: FORM })).toMatchObject({ code: "VERSION_CONFLICT" });
    expect(await saveContract(fakeDeps({ role: "viewer" }).deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 0, basedOn: 0, form: FORM })).toMatchObject({ code: "FORBIDDEN" });
  });

  it("maps a concurrent edit to CONTRACT_CHANGED", async () => {
    const { deps } = fakeDeps({ rpcError: "CONTRACT_CHANGED" });
    expect(await saveContract(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 0, basedOn: 0, form: FORM })).toMatchObject({ code: "CONTRACT_CHANGED" });
  });
});

describe("approveContract", () => {
  const sha = "a".repeat(64);

  it("approves the exact hash from Contract drafted", async () => {
    const { deps, calls } = fakeDeps({ task: { id: "t1", state: "CONTRACT_DRAFTED", version: 2, eventIds: [] } });
    expect(await approveContract(deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 2, version: 1, sha256: sha })).toEqual({ ok: true, value: null });
    expect(calls[0]?.input).toMatchObject({ version: 1, sha256: sha, expectedTaskVersion: 2, steps: [{ event_type: "approve_contract", from: "CONTRACT_DRAFTED", to: "CONTRACT_APPROVED" }] });
  });

  it("refuses when there's no draft to approve or the hash is malformed", async () => {
    expect(await approveContract(fakeDeps().deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 0, version: 1, sha256: sha })).toMatchObject({ code: "INVALID_TRANSITION" });
    expect(await approveContract(fakeDeps().deps, { orgId: "o1", userId: "u1", taskId: "t1", expectedTaskVersion: 0, version: 1, sha256: "nope" })).toEqual({ ok: false, code: "INVALID_REQUEST", message: "Reload the page and try again." });
  });
});

describe("archiveProject", () => {
  const withArchive = (role: OrgRole | null, error?: string) => {
    const { deps } = fakeDeps({ role });
    const calls: unknown[] = [];
    return {
      calls,
      deps: { ...deps, archiveProject: async (input: { projectId: string; actor: string }) => (calls.push(input), error ? { ok: false as const, error } : { ok: true as const, value: null }) },
    };
  };

  it("lets owners and admins archive, passing the project and actor to the database", async () => {
    for (const role of ["owner", "admin"] as const) {
      const { deps, calls } = withArchive(role);
      expect(await archiveProject(deps, { orgId: "o1", userId: "u1", projectId: "p1" })).toEqual({ ok: true, value: null });
      expect(calls).toEqual([{ projectId: "p1", actor: "u1" }]);
    }
  });

  it("refuses members and viewers before calling the database, and maps database errors", async () => {
    for (const role of ["member", "viewer"] as const) {
      const { deps, calls } = withArchive(role);
      expect(await archiveProject(deps, { orgId: "o1", userId: "u1", projectId: "p1" })).toMatchObject({ ok: false, code: "FORBIDDEN", message: expect.stringContaining("owners and admins") });
      expect(calls).toEqual([]);
    }
    expect(await archiveProject(withArchive("owner", "ALREADY_ARCHIVED").deps, { orgId: "o1", userId: "u1", projectId: "p1" })).toMatchObject({ code: "ALREADY_ARCHIVED" });
    expect(await archiveProject(withArchive(null).deps, { orgId: "o1", userId: "u1", projectId: "p1" })).toMatchObject({ code: "NOT_FOUND" });
  });
});
