/**
 * Schedules read from a person's words (stage 271, ADR 0278): the common English ways, the commonest Sinhala and Singlish ones, and
 * words that describe no schedule, two schedules, or one this can't hold, all reading as none. The second half is the sentences a
 * fresh review found misread: each is here with what it must read as.
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
    expect(repeat("remind me to stretch in 2 hours")).toEqual({ kind: "once", date: "2026-11-25", time: "12:00" });
    expect(repeat("today at 6pm")).toEqual({ kind: "once", date: "2026-11-25", time: "18:00" });
  });

  it("reads the commonest Sinhala and Singlish ways", () => {
    expect(repeat("hamadama udeta AI news tika summarise karanna")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("හැමදාම උදේ 7ට පුවත් සාරාංශයක් එවන්න")).toEqual({ kind: "daily", time: "07:00" });
    expect(repeat("heta hawasa 5ta mata mathak karanna")).toEqual({ kind: "once", date: "2026-11-26", time: "17:00" });
    expect(repeat("හෙට හවස මතක් කරන්න")).toEqual({ kind: "once", date: "2026-11-26", time: "18:00" });
    expect(repeat("sathiyakata sarayak report ekak")).toEqual({ kind: "weekly", days: [3], time: "09:00" });
    expect(repeat("hamadama re 10ta news denna")).toEqual({ kind: "daily", time: "22:00" });
    expect(repeat("හැමදාම රෑ 12ට")).toEqual({ kind: "daily", time: "00:00" });
    expect(repeat("මාසෙකට වරක් 1 වෙනිදා වාර්තාවක්")).toEqual({ kind: "monthly", day: 1, time: "09:00" });
  });

  it("reads no schedule where the words give none, and never a count as a time", () => {
    expect(read("What is the capital of France?")).toBeNull();
    expect(read("Summarise this document")).toBeNull();
    expect(read("")).toBeNull();
    // "at 3 sources" is not three o'clock.
    expect(repeat("look at 3 sources every day")).toEqual({ kind: "daily", time: "09:00" });
    expect(repeat("look at 3 sources every day at 7pm")).toEqual({ kind: "daily", time: "19:00" });
    expect(read("at 25:00 every day")).toBeNull();
    expect(read("every 2 hours")).toBeNull();
  });

  it("is in the person's time zone", () => {
    // 04:30 UTC on the 25th is still the 24th in Los Angeles: tomorrow there is the 25th.
    expect(scheduleFromWords("tomorrow at 9am", NOW, "America/Los_Angeles")!.schedule.repeat).toEqual({ kind: "once", date: "2026-11-25", time: "09:00" });
  });
});

describe("words about the subject are not the schedule", () => {
  it("keeps a length of time in the instruction apart from when to run", () => {
    expect(repeat("Summarise the top stories from Hacker News in 5 minutes or less, every morning at 7")).toEqual({ kind: "daily", time: "07:00" });
    expect(repeat("Teach me one useful idea in 5 minutes of reading every day at 8am")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("Summarise everything that happened in 24 hours every morning at 8")).toEqual({ kind: "daily", time: "08:00" });
  });

  it("doesn't take ordinary words for days or months", () => {
    expect(repeat("Explain why prices rose and thus what to expect, every day at 9")).toEqual({ kind: "daily", time: "09:00" });
    expect(repeat("tell me the price of 1000 sats every day at 8am")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("Give me news about the sun's solar flares every day at 9")).toEqual({ kind: "daily", time: "09:00" });
    expect(repeat("SAT exam tips every day at 7am")).toEqual({ kind: "daily", time: "07:00" });
    expect(read("will the sun shine in Colombo")).toBeNull();
    expect(read("Tell me which of the top 10 may be worth reading")).toBeNull();
    expect(read("which stocks may 10x")).toBeNull();
    expect(read("find 5 march songs")).toBeNull();
    expect(repeat("find 5 march songs every day at 9")).toEqual({ kind: "daily", time: "09:00" });
  });

  it("doesn't take a day, a date or a frequency the instruction is about for when to run", () => {
    expect(repeat("Every day at 6pm tell me Saturday's weather")).toEqual({ kind: "daily", time: "18:00" });
    expect(repeat("check my monthly budget every day at 8am")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("summarise the weekly report every day at 9")).toEqual({ kind: "daily", time: "09:00" });
    expect(repeat("track my hourly electricity use every day at 6pm")).toEqual({ kind: "daily", time: "18:00" });
    expect(repeat("tomorrow at 5pm remind me about the 1 dec deadline")).toEqual({ kind: "once", date: "2026-11-26", time: "17:00" });
    expect(repeat("tomorrow morning remind me about Friday's meeting")).toEqual({ kind: "once", date: "2026-11-26", time: "08:00" });
    expect(repeat("today at 6pm remind me about tomorrow's flight")).toEqual({ kind: "once", date: "2026-11-25", time: "18:00" });
    expect(read("summarise what happened on 5 March")).toBeNull();
    expect(read("check the ADA price at 5pm")).toBeNull();
  });

  it("reads nothing when the words name two schedules, or one it can't hold", () => {
    expect(read("every day except sunday at 9")).toBeNull();
    expect(read("Every Friday at 5pm, summarise what I did Monday to Friday")).toBeNull();
    expect(read("first monday of every month")).toBeNull();
    expect(read("every 2 weeks on monday")).toBeNull();
    expect(read("every month on the 1st and 15th")).toBeNull();
    expect(read("every day at 9am and 5pm")).toBeNull();
    expect(read("every day until 5 december")).toBeNull();
    expect(read("every other day at 9")).toBeNull();
    expect(read("twice a day")).toBeNull();
    expect(read("every weekend at 10am")).toBeNull();
  });

  it("reads a range of days, a day said with its week, and a month's first and last day", () => {
    expect(repeat("Monday through Friday at 9am")).toEqual({ kind: "weekdays", time: "09:00" });
    expect(repeat("monday - friday at 9am")).toEqual({ kind: "weekdays", time: "09:00" });
    expect(repeat("mon thru fri at 9am")).toEqual({ kind: "weekdays", time: "09:00" });
    expect(repeat("monday to thursday at 9am")).toEqual({ kind: "weekly", days: [1, 2, 3, 4], time: "09:00" });
    expect(repeat("friday to monday at 9am")).toEqual({ kind: "weekly", days: [0, 1, 5, 6], time: "09:00" });
    expect(repeat("once a week on friday")).toEqual({ kind: "weekly", days: [5], time: "09:00" });
    expect(repeat("on the first of every month")).toEqual({ kind: "monthly", day: 1, time: "09:00" });
    expect(repeat("every month end")).toEqual({ kind: "monthly", day: 31, time: "09:00" });
    expect(repeat("hourly at 15 past")).toEqual({ kind: "hourly", minute: 15 });
  });

  it("ties a part of the day to the time only when it is said with it", () => {
    expect(repeat("every evening at 6, summarise the morning news")).toEqual({ kind: "daily", time: "18:00" });
    expect(repeat("summarise last night's game every day at 8")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("Every evening at 7 send me a summary of this morning's emails")).toEqual({ kind: "daily", time: "19:00" });
    expect(repeat("every day at 6 in the evening")).toEqual({ kind: "daily", time: "18:00" });
    // At night, 12 is midnight and the small hours stay small.
    expect(repeat("every night at 12")).toEqual({ kind: "daily", time: "00:00" });
    expect(repeat("every night at 1")).toEqual({ kind: "daily", time: "01:00" });
    expect(repeat("every night at 10")).toEqual({ kind: "daily", time: "22:00" });
    // Tonight's small hours are tomorrow's date.
    expect(repeat("tonight at 12")).toEqual({ kind: "once", date: "2026-11-26", time: "00:00" });
    expect(repeat("tonight at 9")).toEqual({ kind: "once", date: "2026-11-25", time: "21:00" });
    // An hour that doesn't fit its part of the day is not guessed at.
    expect(read("every morning at 12")).toBeNull();
  });

  it("keeps a time that is said, wherever the sentence goes next", () => {
    expect(repeat("every day at 6 give me the news")).toEqual({ kind: "daily", time: "06:00" });
    expect(read("every day at 6 give me the news")).toMatchObject({ timeAssumed: false, hourAssumed: true });
    expect(repeat("every day at 7 send me news")).toEqual({ kind: "daily", time: "07:00" });
    expect(read("every day at 7 send me news")!.hourAssumed).toBe(false);
    expect(repeat("every monday at 8 check my inbox")).toEqual({ kind: "weekly", days: [1], time: "08:00" });
    expect(repeat("daily 18:00")).toEqual({ kind: "daily", time: "18:00" });
    expect(repeat("every day at 0830")).toEqual({ kind: "daily", time: "08:30" });
  });

  it("uses the year a date gives, and refuses a day the calendar lacks", () => {
    expect(repeat("on 1 December 2027 at 9am")).toEqual({ kind: "once", date: "2027-12-01", time: "09:00" });
    expect(repeat("December 1st, 2027 at 9am")).toEqual({ kind: "once", date: "2027-12-01", time: "09:00" });
    expect(read("on 1 December 2020 at 9am")).toBeNull();
    expect(read("on 30 February at 9am")).toBeNull();
    // 29 February, asked in March 2028: the next February has no 29th.
    expect(scheduleFromWords("on feb 29", new Date("2028-03-10T04:30:00Z"), "Asia/Colombo")).toBeNull();
  });

  it("reads Sinhala words whole, and never an amount as a time", () => {
    expect(read("අදාළ පුවත් 8ට එවන්න")).toBeNull();
    expect(read("මගේ අදහස් ගැන 9ට ලියන්න")).toBeNull();
    expect(repeat("අද හවස 6ට මතක් කරන්න")).toEqual({ kind: "once", date: "2026-11-25", time: "18:00" });
    expect(repeat("හැමදාම ලක්ෂ 5ට වැඩි වාහන හොයන්න")).toEqual({ kind: "daily", time: "09:00" });
    expect(read("හැමදාම ලක්ෂ 5ට වැඩි වාහන හොයන්න")!.timeAssumed).toBe(true);
    expect(repeat("minissu 20ta wada, hamadama udeta")).toEqual({ kind: "daily", time: "08:00" });
    expect(repeat("ada hawasa 5ta mathak karanna")).toEqual({ kind: "once", date: "2026-11-25", time: "17:00" });
  });
});
