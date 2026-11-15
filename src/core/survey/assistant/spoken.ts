/**
 * Reading values from the surveyor's own words (stage 195, ADR 0210). The
 * model never writes a number: it points at the words, and these readers turn
 * them into values. A reader returns null rather than guess, and the
 * assistant then asks.
 *
 * Speech recognisers write numbers unpredictably: as digits ("25.4"), as
 * words ("twenty five point four"), digit by digit ("four five zero zero one
 * two") or mixed ("25 point 4"). Every form is read here, by fixed rules:
 * - Single digits in a row are one number, digit by digit, unless the reader
 *   expects a list (point numbers), where each is its own item.
 * - Tens, teens, hundreds, thousands and lakhs make one number the usual way
 *   ("two lakh fifty thousand twelve" is 250012). A run that mixes the two
 *   ("four fifty thousand") is refused.
 * - "point", "decimal" and "dot" mark the decimal point; what follows is read
 *   digit by digit ("point four five" is .45; "point forty five" too).
 * - "oh" and "nought" are zero only inside a number. "to", "too", "for" and
 *   "won" are never read as digits: "points one to five" is a range.
 *
 * Read-backs for speech go the other way: digit by digit, "decimal" for the
 * point, as aviation reads figures back.
 */
import { parseBearing, type ParsedBearing } from "../angles";

