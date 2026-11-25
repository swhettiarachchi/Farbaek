import { describe, expect, it } from "vitest";
import { nextRun, type Schedule } from "./schedule";
import { BY_FARBAEK, HOME_ROWS, scheduledOnHome, stoppedReason, type HomeRun, type HomeTask } from "./home";
import { PAUSE_AFTER_FAILURES, SCHEDULED_LIMITS, UNREADABLE_SCHEDULE, planProblem, settle } from "./tasks";

const NOW = new Date("2026-11-25T12:00:00Z");
const DAILY: Schedule = { repeat: { kind: "daily", time: "08:00" }, timeZone: "UTC", end: { kind: "never" } };
const HOURLY: Schedule = { repeat: { kind: "hourly", minute: 0 }, timeZone: "UTC", end: { kind: "never" } };
const task = (id: string, more: Partial<HomeTask> = {}): HomeTask => ({
  id,
  title: `Task ${id}`,
  state: "active",
  stateReason: null,
  schedule: DAILY,
  nextRunAt: "2026-11-26T08:00:00Z",
  lastRunAt: null,
  conversationId: null,
  ...more,
});
const run = (taskId: string, dueAt: string, status: HomeRun["status"], more: Partial<HomeRun> = {}): HomeRun => ({
  taskId,
  dueAt,
  status,
  conversationId: null,
  finishedAt: status === "running" || status === "retrying" ? null : dueAt,
  ...more,
});
const STOPPED = `${BY_FARBAEK}its last 5 runs didn't finish. The latest: It broke.`;
const stopped = (id: string, pausedAt = "2026-11-25T08:00:00Z") => task(id, { state: "paused", stateReason: STOPPED, nextRunAt: null, lastRunAt: pausedAt });

