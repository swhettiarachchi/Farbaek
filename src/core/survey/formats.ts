/**
 * How Sri Lankan plans write their numbers and lists
 * (docs/survey/REFERENCE_PLANS_ANALYSIS.md, "Formats"). Presentation only:
 * every value is computed elsewhere at full precision and rounded here once,
 * half away from zero (survey skill, rule 10).
 */
import { HECTARE_M2, fmt, roundTo, type Arp } from "./units";

/** The international foot, exactly. */
export const FOOT_M = 0.3048;

/** Hectares to five decimals, as plans state them: "0.21398". */
export function hectares(m2: number, decimals = 5): string {
  return roundTo(m2 / HECTARE_M2, decimals).toFixed(decimals);
}

/** Acres, roods and perches as the classic sheet writes them: "0 A. 2 R. 04.60 P.", perches zero-padded to two whole digits. */
export function arpClassic(arp: Arp): string {
  const [whole, frac] = arp.perches.toFixed(arp.perchDecimals).split(".");
  return `${arp.acres} A. ${arp.roods} R. ${whole!.padStart(2, "0")}${frac ? `.${frac}` : ""} P.`;
}

/** A date typed as yyyy-mm-dd written dd.mm.yyyy; anything else as typed. */
export function dotDate(value: string): string {
  const v = value.trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : v;
}

const ONES = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 1 to 99 in words: "fourteen", "twenty-one". */
export function inWords(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 99) throw new RangeError("Counts in words run from 1 to 99.");
  if (n < 20) return ONES[n]!;
  const t = TENS[Math.floor(n / 10)]!;
  return n % 10 ? `${t}-${ONES[n % 10]}` : t;
}

/** "three (03)", the count as plans write it. */
export function countPhrase(n: number): string {
  return `${inWords(n)} (${String(n).padStart(2, "0")})`;
}

/** "a, b & c": the last pair joined with an ampersand, as plans list lots. */
export function andList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} & ${items[items.length - 1]}`;
}

/** A road width range from metres, as plans write it: "(14.5ft - 15ft wide)", or "(12ft. wide)" when both ends round alike. Feet to the half foot. */
export function roadWidthText(minM: number, maxM: number, unit: "feet" | "metres"): string {
  if (unit === "metres") {
    const a = fmt(minM, 1);
    const b = fmt(maxM, 1);
    return a === b ? `(${a}m. wide)` : `(${a}m - ${b}m wide)`;
  }
  const half = (m: number) => roundTo((m / FOOT_M) * 2, 0) / 2;
  const ft = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  const a = half(minM);
  const b = half(maxM);
  return a === b ? `(${ft(a)}ft. wide)` : `(${ft(a)}ft - ${ft(b)}ft wide)`;
}
