/**
 * Sokkia SDR files (SDR2x and SDR33), read by their fixed byte positions
 * (stage 194). Source: Sokkia, "Interfacing with the SOKKIA SDR Electronic
 * Field Book", V04-04.xx, October 1999 (research notes, "Survey instrument
 * export formats", sdr_topcon_trimble_landxml.md).
 *
 * - The 00 header picks the layout: "SDR20…" for 4-character point numbers
 *   and 10-byte numbers, "SDR33…" for 16-byte fields. Byte 42 is the
 *   distance unit (1 metres, 2 feet); a "13DU3" note means US survey feet.
 * - 08 records are coordinates: point, northing, easting, elevation, code.
 *   02 records are the occupied stations, with the same coordinates.
 * - 09 and 11 records are observations, which Farbaek doesn't reduce; 18
 *   records are pre-calibration RTK values, and 24 latitude and longitude:
 *   none of these is imported.
 * - A point stored twice: the SDR's own rule is that the later record
 *   replaces the earlier, so the later one is used and the surveyor is told.
 * Feet are refused (set the instrument to metres): nothing is converted.
 */
import { codeProblem, guardFile, numberedLines, pointIdProblem } from "./common";
import { IMPORT_LIMITS, readNumber, type ImportedPoint, type ImportIssue } from "./delimited";

export interface SdrRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  layout: "SDR2x" | "SDR33" | null;
}

/** Whether text is an SDR file: its first record is a 00 header naming SDR2x or SDR33. */
export function looksLikeSdr(text: string): boolean {
  const first = numberedLines(text).map((l) => l.text.replace(/\u0002/g, "").trim()).find(Boolean) ?? "";
  return /^00(?:NM|ED)SDR(?:2\d|33)/.test(first);
}

/** Field widths by layout: [id, number] in bytes, and where each 08 and 02 field starts (0-based). */
const LAYOUTS = {
  SDR2x: { id: 4, num: 10, pos: { id: 4, n: 8, e: 18, z: 28, code: 38, codeLen: 16 }, stn: { id: 4, n: 8, e: 18, z: 28, code: 48, codeLen: 16 } },
  SDR33: { id: 16, num: 16, pos: { id: 4, n: 20, e: 36, z: 52, code: 68, codeLen: 16 }, stn: { id: 4, n: 20, e: 36, z: 52, code: 84, codeLen: 16 } },
} as const;

/** A point name as stored: right-aligned, and zero-filled when numeric ("00000031" is 31). */
const pointName = (raw: string) => {
  const t = raw.trim();
  return /^\d+$/.test(t) ? t.replace(/^0+(?=\d)/, "") : t;
};

