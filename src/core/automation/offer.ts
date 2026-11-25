/**
 * Offering to schedule what a person just asked for in Chat (stage 273, ADR 0280). "Send me the AI news every morning at 8" is
 * answered once, and under the answer Farbaek offers to do it at that time from now on. It is an offer, read by the same tested
 * words reader as the Scheduled page: nothing is scheduled until the person presses, and no model decides.
 *
 * Most messages that mention a time are not requests to do something at it: "write a script that runs every day at 9", "I wake up
 * every day at 5", "can dogs eat rice every day", a pasted email with "tomorrow at 3pm" in it. An offer under those is noise. So the
 * offer is made only when the person's own words (not code, quotes or pasted text) both name a schedule and ask Farbaek for
 * something: to be reminded or sent something, to check or research something, or a sentence that starts with its schedule. A
 * one-time run is offered only for a reminder. The lists in `eval/offer-cases.ts` measure it; a change may not lower their floors.
 */
import { describeSchedule, nextRun, type Schedule } from "./schedule";
import { scheduleFromWords, type FromWords } from "./words";

export interface ScheduleOffer {
  schedule: Schedule;
  /** The schedule in a sentence, as the Scheduled page says it. */
  sentence: string;
  /** No time of day was given, so a usual one was taken: the offer says so. */
  timeAssumed: boolean;
  /** An hour was given with no morning or evening and read as the morning's: the offer says so. */
  hourAssumed: boolean;
}

/** A request to schedule is a sentence or two. Anything longer is mostly something pasted. */
export const OFFER_MAX_CHARS = 400;

const SI = "\\p{Script=Sinhala}";
const word = (source: string) => new RegExp(`(?<![a-z])(?:${source})(?![a-z])`);

