/**
 * Leica GSI files (GSI-8 and GSI-16), read strictly (stage 194). Each line is
 * a block of words; each word is a two-digit word index, four information
 * characters (the sixth is the unit), a sign, then 8 or 16 data characters.
 * GSI-16 lines may start with "*". Sources: Leica's GSI ONLINE guide and
 * Format Manager reference (research notes, "Survey instrument export
 * formats", leica_gsi.md).
 *
 * Read: the point number (WI 11), the target's easting, northing and height
 * (WI 81, 82, 83) or a station's (84, 85, 86), and a code given on the same
 * line (WI 71, the remark, or WI 41). Never guessed:
 * - a code line standing on its own (Leica doesn't tie it to a point);
 * - coordinates without a point number (word 11), or a word given twice on
 *   one line: the line is refused;
 * - a height alone (word 83 without 81 and 82): counted and left out;
 * - feet (Leica doesn't say international or US survey feet);
 * - raw angles and distances (WI 21, 22, 31): the file is refused with the
 *   reason, since Farbaek doesn't reduce observations;
 * - GSI-8 coordinates outside the project's grid: 8 digits can't hold a
 *   grid easting to the millimetre, so leading digits may have been cut.
 * Every problem is reported with its line; nothing is repaired.
 */
import type { CrsRecord } from "../crs";
import { codeProblem, finishPoints, guardFile, impliedDecimal, numberedLines, pointIdProblem } from "./common";
import type { ImportedPoint, ImportIssue } from "./delimited";

/** Decimals implied by the unit digit, for lengths: metres to 1 mm, 1/10 mm and 1/100 mm. Feet (1, 7) and angle units aren't lengths here. */
const METRE_DECIMALS: Record<string, number> = { "0": 3, "6": 4, "8": 5 };
const FEET = new Set(["1", "7"]);

const WORD = /^(\d{2})([0-9.]{4})([+-])(\S{8}|\S{16})$/;

export interface GsiRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  variant: "GSI-8" | "GSI-16" | "mixed" | null;
}

