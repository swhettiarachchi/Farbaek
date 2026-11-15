/**
 * The field book (stage 194): points worked out from bearings and distances,
 * as a surveyor types them from a field book or a deed, the way CAD takes
 * polar input ("@25.40<45°30'") or a traverse editor does. Sri Lankan field
 * books record each leg as point, horizontal distance, bearing and
 * description (DSR Chapter XXII, §22.2.2).
 *
 * The text the entry table writes, and the source Farbaek stores:
 *   start,<point>,<northing>,<easting>       a known starting point (optional
 *                                            when the leg starts at a point
 *                                            already in the project)
 *   leg,<from>,<to>,<bearing>,<distance>,<code>
 * Bearings are whole-circle from grid north in DMS or decimal degrees, or
 * quadrant ("N 45 30 00 E"), read by the tested parser. Distances are
 * horizontal metres. A leg from any known point works: a traverse, or side
 * shots radiating from a station.
 *
 * A leg that ends on a point already known is a check, not a new point: its
 * misclosure is reported (and its ratio over the legs run so far), never
 * adjusted away. Adjusting a traverse needs the surveyor's authorisation and
 * a chosen method (survey skill, rule 7), so the coordinates are unadjusted
 * and say so. Heights aren't computed.
 */
import { parseBearing, deltasFromBearing } from "../angles";
import { codeProblem, finishPoints, guardFile, numberedLines, pointIdProblem } from "./common";
import { readNumber, type ImportedPoint, type ImportIssue } from "./delimited";

export const FIELDBOOK_HEADER = "# Farbaek field book: bearings and distances, unadjusted";
export const FIELDBOOK_ENGINE = "fieldbook/1.0.0";

export function looksLikeFieldBook(text: string): boolean {
  if (text.trimStart().startsWith(FIELDBOOK_HEADER)) return true;
  const first = numberedLines(text).map((l) => l.text.trim()).find((t) => t !== "" && !t.startsWith("#"));
  return /^(?:start|leg)\s*,/i.test(first ?? "");
}

export interface FieldBookCheck {
  line: number;
  /** The known point the leg closes on. */
  on: string;
  dE: number;
  dN: number;
  linear: number;
  /** Length of the legs run so far, and 1 : length ÷ misclosure (null when it closes exactly). */
  length: number;
  ratio: number | null;
}

export interface FieldBookRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  checks: FieldBookCheck[];
}

/** Splits a field-book line on commas; a code may hold anything after the fifth comma. */
const cells = (t: string) => t.split(",").map((c) => c.trim());

/**
 * Reads a field book. `known` are the project's points (by number), which legs may start from or close on; the starting point is
 * imported only when it isn't one of them.
 */
