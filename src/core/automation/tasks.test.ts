/**
 * The rules scheduled tasks share (stage 271, ADR 0278): what a refused turn means for a run, how a run is settled, what a plan
 * allows when a task is saved and again when it runs, and a task's name from its words.
 */
import { describe, expect, it } from "vitest";
import type { Schedule } from "./schedule";
import { EXAMPLES, SCHEDULED_LIMITS, outcomeOfRefusal, planProblem, scheduleProblem, settle, taskInputSchema, titleFor } from "./tasks";
import { scheduleFromWords } from "./words";

const NOW = new Date("2026-11-25T03:31:00Z");
const daily: Schedule = { repeat: { kind: "daily", time: "09:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } };
const once = (date: string): Schedule => ({ repeat: { kind: "once", date, time: "17:00" }, timeZone: "Asia/Colombo", end: { kind: "never" } });
const at = { schedule: daily, attempt: 1, failuresInRow: 0, runsFinished: 0 };

describe("what a refused turn means for a run", () => {
  it("skips what trying again can't change, tries passing trouble again, and fails the rest", () => {
    for (const status of [401, 402, 403]) expect(outcomeOfRefusal(status, "No.")).toEqual({ kind: "skipped", detail: "No." });
    // Farbaek's own limit for the day: skipped, and not the task's doing.
    expect(outcomeOfRefusal(429, "Full for today.")).toEqual({ kind: "skipped", detail: "Full for today.", blameless: true });
    for (const status of [409, 500, 503]) expect(outcomeOfRefusal(status, "Later.")).toEqual({ kind: "retry", detail: "Later." });
    for (const status of [400, 404, 413]) expect(outcomeOfRefusal(status, "Bad.")).toEqual({ kind: "failed", detail: "Bad." });
  });
});

describe("settling a run", () => {
  it("moves on after an answer and counts nothing against the task", () => {
    expect(settle({ kind: "done", conversationId: "c", messageId: "m" }, { ...at, failuresInRow: 3 }, NOW)).toEqual({ status: "done", detail: null, retryAt: null, nextRunAt: new Date("2026-11-26T03:30:00Z"), pauseReason: null, failuresInRow: 0 });
  });

  it("pauses at the fifth due time in a row that didn't finish, but never for Farbaek's own doing", () => {
    const fifth = settle({ kind: "failed", detail: "It broke." }, { ...at, failuresInRow: 4 }, NOW);
    expect(fifth).toMatchObject({ status: "failed", failuresInRow: 5, pauseReason: "Paused by Farbaek: its last 5 runs didn't finish. The latest: It broke." });
    const blameless = settle({ kind: "skipped", detail: "Full for today.", blameless: true }, { ...at, failuresInRow: 4 }, NOW);
    expect(blameless).toMatchObject({ status: "skipped", failuresInRow: 4, pauseReason: null });
  });

  it("ends a one-time task once its time has run, and leaves it standing after a run made by hand before its time", () => {
    // Its own run, at its time.
    expect(settle({ kind: "done", conversationId: "c", messageId: null }, { ...at, schedule: once("2026-11-25") }, new Date("2026-11-25T11:31:00Z")).nextRunAt).toBeNull();
    // A run by hand days before: the schedule's time is still ahead.
    expect(settle({ kind: "done", conversationId: "c", messageId: null }, { ...at, schedule: once("2026-12-01"), manual: true }, NOW).nextRunAt).toEqual(new Date("2026-12-01T11:30:00Z"));
  });

  it("doesn't count a run by hand towards a schedule that ends after a number of runs", () => {
    const twice: Schedule = { ...daily, end: { kind: "after", runs: 2 } };
    expect(settle({ kind: "done", conversationId: "c", messageId: null }, { ...at, schedule: twice, runsFinished: 1 }, NOW).nextRunAt).toBeNull();
    expect(settle({ kind: "done", conversationId: "c", messageId: null }, { ...at, schedule: twice, runsFinished: 1, manual: true }, NOW).nextRunAt).not.toBeNull();
  });
});

describe("what a plan allows", () => {
  it("refuses an hourly schedule on a plan that runs a task once a day at most, and a time that has passed", () => {
    expect(scheduleProblem({ ...daily, repeat: { kind: "hourly", minute: 0 } }, SCHEDULED_LIMITS.free, NOW)).toMatch(/once a day at most/);
    expect(scheduleProblem({ ...daily, repeat: { kind: "hourly", minute: 0 } }, SCHEDULED_LIMITS.plus, NOW)).toBeNull();
    expect(scheduleProblem(once("2020-01-01"), SCHEDULED_LIMITS.plus, NOW)).toMatch(/already passed/);
    // A task that has run before can be given a one-time run ahead: it isn't over by a count.
    expect(scheduleProblem(once("2026-12-01"), SCHEDULED_LIMITS.plus, NOW, 3)).toBeNull();
  });

  it("is checked again when a task runs: its oldest tasks keep running on a smaller plan", () => {
    expect(planProblem(daily, { active: 2, hourly: false }, 2)).toBeNull();
    expect(planProblem(daily, { active: 2, hourly: false }, 3)).toMatch(/keeps 2 scheduled tasks active/);
    expect(planProblem(daily, { active: 1, hourly: false }, 2)).toMatch(/keeps 1 scheduled task active/);
    expect(planProblem({ ...daily, repeat: { kind: "hourly", minute: 5 } }, { active: 5, hourly: false }, 1)).toMatch(/once a day at most/);
  });
});

describe("a task's name and its starting points", () => {
  it("takes a name from the instruction's first words, never cutting a character in two", () => {
    expect(titleFor("  Morning   news ")).toBe("Morning news");
    expect(titleFor("")).toBe("Scheduled task");
    const long = titleFor("Research the latest news on the topics I care about and give me a short summary with sources.");
    expect(long.length).toBeLessThanOrEqual(61);
    expect(long.endsWith("…")).toBe(true);
    // Fifty-nine letters, then an emoji (two units): the cut falls after it, not through it.
    const cut = titleFor(`${"a".repeat(59)}😀 and more words after it`);
    expect(Array.from(cut).some((c) => c === "😀")).toBe(true);
    expect(taskInputSchema.shape.title.safeParse(cut).success).toBe(true);
    // No half of a pair left alone at the cut: it goes through an encoder unchanged.
    expect(new TextDecoder().decode(new TextEncoder().encode(cut))).toBe(cut);
  });

  it("keeps each starting point's words from being read as a different schedule than the one it opens on", () => {
    for (const e of EXAMPLES) {
      expect(taskInputSchema.safeParse({ title: e.title, instruction: e.instruction, schedule: { repeat: e.repeat, timeZone: "UTC", end: { kind: "never" } }, options: { web: true, effort: "balanced", notify: true } }).success, e.title).toBe(true);
      // Their words name no time of their own, so the form keeps the schedule shown on the card.
      expect(scheduleFromWords(e.instruction, NOW, "Asia/Colombo"), e.title).toBeNull();
    }
  });
});
