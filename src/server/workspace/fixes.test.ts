import { describe, expect, it } from "vitest";
import { INTENT_CONTRACT_SCHEMA, type IntentContract } from "@/core/realityloop/contract";
import type { TaskState } from "@/core/realityloop/task-machine";
import { trialWindow } from "@/core/billing/trial";
import { fixIsOpen, fixNote, fixTitle, startFix, type FixDeps } from "./fixes";
import { fixRetryCap } from "./fix-retry";
import type { ContractRecord, Task, TaskFix } from "./types";
import type { WriteDeps } from "./use-cases";

const CONTRACT: IntentContract = {
  schema: INTENT_CONTRACT_SCHEMA,
  version: 1,
  outcome: "The contact form sends messages to the studio.",
  scope: { organizationId: "o1", projectId: "p1", resources: ["index.html", "contact.js"] },
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: [],
  assumptions: ["The site is static."],
  openQuestions: [],
  acceptanceCriteria: [{ id: "ac-1", statement: "The form validates the email.", verification: "test" }],
  approvals: [],
  limits: {},
  requiredChecks: ["npm test"],
  recovery: "Restore contact.js.",
};

const source: Task = { id: "t-src", title: "Add the contact form", state: "FAILED", version: 7, projectId: "p1", createdAt: "", updatedAt: "" };
const approved: ContractRecord = { version: 2, status: "approved", sha256: "a".repeat(64), body: CONTRACT, createdAt: "", approvedAt: "2026-10-27T10:00:00Z" };

function deps(over: { task?: Task | null; contract?: ContractRecord | null; fix?: TaskFix | null; linkError?: string } = {}) {
  const calls: { name: string; input: unknown }[] = [];
  const write: WriteDeps = {
    role: async () => "member",
    billing: async () => ({ state: "free" }),
    countActiveProjects: async () => 0,
    loadTask: async () => ({ id: "t-fix", projectId: "p1", state: "RECEIVED", version: 0, eventIds: [] }),
    createProject: async () => ({ ok: true, value: "p1" }),
    createTask: async (input) => (calls.push({ name: "createTask", input }), { ok: true, value: "t-fix" }),
    applyTransition: async () => ({ ok: true, value: 1 }),
    saveContract: async (input) => (calls.push({ name: "saveContract", input }), { ok: true, value: 1 }),
    approveContract: async () => ({ ok: true, value: null }),
    newEventId: () => "evt",
    now: () => new Date("2026-10-28T00:00:00Z"),
  };
  const d: FixDeps = {
    write,
    task: async () => (over.task === undefined ? source : over.task),
    contract: async () => (over.contract === undefined ? approved : over.contract),
    failedChecks: async () => ["npm test", "Site check"],
    fixFor: async () => over.fix ?? null,
    link: async (input) => (calls.push({ name: "link", input }), over.linkError ? { ok: false, error: over.linkError } : { ok: true, value: null }),
  };
  return { d, calls };
}

const member = { orgId: "o1", userId: "u1", role: "member" as const, permissions: {} };

describe("startFix (mock tasks)", () => {
  it("creates a linked task whose contract is the approved one plus what failed", async () => {
    const { d, calls } = deps();
    expect(await startFix(d, member, "t-src")).toEqual({ ok: true, value: { taskId: "t-fix" } });
    expect(calls.map((c) => c.name)).toEqual(["createTask", "link", "saveContract"]);
    expect(calls[0]!.input).toMatchObject({ projectId: "p1", title: "Fix: Add the contact form" });
    expect(calls[1]!.input).toEqual({ orgId: "o1", actor: "u1", taskId: "t-fix", sourceId: "t-src" });
    const body = (calls[2]!.input as { body: IntentContract }).body;
    expect(body.outcome).toBe(CONTRACT.outcome);
    expect(body.requiredChecks).toEqual(["npm test"]);
    expect(body.assumptions).toEqual(["The site is static.", 'The last attempt at "Add the contact form" didn\'t pass these checks: npm test, Site check. Run them, fix what they found, and keep everything else the same.']);
  });

  it("refuses viewers, withheld agent runs, tasks whose checks didn't fail, and unapproved contracts", async () => {
    expect(await startFix(deps().d, { ...member, role: "viewer" }, "t-src")).toMatchObject({ ok: false, code: "FORBIDDEN" });
    expect(await startFix(deps().d, { ...member, permissions: { run_agents: false } }, "t-src")).toMatchObject({ ok: false });
    for (const state of ["VERIFIED", "EXECUTING", "CONTRACT_APPROVED"] as TaskState[]) {
      expect(await startFix(deps({ task: { ...source, state } }).d, member, "t-src")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
    }
    expect(await startFix(deps({ task: null }).d, member, "t-src")).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(await startFix(deps({ contract: { ...approved, status: "draft", approvedAt: null } }).d, member, "t-src")).toMatchObject({ ok: false, code: "INVALID_TRANSITION" });
  });

  it("allows one open fix at a time, and another once the last one ended", async () => {
    const open = deps({ fix: { id: "t-old", title: "Fix: Add the contact form", state: "EXECUTING" } });
    expect(await startFix(open.d, member, "t-src")).toMatchObject({ ok: false, message: "A fix is already open: Fix: Add the contact form" });
    expect(open.calls).toEqual([]);
    expect((await startFix(deps({ fix: { id: "t-old", title: "x", state: "FAILED" } }).d, member, "t-src")).ok).toBe(true);
    expect(fixIsOpen({ id: "x", title: "x", state: "CONTRACT_DRAFTED" })).toBe(true);
    expect(fixIsOpen({ id: "x", title: "x", state: "VERIFIED" })).toBe(false);
    expect(fixIsOpen(null)).toBe(false);
  });

  it("keeps titles and notes within the contract's limits", () => {
    expect(fixTitle("x".repeat(250))).toHaveLength(200);
    expect(fixNote("A task", [])).toBe('The last attempt at "A task" didn\'t pass its checks. Run them, fix what they found, and keep everything else the same.');
    expect(fixNote("A task", ["a", "b", "c", "d", "e", "f", "g"])).toContain("a, b, c, d, e and 2 more");
    expect(fixNote("y".repeat(500), ["z".repeat(500)]).length).toBeLessThanOrEqual(300);
  });
});

describe("fixRetryCap", () => {
  const now = new Date("2026-10-28T00:00:00Z");
  it("is nothing on Free, Starter's reserve on the trial, and the plan's reserve on a paid plan", () => {
    expect(fixRetryCap({ state: "free" }, now)).toBe(0);
    expect(fixRetryCap({ state: "trialing", trial: trialWindow(new Date("2026-10-20T00:00:00Z")) }, now)).toBeGreaterThan(0);
    const pro = fixRetryCap({ state: "active", paidPlanId: "pro" }, now);
    const starter = fixRetryCap({ state: "active", paidPlanId: "starter" }, now);
    expect(pro).toBeGreaterThan(starter);
    expect(fixRetryCap(null, now)).toBe(0);
  });
});
