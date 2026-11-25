import { describe, expect, it } from "vitest";
import type { HomeRun, HomeTask } from "../automation/home";
import type { Schedule } from "../automation/schedule";
import { BY_FARBAEK } from "../automation/tasks";
import { FINISHED_SHOWN, boardSentence, buildBoard, type BoardFacts, type BoardRun, type BoardWorkflow } from "./board";

const NOW = new Date("2026-11-25T12:00:00Z");
const DAILY: Schedule = { repeat: { kind: "daily", time: "08:00" }, timeZone: "UTC", end: { kind: "never" } };
const run = (id: string, more: Partial<BoardRun> = {}): BoardRun => ({ id, taskId: `task-${id}`, taskTitle: `Build ${id}`, projectName: "Storefront", status: "working", steps: 3, outcome: null, finish: null, changeState: null, startedAt: "2026-11-25T11:00:00Z", endedAt: null, ...more });
const task = (id: string, more: Partial<HomeTask> = {}): HomeTask => ({ id, title: `Task ${id}`, state: "active", stateReason: null, schedule: DAILY, nextRunAt: "2026-11-26T08:00:00Z", lastRunAt: null, conversationId: null, ...more });
const ended = (taskId: string, at: string, status: HomeRun["status"], more: Partial<HomeRun> = {}): HomeRun => ({ taskId, dueAt: at, status, conversationId: null, finishedAt: at, ...more });
const flow = (id: string, status: BoardWorkflow["status"], more: Partial<BoardWorkflow> = {}): BoardWorkflow => ({ id, title: `Flow ${id}`, status, waitingReason: status === "waiting" ? "checkpoint" : null, next: `Next for ${id}.`, stepRunIds: [], waitingTaskIds: [], ...more });
const facts = (more: Partial<BoardFacts> = {}): BoardFacts => ({ lanes: { needs_you: [], working: [], review: [], done: [] }, changes: { mine: [], expired: [], others: 0 }, scheduled: { tasks: [], runs: [] }, workflows: [], now: NOW, ...more });
const ids = (items: { id: string }[]) => items.map((i) => i.id);

