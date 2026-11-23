/**
 * Sokkia Link's printed point list of an SDR job (stage 242, ADR 0250): a "< Condition >" header (project, file name, print date,
 * distance unit, angle unit, point count), then a table of the job's records under "Pt.  Record Type  DC  North/Hor  East/Vert
 * Elev./Dist  Code", each record between dashed rules. Laid out from a real printout (Sokkia Link, 2026); no published layout exists.
 *
 * Read: the coordinate records, POS (a point) and STN (a station), each "North: … East: … Elev: …" in its column, and the code in the
 * Code column. Never guessed:
 * - the columns are found from the table's own heading line, on every page; a coordinate line out of its columns is refused, with its line;
 * - the distance unit must be metres: anything else is refused, never converted;
 * - observations with a distance (OBS "Slp Dist", RED "Hor Dist") aren't worked out from a printout: the file is refused, pointing to
 *   the job's .sdr, which Farbaek reduces (ADR 0236). Lines without a distance (an empty backsight shot) are counted and left out;
 * - the header's point count is checked against the POS lines found, so a missing page is caught;
 * - as in the SDR, a later line for the same point replaces an earlier one, and says so.
 */
import { codeProblem, guardFile, numberedLines, pointIdProblem } from "./common";
import { IMPORT_LIMITS, readNumber, type ImportedPoint, type ImportIssue } from "./delimited";

export interface SokkiaListRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
}

const HEADING = /^\s*Pt\.\s+Record\s+Type\s+DC\s+North\/Hor\s+East\/Vert\s+Elev\.\/Dist\s+Code\s*$/i;

/** Whether text is Sokkia Link's point list: its "< Condition >" opening and its record table's heading. */
export function looksLikeSokkiaList(text: string): boolean {
  const head = text.slice(0, 6000).replace(/^[\uFEFF\u0002]+/, "").trimStart();
  return /^<\s*Condition\s*>/i.test(head) && head.split(/\r\n|\r|\n/).some((l) => HEADING.test(l));
}

/** The value after a column's label ("North: 1008.3150"), "" when the label is there with no value, null when the label isn't. */
const cell = (text: string, label: string): string | null => {
  const t = text.trim();
  if (!t.toLowerCase().startsWith(`${label.toLowerCase()}:`)) return null;
  return t.slice(label.length + 1).trim();
};

