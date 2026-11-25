/**
 * A schedule read from a person's own words (stage 271, ADR 0278): "every weekday at 8:30", "tomorrow at 5pm", "every Monday and
 * Thursday evening", "on the 1st of each month", and the commonest Sinhala and Singlish ways of saying the same ("hamadama udeta",
 * "හෙට හවස"). It only prefills the schedule a person then confirms: nothing is ever scheduled from words alone. No model is involved,
 * so the same words always read the same way, and words it doesn't know read as nothing, never as a guess.
 */
import { wallClock, type Repeat, type Schedule } from "./schedule";

export interface FromWords {
  schedule: Schedule;
  /** True when the words gave no time of day and a usual one was taken: the screen says so. */
  timeAssumed: boolean;
}

const DAY_NAMES: [RegExp, number][] = [
  [/sun(day)?s?/, 0],
  [/mon(day)?s?/, 1],
  [/tue(s|sday)?s?/, 2],
  [/wed(nesday)?s?/, 3],
  [/thu(r|rs|rsday)?s?/, 4],
  [/fri(day)?s?/, 5],
  [/sat(urday)?s?/, 6],
];
const MONTH_NAMES = ["jan(?:uary)?", "feb(?:ruary)?", "mar(?:ch)?", "apr(?:il)?", "may", "june?", "july?", "aug(?:ust)?", "sep(?:t|tember)?", "oct(?:ober)?", "nov(?:ember)?", "dec(?:ember)?"];

/** A Latin word or phrase on its own, not inside a longer word. */
const word = (source: string) => new RegExp(`(?<![a-z])(?:${source})(?![a-z])`);
const has = (t: string, source: string) => word(source).test(t);
const pad = (n: number) => String(n).padStart(2, "0");

// The parts of the day, with the time each stands for when none is given. Sinhala in its own letters and as people type it in English's.
const PARTS: { re: RegExp; sinhala: string[]; time: string; pm: boolean }[] = [
  { re: word("mornings?|ude|udeta|udema|udeeta"), sinhala: ["උදේ", "උදෑසන"], time: "08:00", pm: false },
  { re: word("afternoons?|dawal|dawalta"), sinhala: ["දවල්", "දහවල්"], time: "14:00", pm: true },
  { re: word("evenings?|hawasa|hawasata|hawas"), sinhala: ["හවස", "සවස"], time: "18:00", pm: true },
  { re: word("nights?|tonight|reta|rathri|rathriye"), sinhala: ["රෑ", "රාත්‍රී"], time: "21:00", pm: true },
];