describe("all work, sorted by what it needs", () => {
  it("is empty when nothing is going on", () => {
    expect(buildBoard(facts())).toEqual({ needsYou: [], working: [], scheduled: [], finished: [], others: 0 });
  });

  it("puts what needs the person in one list: a question first, then changes, a stopped change, workflows, paused work, and last what only ran out of time", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [run("q", { status: "waiting" })], working: [], review: [run("r", { status: "finished", changeState: "blocked", endedAt: "2026-11-25T11:30:00Z" })], done: [] },
        changes: { mine: [{ id: "t1", title: "Add opening hours" }], expired: [{ id: "t2", title: "Fix the menu" }], others: 2 },
        workflows: [flow("w", "waiting"), flow("h", "halted"), flow("d", "draft")],
        scheduled: { tasks: [task("s", { state: "paused", stateReason: `${BY_FARBAEK}its last 5 runs didn't finish.`, nextRunAt: null, lastRunAt: "2026-11-25T08:00:00Z" })], runs: [] },
      }),
    );
    expect(ids(board.needsYou)).toEqual(["build:q", "change:t1", "build:r", "workflow:w", "workflow:h", "task:s", "change:t2"]);
    expect(board.needsYou[0]).toMatchObject({ kind: "build", title: "Build q", line: "Storefront. Waiting for you to approve a command before it carries on.", status: "approval", label: "Waiting for you", href: "/app/build/q", action: "Answer" });
    expect(board.needsYou[1]).toMatchObject({ kind: "change", status: "approval", href: "/app/tasks/t1", action: "Review" });
    expect(board.needsYou[2]).toMatchObject({ status: "attention", label: "Stopped by a check", action: "Open", at: "2026-11-25T11:30:00Z", when: "past" });
    expect(board.needsYou[3]).toMatchObject({ kind: "workflow", line: "Next for w.", status: "approval", href: "/app/workflows/w" });
    expect(board.needsYou[4]).toMatchObject({ status: "attention", label: "Stopped" });
    expect(board.needsYou[5]).toMatchObject({ kind: "task", line: "Its last 5 runs didn't finish.", status: "attention", label: "Paused by Farbaek", href: "/app/scheduled" });
    expect(board.needsYou[6]).toMatchObject({ status: "attention", label: "Ran out of time", action: "Open" });
    // Someone else's decisions are counted, not listed; a draft workflow is nobody's turn yet.
    expect(board.others).toBe(2);
  });

  it("lists a change waiting for the person once: as the change, not also as the run that made it or the workflow whose step it is", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [], working: [], review: [run("a", { taskId: "t1", status: "finished", changeState: "pending" }), run("b", { taskId: "t9", status: "finished", changeState: "blocked" })], done: [] },
        changes: { mine: [{ id: "t1", title: "Add opening hours" }], expired: [], others: 0 },
        workflows: [flow("w", "waiting", { waitingReason: "review", waitingTaskIds: ["t1"] })],
      }),
    );
    expect(ids(board.needsYou)).toEqual(["change:t1", "build:b"]);
    expect(board.working).toEqual([]);
    // A change the plan's checks stopped is a warning, not a turn to approve.
    expect(board.needsYou[1]).toMatchObject({ status: "attention", label: "Stopped by a check" });
  });

  it("doesn't call a change that is someone else's to decide this person's turn: it is counted, and its workflow waits on someone else", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [], working: [], review: [run("a", { taskId: "t1", status: "finished", changeState: "pending" })], done: [] },
        changes: { mine: [], expired: [], others: 1 },
        workflows: [flow("w", "waiting", { waitingReason: "review", waitingTaskIds: ["t1"] })],
      }),
    );
    expect(board.needsYou).toEqual([]);
    expect(board.others).toBe(1);
    expect(board.working).toEqual([expect.objectContaining({ id: "workflow:w", status: "pending", label: "Waiting for someone else" })]);
  });

  it("says a build a running workflow started once, as the workflow; a question from one of its steps still asks", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [run("ask", { status: "waiting" })], working: [run("step"), run("solo")], review: [], done: [] },
        workflows: [flow("w", "running", { stepRunIds: ["step", "ask"] })],
      }),
    );
    expect(ids(board.working)).toEqual(["build:solo", "workflow:w"]);
    expect(ids(board.needsYou)).toEqual(["build:ask"]);
  });

  it("lists a change that ran out of time once, not also as the run whose change the checks stopped", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [], working: [], review: [run("x", { taskId: "t2", status: "finished", changeState: "blocked" }), run("y", { taskId: "t3", status: "finished", changeState: "pending" })], done: [] },
        changes: { mine: [], expired: [{ id: "t2", title: "Fix the menu" }, { id: "t3", title: "Add a map" }], others: 0 },
      }),
    );
    expect(ids(board.needsYou)).toEqual(["change:t2", "change:t3"]);
    expect(board.working).toEqual([]);
  });

  it("leads with work Farbaek paused only while the pause is new, then lists it with the scheduled work", () => {
    const paused = (id: string, at: string) => task(id, { state: "paused", stateReason: `${BY_FARBAEK}your plan runs a task once a day at most.`, nextRunAt: null, lastRunAt: at });
    const board = buildBoard(facts({ scheduled: { tasks: [paused("new", "2026-11-24T08:00:00Z"), paused("old", "2026-11-01T08:00:00Z")], runs: [] } }));
    expect(ids(board.needsYou)).toEqual(["task:new"]);
    expect(board.scheduled).toEqual([expect.objectContaining({ id: "task:old", status: "attention", label: "Paused by Farbaek" })]);
  });

  it("asks an owner or admin to approve a draft whose plans are all approved, and nobody else", () => {
    const ready = flow("d", "draft", { readyToApprove: true });
    const notYet = flow("n", "draft");
    expect(ids(buildBoard(facts({ workflows: [ready, notYet], canApproveWorkflows: true })).needsYou)).toEqual(["workflow:d"]);
    expect(buildBoard(facts({ workflows: [ready, notYet], canApproveWorkflows: true })).needsYou[0]).toMatchObject({ status: "approval", label: "Ready to approve", line: "Next for d." });
    expect(buildBoard(facts({ workflows: [ready] })).needsYou).toEqual([]);
    expect(buildBoard(facts({ workflows: [ready], canApproveWorkflows: true, canAct: false })).needsYou).toEqual([]);
  });

  it("puts a finished thing whose time can't be read last", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [], working: [], review: [], done: [run("odd", { status: "finished", endedAt: "soon", startedAt: "also not a time" }), run("ok", { status: "finished", endedAt: "2026-11-25T10:00:00Z" })] },
        scheduled: { tasks: [task("t")], runs: [ended("t", "2026-11-20T09:00:00Z", "done")] },
      }),
    );
    expect(ids(board.finished).map((id) => id.split(":").slice(0, 2).join(":"))).toEqual(["build:ok", "task:t", "build:odd"]);
  });

  it("says nothing is waiting for someone who can't act here: what would need them is listed where it stands", () => {
    const board = buildBoard(
      facts({
        canAct: false,
        lanes: { needs_you: [], working: [], review: [run("b", { status: "finished", changeState: "blocked" })], done: [] },
        workflows: [flow("c", "waiting"), flow("h", "halted")],
        scheduled: { tasks: [task("s", { state: "paused", stateReason: `${BY_FARBAEK}your plan runs a task once a day at most.`, nextRunAt: null })], runs: [] },
      }),
    );
    expect(board.needsYou).toEqual([]);
    expect(board.working.map((i) => [i.id, i.label])).toEqual([
      ["workflow:c", "Waiting for someone else"],
      ["workflow:h", "Stopped"],
      ["build:b", "Stopped by a check"],
    ]);
    expect(board.scheduled).toEqual([expect.objectContaining({ id: "task:s", status: "attention", label: "Paused by Farbaek" })]);
    expect(boardSentence(board)).toBe("Nothing needs you. 3 things are in progress, and one is scheduled.");
  });

  it("lists what is in progress: builds under way, running workflows, and scheduled work that is running or due", () => {
    const board = buildBoard(
      facts({
        lanes: { needs_you: [], working: [run("w"), run("s", { status: "starting", steps: 0 })], review: [], done: [] },
        workflows: [flow("r", "running"), flow("a", "approved"), flow("f", "finished"), flow("c", "cancelled")],
        scheduled: {
          tasks: [task("now", { nextRunAt: "2026-11-25T11:58:00Z" }), task("due", { nextRunAt: "2026-11-25T11:59:00Z", agent: true }), task("later")],
          runs: [ended("now", "2026-11-25T11:58:00Z", "running", { finishedAt: null })],
        },
      }),
    );
    expect(ids(board.working)).toEqual(["build:w", "build:s", "workflow:r", "workflow:a", "task:now", "agent:due"]);
    expect(board.working[0]).toMatchObject({ status: "working", label: "Working", action: "Watch", line: "Storefront. Working, step 3." });
    expect(board.working[1]).toMatchObject({ label: "Starting", line: "Storefront. Getting ready." });
    expect(board.working[4]).toMatchObject({ status: "working", label: "Running now", href: "/app/scheduled" });
    expect(board.working[5]).toMatchObject({ kind: "agent", status: "pending", label: "Due now", href: "/app/scheduled/agents" });
    expect(ids(board.scheduled)).toEqual(["task:later"]);
  });

  it("says a build stopped on a question for someone else is waiting on them, among what is in progress", () => {
    const board = buildBoard(facts({ waitingOnOthers: [run("o", { status: "waiting" })] }));
    expect(board.needsYou).toEqual([]);
    expect(board.working).toEqual([expect.objectContaining({ id: "build:o", status: "pending", label: "Waiting for someone else", line: "Storefront. Waiting for whoever started it, or an owner or admin, to approve a command.", action: "Open" })]);
  });

  it("lists what is scheduled, soonest first, with its next time, then what the person paused", () => {
    const board = buildBoard(
      facts({
        scheduled: {
          tasks: [task("late", { nextRunAt: "2026-11-27T08:00:00Z" }), task("soon", { agent: true }), task("held", { state: "paused", nextRunAt: null }), task("over", { state: "ended", nextRunAt: null }), task("timeless", { nextRunAt: null })],
          runs: [],
        },
      }),
    );
    expect(ids(board.scheduled)).toEqual(["agent:soon", "task:late", "task:timeless", "task:held"]);
    expect(board.scheduled[0]).toMatchObject({ status: "pending", label: "Scheduled", line: "Every day at 8:00 AM, UTC.", at: "2026-11-26T08:00:00Z", when: "next", href: "/app/scheduled/agents" });
    expect(board.scheduled[2]).toMatchObject({ at: null, when: null });
    expect(board.scheduled[3]).toMatchObject({ status: "paused", label: "Paused" });
  });

  it("lists the latest that finished, builds and scheduled runs together, newest first, each as it ended", () => {
    const board = buildBoard(
      facts({
        lanes: {
          needs_you: [],
          working: [],
          review: [],
          done: [run("ok", { status: "finished", changeState: "applied", finish: { summary: "Added opening hours. And more." }, endedAt: "2026-11-25T10:00:00Z" }), run("bad", { status: "failed", outcome: "The build broke.", endedAt: "2026-11-25T08:00:00Z" }), run("cut", { status: "interrupted", endedAt: null, startedAt: "2026-11-24T08:00:00Z" })],
        },
        scheduled: {
          tasks: [task("t", { conversationId: "chat-1" }), task("a", { agent: true })],
          runs: [
            ended("t", "2026-11-25T09:00:00Z", "done", { conversationId: "chat-1" }),
            ended("t", "2026-11-24T09:00:00Z", "skipped", { detail: "This month's AI usage is used up." }),
            ended("a", "2026-11-25T07:00:00Z", "failed"),
            ended("gone", "2026-11-25T11:00:00Z", "done"),
          ],
        },
      }),
    );
    expect(board.finished.map((i) => [i.kind, i.label, i.at])).toEqual([
      ["build", "Finished", "2026-11-25T10:00:00Z"],
      ["task", "Ran", "2026-11-25T09:00:00Z"],
      ["build", "Stopped", "2026-11-25T08:00:00Z"],
      ["agent", "Didn't finish", "2026-11-25T07:00:00Z"],
      ["task", "Skipped", "2026-11-24T09:00:00Z"],
      ["build", "Interrupted", "2026-11-24T08:00:00Z"],
    ]);
    expect(board.finished[0]).toMatchObject({ status: "done", line: "Storefront. Added opening hours.", action: "Open" });
    // A scheduled run that finished opens its answer; one that didn't opens the page that lists it.
    expect(board.finished[1]).toMatchObject({ href: "/app/chat/chat-1", action: "Read the answer", line: "A scheduled run." });
    expect(board.finished[3]).toMatchObject({ status: "failed", href: "/app/scheduled/agents", action: "See it", line: "An agent's run." });
    // A run that said why it didn't finish says so here.
    expect(board.finished[4]).toMatchObject({ status: "off", line: "This month's AI usage is used up." });
    expect(new Set(ids(board.finished)).size).toBe(board.finished.length);
  });

  it("says what an agent's finished run did, in the run's own note, and not a reason left on a run that finished", () => {
    const board = buildBoard(
      facts({
        scheduled: {
          tasks: [task("a", { agent: true }), task("t")],
          runs: [ended("a", "2026-11-25T09:00:00Z", "done", { note: "Compared prices. Next: read the blogs.", detail: "stale" }), ended("t", "2026-11-25T08:00:00Z", "failed", { note: "not shown", detail: "  " })],
        },
      }),
    );
    expect(board.finished.map((i) => i.line)).toEqual(["Compared prices. Next: read the blogs.", "A scheduled run."]);
  });

  it("shows only the latest few that finished", () => {
    const many = Array.from({ length: 12 }, (_, i) => ended("t", `2026-11-${String(10 + i).padStart(2, "0")}T09:00:00Z`, "done"));
    const board = buildBoard(facts({ scheduled: { tasks: [task("t")], runs: many } }));
    expect(board.finished).toHaveLength(FINISHED_SHOWN);
    expect(board.finished[0]!.at).toBe("2026-11-21T09:00:00Z");
  });

  it("still lists everything else when the agent's builds, or the scheduled runs, couldn't be read", () => {
    const board = buildBoard(facts({ lanes: null, changes: { mine: [{ id: "t1", title: "Add opening hours" }], expired: [], others: 0 }, scheduled: { tasks: [task("t", { nextRunAt: "2026-11-25T11:58:00Z" })], runs: null } }));
    expect(ids(board.needsYou)).toEqual(["change:t1"]);
    // With the runs unread nothing is said to be running: the task is due.
    expect(board.working).toEqual([expect.objectContaining({ id: "task:t", label: "Due now" })]);
    expect(board.finished).toEqual([]);
  });
});

describe("all work, in a sentence", () => {
  const some = (n: number) => Array.from({ length: n }, () => ({}) as never);

  it("says the numbers the lists show", () => {
    expect(boardSentence({ needsYou: [], working: [], scheduled: [] })).toBe("Nothing needs you. Nothing is in progress, and nothing is scheduled.");
    expect(boardSentence({ needsYou: some(1), working: some(1), scheduled: some(1) })).toBe("One thing needs you. One thing is in progress, and one is scheduled.");
    expect(boardSentence({ needsYou: some(3), working: some(2), scheduled: some(4) })).toBe("3 things need you. 2 things are in progress, and 4 are scheduled.");
  });
});
