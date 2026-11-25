/**
 * Schedules (stage 271, ADR 0278): when a task runs next, in the person's own time zone, across changes of clocks, short months and
 * the ways a schedule ends; and how it's said.
 */
import { describe, expect, it } from "vitest";
import { describeSchedule, instantOf, nextRun, scheduleSchema, wallClock, type Schedule } from "./schedule";

const at = (iso: string) => new Date(iso);
const sched = (repeat: Schedule["repeat"], timeZone = "Asia/Colombo", end: Schedule["end"] = { kind: "never" }): Schedule => ({ repeat, timeZone, end });

describe("a wall-clock time in a time zone", () => {
  it("is the instant that zone's clocks show it, half-hour offsets included", () => {
    // Sri Lanka is 5:30 ahead of UTC all year.
    expect(instantOf("Asia/Colombo", { y: 2026, m: 11, d: 25, h: 9, mi: 0 }).toISOString()).toBe("2026-11-25T03:30:00.000Z");
    expect(wallClock("Asia/Colombo", at("2026-11-25T03:30:00Z"))).toEqual({ y: 2026, m: 11, d: 25, h: 9, mi: 0 });
    expect(instantOf("UTC", { y: 2026, m: 1, d: 1, h: 0, mi: 0 }).toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("lands just after a gap when the clocks skip it, and takes the first of a time that comes twice", () => {
    // New York, 8 March 2026: 02:00 jumps to 03:00. 02:30 doesn't exist: taken at the old offset, it's 03:30 on the new clock.
    const gap = instantOf("America/New_York", { y: 2026, m: 3, d: 8, h: 2, mi: 30 });
    expect(gap.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(wallClock("America/New_York", gap)).toMatchObject({ h: 3, mi: 30 });
    // 1 November 2026: 01:30 comes twice (EDT then EST): the first, at 05:30 UTC.
    expect(instantOf("America/New_York", { y: 2026, m: 11, d: 1, h: 1, mi: 30 }).toISOString()).toBe("2026-11-01T05:30:00.000Z");
  });
});

describe("when a schedule runs next", () => {
  it("runs every day at its time, today when that's still ahead and tomorrow when it's past", () => {
    const s = sched({ kind: "daily", time: "09:00" });
    expect(nextRun(s, at("2026-11-25T00:00:00Z"))!.toISOString()).toBe("2026-11-25T03:30:00.000Z");
    expect(nextRun(s, at("2026-11-25T03:30:00Z"))!.toISOString()).toBe("2026-11-26T03:30:00.000Z");
  });

  it("keeps the wall-clock time across a change of clocks", () => {
    const s = sched({ kind: "daily", time: "09:00" }, "America/New_York");
    // 7 March is EST (UTC-5): 14:00 UTC. 8 March is EDT (UTC-4): 13:00 UTC.
    expect(nextRun(s, at("2026-03-07T00:00:00Z"))!.toISOString()).toBe("2026-03-07T14:00:00.000Z");
    expect(nextRun(s, at("2026-03-07T14:00:00Z"))!.toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });

  it("skips the weekend on weekdays, and runs only on a weekly schedule's days", () => {
    // 27 November 2026 is a Friday.
    const weekdays = sched({ kind: "weekdays", time: "08:00" }, "UTC");
    expect(nextRun(weekdays, at("2026-11-27T08:00:00Z"))!.toISOString()).toBe("2026-11-30T08:00:00.000Z");
    const weekly = sched({ kind: "weekly", days: [1, 4], time: "16:00" }, "UTC");
    expect(nextRun(weekly, at("2026-11-27T00:00:00Z"))!.toISOString()).toBe("2026-11-30T16:00:00.000Z");
    expect(nextRun(weekly, at("2026-11-30T16:00:00Z"))!.toISOString()).toBe("2026-12-03T16:00:00.000Z");
  });

  it("runs a day of the month a shorter month lacks on that month's last day", () => {
    const s = sched({ kind: "monthly", day: 31, time: "09:00" }, "UTC");
    expect(nextRun(s, at("2027-01-31T09:00:00Z"))!.toISOString()).toBe("2027-02-28T09:00:00.000Z");
    expect(nextRun(s, at("2027-02-28T09:00:00Z"))!.toISOString()).toBe("2027-03-31T09:00:00.000Z");
    // A leap year's February.
    expect(nextRun(s, at("2028-02-01T00:00:00Z"))!.toISOString()).toBe("2028-02-29T09:00:00.000Z");
  });

  it("runs hourly by the zone's own minutes", () => {
    // On the hour in Sri Lanka is half past in UTC.
    const s = sched({ kind: "hourly", minute: 0 });
    expect(nextRun(s, at("2026-11-25T03:10:00Z"))!.toISOString()).toBe("2026-11-25T03:30:00.000Z");
    expect(nextRun(s, at("2026-11-25T03:30:00Z"))!.toISOString()).toBe("2026-11-25T04:30:00.000Z");
  });

  it("runs a one-off once, and never again", () => {
    const s = sched({ kind: "once", date: "2026-12-01", time: "17:00" });
    expect(nextRun(s, at("2026-11-25T00:00:00Z"))!.toISOString()).toBe("2026-12-01T11:30:00.000Z");
    expect(nextRun(s, at("2026-12-01T11:30:00Z"))).toBeNull();
    expect(nextRun(s, at("2026-11-25T00:00:00Z"), 1)).toBeNull();
  });

  it("ends on its last day, that day included, or after its number of runs", () => {
    const until = sched({ kind: "daily", time: "09:00" }, "Asia/Colombo", { kind: "on", date: "2026-11-26" });
    expect(nextRun(until, at("2026-11-25T03:30:00Z"))!.toISOString()).toBe("2026-11-26T03:30:00.000Z");
    expect(nextRun(until, at("2026-11-26T03:30:00Z"))).toBeNull();
    const thrice = sched({ kind: "daily", time: "09:00" }, "Asia/Colombo", { kind: "after", runs: 3 });
    expect(nextRun(thrice, at("2026-11-25T00:00:00Z"), 2)).not.toBeNull();
    expect(nextRun(thrice, at("2026-11-25T00:00:00Z"), 3)).toBeNull();
  });

  it("always answers strictly after the moment asked about, so a run never repeats its own slot", () => {
    const s = sched({ kind: "weekly", days: [0, 1, 2, 3, 4, 5, 6], time: "00:00" }, "Pacific/Auckland");
    let t = at("2026-01-01T00:00:00Z");
    for (let k = 0; k < 400; k++) {
      const n = nextRun(s, t)!;
      expect(n.getTime()).toBeGreaterThan(t.getTime());
      // A day apart, give or take the hour the clocks change by.
      if (k > 0) expect(Math.abs(n.getTime() - t.getTime() - 86_400_000)).toBeLessThanOrEqual(3_600_000);
      t = n;
    }
  });
});

describe("a schedule as stored and as said", () => {
  it("refuses a time zone the runtime doesn't know, a time that isn't one, and no weekdays", () => {
    expect(scheduleSchema.safeParse(sched({ kind: "daily", time: "09:00" })).success).toBe(true);
    expect(scheduleSchema.safeParse(sched({ kind: "daily", time: "09:00" }, "Mars/Olympus")).success).toBe(false);
    expect(scheduleSchema.safeParse(sched({ kind: "daily", time: "24:00" })).success).toBe(false);
    expect(scheduleSchema.safeParse(sched({ kind: "weekly", days: [], time: "09:00" })).success).toBe(false);
    expect(scheduleSchema.safeParse(sched({ kind: "once", date: "2026-13-01", time: "09:00" })).success).toBe(false);
  });

  it("says each schedule in a sentence", () => {
    expect(describeSchedule(sched({ kind: "daily", time: "09:00" }))).toBe("Every day at 9:00 AM, Colombo time.");
    expect(describeSchedule(sched({ kind: "weekdays", time: "08:30" }, "America/New_York"))).toBe("Monday to Friday at 8:30 AM, New York time.");
    expect(describeSchedule(sched({ kind: "weekly", days: [4, 1], time: "16:00" }))).toBe("Every Monday and Thursday at 4:00 PM, Colombo time.");
    expect(describeSchedule(sched({ kind: "monthly", day: 1, time: "00:05" }))).toBe("On the 1st of each month at 12:05 AM, Colombo time.");
    expect(describeSchedule(sched({ kind: "monthly", day: 31, time: "12:00" }))).toBe("On the 31st of each month at 12:00 PM (the last day of a shorter month), Colombo time.");
    expect(describeSchedule(sched({ kind: "hourly", minute: 15 }))).toBe("Every hour, at 15 minutes past.");
    expect(describeSchedule(sched({ kind: "once", date: "2026-12-01", time: "17:00" }))).toBe("Once, on 1 December 2026 at 5:00 PM, Colombo time.");
    expect(describeSchedule(sched({ kind: "daily", time: "09:00" }, "Asia/Colombo", { kind: "on", date: "2026-12-31" }))).toBe("Every day at 9:00 AM, Colombo time, until 31 December 2026.");
    expect(describeSchedule(sched({ kind: "daily", time: "09:00" }, "UTC", { kind: "after", runs: 5 }))).toBe("Every day at 9:00 AM, UTC, 5 times in all.");
  });
});
