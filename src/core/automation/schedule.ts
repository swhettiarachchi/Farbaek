/**
 * Schedules for work Farbaek does by itself (stage 271, ADR 0278): when a scheduled task runs next, worked out in the person's own time
 * zone, and said in a sentence. Framework-free and exact: the same rule on the server that runs the task and on the screen that shows it.
 *
 * A time is a wall-clock time where the person lives ("every day at 9:00"), so it follows their clocks when those change. A time the
 * clocks skip runs just after the gap; a time that comes twice runs the first time. A day of the month a short month lacks (the 31st)
 * runs on the month's last day.
 */
import { z } from "zod";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const time = z.string().regex(TIME);
const date = z.string().regex(DATE);

/** Whether the runtime knows this IANA time zone. */
export function isTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const repeatSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("once"), date, time }),
  z.object({ kind: z.literal("hourly"), minute: z.number().int().min(0).max(59) }),
  z.object({ kind: z.literal("daily"), time }),
  z.object({ kind: z.literal("weekdays"), time }),
  /** Days of the week, 0 for Sunday to 6 for Saturday. */
  z.object({ kind: z.literal("weekly"), days: z.array(z.number().int().min(0).max(6)).min(1).max(7), time }),
  z.object({ kind: z.literal("monthly"), day: z.number().int().min(1).max(31), time }),
]);
export type Repeat = z.infer<typeof repeatSchema>;

export const endSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("never") }),
  /** The last day it may run, in the schedule's time zone. */
  z.object({ kind: z.literal("on"), date }),
  z.object({ kind: z.literal("after"), runs: z.number().int().min(1).max(1000) }),
]);
export type ScheduleEnd = z.infer<typeof endSchema>;

export const scheduleSchema = z.object({
  repeat: repeatSchema,
  timeZone: z.string().min(1).max(64).refine(isTimeZone, "An unknown time zone."),
  end: endSchema,
});
export type Schedule = z.infer<typeof scheduleSchema>;

interface Wall {
  y: number;
  m: number;
  d: number;
  h: number;
  mi: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
/** The wall-clock date and time of an instant in a time zone. */
export function wallClock(timeZone: string, at: Date): Wall {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    formatters.set(timeZone, f);
  }
  const parts: Record<string, number> = {};
  for (const p of f.formatToParts(at)) if (p.type !== "literal") parts[p.type] = Number(p.value);
  return { y: parts.year!, m: parts.month!, d: parts.day!, h: parts.hour! % 24, mi: parts.minute! };
}

const MIN = 60_000;
const DAY = 86_400_000;
const sameWall = (a: Wall, b: Wall) => a.y === b.y && a.m === b.m && a.d === b.d && a.h === b.h && a.mi === b.mi;
/** How far the zone's wall clock is ahead of UTC at an instant, in minutes. */
const offsetAt = (timeZone: string, at: Date): number => {
  const w = wallClock(timeZone, at);
  return (Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi) - Math.floor(at.getTime() / MIN) * MIN) / MIN;
};

/**
 * The instant a wall-clock time falls at in a time zone. A time that comes twice (clocks put back) is the first of the two; a time the
 * clocks skip (put forward) is taken at the offset before the change, so it lands just after the gap.
 */
export function instantOf(timeZone: string, w: Wall): Date {
  const want = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi);
  let best: number | null = null;
  // The offsets a day either side cover both sides of any change of clocks.
  for (const probe of [want - DAY, want, want + DAY]) {
    const t = want - offsetAt(timeZone, new Date(probe)) * MIN;
    if (sameWall(wallClock(timeZone, new Date(t)), w) && (best === null || t < best)) best = t;
  }
  return new Date(best ?? want - offsetAt(timeZone, new Date(want - DAY)) * MIN);
}

const hm = (t: string): [number, number] => [Number(t.slice(0, 2)), Number(t.slice(3, 5))];
const ymd = (s: string): [number, number, number] => [Number(s.slice(0, 4)), Number(s.slice(5, 7)), Number(s.slice(8, 10))];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const dateKey = (y: number, m: number, d: number) => y * 10_000 + m * 100 + d;

/** Whether a calendar day is one the repeat runs on. */
function runsOn(repeat: Repeat, y: number, m: number, d: number): boolean {
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  if (repeat.kind === "daily") return true;
  if (repeat.kind === "weekdays") return dow >= 1 && dow <= 5;
  if (repeat.kind === "weekly") return repeat.days.includes(dow);
  if (repeat.kind === "monthly") return d === Math.min(repeat.day, lastDay(y, m));
  return false;
}