describe("scheduled work on Home", () => {
  it("says nothing when the person has no task", () => {
    expect(scheduledOnHome([], [], NOW)).toBeNull();
  });

  it("lists what runs next, soonest first, with each schedule in a sentence", () => {
    const home = scheduledOnHome([task("late", { nextRunAt: "2026-11-27T08:00:00Z" }), task("soon", { nextRunAt: "2026-11-25T13:00:00Z" })], [], NOW)!;
    expect(home.rows.map((r) => r.id)).toEqual(["soon", "late"]);
    expect(home.rows[0]).toEqual({ id: "soon", title: "Task soon", kind: "next", when: "later", nextRunAt: "2026-11-25T13:00:00Z", line: "Every day at 8:00 AM, UTC.", href: "/app/scheduled" });
    expect(home.more).toBe(0);
    expect(home.stopped).toEqual([]);
    expect(home.lastRun).toBeNull();
  });

  it("says a task whose time has come is due, and never that it runs in the past", () => {
    // Waiting for the tick, waiting to be tried again, or started with Run now: its time is behind the clock until the run ends.
    const home = scheduledOnHome([task("a", { nextRunAt: "2026-11-25T11:48:00Z" }), task("b", { nextRunAt: NOW.toISOString() }), task("c")], [run("a", "2026-11-25T11:48:00Z", "retrying")], NOW)!;
    expect(home.rows.map((r) => [r.id, r.when, r.nextRunAt])).toEqual([
      ["a", "due", null],
      ["b", "due", null],
      ["c", "later", "2026-11-26T08:00:00Z"],
    ]);
  });

  it("says a task is running while its newest run is under way, and only then", () => {
    const tasks = [task("a", { nextRunAt: "2026-11-25T11:58:00Z" }), task("b", { nextRunAt: "2026-11-25T11:58:00Z" }), task("p", { state: "paused", nextRunAt: null })];
    const runs = [
      run("a", "2026-11-25T11:58:00Z", "running"),
      // An older run that was left as running isn't the task's newest: it says nothing about now.
      run("b", "2026-11-24T08:00:00Z", "running"),
      run("b", "2026-11-25T08:00:00Z", "done"),
      // A task that is paused isn't running, whatever a run of it still says.
      run("p", "2026-11-25T11:00:00Z", "running"),
    ];
    const home = scheduledOnHome(tasks, runs, NOW)!;
    expect(home.rows.map((r) => [r.id, r.when])).toEqual([
      ["a", "running"],
      ["b", "due"],
      ["p", null],
    ]);
    // With the runs unread, nothing is said to be running.
    expect(scheduledOnHome(tasks, null, NOW)!.rows[0]).toMatchObject({ id: "a", when: "due" });
  });

  it("puts a task Farbaek paused first, with why, and names it as the person's to look at", () => {
    const home = scheduledOnHome([task("a"), stopped("b")], [], NOW)!;
    expect(home.rows[0]).toEqual({ id: "b", title: "Task b", kind: "stopped", when: null, nextRunAt: null, line: "Its last 5 runs didn't finish. The latest: It broke.", href: "/app/scheduled" });
    expect(home.stopped).toEqual([{ id: "b", title: "Task b", reason: "Its last 5 runs didn't finish. The latest: It broke.", agent: false }]);
  });

  it("sends an agent's work to the Agents tab, where it is listed, and a task to the Scheduled page", () => {
    const home = scheduledOnHome([task("t"), task("a", { agent: true, nextRunAt: "2026-11-25T13:00:00Z" }), { ...stopped("s"), agent: true }], [], NOW)!;
    expect(home.rows.map((r) => [r.id, r.href])).toEqual([
      ["s", "/app/scheduled/agents"],
      ["a", "/app/scheduled/agents"],
      ["t", "/app/scheduled"],
    ]);
    expect(home.stopped).toEqual([expect.objectContaining({ id: "s", agent: true })]);
  });

  it("stops leading with a task Farbaek paused after a week, but keeps its row", () => {
    // A pause the person can't undo (a smaller plan) or doesn't mean to mustn't lead Home for good.
    const home = scheduledOnHome([stopped("old", "2026-11-17T08:00:00Z"), stopped("edge", "2026-11-18T12:00:00Z"), stopped("unknown", null as unknown as string)], [], NOW)!;
    expect(home.rows.map((r) => [r.id, r.kind])).toEqual([
      ["old", "stopped"],
      ["edge", "stopped"],
      ["unknown", "stopped"],
    ]);
    expect(home.stopped.map((s) => s.id)).toEqual(["edge"]);
  });

  it("keeps a task the person paused themselves last, and never asks them to look at it", () => {
    const home = scheduledOnHome([task("mine", { state: "paused", stateReason: "Paused by you.", nextRunAt: null }), task("quiet", { state: "paused", nextRunAt: null }), task("a")], [], NOW)!;
    expect(home.rows.map((r) => [r.id, r.kind])).toEqual([
      ["a", "next"],
      ["mine", "paused"],
      ["quiet", "paused"],
    ]);
    expect(home.stopped).toEqual([]);
  });

  it("shows three rows at most and counts the scheduled and paused ones it left out, not the ended", () => {
    const many = ["a", "b", "c", "d", "e"].map((id, i) => task(id, { nextRunAt: `2026-11-2${6 + i}T08:00:00Z` }));
    const home = scheduledOnHome([...many, task("over", { state: "ended", nextRunAt: null })], [], NOW)!;
    expect(home.rows).toHaveLength(HOME_ROWS);
    expect(home.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(home.more).toBe(2);
  });

  it("counts every task Farbaek just paused as the person's to look at, even one past the rows shown", () => {
    const home = scheduledOnHome(["a", "b", "c", "d"].map((id) => stopped(id)), [], NOW)!;
    expect(home.rows).toHaveLength(3);
    expect(home.more).toBe(1);
    expect(home.stopped).toHaveLength(4);
  });

  it("puts an active task with no time, or a time that can't be read, after the ones with a time, and shows no time for it", () => {
    const home = scheduledOnHome([task("none", { nextRunAt: null }), task("bad", { nextRunAt: "soon" }), task("a")], [], NOW)!;
    expect(home.rows.map((r) => [r.id, r.when, r.nextRunAt])).toEqual([
      ["a", "later", "2026-11-26T08:00:00Z"],
      ["none", null, null],
      ["bad", null, null],
    ]);
  });

  it("says a schedule that no longer reads couldn't be read, and never guesses one", () => {
    expect(scheduledOnHome([task("a", { schedule: null })], [], NOW)!.rows[0]!.line).toBe("Its schedule couldn't be read.");
  });
});

describe("the last thing Farbaek did", () => {
  it("is the newest run that ended, read from the runs themselves, with its chat when it finished there", () => {
    const tasks = [task("old", { conversationId: "c-old" }), task("new", { conversationId: "c-new" }), task("never")];
    const runs = [run("old", "2026-11-20T08:00:00Z", "done", { conversationId: "c-old" }), run("new", "2026-11-24T08:00:00Z", "done", { conversationId: "c-new", finishedAt: "2026-11-24T08:02:00Z" }), run("never", "2026-11-25T11:59:00Z", "running")];
    expect(scheduledOnHome(tasks, runs, NOW)!.lastRun).toEqual({ taskId: "new", title: "Task new", at: "2026-11-24T08:02:00Z", status: "done", conversationId: "c-new" });
  });

  it("says a run that didn't finish or was skipped as that, with no answer to read", () => {
    const tasks = [task("a", { conversationId: "c-a" })];
    // Paused while a try was waiting: the run was closed as not finished, after the task's own record of an older run.
    expect(scheduledOnHome(tasks, [run("a", "2026-11-23T08:00:00Z", "done", { conversationId: "c-a" }), run("a", "2026-11-25T08:00:00Z", "failed", { conversationId: "c-a" })], NOW)!.lastRun).toMatchObject({ status: "failed", at: "2026-11-25T08:00:00Z", conversationId: null });
    expect(scheduledOnHome(tasks, [run("a", "2026-11-25T08:00:00Z", "skipped")], NOW)!.lastRun).toMatchObject({ status: "skipped", conversationId: null });
  });

  it("links no answer when the task's chat has changed since that run", () => {
    // The old chat was deleted or filled up, and the next run started a new one: this run's answer isn't in it.
    const home = scheduledOnHome([task("a", { conversationId: "c-new" })], [run("a", "2026-11-25T08:00:00Z", "done", { conversationId: "c-old" })], NOW)!;
    expect(home.lastRun).toMatchObject({ status: "done", conversationId: null });
  });

  it("ignores a run of a task that is no longer listed, and says nothing when the runs couldn't be read", () => {
    expect(scheduledOnHome([task("a")], [run("gone", "2026-11-25T08:00:00Z", "done")], NOW)!.lastRun).toBeNull();
    expect(scheduledOnHome([task("a", { lastRunAt: "2026-11-25T08:00:00Z" })], null, NOW)!.lastRun).toBeNull();
  });

  it("is still said for a week when every task's schedule has ended, as after a one-time reminder, then Home says nothing", () => {
    const over = task("r", { state: "ended", nextRunAt: null, conversationId: "c-r" });
    const home = scheduledOnHome([over], [run("r", "2026-11-25T09:00:00Z", "done", { conversationId: "c-r" })], NOW)!;
    expect(home).toEqual({ rows: [], more: 0, stopped: [], lastRun: { taskId: "r", title: "Task r", at: "2026-11-25T09:00:00Z", status: "done", conversationId: "c-r" } });
    expect(scheduledOnHome([over], [run("r", "2026-11-10T09:00:00Z", "done", { conversationId: "c-r" })], NOW)).toBeNull();
    expect(scheduledOnHome([over], [], NOW)).toBeNull();
    expect(scheduledOnHome([over], null, NOW)).toBeNull();
  });
});

describe("why Farbaek paused a task", () => {
  it("drops the lead and starts with a capital, as its own sentence", () => {
    expect(stoppedReason(`${BY_FARBAEK}your plan runs a task once a day at most.`)).toBe("Your plan runs a task once a day at most.");
  });

  it("leaves any other reason as it is", () => {
    expect(stoppedReason("Paused by you.")).toBe("Paused by you.");
  });

  it("starts with the same lead wherever Farbaek writes one, since Home and the Scheduled page tell its pauses by it", () => {
    expect(BY_FARBAEK).toBe("Paused by Farbaek: ");
    expect(UNREADABLE_SCHEDULE.startsWith(BY_FARBAEK)).toBe(true);
    expect(planProblem(HOURLY, SCHEDULED_LIMITS.free, 1)?.startsWith(BY_FARBAEK)).toBe(true);
    expect(planProblem(DAILY, SCHEDULED_LIMITS.free, 2)?.startsWith(BY_FARBAEK)).toBe(true);
    const failing = settle({ kind: "retry", detail: "It broke." }, { schedule: DAILY, attempt: 3, failuresInRow: PAUSE_AFTER_FAILURES - 1, runsFinished: 4, manual: false }, NOW);
    expect(failing.pauseReason?.startsWith(BY_FARBAEK)).toBe(true);
    // The schedule used above does have a next time, or settle would end the task instead of pausing it.
    expect(nextRun(DAILY, NOW, 5)).not.toBeNull();
  });
});
