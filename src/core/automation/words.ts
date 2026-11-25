/**
 * A schedule read from a person's own words (stage 271, ADR 0278): "every weekday at 8:30", "tomorrow at 5pm", "every Monday and
 * Thursday evening", "on the 1st of each month", and the commonest Sinhala and Singlish ways of saying the same ("hamadama udeta",
 * "හෙට හවස"). It only prefills the schedule a person then confirms: nothing is ever scheduled from words alone. No model is involved,
 * so the same words always read the same way.
 *
 * It reads a schedule only when the words say one thing. An instruction is mostly about its subject ("Saturday's weather", "the
 * weekly report", "what happened on 5 March"), so a day or a date counts only where it is said as a time to run; words that say two
 * schedules, or one this can't hold ("every other week", "except Sunday", "until December"), read as nothing, never as a guess.
 */
import { isRealDate, wallClock, type Repeat, type Schedule } from "./schedule";

export interface FromWords {
  schedule: Schedule;
  /** True when the words gave no time of day and a usual one was taken: the screen says so. */
  timeAssumed: boolean;
  /** True when an hour came with no morning or evening and was read as the morning's ("at 5" as 5:00 AM): the screen says so. */
  hourAssumed: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");
/** A Latin word or phrase on its own, not inside a longer word. */
const word = (source: string, flags = "") => new RegExp(`(?<![a-z])(?:${source})(?![a-z])`, flags);
const has = (t: string, source: string) => word(source).test(t);
const SI = "\\p{Script=Sinhala}";
/** Sinhala words on their own: not the start or the middle of a longer one ("අද" is today, "අදහස්" is an idea). */
const sinhala = (source: string) => new RegExp(`(?<!${SI})(?:${source})(?!${SI})`, "u");

// ---- Days of the week --------------------------------------------------------------------------------------------------------

const DAY_FULL = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_SHORT = ["sun", "mon", "tues?", "wed", "thu(?:rs?)?", "fri", "sat"];
const DAY_ANY = `${DAY_FULL.join("|")}|${DAY_SHORT.join("|")}`;
const dayIndex = (s: string) => ["su", "mo", "tu", "we", "th", "fr", "sa"].indexOf(s.slice(0, 2));
const PART_EN = "mornings?|afternoons?|evenings?|nights?";

interface DayMention {
  day: number;
  start: number;
  end: number;
  plural: boolean;
  short: boolean;
}

/** Every day of the week named in the text, but not one that owns something ("Saturday's weather"). */
function dayMentions(t: string): DayMention[] {
  const out: DayMention[] = [];
  const re = new RegExp(`(?<![a-z])(?:(${DAY_FULL.join("|")})(s?)|(${DAY_SHORT.join("|")}))(?![a-z'’])`, "g");
  for (const m of t.matchAll(re)) {
    const name = m[1] ?? m[3]!;
    out.push({ day: dayIndex(name), start: m.index, end: m.index + m[0].length, plural: m[2] === "s", short: !m[1] });
  }
  return out;
}

// ---- The time of day -----------------------------------------------------------------------------------------------------------

interface TimeMention {
  h: number;
  mi: number;
  start: number;
  end: number;
  /** Said with am or pm, or on the 24-hour clock: the part of the day can't move it. */
  fixed: boolean;
}

// What stands just before "at 6" when it is a time: "every day at 6", "tomorrow at 6", "Monday at 6", "the 1st at 6".
const BEFORE_AT = new RegExp(
  `(?<![a-z])(?:every ?day|daily|each day|weekdays?|week|month|tomorrow|tmrw|today|tonight|${PART_EN}|${DAY_FULL.join("s?|")}s?|${DAY_SHORT.join("|")}|\\d{1,2}(?:st|nd|rd|th)|\\d{4}|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t|tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?),? ?$`,
);
// What follows "at 6" when the time ends there: the end, a comma, or more of the schedule. Never a thing counted ("at 3 sources").
const AFTER_AT = /^ ?(?:$|[,.;!?]|(?:in the|on|every|each|daily|today|tomorrow|tonight|then|sharp|o'?clock|hrs|hours)(?![a-z]))/;

/** The times of day the words give; "invalid" when one is a time no clock shows ("at 25:00"). */
function timeMentions(t: string): TimeMention[] | "invalid" {
  const out: TimeMention[] = [];
  let invalid = false;
  const add = (h: number, mi: number, start: number, end: number, fixed: boolean) => {
    if (h > 23 || mi > 59) invalid = true;
    else if (!out.some((o) => start < o.end && end > o.start)) out.push({ h, mi, start, end, fixed });
  };
  // "9am", "9:30 pm", "9.30 p.m."
  for (const m of t.matchAll(/(?<![a-z\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/g)) {
    let h = Number(m[1]);
    const pm = m[3]!.startsWith("p");
    if (h < 1 || h > 12) {
      invalid = true;
      continue;
    }
    if (pm && h < 12) h += 12;
    if (!pm && h === 12) h = 0;
    add(h, m[2] ? Number(m[2]) : 0, m.index, m.index + m[0].length, true);
  }
  // "21:15", "8:30", with or without "at".
  for (const m of t.matchAll(/(?<![a-z\d:.])(\d{1,2}):(\d{2})(?![\d:])/g)) add(Number(m[1]), Number(m[2]), m.index, m.index + m[0].length, Number(m[1]) > 12 || m[1]!.length === 2);
  // "at 9", "at 9.30", "at 0830": a time only where the words around it say so.
  for (const m of t.matchAll(/(?<![a-z\d])(?:at|@) ?(?:(\d{2})(\d{2})|(\d{1,2})(?:\.(\d{2}))?)(?![\d:.]|(?:st|nd|rd|th)(?![a-z]))/g)) {
    const [start, end] = [m.index, m.index + m[0].length];
    if (!BEFORE_AT.test(t.slice(0, start)) && !AFTER_AT.test(t.slice(end))) continue;
    if (m[1]) add(Number(m[1]), Number(m[2]), start, end, true);
    else add(Number(m[3]), m[4] ? Number(m[4]) : 0, start, end, Number(m[3]) > 12);
  }
  // Sinhala and Singlish put the time before "ta": "9ta", "9.30 ට". Never an amount ("5ta wada", "ලක්ෂ 5ට වැඩි": more than five).
  for (const m of t.matchAll(new RegExp(`(?<![a-z\\d:.])(\\d{1,2})(?:[:.](\\d{2}))? ?(?:ta(?![a-z])|ට(?!${SI}))(?! ?(?:wada|wadi|wediya|adu|වැඩි|අඩු))`, "gu"))) {
    const h = Number(m[1]);
    if (h >= 1 && h <= 12) add(h, m[2] ? Number(m[2]) : 0, m.index, m.index + m[0].length, false);
  }
  for (const m of t.matchAll(word("noon|midday", "g"))) add(12, 0, m.index, m.index + m[0].length, true);
  for (const m of t.matchAll(word("midnight", "g"))) add(0, 0, m.index, m.index + m[0].length, true);
  return invalid ? "invalid" : out;
}

// ---- The part of the day -------------------------------------------------------------------------------------------------------

type Part = "morning" | "afternoon" | "evening" | "night";
const PARTS: { part: Part; latin: string; sinhala: string; usual: string }[] = [
  { part: "morning", latin: "mornings?|udeta|udema|udeeta|ude", sinhala: "උදේට|උදේ|උදෑසන", usual: "08:00" },
  { part: "afternoon", latin: "afternoons?|dawalta|dawal|dahawal", sinhala: "දවල්ට|දවල්|දහවල්", usual: "14:00" },
  { part: "evening", latin: "evenings?|hawasata|hawasa|hawas", sinhala: "හවසට|හවස|සවස", usual: "18:00" },
  { part: "night", latin: "nights?|tonight|reta|rae|raa|re|rathriye|rathri", sinhala: "රෑට|රෑ|රාත්‍රී", usual: "21:00" },
];
// The words a part of the day hangs on when it says when to run: "every evening", "tomorrow morning", "Monday night", "heta hawasa".
const BEFORE_PART = new RegExp(`(?:(?<![a-z])(?:every|each|this|tomorrow|tmrw|today|heta|ada|hamadama|hama dama|hemadama|hema dama|hamada|dinapatha|${DAY_FULL.join("s?|")}s?|${DAY_SHORT.join("|")})|හෙට|අද|හැමදාම|හැම දාම|දිනපතා|සෑම දිනකම|හැමදා) $`, "u");

/**
 * The part of the day the words tie to the schedule: beside its time ("at 6 in the evening", "hawasa 5ta") or on a schedule word
 * ("every evening", "tomorrow morning"). A part of the day that belongs to the subject ("the morning news", "last night's game")
 * isn't one. Null when none is tied; "unsure" when two different ones are.
 */
function partIn(t: string, times: TimeMention[]): Part | null | "unsure" {
  const found = new Set<Part>();
  let beside: Part | null = null;
  for (const p of PARTS) {
    const res = [new RegExp(`(?<![a-z])(?:${p.latin})(?![a-z'’])`, "g"), new RegExp(`(?<!${SI})(?:${p.sinhala})(?!${SI})`, "gu")];
    for (const re of res) {
      for (const m of t.matchAll(re)) {
        const [start, end] = [m.index, m.index + m[0].length];
        const before = t.slice(0, start);
        // "at 6 in the evening", "6pm this evening"; "evening at 6", "hawasa 5ta", "රෑ 10ට".
        const afterTime = times.some((x) => x.end <= start && /^ ?(?:in the |this |on the )?$/.test(t.slice(x.end, start)));
        const beforeTime = times.some((x) => x.start >= end && /^ ?(?:at |@ ?)?$/.test(t.slice(end, x.start)));
        if (afterTime || beforeTime) beside = beside && beside !== p.part ? beside : p.part;
        if (afterTime || beforeTime || m[0] === "tonight" || BEFORE_PART.test(before)) found.add(p.part);
      }
    }
  }
  if (found.size === 0) return null;
  if (found.size === 1) return [...found][0]!;
  return beside ?? "unsure";
}

/** An hour said without am or pm, in a part of the day: "6" in the evening is 18:00, "12" at night is midnight. Null when they don't fit. */
function hourIn(part: Part, h: number): number | null {
  if (h < 1 || h > 12) return null;
  if (part === "morning") return h <= 11 ? h : null;
  if (part === "afternoon") return h === 12 ? 12 : h <= 6 ? h + 12 : null;
  if (part === "evening") return h >= 4 && h <= 11 ? h + 12 : null;
  return h === 12 ? 0 : h <= 4 ? h : h + 12;
}

// ---- What the words can't say here -------------------------------------------------------------------------------------------

// A schedule this can't hold. Read as nothing, so the person sets it themselves and nothing is half-read.
const BEYOND = word(
  `except|but not|excluding|until|till|every other|every second|every third|alternate|every \\d+(?!st|nd|rd|th)|every (?:two|three|four|five|six|seven|eight|nine|ten|few|couple)|twice|thrice|bi-?weekly|fortnight(?:ly)?|weekends?|(?:first|second|third|fourth|last|1st|2nd|3rd|4th) (?:${DAY_ANY})s?`,
);
// "weekly", "monthly", "hourly" and "daily" describe a thing as often as they say when: "the weekly report", "my monthly budget".
const adverb = (w: string) => `${w}(?! (?!on |at |in the |every |each |and |from |starting |by |\\d)[a-z])`;

const USUAL = "09:00";
const MONTHS = ["jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may(?! be)", "june?", "july?", "aug(?:ust)?", "sep(?:t|tember)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?"];

/** The schedule the words describe, in the person's time zone as of `now`; null when they describe none, or more than one. */
export function scheduleFromWords(text: string, now: Date, timeZone: string): FromWords | null {
  const t = text.toLowerCase().replace(/\s+/g, " ").trim();
  if (!t) return null;
  const times = timeMentions(t);
  // A time no clock shows: nothing is read, rather than a usual time put in its place.
  if (times === "invalid") return null;
  const today = wallClock(timeZone, now);
  const dayAfter = (days: number) => {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + days));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };
  const dow = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();

  // ---- Which schedules the words name. Each is found on its own; more than one means the words aren't clear enough to read.
  const found: { kind: string; make: (at: string) => Repeat | null }[] = [];

  // Every hour, at a minute when one is said ("at 15 past").
  if (has(t, `every hour|each hour|once an hour|${adverb("hourly")}|hama payakama|hama payakatama|payakata sarayak`) || t.includes("පැයකට වරක්") || t.includes("හැම පැයකම")) {
    const past = /(?<![a-z\d])(\d{1,2}) (?:minutes? )?past(?![a-z])/.exec(t);
    const minute = past ? Number(past[1]) : has(t, "half past|on the half hour") ? 30 : 0;
    found.push({ kind: "hourly", make: () => (minute > 59 || times.length > 0 ? null : { kind: "hourly", minute }) });
  }

  // Days of the week: ranges first ("Monday to Thursday"), then the days named one by one.
  const days = dayMentions(t);
  const used = new Set<DayMention>();
  const ranges: number[][] = [];
  for (let i = 0; i + 1 < days.length; i++) {
    const [a, b] = [days[i]!, days[i + 1]!];
    if (!/^ ?(?:to|through|thru|-) ?$/.test(t.slice(a.end, b.start))) continue;
    const span: number[] = [];
    for (let d = a.day; ; d = (d + 1) % 7) {
      span.push(d);
      if (d === b.day) break;
    }
    ranges.push(span);
    used.add(a).add(b);
  }
  // Lists of days said together: "Monday and Thursday", "Tue, Thu and Sat".
  const lists: DayMention[][] = [];
  for (const d of days) {
    if (used.has(d)) continue;
    const last = lists.at(-1)?.at(-1);
    if (last && /^ ?(?:,|and|&|, and|or) ?$/.test(t.slice(last.end, d.start))) lists.at(-1)!.push(d);
    else lists.push([d]);
  }
  const weekdaysSaid = has(t, "every weekday|each weekday|on weekdays|weekdays|week days|working days|every working day");
  const dayLists: { days: number[]; repeats: boolean; next: boolean }[] = [];
  for (const list of lists) {
    const first = list[0]!;
    const before = t.slice(0, first.start);
    const after = t.slice(list.at(-1)!.end);
    const every = /(?<![a-z])(?:every|each|weekly on|weekly|once a week on|every week on|each week on) $/.test(before);
    const pointed = /(?<![a-z])(?:on|next|this|coming) $/.test(before);
    // A day followed by its time or its part of the day is a time to run: "Friday at 5pm", "Friday evening".
    const timed = new RegExp(`^ ?(?:at |@|\\d|(?:${PART_EN})(?![a-z'’]))`).test(after);
    const repeats = every || list.length > 1 || list.some((d) => d.plural);
    // A short form ("sat", "sun", "wed") is a word of its own too: a day only where the words around it say so.
    if (first.short && !every && !pointed && !timed && list.length === 1) continue;
    if (!repeats && !pointed && !timed) continue;
    dayLists.push({ days: [...new Set(list.map((d) => d.day))].sort((a, b) => a - b), repeats, next: /(?<![a-z])next $/.test(before) });
  }
  const isWeekdays = (ds: number[]) => ds.length === 5 && [1, 2, 3, 4, 5].every((d) => ds.includes(d));
  if (weekdaysSaid) found.push({ kind: "weekdays", make: (at) => ({ kind: "weekdays", time: at }) });
  for (const span of ranges) {
    if (isWeekdays(span)) {
      if (!weekdaysSaid) found.push({ kind: "weekdays", make: (at) => ({ kind: "weekdays", time: at }) });
    } else found.push({ kind: "days", make: (at) => ({ kind: "weekly", days: [...span].sort((a, b) => a - b), time: at }) });
  }
  for (const l of dayLists) {
    if (l.repeats) found.push({ kind: "days", make: (at) => ({ kind: "weekly", days: l.days, time: at }) });
    else
      found.push({
        kind: "day",
        make: (at) => {
          // The next such day, today's own only when its time is still ahead.
          let ahead = (l.days[0]! - dow + 7) % 7;
          if (ahead === 0 && (l.next || `${pad(today.h)}:${pad(today.mi)}` >= at)) ahead = 7;
          return { kind: "once", date: dayAfter(ahead), time: at };
        },
      });
  }

  // Each month: "on the 1st of each month", "monthly on the 15th", "on the first of every month", "every month end".
  if (has(t, `every month|each month|once a month|${adverb("monthly")}|masekata sarayak|hama masekama`) || t.includes("මාසෙකට වරක්") || t.includes("මාසිකව") || t.includes("හැම මාසෙකම")) {
    const nth = [...t.matchAll(/(?<![a-z\d])(\d{1,2})(?:st|nd|rd|th)(?![a-z])/g), ...t.matchAll(/(?<![a-z])day (\d{1,2})(?!\d)/g), ...t.matchAll(new RegExp(`(?<![a-z\\d])(\\d{1,2}) ?(?:weni ?da|wenida|වෙනිදා|වෙනි දා)`, "gu"))].map((m) => Number(m[1]));
    const said = new Set(nth);
    const day = said.size === 1 ? nth[0]! : has(t, "first of|first day|on the first") ? 1 : has(t, "last day|end of (?:the |each |every )?month|month end|month-end") ? 31 : today.d;
    found.push({ kind: "monthly", make: (at) => (said.size > 1 || day < 1 || day > 31 ? null : { kind: "monthly", day, time: at }) });
  }

  // Each week with no day named: the day of the week it is now. With a day named, the days above say it.
  if (has(t, `every week|each week|once a week|${adverb("weekly")}|sathiyakata sarayak|hama sathiyakama`) || t.includes("සතියකට වරක්") || t.includes("හැම සතියකම")) {
    if (!found.some((f) => f.kind === "days" || f.kind === "weekdays")) {
      // "Once a week on Friday" says its day: a single day pointed at repeats.
      const single = found.findIndex((f) => f.kind === "day");
      if (single >= 0) {
        const l = dayLists.find((x) => !x.repeats)!;
        found[single] = { kind: "days", make: (at) => ({ kind: "weekly", days: l.days, time: at }) };
      } else found.push({ kind: "days", make: (at) => ({ kind: "weekly", days: [dow], time: at }) });
    }
  }

  // Every day.
  const daily =
    has(t, `every day|everyday|each day|every single day|once a day|${adverb("daily")}|every (?:${PART_EN})|each (?:${PART_EN})|hamadama|hama dama|hemadama|hema dama|hamada|dinapatha`) ||
    ["හැමදාම", "හැම දාම", "දිනපතා", "සෑම දිනකම"].some((s) => t.includes(s)) ||
    sinhala("හැමදා").test(t);
  if (daily) found.push({ kind: "daily", make: (at) => ({ kind: "daily", time: at }) });

  // A date: "on 1 December at 8", "December 1st, 2027 at 9am". It is a time to run when its time is said with it, or when the words
  // are the date and nothing else; a date in the middle of an instruction is mostly its subject ("what happened on 5 March").
  const dates: { y: number | null; m: number; d: number; start: number; end: number }[] = [];
  for (let k = 0; k < 12; k++) {
    const mo = MONTHS[k]!;
    for (const m of t.matchAll(new RegExp(`(?<![a-z\\d])(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(?:${mo})(?![a-z])(?:,? (\\d{4})(?!\\d))?`, "g"))) dates.push({ y: m[2] ? Number(m[2]) : null, m: k + 1, d: Number(m[1]), start: m.index, end: m.index + m[0].length });
    for (const m of t.matchAll(new RegExp(`(?<![a-z])(?:${mo}) (\\d{1,2})(?:st|nd|rd|th)?(?![\\d:a-z])(?:,? (\\d{4})(?!\\d))?`, "g"))) dates.push({ y: m[2] ? Number(m[2]) : null, m: k + 1, d: Number(m[1]), start: m.index, end: m.index + m[0].length });
  }
  const dated = dates.filter((x) => {
    const alone = /^(?:on |by )?(?:the )?$/.test(t.slice(0, x.start)) && /^[.!]?$/.test(t.slice(x.end));
    const withTime = times.some((c) => (c.start >= x.end && /^,? ?(?:at |@ ?)?$/.test(t.slice(x.end, c.start))) || (c.end <= x.start && /^,? ?(?:on |of )?(?:the )?$/.test(t.slice(c.end, x.start))));
    return alone || withTime;
  });
  for (const x of dated) {
    found.push({
      kind: "date",
      make: (at) => {
        const past = x.m < today.m || (x.m === today.m && x.d < today.d);
        const y = x.y ?? today.y + (past ? 1 : 0);
        const date = `${y}-${pad(x.m)}-${pad(x.d)}`;
        // A day the calendar lacks (30 February), or a year already gone, reads as nothing.
        if (!isRealDate(date) || date < dayAfter(0)) return null;
        return { kind: "once", date, time: at };
      },
    });
  }

  // Tomorrow, or today: never one that owns something ("tomorrow's flight").
  if (/(?<![a-z])(?:tomorrow|tmrw|heta)(?![a-z'’])/.test(t) || sinhala("හෙට").test(t)) found.push({ kind: "tomorrow", make: (at) => ({ kind: "once", date: dayAfter(1), time: at }) });
  // "ada" is today in Sinhala and a word in English too ("the ADA price"): today only before a part of the day or a time.
  const todaySaid = /(?<![a-z])today(?![a-z'’])/.test(t) || new RegExp(`(?<![a-z])ada (?:${PARTS.map((p) => p.latin).join("|")}|\\d)`).test(t) || sinhala("අද").test(t);
  const tonight = /(?<![a-z])tonight(?![a-z'’])/.test(t);

  // ---- The time of day.
  const part = partIn(t, times);
  if (part === "unsure") return null;
  const distinct = [...new Set(times.map((c) => c.h * 60 + c.mi))];
  // Two times ("at 9am and 5pm") are two schedules.
  if (distinct.length > 1) return null;
  const given = times[0] ?? null;
  let at = USUAL;
  let timeAssumed = true;
  let hourAssumed = false;
  // "Tonight at 12", "tonight at 1": the small hours belong to tomorrow's date.
  let pastMidnight = false;
  if (given) {
    let h = given.h;
    if (!given.fixed && part) {
      const fitted = hourIn(part, h);
      if (fitted === null) return null;
      pastMidnight = part === "night" && fitted < 5;
      h = fitted;
    } else if (!given.fixed && h >= 1 && h <= 6) hourAssumed = true;
    at = `${pad(h)}:${pad(given.mi)}`;
    timeAssumed = false;
  } else if (part) at = PARTS.find((p) => p.part === part)!.usual;

  if ((todaySaid && given) || tonight) found.push({ kind: "today", make: (when) => ({ kind: "once", date: dayAfter(pastMidnight ? 1 : 0), time: when }) });

  // In a while: "in 20 minutes", "in 2 hours", said at the start or the end, and with no other schedule beside it.
  const soon = /^in (\d{1,3}) ?(min(?:ute)?s?|hours?|hrs?)(?![a-z])/.exec(t) ?? /(?<![a-z])in (\d{1,3}) ?(min(?:ute)?s?|hours?|hrs?)[.!]?$/.exec(t);
  if (soon && found.length === 0 && times.length === 0) {
    const ms = Number(soon[1]) * (soon[2]!.startsWith("h") ? 3_600_000 : 60_000);
    const w = wallClock(timeZone, new Date(Math.ceil((now.getTime() + ms) / 60_000) * 60_000));
    return { schedule: { repeat: { kind: "once", date: `${w.y}-${pad(w.m)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}` }, timeZone, end: { kind: "never" } }, timeAssumed: false, hourAssumed: false };
  }

  if (found.length !== 1 || BEYOND.test(t)) return null;
  const repeat = found[0]!.make(at);
  if (!repeat) return null;
  const hourly = repeat.kind === "hourly";
  return { schedule: { repeat, timeZone, end: { kind: "never" } }, timeAssumed: hourly ? false : timeAssumed, hourAssumed: hourly ? false : hourAssumed };
}