export function parseFieldBook(text: string, known: readonly { pointId: string; e: number; n: number }[] = []): FieldBookRead {
  const guard = guardFile(text, "This isn't a text field book.");
  if (guard) return { points: [], issues: [guard], checks: [] };
  const issues: ImportIssue[] = [];
  const checks: FieldBookCheck[] = [];
  const at = new Map<string, { e: number; n: number; imported: boolean }>(known.map((p) => [p.pointId, { e: p.e, n: p.n, imported: false }]));
  const read: ImportedPoint[] = [];
  let length = 0;
  let legs = 0;
  for (const { line, text: raw } of numberedLines(text)) {
    const t = raw.trim();
    if (!t || t.startsWith("#")) continue;
    const c = cells(t);
    const kind = c[0]!.toLowerCase();
    if (kind === "start") {
      const [, id = "", nText = "", eText = ""] = c;
      const problem = pointIdProblem(id);
      const n = readNumber(nText);
      const e = readNumber(eText);
      if (problem || n === null || e === null) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}: a starting point needs a number, a northing and an easting${problem ? `; it ${problem}` : ""}.` });
        continue;
      }
      const existing = at.get(id);
      if (existing && (existing.e !== e || existing.n !== n)) {
        issues.push({ code: "DUPLICATE_POINT_CONFLICT", severity: "error", line, message: `Line ${line}: point ${id} is already known at other coordinates. Start from it as it is, or give the new point another number.` });
        continue;
      }
      if (!existing) {
        at.set(id, { e, n, imported: true });
        read.push({ line, pointId: id, e, n, z: null, code: null });
      }
      continue;
    }
    if (kind !== "leg") {
      issues.push({ code: "WRONG_COLUMN_COUNT", severity: "error", line, message: `Line ${line} isn't a "start" or a "leg" line.` });
      continue;
    }
    const [, from = "", to = "", bearingText = "", distText = "", ...rest] = c;
    const code = rest.join(",").trim() || null;
    const origin = at.get(from);
    if (!origin) {
      issues.push({ code: "MISSING_COORDINATE", severity: "error", line, message: `Line ${line}: the leg starts at point ${from || "(none)"}, which isn't known yet. Start from a point in the project, a starting point, or a point an earlier leg reached.` });
      continue;
    }
    const toProblem = pointIdProblem(to);
    if (toProblem) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line}: the leg's end ${toProblem}.` });
      continue;
    }
    const bearing = parseBearing(bearingText);
    if (!bearing) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}: the bearing "${bearingText}" isn't one Farbaek reads for certain. Write it as 45 30 00, 45°30'00", 45.5 or N 45 30 00 E.` });
      continue;
    }
    const distance = readNumber(distText);
    if (distance === null || !(distance > 0)) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}: the distance "${distText}" isn't a horizontal distance in metres above zero.` });
      continue;
    }
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}: the leg ${cp}.` });
      continue;
    }
    const { dE, dN } = deltasFromBearing(bearing.degrees, distance);
    // Full precision: rounding is for the sheet and the exports (survey skill, rule 10).
    const e = origin.e + dE;
    const n = origin.n + dN;
    length += distance;
    legs++;
    const target = at.get(to);
    if (target) {
      // A leg onto a known point is a check: how far the computed end falls from it.
      const mE = e - target.e;
      const mN = n - target.n;
      const linear = Math.hypot(mE, mN);
      checks.push({ line, on: to, dE: mE, dN: mN, linear, length, ratio: linear < 1e-9 ? null : length / linear });
      continue;
    }
    at.set(to, { e, n, imported: true });
    read.push({ line, pointId: to, e, n, z: null, code });
  }
  if (legs === 0 && issues.length === 0) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "The field book has no legs." }], checks };
  for (const k of checks) {
    issues.push({
      code: "CLOSURE",
      severity: "warning",
      line: k.line,
      message: k.ratio === null ? `Line ${k.line}: the legs close on point ${k.on} exactly.` : `Line ${k.line}: the legs close on point ${k.on} ${(k.linear * 1000).toFixed(k.linear < 0.0095 ? 1 : 0)} mm out (1 in ${Math.round(k.ratio).toLocaleString("en-GB")} over ${k.length.toFixed(2)} m). The coordinates are unadjusted.`,
    });
  }
  return { ...finishPoints(read, issues), checks };
}

/** The text the entry table writes: a header, the start, then one leg per row. */
export function fieldBookText(start: { pointId: string; n: string; e: string } | null, legs: readonly { from: string; to: string; bearing: string; distance: string; code: string }[]): string {
  const clean = (s: string) => s.replace(/[\r\n,]/g, " ").trim();
  return [FIELDBOOK_HEADER, ...(start && start.pointId.trim() ? [`start,${clean(start.pointId)},${clean(start.n)},${clean(start.e)}`] : []), ...legs.filter((l) => l.to.trim() || l.bearing.trim() || l.distance.trim()).map((l) => `leg,${clean(l.from)},${clean(l.to)},${clean(l.bearing)},${clean(l.distance)},${clean(l.code)}`)].join("\n");
}