/**
 * When the schedule runs next, strictly after `after`; null when it has ended. `runsSoFar` counts the runs already started, for a
 * schedule that ends after a number of them.
 */
export function nextRun(schedule: Schedule, after: Date, runsSoFar = 0): Date | null {
  const { repeat, timeZone, end } = schedule;
  if (end.kind === "after" && runsSoFar >= end.runs) return null;
  const within = (at: Date): Date | null => {
    if (end.kind !== "on") return at;
    const w = wallClock(timeZone, at);
    const [y, m, d] = ymd(end.date);
    return dateKey(w.y, w.m, w.d) <= dateKey(y, m, d) ? at : null;
  };
  if (repeat.kind === "once") {
    const [y, m, d] = ymd(repeat.date);
    const [h, mi] = hm(repeat.time);
    const at = instantOf(timeZone, { y, m, d, h, mi });
    return runsSoFar === 0 && at.getTime() > after.getTime() ? within(at) : null;
  }
  if (repeat.kind === "hourly") {
    // By the zone's own minutes: an offset of a half or three-quarter hour (Sri Lanka's is 5:30) moves "on the hour" off UTC's.
    let t = Math.floor(after.getTime() / MIN) * MIN + MIN;
    for (let k = 0; k < 60 && wallClock(timeZone, new Date(t)).mi !== repeat.minute; k++) t += MIN;
    return within(new Date(t));
  }
  const [h, mi] = hm(repeat.time);
  const start = wallClock(timeZone, after);
  // Day by day from the day `after` falls on: a year and a bit covers every rule (the 31st, a single weekday).
  for (let k = 0; k <= 400; k++) {
    const day = new Date(Date.UTC(start.y, start.m - 1, start.d + k));
    const [y, m, d] = [day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate()];
    if (!runsOn(repeat, y, m, d)) continue;
    const at = instantOf(timeZone, { y, m, d, h, mi });
    if (at.getTime() > after.getTime()) return within(at);
  }
  return null;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : (["th", "st", "nd", "rd"][n % 10] ?? "th")}`;
const list = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
/** "9:00 AM" from "09:00". */
export function clock(t: string): string {
  const [h, mi] = hm(t);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** A time zone as people say it: "Asia/Colombo" is "Colombo time". */
export function zoneWords(timeZone: string): string {
  if (timeZone === "UTC" || timeZone === "Etc/UTC") return "UTC";
  return `${(timeZone.split("/").at(-1) ?? timeZone).replace(/_/g, " ")} time`;
}

/** The schedule in a sentence: "Every day at 9:00 AM, Colombo time." */
export function describeSchedule(schedule: Schedule): string {
  const { repeat, timeZone, end } = schedule;
  const zone = zoneWords(timeZone);
  const when =
    repeat.kind === "once"
      ? `Once, on ${Number(repeat.date.slice(8, 10))} ${MONTHS[Number(repeat.date.slice(5, 7)) - 1]} ${repeat.date.slice(0, 4)} at ${clock(repeat.time)}`
      : repeat.kind === "hourly"
        ? repeat.minute === 0
          ? "Every hour, on the hour"
          : `Every hour, at ${repeat.minute} ${repeat.minute === 1 ? "minute" : "minutes"} past`
        : repeat.kind === "daily"
          ? `Every day at ${clock(repeat.time)}`
          : repeat.kind === "weekdays"
            ? `Monday to Friday at ${clock(repeat.time)}`
            : repeat.kind === "weekly"
              ? `Every ${list([...new Set(repeat.days)].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7)).map((d) => DAYS[d]!))} at ${clock(repeat.time)}`
              : `On the ${ordinal(repeat.day)} of each month at ${clock(repeat.time)}${repeat.day > 28 ? " (the last day of a shorter month)" : ""}`;
  const until =
    repeat.kind === "once" || end.kind === "never"
      ? ""
      : end.kind === "on"
        ? `, until ${Number(end.date.slice(8, 10))} ${MONTHS[Number(end.date.slice(5, 7)) - 1]} ${end.date.slice(0, 4)}`
        : `, ${end.runs === 1 ? "once" : `${end.runs} times`} in all`;
  return `${when}${repeat.kind === "hourly" ? "" : `, ${zone}`}${until}.`;
}

/** The shortest gap between two runs of a repeat, in minutes: what a plan's "how often" limit is checked against. */
export function shortestGapMinutes(repeat: Repeat): number {
  return repeat.kind === "hourly" ? 60 : repeat.kind === "once" ? Infinity : repeat.kind === "monthly" ? 28 * 1440 : 1440;
}
