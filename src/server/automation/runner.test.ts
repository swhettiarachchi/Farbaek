/**
 * The scheduled-task runner (stage 271, ADR 0278), with the database and the Chat turn standing in: what each way a run can end is
 * recorded as, when it's tried again, when the task is paused, and who is told. SYNTHETIC values.
 */
import { describe, expect, it, vi } from "vitest";
import type { ScheduledLimit } from "@/core/automation/tasks";
import type { ScheduledNotice } from "@/server/email/notify";
import type { HeadlessResult } from "./headless-chat";
import { runClaimed, runDueTasks, type RunnerDeps } from "./runner";
import type { ClaimedRun, RunFinish } from "./store";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-11-25T03:31:00Z");
const DAILY = { repeat: { kind: "daily", time: "09:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } };
const run = (o: Partial<ClaimedRun> = {}): ClaimedRun => ({
  runId: "11111111-1111-4111-8111-111111111111",
  taskId: "22222222-2222-4222-8222-222222222222",
  orgId: "33333333-3333-4333-8333-333333333333",
  ownerId: "44444444-4444-4444-8444-444444444444",
  title: "Morning news",
  instruction: "Research the latest news and summarise it.",
  schedule: DAILY,
  options: { web: true, effort: "balanced", notify: true },
  conversationId: null,
  dueAt: new Date("2026-11-25T03:30:00Z"),
  attempt: 1,
  runsFinished: 0,
  failuresInRow: 0,
  manual: false,
  ...o,
});
const DONE: HeadlessResult = { ok: true, conversationId: "55555555-5555-4555-8555-555555555555", messageId: "66666666-6666-4666-8666-666666666666", status: "complete", error: null, chars: 900 };
const USED_UP: HeadlessResult = { ok: false, status: 402, message: "This month's AI usage is used up.", conversationId: null };

function setup(result: HeadlessResult | (() => Promise<HeadlessResult>), o: { recorded?: ("recorded" | "stale" | "error")[]; limit?: ScheduledLimit | null; position?: number | null } = {}) {
  const finished: RunFinish[] = [];
  const told: ScheduledNotice[] = [];
  const waits: number[] = [];
  const answers = [...(o.recorded ?? [])];
  const turn = vi.fn(async () => (typeof result === "function" ? result() : result));
  const deps: RunnerDeps = {
    store: { claim: async () => [], finish: async (i) => (finished.push(i), answers.shift() ?? "recorded"), linkConversation: async () => undefined, position: async () => (o.position === undefined ? 1 : o.position) },
    turn,
    ...(o.limit !== undefined ? { limit: async () => o.limit ?? null } : {}),
    notify: async (n) => void told.push(n),
    now: () => NOW,
    sleep: async (ms) => void waits.push(ms),
  };
  return { deps, finished, told, turn, waits };
}

describe("a scheduled run", () => {
  it("records an answer as done, moves the task to its next time, and tells the person where the answer is", async () => {
    const s = setup(DONE);
    expect(await runClaimed(s.deps, run())).toBe("done");
    expect(s.turn).toHaveBeenCalledWith(expect.objectContaining({ userId: "44444444-4444-4444-8444-444444444444", text: "Research the latest news and summarise it.", web: true, effort: "balanced", title: "Morning news" }), expect.anything(), "22222222-2222-4222-8222-222222222222");
    expect(s.finished).toEqual([
      { runId: run().runId, attempt: 1, status: "done", detail: null, conversationId: DONE.conversationId, messageId: "66666666-6666-4666-8666-666666666666", nextRunAt: new Date("2026-11-26T03:30:00Z"), retryAt: null, pauseReason: null, failuresInRow: 0 },
    ]);
    expect(s.told).toEqual([{ userId: run().ownerId, taskTitle: "Morning news", status: "done", detail: null, conversationId: DONE.conversationId }]);
  });

  it("skips a run the plan or the person's access refuses, without trying again", async () => {
    const s = setup(USED_UP);
    expect(await runClaimed(s.deps, run())).toBe("skipped");
    expect(s.finished[0]).toMatchObject({ status: "skipped", detail: "This month's AI usage is used up.", retryAt: null, nextRunAt: new Date("2026-11-26T03:30:00Z"), failuresInRow: 1 });
    expect(s.told[0]).toMatchObject({ status: "skipped", conversationId: null });
    const gone = setup({ ok: false, status: 403, message: "You can no longer use AI in this workspace, so this didn't run.", conversationId: null });
    expect(await runClaimed(gone.deps, run())).toBe("skipped");
    expect(gone.finished[0]).toMatchObject({ status: "skipped", retryAt: null });
  });

  it("tries passing trouble again after 2 and then 10 minutes, then records the failure", async () => {
    const down: HeadlessResult = { ok: false, status: 503, message: "AI isn't answering right now.", conversationId: null };
    const first = setup(down);
    expect(await runClaimed(first.deps, run({ attempt: 1 }))).toBe("retrying");
    expect(first.finished[0]).toMatchObject({ retryAt: new Date(NOW.getTime() + 2 * 60_000), nextRunAt: null, failuresInRow: 0 });
    expect(first.told).toEqual([]);
    const second = setup(down);
    await runClaimed(second.deps, run({ attempt: 2 }));
    expect(second.finished[0]).toMatchObject({ retryAt: new Date(NOW.getTime() + 10 * 60_000) });
    const third = setup(down);
    expect(await runClaimed(third.deps, run({ attempt: 3 }))).toBe("failed");
    expect(third.finished[0]).toMatchObject({ status: "failed", detail: "AI isn't answering right now. Tried 3 times.", retryAt: null, nextRunAt: new Date("2026-11-26T03:30:00Z"), failuresInRow: 1 });
    expect(third.told[0]).toMatchObject({ status: "failed" });
  });

  it("tries again when an answer was cut off, the turn stopped unexpectedly, or an answer is still being written in its conversation", async () => {
    const cut = setup({ ...DONE, status: "stopped" });
    expect(await runClaimed(cut.deps, run())).toBe("retrying");
    expect(cut.finished[0]).toMatchObject({ detail: "The answer took too long and was stopped.", conversationId: DONE.conversationId });
    const threw = setup(async () => {
      throw new Error("boom");
    });
    expect(await runClaimed(threw.deps, run())).toBe("retrying");
    const busy = setup({ ok: false, status: 409, message: "Wait for the answer to finish, or stop it, before asking again.", conversationId: DONE.conversationId });
    expect(await runClaimed(busy.deps, run())).toBe("retrying");
  });

  it("doesn't hold Farbaek's own limit for the day, or its own downtime, against the task", async () => {
    const daily = setup({ ok: false, status: 429, message: "Farbaek has reached its limit for today.", conversationId: null });
    expect(await runClaimed(daily.deps, run({ failuresInRow: 4 }))).toBe("skipped");
    expect(daily.finished[0]).toMatchObject({ status: "skipped", retryAt: null, pauseReason: null, failuresInRow: 4 });
    // More than six hours late (the server was down): skipped without running, said, and not counted.
    const late = setup(DONE);
    expect(await runClaimed(late.deps, run({ dueAt: new Date("2026-11-24T20:00:00Z"), failuresInRow: 4 }))).toBe("skipped");
    expect(late.turn).not.toHaveBeenCalled();
    expect(late.finished[0]).toMatchObject({ status: "skipped", detail: "Farbaek wasn't running at this time, so this run was missed.", pauseReason: null, failuresInRow: 4 });
  });

  it("pauses a task whose schedule can't be read, rather than run it on a guess, and says so", async () => {
    const s = setup(DONE);
    expect(await runClaimed(s.deps, run({ schedule: { repeat: { kind: "sometimes" } }, options: { web: true, effort: "balanced", notify: false } }))).toBe("failed");
    expect(s.turn).not.toHaveBeenCalled();
    expect(s.finished[0]).toMatchObject({ status: "failed", nextRunAt: null, pauseReason: expect.stringContaining("its schedule couldn't be read") });
    // A task Farbaek paused is always told, even with notices off.
    expect(s.told).toEqual([expect.objectContaining({ detail: expect.stringContaining("Paused by Farbaek") })]);
  });

  it("pauses the task after five runs in a row didn't finish, and tells the person even when they asked not to be told", async () => {
    const s = setup(USED_UP);
    await runClaimed(s.deps, run({ failuresInRow: 4, options: { web: true, effort: "balanced", notify: false } }));
    expect(s.finished[0]!.pauseReason).toBe("Paused by Farbaek: its last 5 runs didn't finish. The latest: This month's AI usage is used up.");
    expect(s.told).toEqual([expect.objectContaining({ status: "skipped", detail: expect.stringContaining("Paused by Farbaek") })]);
    // Four in a row, with notices off: recorded, and nobody is told.
    const quiet = setup({ ok: false, status: 402, message: "Used up.", conversationId: null });
    await runClaimed(quiet.deps, run({ failuresInRow: 3, options: { web: true, effort: "balanced", notify: false } }));
    expect(quiet.finished[0]!.pauseReason).toBeNull();
    expect(quiet.told).toEqual([]);
  });

  it("tells of runs skipped in a row once, not every time", async () => {
    const first = setup(USED_UP);
    await runClaimed(first.deps, run({ failuresInRow: 0 }));
    expect(first.told).toHaveLength(1);
    const again = setup(USED_UP);
    await runClaimed(again.deps, run({ failuresInRow: 1 }));
    expect(again.told).toEqual([]);
    // A run that works after skipped ones is told as any other.
    const back = setup(DONE);
    await runClaimed(back.deps, run({ failuresInRow: 2 }));
    expect(back.told).toHaveLength(1);
    expect(back.finished[0]!.failuresInRow).toBe(0);
  });

  it("follows the plan the owner has when the task runs: what it no longer allows is paused with the reason, before anything is spent", async () => {
    // An hourly task on a plan that runs a task once a day at most.
    const hourly = setup(DONE, { limit: { active: 1, hourly: false } });
    expect(await runClaimed(hourly.deps, run({ schedule: { ...DAILY, repeat: { kind: "hourly", minute: 0 } }, options: { web: true, effort: "balanced", notify: false } }))).toBe("skipped");
    expect(hourly.turn).not.toHaveBeenCalled();
    expect(hourly.finished[0]).toMatchObject({ status: "skipped", pauseReason: expect.stringContaining("once a day at most"), nextRunAt: new Date("2026-11-25T04:30:00Z"), failuresInRow: 0 });
    expect(hourly.told).toHaveLength(1);
    // The third-oldest active task on a plan that keeps two: paused. The oldest two keep running.
    const over = setup(DONE, { limit: { active: 2, hourly: true }, position: 3 });
    expect(await runClaimed(over.deps, run())).toBe("skipped");
    expect(over.finished[0]!.pauseReason).toContain("keeps 2 scheduled tasks active");
    const within = setup(DONE, { limit: { active: 2, hourly: true }, position: 2 });
    expect(await runClaimed(within.deps, run())).toBe("done");
    // A plan that can't be read doesn't stop a run here: the turn itself reads the plan and refuses what it must.
    const unread = setup(DONE, { limit: null });
    expect(await runClaimed(unread.deps, run())).toBe("done");
  });

  it("doesn't count a run started by hand as one of the schedule's", async () => {
    const twice = { ...DAILY, end: { kind: "after", runs: 2 } };
    // One scheduled run made, a run by hand now: the schedule still has its second run to make.
    const byHand = setup(DONE);
    await runClaimed(byHand.deps, run({ schedule: twice, runsFinished: 1, manual: true }));
    expect(byHand.finished[0]!.nextRunAt).toEqual(new Date("2026-11-26T03:30:00Z"));
    // The same run on the schedule is its second and last.
    const scheduled = setup(DONE);
    await runClaimed(scheduled.deps, run({ schedule: twice, runsFinished: 1 }));
    expect(scheduled.finished[0]!.nextRunAt).toBeNull();
  });

  it("asks the database again when an outcome couldn't be recorded, so an answer already written isn't run a second time", async () => {
    const s = setup(DONE, { recorded: ["error", "error", "recorded"] });
    expect(await runClaimed(s.deps, run())).toBe("done");
    expect(s.finished).toHaveLength(3);
    expect(s.waits).toEqual([500, 2000]);
    expect(s.told).toHaveLength(1);
    // Never recorded: nobody is told of an outcome the task doesn't show.
    const lost = setup(DONE, { recorded: ["error", "error", "error", "error"] });
    await runClaimed(lost.deps, run());
    expect(lost.finished).toHaveLength(4);
    expect(lost.told).toEqual([]);
  });

  it("tells nobody when the try had already been given up on, and doesn't ask again", async () => {
    const s = setup(DONE, { recorded: ["stale"] });
    await runClaimed(s.deps, run());
    expect(s.finished).toHaveLength(1);
    expect(s.told).toEqual([]);
  });
});

describe("a tick", () => {
  it("runs what it claimed and tallies how each went; nothing claimed is nothing run", async () => {
    const s = setup(DONE);
    s.deps.store.claim = async () => [run(), run({ runId: "77777777-7777-4777-8777-777777777777", dueAt: new Date("2026-11-24T20:00:00Z") })];
    expect(await runDueTasks(s.deps, 3)).toEqual({ claimed: 2, done: 1, retrying: 0, skipped: 1, failed: 0 });
    s.deps.store.claim = async () => null;
    expect(await runDueTasks(s.deps, 3)).toBeNull();
    expect(await runDueTasks(s.deps, 0)).toEqual({ claimed: 0, done: 0, retrying: 0, skipped: 0, failed: 0 });
  });
});