export function parseSokkiaList(text: string): SokkiaListRead {
  const guard = guardFile(text, "This isn't a text file. Upload Sokkia Link's point list as it was printed to a file, or the job's .sdr file.");
  if (guard) return { points: [], issues: [guard] };
  const issues: ImportIssue[] = [];
  const lines = numberedLines(text);
  const header = (label: string) => lines.slice(0, 40).map((l) => new RegExp(`^\\s*${label}\\s*:\\s*(.*)$`, "i").exec(l.text)?.[1]?.trim()).find((v) => v !== undefined) ?? null;
  const fail = (message: string): SokkiaListRead => ({ points: [], issues: [{ code: "MISSING_MAPPING", severity: "error", line: null, message }] });

  const unit = header("Distance\\s+Unit");
  if (unit === null) return fail("The printout doesn't say its distance unit, so its numbers can't be read as metres. Upload the job's .sdr file instead.");
  if (!/^(?:met(?:er|re)s?|m)$/i.test(unit)) return fail(`The printout's distances are in ${unit.slice(0, 40)}. Farbaek reads metres only and converts nothing: print it again with the job set to metres, or upload the job's .sdr file.`);
  const countText = header("Pt\\.\\s*Count");
  const stated = countText !== null && /^\d+$/.test(countText) ? Number(countText) : null;
  const file = header("File\\s+Name");
  const sdr = file ? file.slice(Math.max(file.lastIndexOf("\\"), file.lastIndexOf("/")) + 1).slice(0, 120) : null;
  const instead = `Upload the job's .sdr file${sdr && /\.sdr$/i.test(sdr) ? ` (${sdr})` : ""} instead: Farbaek works out a total station's shots from it.`;

  let cols: { north: number; east: number; elev: number; code: number } | null = null;
  const byName = new Map<string, ImportedPoint>();
  const order: string[] = [];
  const posIds = new Set<string>();
  let posLines = 0;
  let stnIds = 0;
  let shots = 0;
  const shotLines: number[] = [];
  let leftOut = 0;

  for (const { line, text: raw } of lines) {
    const t = raw.replace(/\s+$/, "");
    if (HEADING.test(t)) {
      cols = { north: t.indexOf("North/Hor"), east: t.indexOf("East/Vert"), elev: t.indexOf("Elev./Dist"), code: t.search(/Code\s*$/) };
      continue;
    }
    const kind = /^(\S+)?\s+(POS|STN|OBS|RED|BKB|NOTE|TARGET|SCALE|INSTR|JOB|Fbk Settings)\b/.exec(t);
    if (!kind) {
      // Anything else holding a coordinate label is a record out of the table's columns: refused, never read around.
      if (/\bNorth:\s*\S/.test(t)) issues.push({ code: "WRONG_COLUMN_COUNT", severity: "error", line, message: `Line ${line} gives a North but isn't laid out as a Sokkia Link record. Upload the job's .sdr file instead.` });
      continue;
    }
    const type = kind[2]!;
    if (type === "OBS" || type === "RED") {
      const dist = /(?:Slp|Hor)\s+Dist:\s*(\S+)/.exec(t)?.[1];
      if (dist && readNumber(dist) !== null) {
        shots++;
        if (shotLines.length < 5) shotLines.push(line);
      } else leftOut++;
      continue;
    }
    if (type !== "POS" && type !== "STN") continue;
    if (!cols || cols.north < 0 || cols.east < 0 || cols.elev < 0 || cols.code < 0) return fail(`Line ${line} comes before the printout's table heading (Pt., Record Type, DC, North/Hor, East/Vert, Elev./Dist, Code), so its columns aren't known.`);
    const id = (kind[1] ?? "").trim();
    const problem = pointIdProblem(id);
    if (problem) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line} ${problem}.` });
      continue;
    }
    const padded = t.padEnd(cols.code);
    const north = cell(padded.slice(cols.north, cols.east), "North");
    const east = cell(padded.slice(cols.east, cols.elev), "East");
    const elev = cell(padded.slice(cols.elev, cols.code), "Elev");
    if (north === null || east === null || elev === null) {
      issues.push({ code: "WRONG_COLUMN_COUNT", severity: "error", line, message: `Line ${line}, point ${id}: its North, East and Elev aren't in the table's columns.` });
      continue;
    }
    const n = readNumber(north);
    const e = readNumber(east);
    const z = elev === "" ? null : readNumber(elev);
    if (n === null || e === null || (elev !== "" && z === null)) {
      // A station the instrument didn't place has no coordinates: it's a station, not a point.
      if (type === "STN" && north === "" && east === "") continue;
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${id}: a coordinate isn't a plain number.` });
      continue;
    }
    const code = padded.slice(cols.code).trim() || null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${id} ${cp}.` });
      continue;
    }
    if (type === "POS") {
      posLines++;
      posIds.add(id);
    } else stnIds++;
    const point: ImportedPoint = { line, pointId: id, e, n, z, code };
    const prior = byName.get(id);
    if (prior) {
      if (prior.e !== e || prior.n !== n || prior.z !== z || prior.code !== code)
        issues.push({ code: "DUPLICATE_POINT_REPLACED", severity: "warning", line, message: `Line ${line}: point ${id} was listed again with different values. As in the SDR, the later record replaces the earlier one (line ${prior.line}), so line ${line} is used.` });
      byName.set(id, point);
      continue;
    }
    byName.set(id, point);
    order.push(id);
    if (order.length > IMPORT_LIMITS.maxRows) return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The printout lists more than ${IMPORT_LIMITS.maxRows} points; the limit is ${IMPORT_LIMITS.maxRows}.` }] };
  }

  if (shots > 0) return fail(`The printout lists ${shots} shot${shots === 1 ? "" : "s"} from the instrument (line${shotLines.length === 1 ? "" : "s"} ${shotLines.join(", ")}${shots > shotLines.length ? " and more" : ""}), which Farbaek doesn't work out from a printout. ${instead}`);
  if (!cols) return fail("The printout's table heading (Pt., Record Type, DC, North/Hor, East/Vert, Elev./Dist, Code) wasn't found, so its columns aren't known.");
  // "Pt. Count" counts the POS records (a real printout: 39 POS lines and one station, "Pt. Count : 39"). Stations never count. When
  // the records match but a point was listed twice, as many different points as the count say can't be shown, so it's said.
  if (stated !== null && posLines !== stated)
    issues.push({ code: "NO_ROWS", severity: "error", line: null, message: `The printout says it lists ${stated} points, and ${posLines} were found: a page may be missing. Print it again, or ${instead.charAt(0).toLowerCase()}${instead.slice(1)}` });
  else if (stated !== null && posIds.size < stated)
    issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `The printout counts ${stated} point records, and they hold ${posIds.size} different points: one was listed again. If a page is missing, print it again, or ${instead.charAt(0).toLowerCase()}${instead.slice(1)}` });
  if (leftOut > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${leftOut} observation line${leftOut === 1 ? "" : "s"} without a distance (a backsight or an empty shot) ${leftOut === 1 ? "was" : "were"} left out: ${leftOut === 1 ? "it places" : "they place"} no point.` });
  if (stnIds > 0 && order.length > 0 && order.every((id) => !posIds.has(id))) issues.push({ code: "NO_ROWS", severity: "error", line: null, message: `The printout lists only its station${order.length === 1 ? "" : "s"}, no points. ${instead}` });
  if (order.length === 0) return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: "The printout lists no points with coordinates." }] };
  return { points: order.map((id) => byName.get(id)!), issues };
}
