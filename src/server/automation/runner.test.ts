/**
 * The scheduled-task runner (stage 271, ADR 0278), with the database and the Chat turn standing in: what each way a run can end is
 * recorded as, when it's tried again, when the task is paused, and who is told. SYNTHETIC values.
 */
import { describe, expect, it, vi } from "vitest";
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
  ...o,
});
const DONE: HeadlessResult = { ok: true, conversationId: "55555555-5555-4555-8555-555555555555", messageId: "66666666-6666-4666-8666-666666666666", status: "complete", error: null, chars: 900 };

function setup(result: HeadlessResult | (() => Promise<HeadlessResult>), recorded = true) {
  const finished: RunFinish[] = [];
  const told: ScheduledNotice[] = [];
  const turn = vi.fn(async () => (typeof result === "function" ? result() : result));
  const deps: RunnerDeps = {
    store: { claim: async () => [], finish: async (i) => (finished.push(i), recorded), linkConversation: async () => undefined },
    turn,
    notify: async (n) => void told.push(n),
    now: () => NOW,
  };
  return { deps, finished, told, turn };
}

describe("a scheduled run", () => {
  it("records an answer as done, moves the task to its next time, and tells the person where the answer is", async () => {
    const s = setup(DONE);
    expect(await runClaimed(s.deps, run())).toBe("done");
    expect(s.turn).toHaveBeenCalledWith(expect.objectContaining({ userId: "44444444-4444-4444-8444-444444444444", text: "Research the latest news and summarise it.", web: true, effort: "balanced", title: "Morning news" }), expect.anything(), "22222222-2222-4222-8222-222222222222");
    expect(s.finished).toEqual([
      { runId: run().runId, attempt: 1, status: "done", detail: null, conversationId: DONE.conversationId, messageId: "66666666-6666-4666-8666-666666666666", nextRunAt: new Date("2026-11-26T03:30:00Z"), retryAt: null, pauseReason: null },
    ]);
    expect(s.told).toEqual([{ userId: run().ownerId, taskTitle: "Morning news", status: "done", detail: null, conversationId: DONE.conversationId }]);
  });

  it("skips a run the plan or the person's access refuses, without trying again", async () => {
    const s = setup({ ok: false, status: 402, message: "This month's AI usage is used up.", conversationId: null });
    expect(await runClaimed(s.deps, run())).toBe("skipped");
    expect(s.finished[0]).toMatchObject({ status: "skipped", detail: "This month's AI usage is used up.", retryAt: null, nextRunAt: new Date("2026-11-26T03:30:00Z") });
    expect(s.told[0]).toMatchObject({ status: "skipped", conversationId: null });
  });

  it("tries passing trouble again after 2 and then 10 minutes, then records the failure", async () => {
    const down: HeadlessResult = { ok: false, status: 503, message: "AI isn't answering right now.", conversationId: null };
    const first = setup(down);
    expect(await runClaimed(first.deps, run({ attempt: 1 }))).toBe("retrying");
    expect(first.finished[0]).toMatchObject({ retryAt: new Date(NOW.getTime() + 2 * 60_000), nextRunAt: null });
    expect(first.told).toEqual([]);
    const second = setup(down);
    await runClaimed(second.deps, run({ attempt: 2 }));
    expect(second.finished[0]).toMatchObject({ retryAt: new Date(NOW.getTime() + 10 * 60_000) });
    const third = setup(down);
    expect(await runClaimed(third.deps, run({ attempt: 3 }))).toBe("failed");
    expect(third.finished[0]).toMatchObject({ status: "failed", detail: "AI isn't answering right now. Tried 3 times.", retryAt: null, nextRunAt: new Date("2026-11-26T03:30:00Z") });
    expect(third.told[0]).toMatchObject({ status: "failed" });
  });

  it("tries again when an answer was cut off or the turn stopped unexpectedly", async () => {
    const cut = setup({ ...DONE, status: "stopped" });
    expect(await runClaimed(cut.deps, run())).toBe("retrying");
    expect(cut.finished[0]).toMatchObject({ detail: "The answer took too long and was stopped.", conversationId: DONE.conversationId });
    const threw = setup(async () => {
      throw new Error("boom");
    });
    expect(await runClaimed(threw.deps, run())).toBe("retrying");
  });

  it("skips a due time more than six hours old without running it, and says the server wasn't running", async () => {
    const s = setup(DONE);
    expect(await runClaimed(s.deps, run({ dueAt: new Date("2026-11-24T20:00:00Z") }))).toBe("skipped");
    expect(s.turn).not.toHaveBeenCalled();
    expect(s.finished[0]).toMatchObject({ status: "skipped", detail: "Farbaek wasn't running at this time, so this run was missed." });
  });

  it("pauses a task whose schedule can't be read, rather than run it on a guess", async () => {
    const s = setup(DONE);
    expect(await runClaimed(s.deps, run({ schedule: { repeat: { kind: "sometimes" } } }))).toBe("failed");
    expect(s.turn).not.toHaveBeenCalled();
    expect(s.finished[0]).toMatchObject({ status: "failed", nextRunAt: null, pauseReason: expect.stringContaining("its schedule couldn't be read") });
  });

  it("pauses the task after five runs in a row didn't finish, and tells the person even when they asked not to be told", async () => {
    const s = setup({ ok: false, status: 402, message: "This month's AI usage is used up.", conversationId: null });
    await runClaimed(s.deps, run({ failuresInRow: 4, options: { web: true, effort: "balanced", notify: false } }));
    expect(s.finished[0]!.pauseReason).toBe("Paused by Farbaek: its last 5 runs didn't finish. The latest: This month's AI usage is used up.");
    expect(s.told).toEqual([expect.objectContaining({ status: "skipped", detail: expect.stringContaining("Paused by Farbaek") })]);
    // Four in a row, with notices off: recorded, and nobody is told.
    const quiet = setup({ ok: false, status: 402, message: "Used up.", conversationId: null });
    await runClaimed(quiet.deps, run({ failuresInRow: 3, options: { web: true, effort: "balanced", notify: false } }));
    expect(quiet.finished[0]!.pauseReason).toBeNull();
    expect(quiet.told).toEqual([]);
  });

  it("tells nobody when the try had already been given up on", async () => {
    const s = setup(DONE, false);
    await runClaimed(s.deps, run());
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