/** Whether text looks like GSI: its first few blocks are made only of GSI words. */
export function looksLikeGsi(text: string): boolean {
  const blocks = numberedLines(text)
    .map((l) => l.text.trim().replace(/^\*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
  return blocks.length > 0 && blocks.every((b) => b.split(/\s+/).every((w) => WORD.test(w)));
}

/** Strips the zero fill from a text word (point numbers, codes): "0000A110" is "A110", "00000000" is "0", "0000.125" is "0.125". */
const unfill = (data: string) => data.replace(/^0+(?=[^.])/, "");

export function parseGsi(text: string, crs: CrsRecord | null = null): GsiRead {
  const guard = guardFile(text, "This is a binary file, perhaps a Leica DBX job. Export the job from the instrument as GSI-16 or as ASCII with coordinates, then import that.");
  if (guard) return { points: [], issues: [guard], variant: null };
  const issues: ImportIssue[] = [];
  const read: ImportedPoint[] = [];
  let short = 0;
  let long = 0;
  // GSI-8 coordinate words only: point numbers and codes in 8 characters say nothing about cut coordinates.
  let shortCoords = 0;
  let rawLines = 0;
  let codeAlone = 0;
  let heightOnly = 0;
  for (const { line, text: raw } of numberedLines(text)) {
    const body = raw.trim().replace(/^\*/, "").trim();
    if (!body) continue;
    const words = body.split(/\s+/);
    const parsed: { wi: string; unit: string; sign: "+" | "-"; data: string }[] = [];
    let bad = false;
    for (const [k, w] of words.entries()) {
      const m = WORD.exec(w);
      if (!m) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, word ${k + 1} ("${w.slice(0, 24)}") isn't a GSI word of 15 or 23 characters.` });
        bad = true;
        break;
      }
      if (parsed.some((p) => p.wi === m[1])) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}: word ${m[1]} appears twice, so Farbaek can't tell which one holds the value.` });
        bad = true;
        break;
      }
      if (m[4]!.length === 8) {
        short++;
        if (/^8[1-6]$/.test(m[1]!)) shortCoords++;
      } else long++;
      parsed.push({ wi: m[1]!, unit: m[2]![3]!, sign: m[3] as "+" | "-", data: m[4]! });
    }
    if (bad) continue;
    const word = (wi: string) => parsed.find((p) => p.wi === wi);
    const id = word("11");
    const coords = [word("81"), word("82"), word("83")];
    const station = [word("84"), word("85"), word("86")];
    const set = coords[0] || coords[1] ? coords : station[0] || station[1] ? station : null;
    if (!set) {
      if (word("83") || word("86")) heightOnly++;
      else if (word("21") || word("22") || word("31") || word("32")) rawLines++;
      else if (!id && word("41")) codeAlone++;
      continue;
    }
    if (!id || /^0+$/.test(id.data)) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line} has coordinates but no point number (word 11${id ? " is all zeros" : " is missing"}).` });
      continue;
    }
    const pointId = unfill(id.data);
    const idProblem = pointIdProblem(pointId);
    if (idProblem) {
      issues.push({ code: "POINT_ID_TOO_LONG", severity: "error", line, message: `Line ${line} ${idProblem}.` });
      continue;
    }
    const [e, n, z] = set;
    if (!e || !n) {
      issues.push({ code: "MISSING_COORDINATE", severity: "error", line, message: `Line ${line}, point ${pointId}: the ${!e ? "easting" : "northing"} word is missing.` });
      continue;
    }
    const value = (w: NonNullable<typeof e>, what: string): number | string => {
      if (FEET.has(w.unit)) return `the ${what} is in feet. Set the instrument's distance unit to metres and export again: Leica doesn't say which foot.`;
      const d = METRE_DECIMALS[w.unit];
      if (d === undefined) return `the ${what}'s unit digit "${w.unit}" isn't a length in metres.`;
      if (!/^\d+$/.test(w.data)) return `the ${what} "${w.data}" isn't a number.`;
      return impliedDecimal(w.sign, w.data, d);
    };
    const ve = value(e, "easting");
    const vn = value(n, "northing");
    const vz = z ? value(z, "height") : null;
    const problem = [ve, vn, vz].find((v): v is string => typeof v === "string");
    if (problem) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${pointId}: ${problem}` });
      continue;
    }
    if (ve === 0 && vn === 0 && (vz === null || vz === 0)) {
      issues.push({ code: "MISSING_COORDINATE", severity: "error", line, message: `Line ${line}, point ${pointId}: every coordinate is zero, which is how an unset field is written. Check the point in the instrument.` });
      continue;
    }
    // The remark (71) when it's filled, else the code word (41): an empty remark is written as zeros.
    const codeWord = [word("71"), word("41")].find((w) => w && unfill(w.data) !== "0");
    const code = codeWord ? unfill(codeWord.data) : null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${pointId} ${cp}.` });
      continue;
    }
    read.push({ line, pointId, e: ve as number, n: vn as number, z: vz as number | null, code });
  }
  const variant = short && long ? "mixed" : long ? "GSI-16" : short ? "GSI-8" : null;
  if (read.length === 0 && rawLines > 0) {
    return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: `This file holds raw observations (angles and distances on ${rawLines} ${rawLines === 1 ? "line" : "lines"}), not coordinates. Farbaek doesn't reduce observations: compute the coordinates in the instrument or your office software and export them (GSI words 81 to 83, or a CSV).` }], variant };
  }
  if (read.length === 0 && issues.length === 0) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "The file has no points with coordinates (GSI words 11 with 81 and 82)." }], variant };
  if (codeAlone > 0) issues.push({ code: "CODE_NOT_READABLE", severity: "warning", line: null, message: `${codeAlone} code ${codeAlone === 1 ? "line stands" : "lines stand"} on ${codeAlone === 1 ? "its" : "their"} own. Leica doesn't tie a code line to a point, so Farbaek doesn't guess: record codes as remarks with each point, or export them in the same line.` });
  if (rawLines > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${rawLines} ${rawLines === 1 ? "line holds" : "lines hold"} raw angles and distances, which Farbaek doesn't reduce: only the points with coordinates are imported.` });
  if (heightOnly > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${heightOnly} ${heightOnly === 1 ? "line has" : "lines have"} a height but no easting and northing (word 83 without 81 and 82), so ${heightOnly === 1 ? "it wasn't" : "they weren't"} imported.` });
  if (variant === "mixed") issues.push({ code: "CHECK_FILE", severity: "warning", line: null, message: "The file mixes GSI-8 and GSI-16 words, which usually means files were joined or edited by hand. Check it." });
  // GSI-8 keeps 8 digits: a grid easting such as 500000.000 m can't fit to the millimetre, so points outside the grid were likely cut.
  const r = crs?.plausibleRange;
  if (r && shortCoords && read.some((p) => p.e < r.minE || p.e > r.maxE || p.n < r.minN || p.n > r.maxN)) {
    issues.push({ code: "NOT_A_NUMBER", severity: "error", line: null, message: `These GSI-8 coordinates fall outside ${crs!.name}. GSI-8 keeps only 8 digits, so the leading digits of grid coordinates are cut. Export the job as GSI-16, which keeps them.` });
  }
  return { ...finishPoints(read, issues), variant };
}