/** Asking to be reminded, woken or alerted: the only thing a one-time run is offered for. */
const REMIND = new RegExp(`(?<![a-z])(?:remind(?:er)?|wake me|notify me|alert me|ping me|nagittanna|mathak)(?![a-z])|මතක්|නැගිට්ටන්න`, "u");
/** "Remind me what documents I need" asks a question now; it isn't a reminder to set. */
const REMIND_QUESTION = word("remind me (?:what|how|why|who|when|where|which|if|about what)");
/** Asking to be sent or told something. With a repeat, a request; with a single day, mostly a plain question ("tell me the weather tomorrow"). */
const SEND = new RegExp(`(?<![a-z])(?:send me|email me|message me|text me|update me|brief me|tell me|give me|show me|let me know|ewanna|evanna|kiyanna|denna)(?![a-z])|එවන්න|කියන්න|දෙන්න`, "u");
/** A sentence that starts by asking Farbaek to do the work, with or without "can you" and "please". */
const TASK_START = /^(?:please )?(?:(?:can|could|will|would) you (?:please )?)?(?:check|research|monitor|track|look up|look at|look for|find|summari[sz]e|review|scan|watch|report|compile|collect|gather|prepare|keep an eye|do this|do the same|do that|do it|run this|run that|run it)(?![a-z])/;
/** "I want a summary every evening", never "I want to…", which is about the person. */
const WANT = /^(?:i want|i'd like|i would like|i need) (?!to(?![a-z]))/;
/** A sentence that starts with its schedule: "Every Monday morning, …", "daily at 7am: …", "hamadama ude 7ta …". */
const STARTS_WITH_SCHEDULE = new RegExp(
  `^(?:from now on,? ?)?(?:(?:every|each|daily|weekly|monthly|hourly|next|tomorrow|tonight|on the \\d|on (?:sun|mon|tue|wed|thu|fri|sat)|in \\d+ ?(?:min|hour|hr)|hamadama|hama dama|hemadama|dinapatha|sathiyakata|masekata|heta)(?![a-z])|හැමදාම|දිනපතා|හෙට|සතියකට|මාසෙකට)`,
  "u",
);
/** Where the schedule's own words begin, so what comes before them can be read. */
const SCHEDULE_AT = new RegExp(
  `(?<![a-z])(?:every|each|daily|weekly|monthly|hourly|tomorrow|tonight|today|weekdays?|next|on the|in \\d+ ?(?:min|hour|hr)|at \\d|noon|midnight|(?:sun|mon|tues|wednes|thurs|fri|satur)days?|hamadama|hama dama|hemadama|dinapatha|heta|sathiyakata|masekata)(?![a-z])|(?<!${SI})(?:හැමදාම|දිනපතා|හෙට|අද|සතියකට|මාසෙකට)`,
  "u",
);
/** Words that put the schedule inside a description: "a script that runs every day", "why I feel tired every afternoon", "how to set an alarm for…". */
const DESCRIBES = word("that|which|who|whose|where|if|when|because|why|how|what|to (?:run|send|execute|trigger|fire|post|repeat|set|create|make)");
/** How a question or an explanation starts, in English and in Sinhala typed with English letters. */
const QUESTION_START = /^(?:what|why|how|who|whom|whose|when|where|which|is|are|was|were|does|did|do (?:i|we|you|they|people)|can (?!you(?![a-z]))|could (?!you(?![a-z]))|will (?!you(?![a-z]))|would (?!you(?![a-z]))|should|explain|describe|kohomada|mokakda|mokada|aei|kawda|koheda)(?![a-z])/;
/** A Sinhala question ends on "da": "hondada", "wahinawada", "හොඳද". */
const SINHALA_QUESTION_END = new RegExp(`(?:[a-z]da|${SI}ද)\\s*[?？]?$`, "u");
/** A sentence about the person or a thing, not a request: "I wake up every day at 5", "My daughter has piano every Tuesday". */
const STATEMENT_START = new RegExp(`^(?:(?:i|we|my|our|he|she|they|his|her|their|the|a|an|this|that|it|mage|mama|api)(?![a-z'’])|මගේ|මම|අපි)`, "u");
/** After a schedule at the start, a subject means a statement: "Every morning I wake up tired". */
const SCHEDULE_THEN_A_STATEMENT = /^(?:from now on,? ?)?(?:every|each|daily|weekly|monthly|hourly)(?![a-z])[^,.]{0,30}?[, ]+(?:i|we|he|she|they)(?![a-z])/;
/** Before a colon, a word that means what follows is something to work on, not the person's request: "Translate to Sinhala: …". */
const WORKS_ON_WHAT_FOLLOWS = word("translate|summari[sz]e|rewrite|reply|proofread|fix|correct|improve|paraphrase|explain|review|write|draft|edit|check|is this|what does|let me know");

/**
 * The person's own request, without what they pasted, quoted or wrote as code: a schedule in those belongs to the thing they are
 * asking about. Null when the message is too long or too many lines to be a request to schedule.
 */
export function ownWords(message: string): string | null {
  const raw = message.trim();
  if (raw.length > OFFER_MAX_CHARS || raw.split(/\r?\n/).length > 3) return null;
  let text = raw
    .replace(/```[\s\S]*?(?:```|$)/g, " ")
    .replace(/`[^`\n]*`/g, " ")
    .replace(/"[^"\n]{3,}"|“[^”\n]{3,}”|(?<![A-Za-z])'[^'\n]{3,}'(?![A-Za-z])/g, " ");
  const colon = text.indexOf(":");
  // "Translate to Sinhala: I go to the gym every day": what follows the colon is the material, not the request.
  if (colon > 0 && WORKS_ON_WHAT_FOLLOWS.test(text.slice(0, colon).toLowerCase())) text = text.slice(0, colon);
  text = text.replace(/\s+/g, " ").trim();
  return text.length >= 8 ? text : null;
}

/**
 * The schedule worth offering for a message, or null. `askedAt` is when the message was sent: "tomorrow" and "in 20 minutes" are
 * read from then, so the same chat opened a week later doesn't offer a different day. `now` is the moment of looking: a time
 * already past is never offered.
 */
export function scheduleOffer(message: string, askedAt: Date, timeZone: string, now: Date = askedAt): ScheduleOffer | null {
  const own = ownWords(message);
  if (!own) return null;
  const lower = own.toLowerCase();
  const reminds = REMIND.test(lower) && !REMIND_QUESTION.test(lower);

  let read: FromWords | null = scheduleFromWords(own, askedAt, timeZone);
  // "Remind me at 5pm to call mom" names no day: it means the next 5pm, today's if that is still ahead.
  if (!read && reminds) {
    const today = scheduleFromWords(`today ${own}`, askedAt, timeZone);
    read = today && nextRun(today.schedule, askedAt) !== null ? today : scheduleFromWords(`tomorrow ${own}`, askedAt, timeZone);
  }
  if (!read) return null;

  // The schedule must be the person's request, not part of a thing they describe.
  const at = SCHEDULE_AT.exec(lower);
  if (at && DESCRIBES.test(lower.slice(0, at.index))) return null;

  const once = read.schedule.repeat.kind === "once";
  if (once) {
    // A single day is offered only for a reminder: "tell me the weather tomorrow" is a question about tomorrow.
    if (!reminds) return null;
  } else {
    const starts = STARTS_WITH_SCHEDULE.test(lower);
    const wants = WANT.test(lower);
    if (!(reminds || SEND.test(lower) || TASK_START.test(lower) || wants || starts)) return null;
    if (!reminds) {
      if (QUESTION_START.test(lower) || SINHALA_QUESTION_END.test(lower)) return null;
      if (STATEMENT_START.test(lower) && !wants) return null;
      // "Every morning I wake up tired": the schedule leads, and a statement follows it.
      if (starts && SCHEDULE_THEN_A_STATEMENT.test(lower) && !SEND.test(lower)) return null;
    }
  }
  // A time already past can't be scheduled.
  if (nextRun(read.schedule, now) === null) return null;
  return { schedule: read.schedule, sentence: describeSchedule(read.schedule), timeAssumed: read.timeAssumed, hourAssumed: read.hourAssumed };
}

/** Two instructions that are the same task: compared without regard to spacing or capitals. */
export function sameInstruction(a: string, b: string): boolean {
  const flat = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return flat(a) === flat(b) && flat(a).length > 0;
}

/** Where a request waits, in this browser only, when it is carried from Chat to the Scheduled page to be changed before saving. */
export const SCHEDULE_PROMPT_KEY = "farbaek.schedule-prompt";
/** A carried request that wasn't picked up within this long is dropped: it was for a visit that never happened. */
export const SCHEDULE_PROMPT_MINUTES = 10;