/** The time of day the words give, as "HH:MM"; null when they give none; "invalid" when they give one no clock shows ("at 25:00"). */
function timeIn(t: string): { time: string; assumed: boolean } | null | "invalid" {
  const part = PARTS.find((p) => p.re.test(t) || p.sinhala.some((s) => t.includes(s))) ?? null;
  if (has(t, "noon|midday")) return { time: "12:00", assumed: false };
  if (has(t, "midnight")) return { time: "00:00", assumed: false };
  // "at 9", "at 9:30 pm", "at 21:00", "9am", "9.30 p.m."; Sinhala and Singlish put the time before "ta": "9ta", "9.30 ට".
  const m =
    /(?<![a-z\d])(?:at|@)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?(?![\d])/.exec(t) ??
    /(?<![a-z\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/.exec(t) ??
    /(?<![a-z\d:.])(\d{1,2})(?:[:.](\d{2}))?\s*(?:ta|ට)(?![a-z])()/.exec(t);
  // A bare "at 3" is a time only when what follows reads like one ends there: "at 9 every day", never "look at 3 sources".
  const bare = m && m[0].startsWith("a") && !m[2] && !m[3];
  const after = m ? t.slice(m.index + m[0].length) : "";
  if (m && !(bare && !/^\s*(?:$|[,.;!?]|(?:in|on|every|each|daily|today|tomorrow|tonight|and|then|to|sharp|o'?clock)(?![a-z]))/.test(after))) {
    let h = Number(m[1]);
    const mi = m[2] ? Number(m[2]) : 0;
    const half = (m[3] ?? "").replace(/\./g, "");
    if (h > 23 || mi > 59 || (half && (h < 1 || h > 12))) return "invalid";
    if (half === "pm" && h < 12) h += 12;
    if (half === "am" && h === 12) h = 0;
    // No am or pm, but the part of the day says which: "at 6 in the evening" is 18:00.
    if (!half && part?.pm && h >= 1 && h < 12) h += 12;
    return { time: `${pad(h)}:${pad(mi)}`, assumed: false };
  }
  return part ? { time: part.time, assumed: true } : null;
}

const USUAL = "09:00";

/** The schedule the words describe, in the person's time zone as of `now`; null when they describe none. */
export function scheduleFromWords(text: string, now: Date, timeZone: string): FromWords | null {
  const t = text.toLowerCase().replace(/\s+/g, " ");
  const given = timeIn(t);
  // A time no clock shows: nothing is read, rather than a usual time put in its place.
  if (given === "invalid") return null;
  const at = given?.time ?? USUAL;
  const done = (repeat: Repeat, timeAssumed = !given || given.assumed): FromWords => ({ schedule: { repeat, timeZone, end: { kind: "never" } }, timeAssumed });
  const today = wallClock(timeZone, now);
  const dayAfter = (days: number) => {
    const d = new Date(Date.UTC(today.y, today.m - 1, today.d + days));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  };

  // In a while: "in 20 minutes", "in 2 hours".
  const soon = /(?<![a-z])in (\d{1,3}) ?(min(ute)?s?|hours?|hrs?)(?![a-z])/.exec(t);
  if (soon) {
    const ms = Number(soon[1]) * (soon[2]!.startsWith("h") ? 3_600_000 : 60_000);
    const w = wallClock(timeZone, new Date(Math.ceil((now.getTime() + ms) / 60_000) * 60_000));
    return done({ kind: "once", date: `${w.y}-${pad(w.m)}-${pad(w.d)}`, time: `${pad(w.h)}:${pad(w.mi)}` }, false);
  }

  // Every hour.
  if (has(t, "every hour|hourly|each hour|hama payakama|hama payakatama|payakata sarayak") || t.includes("පැයකට වරක්") || t.includes("හැම පැයකම")) {
    return done({ kind: "hourly", minute: 0 }, false);
  }

  // Monday to Friday.
  if (has(t, "every weekday|on weekdays|weekdays|each weekday|monday to friday|mon to fri|mon-fri|working days|every working day")) return done({ kind: "weekdays", time: at });

  // Named days: "every Monday and Thursday", "on Fridays", "weekly on Tuesday". One named with "next", "this" or "on" alone is a one-off.
  const named = DAY_NAMES.filter(([re]) => has(t, re.source)).map(([, d]) => d);
  if (named.length > 0) {
    const repeats = has(t, "every|each|weekly|(sun|mon|tues|wednes|thurs|fri|satur)days");
    if (repeats || named.length > 1) return done({ kind: "weekly", days: [...new Set(named)].sort((a, b) => a - b), time: at });
    // The next such day, today's own only when its time is still ahead.
    const dow = new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay();
    let ahead = (named[0]! - dow + 7) % 7;
    if (ahead === 0 && (has(t, "next") || `${pad(today.h)}:${pad(today.mi)}` >= at)) ahead = 7;
    return done({ kind: "once", date: dayAfter(ahead), time: at });
  }

  // Each month: "on the 1st of each month", "monthly on the 15th", "every month".
  const monthly = has(t, "every month|each month|monthly|masekata sarayak|hama masekama") || t.includes("මාසෙකට වරක්") || t.includes("මාසිකව") || t.includes("හැම මාසෙකම");
  if (monthly) {
    const nth = /(?<![a-z\d])(\d{1,2})(?:st|nd|rd|th)(?![a-z])/.exec(t) ?? /(?<![a-z])day (\d{1,2})(?!\d)/.exec(t);
    const day = nth ? Number(nth[1]) : has(t, "last day|end of (the |each |every )?month") ? 31 : today.d;
    if (day < 1 || day > 31) return null;
    return done({ kind: "monthly", day, time: at });
  }

  // Each week, no day named: the day of the week it is now.
  if (has(t, "every week|each week|weekly|once a week|sathiyakata sarayak|hama sathiyakama") || t.includes("සතියකට වරක්") || t.includes("හැම සතියකම")) {
    return done({ kind: "weekly", days: [new Date(Date.UTC(today.y, today.m - 1, today.d)).getUTCDay()], time: at });
  }

  // Every day.
  const daily =
    has(t, "every day|everyday|daily|each day|every single day|every (morning|afternoon|evening|night)|each (morning|afternoon|evening|night)|hamadama|hama dama|hemadama|hema dama|hamada|dinapatha") ||
    ["හැමදාම", "හැම දාම", "දිනපතා", "සෑම දිනකම", "හැමදා"].some((s) => t.includes(s));
  if (daily) return done({ kind: "daily", time: at });

  // A date: "on 1 December", "on December 1st", this year's or next year's when that has passed.
  for (let k = 0; k < 12; k++) {
    const mo = MONTH_NAMES[k]!;
    const m = new RegExp(`(?<![a-z\\d])(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(?:${mo})(?![a-z])`).exec(t) ?? new RegExp(`(?<![a-z])(?:${mo}) (\\d{1,2})(?:st|nd|rd|th)?(?![\\d:])`).exec(t);
    if (!m) continue;
    const d = Number(m[1]);
    if (d < 1 || d > new Date(Date.UTC(today.y, k + 1, 0)).getUTCDate()) return null;
    const past = k + 1 < today.m || (k + 1 === today.m && d < today.d);
    return done({ kind: "once", date: `${today.y + (past ? 1 : 0)}-${pad(k + 1)}-${pad(d)}`, time: at });
  }

  // Tomorrow, or today.
  if (has(t, "tomorrow|tmrw|heta") || t.includes("හෙට")) return done({ kind: "once", date: dayAfter(1), time: at });
  if (given && !given.assumed && (has(t, "today|tonight|ada") || t.includes("අද"))) return done({ kind: "once", date: dayAfter(0), time: at }, false);
  if (has(t, "tonight")) return done({ kind: "once", date: dayAfter(0), time: at });
  return null;
}