const UNITS: Record<string, number> = { zero: 0, oh: 0, nought: 0, naught: 0, nil: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TEENS: Record<string, number> = { ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS: Record<string, number> = { twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const SCALES: Record<string, number> = { hundred: 100, thousand: 1_000, lakh: 100_000, lakhs: 100_000, lac: 100_000, million: 1_000_000 };
const POINT_WORDS = new Set(["point", "decimal", "dot"]);
const REPEAT: Record<string, number> = { double: 2, triple: 3 };

type Tok = { kind: "digits"; text: string } | { kind: "unit"; n: number; zeroWord: boolean } | { kind: "teen"; n: number } | { kind: "tens"; n: number } | { kind: "scale"; n: number } | { kind: "point" } | { kind: "and" } | { kind: "repeat"; n: number } | { kind: "minus" } | { kind: "word"; text: string };

/** Words as tokens: "twenty-five" splits, "25.4" stays whole, a trailing full stop or comma goes. */
function tokens(text: string): Tok[] {
  const words = text
    .normalize("NFKC")
    .replace(/(\d),(?=\d{3}\b)/g, "$1") // thousands separators in digits: 450,012.345
    .replace(/[‐-―−]/g, "-")
    // A comma or semicolon ends a number: "lot B one, 25.4 metres" is two.
    .replace(/[,;]/g, " , ")
    .split(/\s+|(?<=[a-z])-(?=[a-z])/i)
    .map((w) => w.replace(/^[("'“‘[]+|[)"'”’\].!?:]+$/g, ""))
    .filter(Boolean);
  return words.map((raw): Tok => {
    const w = raw.toLowerCase();
    if (/^\d+(?:\.\d+)?$/.test(w)) return { kind: "digits", text: w };
    if (w in UNITS) return { kind: "unit", n: UNITS[w]!, zeroWord: UNITS[w] === 0 };
    if (w in TEENS) return { kind: "teen", n: TEENS[w]! };
    if (w in TENS) return { kind: "tens", n: TENS[w]! };
    if (w in SCALES) return { kind: "scale", n: SCALES[w]! };
    if (POINT_WORDS.has(w)) return { kind: "point" };
    if (w === "and") return { kind: "and" };
    if (w in REPEAT) return { kind: "repeat", n: REPEAT[w]! };
    if (w === "minus" || w === "negative") return { kind: "minus" };
    return { kind: "word", text: raw };
  });
}

const isNumberTok = (t: Tok) => t.kind === "digits" || t.kind === "unit" || t.kind === "teen" || t.kind === "tens" || t.kind === "scale" || t.kind === "repeat";

/** "oh" and "nought" are zero only beside other number words; alone they're words ("oh, and lot B"). */
function settleZeroWords(toks: Tok[]): Tok[] {
  return toks.map((t, i) => {
    if (t.kind !== "unit" || !t.zeroWord) return t;
    const near = [toks[i - 1], toks[i + 1]].some((n) => n && (isNumberTok(n) || n.kind === "point"));
    return near ? t : { kind: "word", text: "oh" };
  });
}

/** The digits of a run of single digits (with "double five" as 55), or null when the run isn't only single digits. */
function digitRun(run: readonly Tok[]): string | null {
  let out = "";
  for (let i = 0; i < run.length; i++) {
    const t = run[i]!;
    if (t.kind === "repeat") {
      const next = run[i + 1];
      if (next?.kind !== "unit") return null;
      out += String(next.n).repeat(t.n);
      i++;
    } else if (t.kind === "unit") out += String(t.n);
    else if (t.kind === "digits" && /^\d$/.test(t.text)) out += t.text;
    else return null;
  }
  return out === "" ? null : out;
}

/** The value of a run of cardinal words ("two lakh fifty thousand and twelve"), or null when it doesn't read one way only. */
function cardinal(run: readonly Tok[]): number | null {
  let total = 0;
  let group = 0;
  let last: Tok["kind"] | null = null;
  let lastScale = Infinity;
  let any = false;
  for (const t of run) {
    if (t.kind === "and") {
      if (last !== "scale") return null;
      continue;
    }
    if (t.kind === "unit") {
      if (last === "unit" || last === "teen" || (t.n === 0 && (any || run.length > 1))) return null;
      group += t.n;
    } else if (t.kind === "teen") {
      if (last === "unit" || last === "teen" || last === "tens") return null;
      group += t.n;
    } else if (t.kind === "tens") {
      if (last === "unit" || last === "teen" || last === "tens") return null;
      group += t.n;
    } else if (t.kind === "scale") {
      if (t.n === 100) {
        if (group >= 100) return null;
        group = (group || 1) * 100;
      } else {
        if (t.n >= lastScale) return null;
        total += (group || 1) * t.n;
        group = 0;
        lastScale = t.n;
      }
    } else if (t.kind === "digits") {
      // Digits inside words ("2 lakh") count as a group's value.
      if (last !== null && last !== "scale") return null;
      const n = Number(t.text);
      if (!Number.isInteger(n)) return null;
      group += n;
    } else return null;
    last = t.kind;
    any = true;
  }
  return any ? total + group : null;
}

/** A whole number from a run: digits, digit by digit, or cardinal words; never a mix of the last two. */
function integerOf(run: readonly Tok[]): string | null {
  if (run.length === 1 && run[0]!.kind === "digits" && /^\d+$/.test(run[0]!.text)) return run[0]!.text;
  const digits = digitRun(run);
  if (digits !== null) return digits;
  const n = cardinal(run);
  return n === null ? null : String(n);
}

/** The digits after a decimal point: digit by digit, or one cardinal group ("point forty five" is .45). */
function fractionOf(run: readonly Tok[]): string | null {
  if (run.length === 1 && run[0]!.kind === "digits" && /^\d+$/.test(run[0]!.text)) return run[0]!.text;
  const digits = digitRun(run);
  if (digits !== null) return digits;
  const n = cardinal(run);
  return n === null || n >= 1000 ? null : String(n);
}

export interface ReadNumber {
  /** The number exactly as said, as decimal text ("450012.345", "-0.5"). */
  text: string;
  value: number;
}

/** Splits tokens into runs of number words, keeping each run's tokens. */
function numberRuns(toks: Tok[]): Tok[][] {
  const runs: Tok[][] = [];
  let cur: Tok[] = [];
  const flush = () => {
    // A run can't end on "and" or a decimal point.
    while (cur.length && (cur[cur.length - 1]!.kind === "and" || cur[cur.length - 1]!.kind === "point" || cur[cur.length - 1]!.kind === "minus")) cur.pop();
    if (cur.some(isNumberTok)) runs.push(cur);
    cur = [];
  };
  toks.forEach((t, i) => {
    const prev = cur[cur.length - 1];
    if (isNumberTok(t)) cur.push(t);
    else if (t.kind === "point" && prev && isNumberTok(prev) && toks[i + 1] && isNumberTok(toks[i + 1]!)) cur.push(t);
    else if (t.kind === "and" && prev?.kind === "scale") cur.push(t);
    else if (t.kind === "minus" && toks[i + 1] && isNumberTok(toks[i + 1]!)) {
      flush();
      cur.push(t);
    } else flush();
  });
  flush();
  return runs;
}

/** One number read from a run of tokens, or null. */
function numberOfRun(run: readonly Tok[]): ReadNumber | null {
  let sign = "";
  let r = run;
  if (r[0]?.kind === "minus") {
    sign = "-";
    r = r.slice(1);
  }
  const p = r.findIndex((t) => t.kind === "point");
  // "25.4" as one token.
  if (p < 0 && r.length === 1 && r[0]!.kind === "digits") {
    const text = `${sign}${r[0]!.text}`;
    return { text, value: Number(text) };
  }
  const intPart = integerOf(p < 0 ? r : r.slice(0, p));
  if (intPart === null) return null;
  if (p < 0) return { text: `${sign}${intPart}`, value: Number(`${sign}${intPart}`) };
  const frac = fractionOf(r.slice(p + 1));
  if (frac === null) return null;
  const text = `${sign}${intPart}.${frac}`;
  return { text, value: Number(text) };
}

/** Every number said in the text, in order. A run that doesn't read one way only is left out. */
export function numbersIn(text: string): ReadNumber[] {
  return numberRuns(settleZeroWords(tokens(text)))
    .map(numberOfRun)
    .filter((n): n is ReadNumber => n !== null);
}

/** The one number said in the text, or null when there's none, more than one, or a run that doesn't read one way. */
export function readNumber(text: string): ReadNumber | null {
  const runs = numberRuns(settleZeroWords(tokens(text)));
  if (runs.length !== 1) return null;
  return numberOfRun(runs[0]!);
}

/** A count from 1 to `max` ("four lots", "4"). */
export function readCount(text: string, max = 50): number | null {
  const n = readNumber(text);
  return n && Number.isInteger(n.value) && n.value >= 1 && n.value <= max ? n.value : null;
}

const RANGE_WORDS = new Set(["to", "through", "thru", "till", "until", "-"]);
const LIST_FILLER = new Set(["point", "points", "corner", "corners", "number", "numbers", "no", "no.", "nos", "from", "and", "then", "with", "using", "the", "at", "via", "pt", "pts", "station", "stations"]);

export interface PointList {
  /** The point numbers, in the order said. */
  ids: string[];
  /** Items said that aren't points of the project. */
  unknown: string[];
}

/**
 * A list of point numbers from the words: "points 1, 2, 3 and 4", "one two three four", "1 to 5", "from 101 through 104", "A110 A111".
 * Each single digit is its own item here. A range runs over whole numbers and must lie within `known`; at most 500 items.
 */
export function readPointList(text: string, known: ReadonlySet<string>): PointList | null {
  const raw = text
    .normalize("NFKC")
    .replace(/[‐-―−]/g, "-")
    .replace(/(\w)-(\w)/g, "$1 - $2")
    .split(/[\s,;]+/)
    .map((w) => w.replace(/^[("'“‘[]+|[)"'”’\].!?:]+$/g, ""))
    .filter(Boolean);
  const items: string[] = [];
  const unknown: string[] = [];
  let pendingRange = false;
  const lookup = (id: string) => (known.has(id) ? id : ([...known].find((k) => k.toLowerCase() === id.toLowerCase()) ?? null));
  const push = (id: string) => {
    if (pendingRange) {
      pendingRange = false;
      const from = items[items.length - 1];
      if (from === undefined || !/^\d+$/.test(from) || !/^\d+$/.test(id)) return false;
      const [a, b] = [Number(from), Number(id)];
      if (b <= a || b - a > 500) return false;
      for (let n = a + 1; n <= b; n++) {
        const k = lookup(String(n));
        if (k) items.push(k);
        else unknown.push(String(n));
      }
      return true;
    }
    const k = lookup(id);
    if (k) items.push(k);
    else unknown.push(id);
    return true;
  };
  // Number words become items: single digits each on their own, "twenty one" and "one hundred and five" as one.
  for (let i = 0; i < raw.length; i++) {
    const w = raw[i]!;
    const lw = w.toLowerCase();
    if (RANGE_WORDS.has(lw)) {
      if (items.length === 0 && unknown.length === 0) return null;
      pendingRange = true;
      continue;
    }
    if (LIST_FILLER.has(lw)) continue;
    const t = tokens(w)[0];
    if (t && (t.kind === "tens" || t.kind === "teen" || t.kind === "scale" || (t.kind === "unit" && !t.zeroWord) || t.kind === "repeat")) {
      // Gather a cardinal group: tens + unit, or a chain with hundred/thousand.
      const group: Tok[] = [t];
      let j = i + 1;
      while (j < raw.length) {
        const n = tokens(raw[j]!)[0];
        if (!n) break;
        const prev = group[group.length - 1]!;
        const joins = (prev.kind === "tens" && n.kind === "unit" && !n.zeroWord) || n.kind === "scale" || (n.kind === "and" && prev.kind === "scale") || (prev.kind === "scale" && (n.kind === "unit" || n.kind === "teen" || n.kind === "tens")) || (prev.kind === "and" && (n.kind === "unit" || n.kind === "teen" || n.kind === "tens"));
        if (!joins) break;
        group.push(n);
        j++;
      }
      if (t.kind === "repeat") return null;
      const v = cardinal(group);
      if (v === null) return null;
      if (!push(String(v))) return null;
      i = j - 1;
      continue;
    }
    if (t && t.kind === "unit" && t.zeroWord) {
      if (!push("0")) return null;
      continue;
    }
    if (!push(w)) return null;
  }
  if (pendingRange) return null;
  if (items.length + unknown.length === 0 || items.length > 500) return null;
  return { ids: items, unknown };
}

const SUP_WORDS: Record<string, string> = { ...Object.fromEntries(Object.entries(UNITS).filter(([, n]) => n > 0).map(([w, n]) => [w, String(n)])), ...Object.fromEntries(Object.entries(TEENS).map(([w, n]) => [w, String(n)])) };

/**
 * A lot's name from the words: "lot B1", "lot B one", "lot B superscript 1", "lot 4A", "lot four A", "lot 2". A letter or number then
 * a short suffix is label and superscript (B¹, 4ᴬ), as the plans write them.
 */
export function readLotName(text: string): { label: string; sup: string } | null {
  const words = text
    .normalize("NFKC")
    .replace(/\b(lots?|allotments?|no\.?|number|superscript|sup)\b/gi, " ")
    .split(/[\s,;.]+/)
    .filter(Boolean);
  if (words.length === 0 || words.length > 3) return null;
  const part = (w: string) => SUP_WORDS[w.toLowerCase()] ?? (/^[A-Za-z]$/.test(w) ? w.toUpperCase() : /^\d{1,3}$/.test(w) ? w : /^[A-Za-z]{1,2}\d{1,3}$|^\d{1,3}[A-Za-z]{1,2}$/.test(w) ? w.toUpperCase() : null);
  const parts = words.map(part);
  if (parts.some((p) => p === null)) return null;
  const joined = (parts as string[]).join("");
  const m = /^([A-Z]{1,2}|\d{1,3})([A-Z]{1,2}|\d{1,3})?$/.exec(joined);
  if (!m) return null;
  return { label: m[1]!, sup: m[2] ?? "" };
}

/**
 * Splits a run of number words into whole numbers by their structure, for values said one after another without a word between:
 * "forty five thirty fifteen" is 45, 30 and 15; "three hundred fifteen forty five" is 315 and 45; "ninety zero zero" is 90, 0 and 0.
 * A run of single digits stays one number, digit by digit ("four five" is 45).
 */
function cardinalGroups(run: readonly Tok[]): Tok[][] {
  if (digitRun(run) !== null && !run.some((t) => t.kind === "unit" && t.zeroWord && run.length > 1 && run.every((x) => x.kind === "unit" && x.zeroWord))) return [[...run]];
  const groups: Tok[][] = [];
  let cur: Tok[] = [];
  for (const t of run) {
    const last = cur[cur.length - 1];
    const zero = (x: Tok | undefined) => x?.kind === "unit" && x.zeroWord;
    const starts =
      last !== undefined &&
      (zero(t) ||
        zero(last) ||
        t.kind === "digits" ||
        last.kind === "digits" ||
        ((t.kind === "tens" || t.kind === "teen") && (last.kind === "unit" || last.kind === "teen" || last.kind === "tens")) ||
        (t.kind === "unit" && (last.kind === "unit" || last.kind === "teen")));
    if (starts) {
      groups.push(cur);
      cur = [];
    }
    cur.push(t);
  }
  if (cur.length) groups.push(cur);
  return groups;
}

/**
 * A bearing's parts as digits, from the words: "45 30 15", "forty five degrees thirty minutes fifteen seconds", "forty five thirty
 * fifteen", "N 45 30 E", "north forty five east". Null when a part doesn't read, or there are more than three.
 */
export function bearingParts(text: string): { quadrant: [string, string] | null; parts: string[] } | null {
  const quadrant = /\b(north|south)\b(.*)\b(east|west)\b/i.exec(text);
  const inner = quadrant ? quadrant[2]! : text;
  // The marks and the words degrees, minutes and seconds end a part; so does each number written in digits.
  const toks = settleZeroWords(tokens(inner.replace(/[°'"′″]/g, " , ")));
  const groups: Tok[][] = [];
  let cur: Tok[] = [];
  const end = () => {
    if (cur.length) groups.push(...cardinalGroups(cur));
    cur = [];
  };
  for (const t of toks) {
    if (t.kind === "digits") {
      end();
      groups.push([t]);
    } else if (t.kind === "word") end();
    else cur.push(t);
  }
  end();
  // Each part (degrees, minutes, seconds) is one whole number.
  const parts: string[] = [];
  for (const g of groups) {
    const n = numberOfRun(g);
    if (!n) return null;
    parts.push(n.text);
  }
  if (parts.length === 0 || parts.length > 3) return null;
  return { quadrant: quadrant ? [quadrant[1]![0]!.toUpperCase(), quadrant[3]![0]!.toUpperCase()] : null, parts };
}

/** The bearing as digits ("45 30 15", "N 45 30 E"), as the typed tables take it, or null. */
export function bearingText(text: string): string | null {
  const b = bearingParts(text);
  if (!b) return null;
  const body = b.parts.join(" ");
  return b.quadrant ? `${b.quadrant[0]} ${body} ${b.quadrant[1]}` : body;
}

/** A bearing from the words, read by the tested bearing parser (angles.ts) once the numbers are digits. */
export function readBearing(text: string): ParsedBearing | null {
  const t = bearingText(text);
  return t === null ? null : parseBearing(t);
}

/** A drawing scale: "1:500", "1/500", "one to five hundred", "1 in 500", "scale 500"; "automatic" is null. Only 50 to 100,000. */
export function readScale(text: string): { scale: number | null } | null {
  if (/\b(auto|automatic|automatically|best)\b/i.test(text)) return { scale: null };
  const t = text.replace(/\bscale\b/gi, " ");
  const ratio = /(?:^|\s)(\S+(?:\s+\S+)*?)\s*(?::|\/|\bto\b|\bin\b)\s*(.+)$/i.exec(t.trim());
  let n: number | null = null;
  if (ratio) {
    const one = readNumber(ratio[1]!);
    const den = readNumber(ratio[2]!);
    if (!one || one.value !== 1 || !den) return null;
    n = den.value;
  } else {
    const only = readNumber(t);
    n = only ? only.value : null;
  }
  return n !== null && Number.isInteger(n) && n >= 50 && n <= 100_000 ? { scale: n } : null;
}

/** A length with its unit: metres unless feet are said. */
export function readLength(text: string): { value: number; text: string; unit: "m" | "ft" } | null {
  const n = readNumber(text.replace(/\b(metres?|meters?|m|feet|foot|ft)\b/gi, " "));
  if (!n || !(n.value > 0)) return null;
  return { value: n.value, text: n.text, unit: /\b(feet|foot|ft)\b/i.test(text) ? "ft" : "m" };
}

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const ORDINALS: Record<string, number> = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10, eleventh: 11, twelfth: 12, thirteenth: 13, fourteenth: 14, fifteenth: 15, sixteenth: 16, seventeenth: 17, eighteenth: 18, nineteenth: 19, twentieth: 20, thirtieth: 30 };

/** A whole calendar date: "12.11.2026", "2026-11-12", "12 November 2026", "the twelfth of November twenty twenty six"; as yyyy-mm-dd. */
export function readDate(text: string): string | null {
  const t = text.trim().toLowerCase();
  const digits = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(t) ?? null;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  let y: number | null = null;
  let m: number | null = null;
  let d: number | null = null;
  if (digits) [d, m, y] = [Number(digits[1]), Number(digits[2]), Number(digits[3])];
  else if (iso) [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  else {
    const mi = MONTHS.findIndex((name) => new RegExp(`\\b${name}\\b|\\b${name.slice(0, 3)}\\b`).test(t));
    if (mi < 0) return null;
    m = mi + 1;
    const [before, after] = t.split(new RegExp(`\\b${MONTHS[mi]}\\b|\\b${MONTHS[mi]!.slice(0, 3)}\\b`));
    const dayText = /\d/.test(before ?? "") || /\b(first|second|third|\w+th|\w+st|\w+nd|\w+rd|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty)\b/.test(before ?? "") ? before! : (after ?? "").split(/,|\b(?:twenty|nineteen|two thousand)\b|\b\d{4}\b/)[0]!;
    d = dayOf(dayText);
    const yearText = dayText === before ? (after ?? "") : (after ?? "").slice(dayText.length);
    y = yearOf(yearText);
  }
  if (y === null || m === null || d === null || y < 1800 || y > 2200 || m < 1 || m > 12 || d < 1) return null;
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > days) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function dayOf(text: string): number | null {
  const t = text.replace(/\b(the|of|on)\b/g, " ").trim();
  const num = /^(\d{1,2})(?:st|nd|rd|th)?$/.exec(t);
  if (num) return Number(num[1]);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length === 1 && words[0]! in ORDINALS) return ORDINALS[words[0]!]!;
  if (words.length === 2 && words[0]! in TENS && words[1]! in ORDINALS) return TENS[words[0]!]! + ORDINALS[words[1]!]!;
  const n = readNumber(t);
  return n && Number.isInteger(n.value) ? n.value : null;
}

function yearOf(text: string): number | null {
  const t = text.replace(/[,.]/g, " ").trim();
  if (/^\d{4}$/.test(t)) return Number(t);
  // "twenty twenty six" is 2026: two cardinal pairs.
  const pair = /^(twenty|nineteen)\s+(.+)$/i.exec(t);
  if (pair) {
    const tail = readNumber(pair[2]!);
    if (tail && Number.isInteger(tail.value) && tail.value >= 0 && tail.value < 100) return (pair[1]!.toLowerCase() === "twenty" ? 2000 : 1900) + tail.value;
  }
  const n = readNumber(t);
  return n && Number.isInteger(n.value) ? n.value : null;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Read-backs: how a value is said back, so it can be checked by ear. The figures on screen are the record; this is an aid.

const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];

/** "450012.345" as "four five zero zero one two decimal three four five". */
export function speakDigits(text: string): string {
  return [...text]
    .map((c) => (c === "." ? "decimal" : c === "-" ? "minus" : /\d/.test(c) ? DIGIT_WORDS[Number(c)] : c))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

const SMALL = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS_WORDS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** A whole number from 0 to 999 in words ("three hundred and forty five"). */
export function cardinalWords(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 999) return speakDigits(String(n));
  if (n < 20) return SMALL[n]!;
  if (n < 100) return `${TENS_WORDS[Math.floor(n / 10)]}${n % 10 ? ` ${SMALL[n % 10]}` : ""}`;
  return `${SMALL[Math.floor(n / 100)]} hundred${n % 100 ? ` and ${cardinalWords(n % 100)}` : ""}`;
}

/** A whole-circle bearing as said: "forty five degrees, thirty minutes, fifteen seconds". */
export function speakBearing(d: number, m: number, s: number): string {
  return `${cardinalWords(d)} degrees, ${cardinalWords(m)} minutes, ${cardinalWords(Math.round(s))} seconds`;
}

/** Point numbers as said: digit by digit when longer than two digits, so "101" is "one zero one". */
export function speakPointNumbers(ids: readonly string[]): string {
  return ids.map((id) => (/^\d+$/.test(id) ? (id.length <= 2 ? cardinalWords(Number(id)) : speakDigits(id)) : [...id].map((c) => (/\d/.test(c) ? DIGIT_WORDS[Number(c)] : c.toUpperCase())).join(" "))).join(", ");
}

/** Where numbers are in the text, so the screen can mark them: [start, end) of each run of digits. */
export function numberSpans(text: string): [number, number][] {
  return [...text.matchAll(/-?\d+(?:[.,:/°'"′″]\d+)*/g)].map((m) => [m.index!, m.index! + m[0].length]);
}
