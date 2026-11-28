import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkflowView } from "@/core/realityloop/workflow";

const mocks = vi.hoisted(() => ({ loadInbox: vi.fn(), loadScheduledWork: vi.fn(), loadUsageSummary: vi.fn(), waitingChanges: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/server/cloud-agent/inbox", () => ({ loadInbox: mocks.loadInbox }));
vi.mock("@/server/automation/work", () => ({ loadScheduledWork: mocks.loadScheduledWork }));
vi.mock("@/server/workspace/usage-summary", () => ({ loadUsageSummary: mocks.loadUsageSummary }));
vi.mock("@/server/workspace/waiting-changes", () => ({ waitingChanges: mocks.waitingChanges }));

import { RESUME_MANAGERS_ONLY } from "@/server/workspace/incidents";
import { loadWork, pauseReasons, type WorkContext } from "./load-work";

const NOW = new Date("2026-11-27T10:00:00Z");
const flow = (id: string, projectId: string, status: WorkflowView["status"]): WorkflowView => ({
  id,
  projectId,
  title: `Flow ${id}`,
  status,
  waitingReason: status === "waiting" ? "checkpoint" : null,
  haltedReason: null,
  ceilingUnits: 1000,
  approvedBy: null,
  approvedAt: null,
  approvedSha256: null,
  createdAt: "2026-11-27T09:00:00Z",
  steps: [],
});
const context = (more: { mode?: "live" | "demo"; role?: string | null; writes?: boolean; flows?: WorkflowView[] | Error } = {}) => {
  const listWorkflows = vi.fn(async () => {
    if (more.flows instanceof Error) throw more.flows;
    return more.flows ?? [];
  });
  return {
    mode: more.mode ?? "live",
    user: { id: "u1", email: "ada@example.com" },
    reader: { listWorkflows },
    workspaces: [],
    current: { id: "org1", agentsPaused: null },
    role: more.role === undefined ? "member" : more.role,
    permissions: {},
    writes: more.writes === false ? { enabled: false, reason: "Changes are off." } : { enabled: true },
  } as unknown as WorkContext;
};

describe("the reads behind All work and the assistant's answer (stage 290, ADR 0298)", () => {
  beforeEach(() => {
    for (const m of Object.values(mocks)) m.mockReset();
    mocks.loadInbox.mockResolvedValue({ runs: [], proposals: new Map() });
    mocks.loadScheduledWork.mockResolvedValue({ tasks: [], runs: [] });
    mocks.loadUsageSummary.mockResolvedValue({ tasks: [], projects: [{ id: "p1", archivedAt: null }, { id: "p2", archivedAt: "2026-11-01T00:00:00Z" }] });
    mocks.waitingChanges.mockResolvedValue({ mine: [{ id: "t1", title: "Add opening hours" }], expired: [], others: 1 });
  });

  it("lists a change as this person's turn when they contribute and changes are on", async () => {
    const work = await loadWork(context({ role: "member" }), NOW);
    expect(work).toMatchObject({ canAct: true, contributor: true, manager: false, tour: false, live: true });
    expect(work.board.needsYou.map((i) => i.id)).toEqual(["change:t1"]);
    expect(work.board.others).toBe(1);
    expect(work.unread).toEqual({ builds: false, workflows: false, tasks: false, runs: false, any: false });
  });

  it("says nothing is waiting for a viewer, or for anyone while changes are off: their changes are counted as someone's", async () => {
    for (const ctx of [context({ role: "viewer" }), context({ role: "owner", writes: false }), context({ role: null })]) {
      const work = await loadWork(ctx, NOW);
      expect(work.canAct).toBe(false);
      expect(work.board.needsYou).toEqual([]);
      expect(work.board.others).toBe(2);
    }
  });

  it("knows an owner or admin, who may approve a workflow and resume agents", async () => {
    const draft = flow("w1", "p1", "draft");
    draft.steps = [{ position: 1, stage: 1, title: "One", notes: "", checkpoint: false, taskId: "t9", runId: null, status: "pending", detail: null, contract: { status: "approved", sha256: "x", version: 1 }, startedAt: null, finishedAt: null }];
    const asOwner = await loadWork(context({ role: "owner", flows: [draft] }), NOW);
    expect(asOwner.manager).toBe(true);
    expect(asOwner.board.needsYou.map((i) => i.id)).toContain("workflow:w1");
    const asMember = await loadWork(context({ role: "member", flows: [draft] }), NOW);
    expect(asMember.manager).toBe(false);
    expect(asMember.board.needsYou.map((i) => i.id)).not.toContain("workflow:w1");
  });

  it("leaves out work in an archived project", async () => {
    const work = await loadWork(context({ role: "owner", flows: [flow("live", "p1", "waiting"), flow("old", "p2", "waiting")] }), NOW);
    const ids = [...work.board.needsYou, ...work.board.working, ...work.board.scheduled, ...work.board.finished].map((i) => i.id);
    expect(ids).toContain("workflow:live");
    expect(ids).not.toContain("workflow:old");
  });

  it("says which part couldn't be read, and never sums up a list it knows is short", async () => {
    mocks.loadInbox.mockResolvedValue(null);
    expect((await loadWork(context(), NOW)).unread).toEqual({ builds: true, workflows: false, tasks: false, runs: false, any: true });

    mocks.loadInbox.mockResolvedValue({ runs: [], proposals: new Map() });
    expect((await loadWork(context({ flows: new Error("down") }), NOW)).unread).toMatchObject({ workflows: true, any: true });

    mocks.loadScheduledWork.mockResolvedValue({ tasks: null, runs: null });
    expect((await loadWork(context(), NOW)).unread).toMatchObject({ tasks: true, runs: true, any: true });

    // Runs alone leave the lists whole but for "just finished", which says so itself.
    mocks.loadScheduledWork.mockResolvedValue({ tasks: [], runs: null });
    expect((await loadWork(context(), NOW)).unread).toEqual({ builds: false, workflows: false, tasks: false, runs: true, any: false });
  });

  it("reads no agent builds for the demo workspace, whose sample work anyone may look at", async () => {
    const work = await loadWork(context({ mode: "demo", role: "owner", writes: false }), NOW);
    expect(mocks.loadInbox).not.toHaveBeenCalled();
    expect(work).toMatchObject({ tour: true, live: false, canAct: true });
    expect(work.unread.builds).toBe(false);
    expect(work.board.needsYou.map((i) => i.id)).toEqual(["change:t1"]);
  });

  it("asks about the workspace the person is in, as them, and at one moment", async () => {
    const ctx = context();
    await loadWork(ctx, NOW);
    expect(mocks.loadInbox).toHaveBeenCalledWith("org1", expect.any(Number));
    expect(mocks.loadScheduledWork).toHaveBeenCalledWith("live", "org1", expect.any(Number));
    expect(mocks.waitingChanges.mock.calls[0]![1]).toMatchObject({ orgId: "org1", role: "member", tour: false });
    expect(mocks.waitingChanges.mock.calls[0]![2]).toBe(NOW);
  });

  it("says why this person can't pause or can't resume, in the control's own words", () => {
    const readOnly = "The demo workspace is read-only.";
    expect(pauseReasons({ tour: true, manager: true, contributor: true })).toEqual({ pauseReason: readOnly, resumeReason: readOnly });
    expect(pauseReasons({ tour: false, manager: false, contributor: false })).toEqual({ pauseReason: "Viewers can't pause agents. Ask someone who contributes to this workspace.", resumeReason: RESUME_MANAGERS_ONLY });
    expect(pauseReasons({ tour: false, manager: false, contributor: true })).toEqual({ pauseReason: null, resumeReason: RESUME_MANAGERS_ONLY });
    expect(pauseReasons({ tour: false, manager: true, contributor: true })).toEqual({ pauseReason: null, resumeReason: null });
  });
});
