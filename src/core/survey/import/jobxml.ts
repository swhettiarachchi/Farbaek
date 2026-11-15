/**
 * Trimble JobXML (stage 194): the final grid coordinates in Reductions/Point
 * (the XSD calls them the best position; JobXML stores lengths in metres
 * whatever the display units), each point's name and code. Points whose
 * field-book record is marked Deleted are left out, and points with only
 * WGS84 or local values are listed as not imported. Source: Trimble's JobXML
 * 5.2 schema (research notes, "Survey instrument export formats",
 * sdr_topcon_trimble_landxml.md).
 *
 * The date of the latest observation (a PointRecord's TimeStamp) is offered
 * as the survey date, for the surveyor to check.
 */
import { codeProblem, finishPoints, guardFile, pointIdProblem } from "./common";
import { readNumber, type ImportedPoint, type ImportIssue } from "./delimited";
import { XmlProblem, childText, elements, lineFinder, stripXml } from "./xml";

export function looksLikeJobXml(text: string): boolean {
  return /<(?:[\w.-]+:)?JOBFile[\s>]/i.test(text.slice(0, 4000));
}

export function parseJobXml(text: string): { points: ImportedPoint[]; issues: ImportIssue[]; surveyDate: string | null } {
  const guard = guardFile(text, "This is a binary file, not JobXML. Export the job from Trimble Access as JobXML or CSV.");
  if (guard) return { points: [], issues: [guard], surveyDate: null };
  try {
    return readJobXml(text);
  } catch (e) {
    // A file cut short or not well formed is refused whole, with the line, never half-read.
    if (e instanceof XmlProblem) return { points: [], issues: [{ code: "FILE_CUT_SHORT", severity: "error", line: e.line, message: e.message }], surveyDate: null };
    throw e;
  }
}

function readJobXml(text: string): { points: ImportedPoint[]; issues: ImportIssue[]; surveyDate: string | null } {
  const clean = stripXml(text);
  if (!looksLikeJobXml(clean)) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "This isn't a Trimble JobXML file: it has no JOBFile element." }], surveyDate: null };
  // The root must close: a file cut off after its last point would otherwise read as complete.
  elements(clean, "JOBFile");
  const lineAt = lineFinder(clean);
  // The field book's records: which are deleted, and when the points were observed.
  const deleted = new Set<string>();
  const dates: string[] = [];
  for (const rec of elements(clean, "PointRecord")) {
    // xs:boolean: "true" or "1".
    const del = (childText(rec.inner, "Deleted") ?? "").toLowerCase();
    const isDeleted = del === "true" || del === "1";
    if (isDeleted && rec.attrs.ID) deleted.add(rec.attrs.ID);
    const ts = rec.attrs.TimeStamp;
    if (!isDeleted && ts && /^\d{4}-\d{2}-\d{2}/.test(ts)) dates.push(ts.slice(0, 10));
  }
  const reductions = elements(clean, "Reductions")[0];
  if (!reductions) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "The JobXML file has no Reductions section, where the final coordinates are. Export it again from Trimble Access with reductions." }], surveyDate: null };
  const offset = reductions.innerStart;
  const issues: ImportIssue[] = [];
  const read: ImportedPoint[] = [];
  let noGrid = 0;
  for (const p of elements(reductions.inner, "Point")) {
    const line = lineAt(offset + p.index);
    const id = childText(p.inner, "ID");
    if (id && deleted.has(id)) continue;
    const name = childText(p.inner, "Name") ?? "";
    const grid = elements(p.inner, "Grid")[0];
    if (!grid) {
      noGrid++;
      continue;
    }
    const problem = pointIdProblem(name);
    if (problem) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line}: a point ${problem}.` });
      continue;
    }
    const value = (tag: string) => {
      const t = childText(grid.inner, tag);
      return t === null || t === "" ? null : readNumber(t);
    };
    const n = value("North");
    const e = value("East");
    const zText = childText(grid.inner, "Elevation");
    const z = zText ? readNumber(zText) : null;
    if (n === null || e === null || (zText && z === null)) {
      if (n === null && e === null) {
        noGrid++;
        continue;
      }
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${name}: a grid coordinate is missing or isn't a plain number.` });
      continue;
    }
    const code = childText(p.inner, "Code") || null;
    const cp = codeProblem(code);
    if (cp) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${name} ${cp}.` });
      continue;
    }
    read.push({ line, pointId: name, n, e, z, code });
  }
  if (read.length === 0 && issues.length === 0) {
    return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: noGrid > 0 ? "The JobXML points have no grid coordinates, only WGS84 or local values. Set the job's coordinate system (SLD99) in Trimble Access and export again." : "The JobXML file has no points." }], surveyDate: null };
  }
  if (noGrid > 0) issues.push({ code: "MISSING_COORDINATE", severity: "warning", line: null, message: `${noGrid} ${noGrid === 1 ? "point has" : "points have"} no grid coordinates (only WGS84 or local values) and ${noGrid === 1 ? "isn't" : "aren't"} imported.` });
  const surveyDate = dates.length > 0 ? dates.sort()[dates.length - 1]! : null;
  return { ...finishPoints(read, issues), surveyDate };
}
