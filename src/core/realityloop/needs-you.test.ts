import { describe, expect, it } from "vitest";
import { needsYou, sortWaiting, type NeedsYouFacts, type NeedsYouPerson, type WaitingTask } from "./needs-you";

const NOW = new Date("2026-11-05T12:00:00Z");
const OPEN = { status: "pending", createdAt: "2026-11-05T10:00:00Z", expiresAt: "2026-11-08T10:00:00Z", escalated: false };
const task = (id: string, change: WaitingTask["change"] = OPEN): WaitingTask => ({ id, title: `Task ${id}`, change });

const OWNER: NeedsYouPerson = { canAct: true, canApprove: true, canApproveEscalated: true };
const MEMBER: NeedsYouPerson = { canAct: true, canApprove: true, canApproveEscalated: false };
const APPROVE_OFF: NeedsYouPerson = { canAct: true, canApprove: false, canApproveEscalated: false };
const VIEWER: NeedsYouPerson = { canAct: false, canApprove: false, canApproveEscalated: false };

const none: NeedsYouFacts = { questions: [], mine: [], expired: [], others: 0 };
const ONE = [{ id: "t1", title: "Add opening hours" }];
const TWO = [...ONE, { id: "t2", title: "Fix the menu" }];
const ASKING = [{ id: "r1", taskTitle: "Add a map" }];

describe("what each waiting task really needs", () => {
  it("gives an ordinary change to anyone who can approve", () => {
    expect(sortWaiting([task("a")], MEMBER, NOW)).toEqual({ mine: [{ id: "a", title: "Task a" }], expired: [], others: 0 });
  });

  it("leaves a change the rules send to an owner or admin with them, as the task's page and the server do", () => {
    const escalated = task("a", { ...OPEN, escalated: true });
    expect(sortWaiting([escalated], MEMBER, NOW)).toEqual({ mine: [], expired: [], others: 1 });
    expect(sortWaiting([escalated], OWNER, NOW).mine).toHaveLength(1);
  });

  it("isn't the turn of a member with approving turned off, or of a viewer", () => {
    expect(sortWaiting([task("a")], APPROVE_OFF, NOW).others).toBe(1);
    expect(sortWaiting([task("a")], VIEWER, NOW).others).toBe(1);
  });

  it("doesn't ask for a yes or no on a change that ran out of time", () => {
    const late = task("a", { ...OPEN, createdAt: "2026-11-01T10:00:00Z", expiresAt: "2026-11-04T10:00:00Z" });
    expect(sortWaiting([late], MEMBER, NOW)).toEqual({ mine: [], expired: [{ id: "a", title: "Task a" }], others: 0 });
    // Someone who can't discard it is told nothing: there's nothing to decide.
    expect(sortWaiting([late], VIEWER, NOW)).toEqual({ mine: [], expired: [], others: 0 });
  });

  it("says nothing about a task with no open change, because there's nothing to approve", () => {
    expect(sortWaiting([task("a", null)], OWNER, NOW)).toEqual({ mine: [], expired: [], others: 0 });
    expect(sortWaiting([task("a", { ...OPEN, status: "applied" })], OWNER, NOW)).toEqual({ mine: [], expired: [], others: 0 });
  });
});

describe("what Home leads with", () => {
  it("says nothing when nothing is waiting", () => {
    expect(needsYou(none)).toBeNull();
  });

  it("opens the task when one change is waiting, and names it", () => {
    expect(needsYou({ ...none, mine: ONE })).toEqual({
      tone: "action",
      title: "A change is waiting for your yes or no",
      body: "Add opening hours",
      action: { label: "Review it", href: "/app/tasks/t1" },
    });
  });

  it("opens Approvals when several are waiting", () => {
    expect(needsYou({ ...none, mine: TWO })).toMatchObject({
      title: "2 changes are waiting for your yes or no",
      action: { label: "See them", href: "/app/approvals" },
    });
  });

  it("puts the agent's question first, because it has stopped until someone answers", () => {
    const step = needsYou({ ...none, mine: ONE, questions: ASKING });
    expect(step).toMatchObject({ title: "The agent is waiting for you", action: { label: "Answer it", href: "/app/build/r1" } });
    expect(step?.body).toContain('On "Add a map".');
    expect(step?.body).toContain("A change is waiting for your yes or no too.");
  });

  it("opens Build when the agent is asking on several tasks", () => {
    const step = needsYou({ ...none, mine: TWO, questions: [...ASKING, { id: "r2", taskTitle: "Add a form" }] });
    expect(step).toMatchObject({ title: "The agent is waiting for you on 2 tasks", action: { label: "See them", href: "/app/build" } });
    expect(step?.body).toContain("2 changes are waiting for your yes or no too.");
  });

  it("says a change ran out of time only when nothing more pressing needs this person", () => {
    expect(needsYou({ ...none, expired: ONE })).toMatchObject({ title: "A change ran out of time", action: { label: "Open it", href: "/app/tasks/t1" } });
    expect(needsYou({ ...none, expired: TWO })).toMatchObject({ title: "2 changes ran out of time", action: { href: "/app/approvals" } });
    expect(needsYou({ ...none, expired: ONE, mine: ONE })?.title).toBe("A change is waiting for your yes or no");
  });

  it("isn't the turn of someone who can only look, and offers them nothing to press", () => {
    expect(needsYou({ ...none, others: 1 })).toMatchObject({ tone: "idle", title: "A change is waiting for someone else's yes or no", action: null });
    expect(needsYou({ ...none, others: 2 })).toMatchObject({ title: "2 changes are waiting for someone else's yes or no", action: null });
    expect(needsYou({ ...none, others: 2, mine: ONE })?.tone).toBe("action");
  });
});