export function parseSdr(text: string): SdrRead {
  const guard = guardFile(text, "This is a binary file, not an SDR text file. Export the job from the instrument or Sokkia's software as an SDR33 or CSV file.");
  if (guard) return { points: [], issues: [guard], layout: null };
  const records = numberedLines(text)
    .map((l) => ({ line: l.line, text: l.text.replace(/\u0002/g, "").trimEnd() }))
    .filter((l) => l.text && !l.text.startsWith("\u0003") && !/^\d{5}$/.test(l.text));
  const header = records[0];
  const version = header?.text.slice(4, 20).trim() ?? "";
  const layout = /^SDR33/.test(version) ? "SDR33" : /^SDR2\d/.test(version) ? "SDR2x" : null;
  if (!header || !/^00(?:NM|ED)/.test(header.text) || !layout) {
    return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: header?.line ?? null, message: "This isn't an SDR file: its first record isn't an SDR2x or SDR33 header (00NM or 00ED)." }], layout: null };
  }
  const issues: ImportIssue[] = [];
  // Header byte 42 is the distance unit: 1 metres, 2 feet. Anything but 1 is refused, as is a feet note (13DU2, 13DU3) anywhere.
  const unit = header.text.padEnd(46)[41];
  if (unit === "2" || records.some((r) => r.text.startsWith("13DU3") || r.text.startsWith("13DU2"))) {
    return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: header.line, message: "The SDR file is in feet. Set the instrument's distance unit to metres and export again: Farbaek stores metres and never converts." }], layout };
  }
  if (unit !== "1") {
    return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: header.line, message: `The SDR header doesn't say the distances are in metres (its distance unit, byte 42, is "${unit?.trim() || "blank"}"). Set the instrument's distance unit to metres and export again.` }], layout };
  }
  if (header.text.padEnd(46)[44] === "2") {
    issues.push({ code: "CHECK_FILE", severity: "warning", line: header.line, message: "The instrument was set to show coordinates easting first. Sokkia's layout stores northing first in the file, and Farbaek reads it that way: check one point against your field notes." });
  }
  const L = LAYOUTS[layout];
  const byName = new Map<string, ImportedPoint>();
  const order: string[] = [];
  let observations = 0;
  let skippedOther = 0;
  let coordinateRecords = 0;
  for (const { line, text: rec } of records.slice(1)) {
    const type = rec.slice(0, 2);
    if (type === "09" || type === "11") {
      observations++;
      continue;
    }
    if (type === "18" || type === "24") {
      skippedOther++;
      continue;
    }
    if (type !== "08" && type !== "02") continue;
    if (++coordinateRecords > IMPORT_LIMITS.maxRows) {
      return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The file has more than ${IMPORT_LIMITS.maxRows} coordinate records; the limit is ${IMPORT_LIMITS.maxRows}.` }], layout };
    }
    const f = type === "08" ? L.pos : L.stn;
    const padded = rec.padEnd(f.code + f.codeLen);
    const id = pointName(padded.slice(f.id, f.id + L.id));
    const problem = pointIdProblem(id);
    if (problem) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line} ${problem}.` });
      continue;
    }
    const num = (start: number) => {
      const cell = padded.slice(start, start + L.num).trim();
      return cell === "" ? null : readNumber(cell);
    };
    const n = num(f.n);
    const e = num(f.e);
    const zCell = padded.slice(f.z, f.z + L.num).trim();
    const z = zCell === "" ? null : readNumber(zCell);
    if (n === null || e === null || (zCell !== "" && z === null)) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${id}: a coordinate isn't a plain number in its SDR field.` });
      continue;
    }
    const code = padded.slice(f.code, f.code + f.codeLen).trim() || null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${id} ${cp}.` });
      continue;
    }
    const point: ImportedPoint = { line, pointId: id, e, n, z, code };
    const prior = byName.get(id);
    if (prior) {
      if (prior.e !== e || prior.n !== n || prior.z !== z || prior.code !== code) {
        issues.push({ code: "DUPLICATE_POINT_REPLACED", severity: "warning", line, message: `Line ${line}: point ${id} was stored again with different values. The SDR's rule is that the later record replaces the earlier one (line ${prior.line}), so line ${line} is used.` });
        byName.set(id, point);
      }
      continue;
    }
    byName.set(id, point);
    order.push(id);
  }
  const points = order.map((id) => byName.get(id)!);
  if (points.length === 0 && observations > 0) {
    return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: `This job holds the instrument's measurements (angles and distances, ${observations} ${observations === 1 ? "record" : "records"}), not coordinates. Compute the coordinates in Sokkia Link or on the instrument and export the job again, or export the coordinates as a CSV (point, northing, easting, height, code).` }], layout };
  }
  if (points.length === 0) return { points: [], issues: [...issues, { code: "NO_ROWS", severity: "error", line: null, message: "The SDR file has no coordinate records (08 or 02)." }], layout };
  if (observations > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${observations} observation ${observations === 1 ? "record (09 or 11) was" : "records (09 or 11) were"} left out: Farbaek doesn't reduce observations, so only the coordinate records are imported.` });
  if (skippedOther > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${skippedOther} RTK or latitude-longitude ${skippedOther === 1 ? "record was" : "records were"} left out: they aren't grid coordinates in the job's system.` });
  return { points, issues, layout };
}
