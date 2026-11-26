/**
 * How soon a scheduled task starts, as the page may say it (ADR 0278): within a minute only while the every-minute tick is seen
 * to be arriving on this server; otherwise what the fifteen-minute sweep keeps.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { MINUTE_TICK_FRESH_MS, minuteTickRunning, noteMinuteTick, startsWithinLine } from "./minute-tick";

const T = Date.parse("2026-11-26T09:00:00Z");

describe("the every-minute tick, as seen by this server", () => {
  beforeEach(() => noteMinuteTick(0));

  it("is not running until a tick has been taken", () => {
    expect(minuteTickRunning(T)).toBe(false);
    expect(startsWithinLine(T)).toBe("A task starts within 15 minutes of its time.");
  });

  it("is running for three minutes after a tick, and the page may then promise a minute", () => {
    noteMinuteTick(T);
    expect(minuteTickRunning(T)).toBe(true);
    expect(minuteTickRunning(T + 60_000)).toBe(true);
    expect(minuteTickRunning(T + MINUTE_TICK_FRESH_MS)).toBe(true);
    expect(startsWithinLine(T + 90_000)).toBe("A task starts within a minute of its time.");
  });

  it("is taken to be off once three ticks in a row are missing: the page goes back to what the sweep keeps", () => {
    noteMinuteTick(T);
    expect(minuteTickRunning(T + MINUTE_TICK_FRESH_MS + 1)).toBe(false);
    expect(startsWithinLine(T + 20 * 60_000)).toBe("A task starts within 15 minutes of its time.");
  });

  it("never counts a tick dated after now", () => {
    noteMinuteTick(T + 5_000);
    expect(minuteTickRunning(T)).toBe(false);
  });

  it("is one value for the whole process, however the code was loaded", () => {
    noteMinuteTick(T);
    expect((globalThis as { __farbaekMinuteTick?: { at: number } }).__farbaekMinuteTick?.at).toBe(T);
  });
});
