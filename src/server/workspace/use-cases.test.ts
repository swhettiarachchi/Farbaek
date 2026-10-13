import { describe, expect, it } from "vitest";
import { trialWindow, type BillingSnapshot } from "@/core/billing/trial";
import type { TaskState } from "@/core/realityloop/task-machine";
import type { OrgRole } from "./types";
import { cancelTask, codeFromDatabaseError, createProject, createTask, type WriteDeps } from "./use-cases";

const NOW = new Date("2026-10-14T10:00:00.000Z");

function fakeDeps(over: {
  role?: OrgRole | null;
  billing?: BillingSnapshot | null;
  projects?: number;
  task?: { id: string; state: TaskState; version: number; eventIds: string[] } | null;
  rpcError?: string;
} = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const deps: WriteDeps = {
    role: async () => (over.role === undefined ? "owner" : over.role),
    billing: async () => (over.billing === undefined ? { state: "free" } : over.billing),
    countActiveProjects: async () => over.projects ?? 0,
    loadTask: async () => (over.task === undefined ? { id: "t1", state: "RECEIVED", version: 0, eventIds: [] } : over.task),
    createProject: async (input) => (calls.push({ name: "createProject", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: "p1" }),
    createTask: async (input) => (calls.push({ name: "createTask", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: "t1" }),
    applyTransition: async (input) => (calls.push({ name: "applyTransition", input }), over.rpcError ? { ok: false, error: over.rpcError } : { ok: true, value: 1 }),
    newEventId: () => "evt-1",
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
});
