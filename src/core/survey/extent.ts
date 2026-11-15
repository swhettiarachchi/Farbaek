/**
 * A stated extent, as a deed or an earlier plan writes it, read as a number
 * so it can be set beside the land the engine computed (stage 192, survey
 * skill rule 5: a stated extent and a computed area are different numbers,
 * kept apart). This only parses what's written, in the units it names, and
 * it's strict: every number must pair with a unit, nothing may be left over,
 * and anything ambiguous ("0-2-04.60", "0,21398 ha", "about half an acre") is
 * unread, never guessed.
 *
 * Units, from the international yard (units.ts): 1 perch = 25.29285264 m²,
 * 40 perches = 1 rood, 4 roods = 1 acre; 1 hectare = 10,000 m².
 */
import { ACRE_M2, HECTARE_M2, PERCH_M2, ROOD_M2 } from "./units";

export type StatedUnit = "arp" | "ha" | "acre" | "perch" | "m2";

export interface StatedExtent {
  m2: number;
  /** The units it was written in, so the difference is shown in the same. */
  as: StatedUnit;
}

type Unit = "A" | "R" | "P" | "HA" | "M2";
type Token = { num: number } | { unit: Unit } | { bad: true };

const UNITS: Record<string, Unit> = {
  a: "A",
  ac: "A",
  acre: "A",
  acres: "A",
  r: "R",
  rd: "R",
  rds: "R",
  rood: "R",
  roods: "R",
  p: "P",
  per: "P",
  perch: "P",
  perches: "P",
  ha: "HA",
  hect: "HA",
  hectare: "HA",
  hectares: "HA",
  sqm: "M2",
};
const IGNORED = new Set(["and"]);

/** One plain number: 4.60, 2,267.41 (thousands only in groups of three), 10 1/2. Anything else (a decimal comma) is bad. */
function number(raw: string): number | null {
  const m = /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/.exec(raw);
  if (!m) return null;
  return Number(`${m[1]!.replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`);
}

function tokens(text: string): Token[] {
  const t = text
    .replace(/½/g, " 1/2")
    .replace(/¼/g, " 1/4")
    .replace(/¾/g, " 3/4")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/square\s+met(?:re|er)s?|sq\.?\s*m(?:etres?|eters?)?\b|m²|m2\b/g, " sqm ");
  const out: Token[] = [];
  const re = /(\d[\d,]*(?:\.\d+)?)(?:\s+(\d+)\/(\d+))?|(\d+)\/(\d+)|([a-z]+)|([^\s.:;,&()\-–])/g;
  for (const m of t.matchAll(re)) {
    if (m[1] !== undefined) {
      const whole = number(m[1]);
      if (whole === null) return [{ bad: true }];
      out.push({ num: whole + (m[2] !== undefined ? Number(m[2]) / Number(m[3]) : 0) });
    } else if (m[4] !== undefined) out.push({ num: Number(m[4]) / Number(m[5]) });
    else if (m[6] !== undefined) {
      if (IGNORED.has(m[6])) continue;
      const u = UNITS[m[6]];
      out.push(u ? { unit: u } : { bad: true });
    } else out.push({ bad: true });
  }
  return out;
}

/** Pairs of number and unit from tokens that alternate strictly, numbers first or units first; null if they don't. */
function pairs(ts: Token[]): [Unit, number][] | null {
  if (ts.length === 0 || ts.length % 2 !== 0 || ts.some((t) => "bad" in t)) return null;
  const unitFirst = "unit" in ts[0]!;
  const out: [Unit, number][] = [];
  for (let i = 0; i < ts.length; i += 2) {
    const [x, y] = unitFirst ? [ts[i + 1]!, ts[i]!] : [ts[i]!, ts[i + 1]!];
    if (!("num" in x) || !("unit" in y)) return null;
    out.push([y.unit, x.num]);
  }
  return out;
}

/** One reading of one stretch of text, or null. */
function readOne(text: string): StatedExtent | null {
  const p = pairs(tokens(text));
  if (!p) return null;
  const units = p.map(([u]) => u);
  if (new Set(units).size !== units.length) return null;
  const v = Object.fromEntries(p) as Partial<Record<Unit, number>>;
  if (units.every((u) => u === "A" || u === "R" || u === "P")) {
    // In the written order acres, roods, perches; roods under 4 and perches under 40 when a larger unit is given.
    const order = units.map((u) => "ARP".indexOf(u));
    if (order.some((o, i) => i > 0 && o <= order[i - 1]!)) return null;
    if (units.length === 1) {
      const [u] = units;
      if (u === "A") return { m2: v.A! * ACRE_M2, as: "acre" };
      if (u === "P") return { m2: v.P! * PERCH_M2, as: "perch" };
      return { m2: v.R! * ROOD_M2, as: "arp" };
    }
    if ((v.A !== undefined && (v.R ?? 0) >= 4) || ((v.A !== undefined || v.R !== undefined) && (v.P ?? 0) >= 40)) return null;
    return { m2: (v.A ?? 0) * ACRE_M2 + (v.R ?? 0) * ROOD_M2 + (v.P ?? 0) * PERCH_M2, as: "arp" };
  }
  if (units.length !== 1) return null;
  if (units[0] === "HA") return { m2: v.HA! * HECTARE_M2, as: "ha" };
  return { m2: v.M2!, as: "m2" };
}

/**
 * Reads "0 A. 2 R. 04.60 P.", "A. 0 R. 2 P. 04.60", "1 Acre, 2 Roods and 10
 * Perches", "10½ perches", "0.21398 Hectares", "2,267 m²". A text giving the
 * same extent two ways, one in brackets ("0.21398 Hectares ( 0 A. 2 R.
 * 04.60 P. )"), is read by its acres, roods and perches if the two agree
 * within 0.5%, and is unread if they don't.
 */
export function readStatedExtent(text: string): StatedExtent | null {
  const t = text.trim();
  if (!t) return null;
  const parts = t.split(/[()]/).map((s) => s.trim()).filter(Boolean);
  if (parts.length === 1) return readOne(parts[0]!);
  const readings = parts.map(readOne);
  if (readings.some((r) => r === null)) return null;
  const rs = readings as StatedExtent[];
  const first = rs[0]!;
  if (rs.some((r) => Math.abs(r.m2 - first.m2) > first.m2 * 0.005)) return null;
  return rs.find((r) => r.as === "arp") ?? first;
}
