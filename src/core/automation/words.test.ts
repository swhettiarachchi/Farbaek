/**
 * Schedules read from a person's words (stage 271, ADR 0278): the common English ways, the commonest Sinhala and Singlish ones, and
 * words that describe no schedule reading as none.
 */
import { describe, expect, it } from "vitest";
import { scheduleFromWords } from "./words";

// Wednesday 25 November 2026, 10:00 in Sri Lanka.
const NOW = new Date("2026-11-25T04:30:00Z");
const read = (text: string) => scheduleFromWords(text, NOW, "Asia/Colombo");
const repeat = (text: string) => read(text)?.schedule.repeat ?? null;

describe("a schedule in a person's words", () => {
  it("reads every day, with the time given or the part of the day", () => {
    expect(repeat("Research the latest AI news every morning and summarise it")).toEqual({ kind: "daily", time: "08:00" });
    expect(read("Research the latest AI news every morning and summarise it")!.timeAssumed).toBe(true);
    expect(repeat("send me a roundup daily at 7:30am")).toEqual({ kind: "daily", time: "07:30" });
    expect(read("send me a roundup daily at 7:30am")!.timeAssumed).toBe(false);
    expect(repeat("every day at 21:15, check my project")).toEqual({ kind: "daily", time: "21:15" });
    expect(repeat("check prices every evening at 6")).toEqual({ kind: "daily", time: "18:00" });
    expect(repeat("every day, a short summary")).toEqual({ kind: "daily", time: "09:00" });
    expect(repeat("every day at noon")).toEqual({ kind: "daily", time: "12:00" });
  });

  it("reads weekdays, named days, each week and each month", () => {
    expect(repeat("every weekday at 8:30 give me a briefing")).toEqual({ kind: "weekdays", time: "08:30" });
    expect(repeat("Monday to Friday at 9am")).toEqual({ kind: "weekdays", time: "09:00" });
    expect(repeat("every Monday and Thursday at 4pm")).toEqual({ kind: "weekly", days: [1, 4], time: "16:00" });
    expect(repeat("a report on Fridays at 5 pm")).toEqual({ kind: "weekly", days: [5], time: "17:00" });
    // No day named: the day of the week it is now (a Wednesday).
    expect(repeat("review my business data every week")).toEqual({ kind: "weekly", days: [3], time: "09:00" });
    expect(repeat("on the 1st of each month at 9")).toEqual({ kind: "monthly", day: 1, time: "09:00" });
    expect(repeat("monthly, on the last day")).toEqual({ kind: "monthly", day: 31, time: "09:00" });
    expect(repeat("check the site every hour")).toEqual({ kind: "hourly", minute: 0 });
  });

  it("reads a one-off: tomorrow, a named day, a date, or in a while", () => {
    expect(repeat("remind me tomorrow at 5pm to call the bank")).toEqual({ kind: "once", date: "2026-11-26", time: "17:00" });
    expect(repeat("on Friday at 10am send the summary")).toEqual({ kind: "once", date: "2026-11-27", time: "10:00" });
    // Today's own day, its time already past: next week's.
    expect(repeat("on Wednesday at 9am")).toEqual({ kind: "once", date: "2026-12-02", time: "09:00" });
    expect(repeat("on 1 December at 08:00")).toEqual({ kind: "once", date: "2026-12-01", time: "08:00" });
    // A date already past this year: next year's.
    expect(repeat("on March 3rd")).toEqual({ kind: "once", date: "2027-03-03", time: "09:00" });
    expect(repeat("in 20 minutes remind me")).toEqual({ kind: "once", date: "2026-11-25", time: "10:20" });
    expect(repeat("today at 6pm")).toEqual({ kind: "once", date: "2026-11-25", time: "18:00" });
  });

  it("reads the commonest Sinhala and Singlish ways", () => {
    expect(repeat("hamadama udeta AI news tika summarise karanna")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("හැමදාම උදේ 7ට පුවත් සාරාංශයක් එවන්න")).toEqual({ kind: "daily", time: "07:00" });
    expect(repeat("heta hawasa 5ta mata mathak karanna")).toEqual({ kind: "once", date: "2026-11-26", time: "17:00" });
    expect(repeat("හෙට හවස මතක් කරන්න")).toEqual({ kind: "once", date: "2026-11-26", time: "18:00" });
    expect(repeat("sathiyakata sarayak report ekak")).toEqual({ kind: "weekly", days: [3], time: "09:00" });
  });

  it("reads no schedule where the words give none, and never a count as a time", () => {
    expect(read("What is the capital of France?")).toBeNull();
    expect(read("Summarise this document")).toBeNull();
    // "at 3 sources" is not three o'clock.
    expect(repeat("look at 3 sources every day")).toEqual({ kind: "daily", time: "09:00" });
    expect(read("at 25:00 every day")).toBeNull();
    expect(read("every 2 hours")).toBeNull();
  });

  it("is in the person's time zone", () => {
    // 04:30 UTC on the 25th is still the 24th in Los Angeles: tomorrow there is the 25th.
    expect(scheduleFromWords("tomorrow at 9am", NOW, "America/Los_Angeles")!.schedule.repeat).toEqual({ kind: "once", date: "2026-11-25", time: "09:00" });
  });
});
