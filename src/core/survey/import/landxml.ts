/**
 * LandXML point files (stage 194): every CgPoint, whose text is "northing
 * easting" or "northing easting elevation" (LandXML 1.1 and 1.2 schema
 * documentation; research notes, "Survey instrument export formats",
 * sdr_topcon_trimble_landxml.md). The name attribute is the point number;
 * the code attribute, or failing it desc, is the code.
 *
 * Units come from <Units>: metric lengths are taken in metres (millimetre,
 * centimetre and kilometre values are scaled exactly by powers of ten);
 * imperial files are refused, since Farbaek stores metres and never guesses
 * which foot. A CgPoint that only refers to another (pntRef) is the same
 * point under another name and is left out. Observations without points
 * are refused with the reason.
 */
import { codeProblem, finishPoints, guardFile, pointIdProblem } from "./common";
import { readNumber, type ImportedPoint, type ImportIssue } from "./delimited";
import { XmlProblem, elements, lineFinder, stripXml, textOf } from "./xml";

export function looksLikeLandXml(text: string): boolean {
  return /<(?:[\w.-]+:)?LandXML[\s>]/.test(text.slice(0, 4000));
}

const METRIC_SCALE: Record<string, number> = { meter: 1, metre: 1, millimeter: 0.001, millimetre: 0.001, centimeter: 0.01, centimetre: 0.01, kilometer: 1000, kilometre: 1000 };

/** A coordinate written in a metric unit, in metres, by moving the decimal point (so 1234.5 mm is exactly 1.2345 m). */
function toMetres(cell: string, scale: number): number | null {
  const v = readNumber(cell);
  if (v === null) return null;
  if (scale === 1) return v;
  const shift = Math.round(Math.log10(scale));
  return Number(`${cell.trim()}e${shift}`);
}

export function parseLandXml(text: string): { points: ImportedPoint[]; issues: ImportIssue[] } {
  const guard = guardFile(text, "This is a binary file, not LandXML. Export the points as LandXML or CSV.");
  if (guard) return { points: [], issues: [guard] };
  try {
    return readLandXml(text);
  } catch (e) {
    // A file cut short or not well formed is refused whole, with the line, never half-read.
    if (e instanceof XmlProblem) return { points: [], issues: [{ code: "FILE_CUT_SHORT", severity: "error", line: e.line, message: e.message }] };
    throw e;
  }
}

function readLandXml(text: string): { points: ImportedPoint[]; issues: ImportIssue[] } {
  const clean = stripXml(text);
  if (!looksLikeLandXml(clean)) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "This isn't a LandXML file: it has no LandXML element." }] };
  // The root must close: a file cut off after its last point would otherwise read as complete.
  elements(clean, "LandXML");
  const lineAt = lineFinder(clean);
  const metric = elements(clean, "Metric")[0];
  const imperial = elements(clean, "Imperial")[0];
  if (imperial && !metric) return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: null, message: "The LandXML file is in imperial units. Export it in metres: Farbaek stores metres and never guesses which foot." }] };
  const unit = (metric?.attrs.linearUnit ?? "meter").toLowerCase();
  const scale = METRIC_SCALE[unit];
  if (scale === undefined) return { points: [], issues: [{ code: "NOT_A_NUMBER", severity: "error", line: null, message: `The LandXML file's length unit "${metric?.attrs.linearUnit}" isn't one Farbaek reads. Export it in metres.` }] };
  const issues: ImportIssue[] = [];
  const read: ImportedPoint[] = [];
  let references = 0;
  for (const el of elements(clean, "CgPoint")) {
    const line = lineAt(el.index);
    const name = (el.attrs.name ?? "").trim();
    const values = textOf(el.inner, " ").trim();
    if (!values && el.attrs.pntRef) {
      references++;
      continue;
    }
    const problem = pointIdProblem(name);
    if (problem) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line}: a CgPoint ${problem} (its name attribute).` });
      continue;
    }
    const cells = values.split(/\s+/);
    if (cells.length < 2 || cells.length > 3) {
      issues.push({ code: "WRONG_COLUMN_COUNT", severity: "error", line, message: `Line ${line}, point ${name}: a CgPoint holds northing, easting and an optional elevation; this one has ${values ? cells.length : 0} values.` });
      continue;
    }
    const [n, e, z] = cells.map((c) => toMetres(c, scale));
    if (n === null || n === undefined || e === null || e === undefined || (cells[2] !== undefined && (z === null || z === undefined))) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${name}: "${values.slice(0, 60)}" isn't plain numbers.` });
      continue;
    }
    const code = (el.attrs.code ?? el.attrs.desc ?? "").trim() || null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${name} ${cp}.` });
      continue;
    }
    read.push({ line, pointId: name, n, e, z: z ?? null, code });
  }
  const observations = elements(clean, "RawObservation").length;
  const raw = observations + elements(clean, "InstrumentSetup").length;
  if (read.length === 0 && issues.length === 0) {
    return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: raw > 0 ? "This LandXML file holds instrument observations, not points with coordinates. Farbaek doesn't reduce observations: export the computed points (CgPoints)." : "The LandXML file has no CgPoint with coordinates." }] };
  }
  if (raw > 0) {
    issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `The file also holds instrument observations${observations > 0 ? ` (${observations})` : ""}, which Farbaek doesn't reduce: only the CgPoints are imported, as your software computed them.` });
  }
  if (references > 0) issues.push({ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: `${references} ${references === 1 ? "CgPoint only refers" : "CgPoints only refer"} to another point (pntRef) and ${references === 1 ? "was" : "were"} left out: ${references === 1 ? "it's" : "they're"} the same point under another name.` });
  return finishPoints(read, issues);
}
