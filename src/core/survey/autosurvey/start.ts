/**
 * AutoSurvey's start (stage 222, ADR 0233): everything a surveyor uploads at once is sorted and read here, before anything is
 * saved, so one press of Generate Plan can create the project, import every file and draw the plan.
 *
 * The same functions run in the browser (to show at once what each file holds) and on the server (which reads every file again
 * itself: the browser's reading is never trusted). Nothing here guesses a fact: a file whose columns the file itself doesn't settle,
 * two files that give one point two places, or points that don't fit the chosen grid each stop the start with one plain question.
 */
import { codeBase, codeOf, dsrCodesIn, type CodeEntry } from "../codes";
import { crsById, implausiblePoints, looksSwapped, type CrsRecord } from "../crs";
import { suggestColumns } from "../import/columns";
import { IMPORT_LIMITS, previewDelimited, type ColumnRole, type Delimiter, type ImportedPoint, type ImportIssue } from "../import/delimited";
import { IMPORT_FORMATS, detectFormat, unreadableFile, type ImportFormat } from "../import/detect";
import { readPoints, type PointsRead } from "../import/read";
import type { AdjustMethod } from "../adjust";

/** What an uploaded file is to AutoSurvey. */
export type UploadKind = "survey-data" | "sketch" | "document" | "unreadable";

/** Files at most, in one start. */
export const START_LIMITS = { files: 12, dataBytes: 5 * 1024 * 1024 } as const;

const IMAGE = /\.(?:jpe?g|png|webp|heic|heif|gif|bmp|tiff?)$/i;
// A DXF drawing is read for its points (stage 242, ADR 0250); a DWG isn't.
const DOCUMENT = /\.(?:pdf|docx?|xlsx?|dwg)$/i;

/**
 * What a file is, from its name and type, before its text is read. Pictures are field sketches or photos; a PDF, Word, Excel or CAD
 * file is a document. Everything else is read as text and goes to the survey readers, which settle what it really is.
 */
export function kindOfUpload(name: string, mimeType: string): Exclude<UploadKind, "unreadable"> {
  if (mimeType.startsWith("image/") || IMAGE.test(name)) return "sketch";
  if (mimeType === "application/pdf" || DOCUMENT.test(name)) return "document";
  return "survey-data";
}

/** Why a document isn't read: said beside it, so nothing looks read that wasn't. Sketches are read with Claude (sketch.ts). */
export function notReadYet(name: string): string {
  if (/\.dwg$/i.test(name)) return "DWG drawings can't be read. Upload the survey's points file instead.";
  if (/\.xlsx?$/i.test(name)) return "Excel files aren't read. Save the sheet as CSV and upload that.";
  return "Documents aren't read yet. Upload the survey's points file.";
}

/** How a survey file was read: the settings the server repeats, the points, and what to tell the surveyor. */
export interface FileRead {
  name: string;
  format: ImportFormat;
  formatLabel: string;
  delimiter: Delimiter;
  hasHeader: boolean;
  columns: ColumnRole[];
  points: ImportedPoint[];
  /** Notes worth showing (repeats kept once, records left out); never errors. */
  notes: ImportIssue[];
  surveyDate: string | null;
  /** When points were worked out from observations, with the traverse's closure and any adjustment: recorded with the import (ADR 0236, ADR 0241). */
  reduction: NonNullable<PointsRead["reduction"]> | null;
}

export type FileReadResult = { ok: true; read: FileRead } | { ok: false; name: string; problem: string };

const NO_COLUMNS: ColumnRole[] = ["point", "easting", "northing"];

/**
 * Reads one survey file with the tested readers, choosing the settings the file itself settles. A points file whose columns the
 * file doesn't settle (no header and two orders fit the grid) isn't guessed: it is a problem with the question to answer.
 */
export function readSurveyFile(name: string, text: string, crs: CrsRecord | null, adjust: AdjustMethod | null = null): FileReadResult {
  if (text.length > IMPORT_LIMITS.maxBytes) return { ok: false, name, problem: `This file is larger than ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Split it, or export only this survey's points.` };
  if (text.trim() === "") return { ok: false, name, problem: "This file is empty." };
  const unreadable = unreadableFile(name, text);
  if (unreadable) return { ok: false, name, problem: unreadable };
  const format = detectFormat(name, text);
  const formatLabel = IMPORT_FORMATS.find((f) => f.id === format)?.label ?? format;
  let delimiter: Delimiter = ",";
  let hasHeader = false;
  let columns: ColumnRole[] = NO_COLUMNS;
  if (format === "delimited") {
    const preview = previewDelimited(text, 300);
    if ("error" in preview) return { ok: false, name, problem: preview.error.message };
    const guess = suggestColumns(preview, crs);
    // Latitude and longitude, by their numbers or by a column's name.
    const namesLatLong = (preview.header ?? []).some((h) => /^\W*(?:lat|latitude|lon|lng|long|longitude)\W*$/i.test(h));
    if (guess.latLong || namesLatLong) return { ok: false, name, problem: "These coordinates look like latitude and longitude. AutoSurvey reads grid coordinates in metres: export the points in your grid (for example SLD99), or use a file from the instrument's software." };
    // Only the guesser's first sentence (what it couldn't settle): AutoSurvey doesn't go on to assume an order, it asks.
    if (guess.unsure.length > 0) return { ok: false, name, problem: `Farbaek can't tell which column is which in this file. ${guess.unsure[0]!.split(/(?<=\.)\s+/)[0]} Open the detailed import below to choose the columns yourself, or export the file with a header row (Point, Easting, Northing, Height, Code).` };
    delimiter = preview.delimiter;
    hasHeader = preview.hasHeader;
    columns = guess.columns;
  }
  // A field book's legs need points already in a project; a new start has none, so they must be in the same book.
  // A traverse is adjusted only by the rule the surveyor chose for this file (ADR 0241).
  const result = readPoints(format, text, { delimiter, hasHeader, columns, crs, known: [], adjust });
  const errors = result.issues.filter((i) => i.severity === "error");
  if (errors.length > 0) {
    const first = errors[0]!;
    const where = first.line !== null ? `Line ${first.line}: ` : "";
    return { ok: false, name, problem: `${where}${first.message}${errors.length > 1 ? ` (${errors.length - 1} more ${errors.length === 2 ? "problem" : "problems"} like this.)` : ""}` };
  }
  if (result.points.length === 0) return { ok: false, name, problem: "This file has no points in it." };
  return { ok: true, read: { name, format, formatLabel, delimiter, hasHeader, columns, points: result.points, notes: result.issues.filter((i) => i.severity !== "error").slice(0, 20), surveyDate: result.surveyDate, reduction: result.reduction ?? null } };
}

/** A question that stops the start, with the file it's about when there is one. */
export interface StartProblem {
  file: string | null;
  problem: string;
}

/** Where two files put the same point number within half a millimetre: their numbers are written to the millimetre. */
const SAME_PLACE_M = 0.0005;

/**
 * Whether a file has heights: one whose every height is 0 (or missing) was exported without them, as a 2D drawing or an instrument's
 * printed list of a survey shot without heights is, so its zeros say nothing about the ground.
 */
export const hasHeights = (r: FileRead) => r.points.some((p) => p.z !== null && p.z !== 0);

/** Whether a file has codes: a drawing or list exported without them says nothing about a point's code. */
export const hasCodes = (r: FileRead) => r.points.some((p) => (p.code ?? "").trim() !== "");

/**
 * The order files are imported in: those with heights first, otherwise as given, so the files that say most about a point come first.
 * The checks run in this order too, so what's checked is what's imported.
 */
export const importOrder = (reads: readonly FileRead[]): FileRead[] => [...reads.filter(hasHeights), ...reads.filter((r) => !hasHeights(r))];

/** One point number across the files that give it (stage 252): the value kept, and every file that gave it, by its place in the order. */
export interface KeptPoint {
  e: number;
  n: number;
  /** The height, from the first file with heights that gives one; null when none does. */
  z: number | null;
  /** The code, from the first file with codes that gives one; null when none does. */
  code: string | null;
  /** The files that give it, by their place in `importOrder`. */
  files: number[];
}

/**
 * The files read together, as one survey (stage 252): each point number given once or more, compared across every file that gives it.
 * The same survey uploaded as its instrument file, its printed list and its drawing is one set of points: each point is imported once,
 * with the best each file says (its place, a height from a file with heights, a code from a file with codes), and every file is kept as
 * a source. Files are told apart by their place in the order, never by name: two uploads may share one.
 */
export function readTogether(ordered: readonly FileRead[]): { kept: Map<string, KeptPoint>; clashes: StartProblem[]; repeats: { index: number; file: string; count: number; of: string[] }[] } {
  const kept = new Map<string, KeptPoint>();
  const clashes: StartProblem[] = [];
  const heights = ordered.map(hasHeights);
  const codes = ordered.map(hasCodes);
  const said = new Set<string>();
  const clash = (file: string, text: string) => {
    if (clashes.length < 5 && !said.has(text)) {
      said.add(text);
      clashes.push({ file, problem: text });
    }
  };
  const repeats = ordered.map((r, index) => ({ index, file: r.name, count: 0, of: new Set<string>() }));
  ordered.forEach((r, i) => {
    for (const p of r.points) {
      const k = kept.get(p.pointId);
      const z = heights[i] ? p.z : null;
      const code = codes[i] && (p.code ?? "").trim() !== "" ? p.code! : null;
      if (!k) {
        kept.set(p.pointId, { e: p.e, n: p.n, z, code, files: [i] });
        continue;
      }
      const where = (j: number) => (j === i ? "an earlier line of the same file" : ordered[j]!.name);
      const first = k.files[0]!;
      if (Math.abs(k.e - p.e) >= SAME_PLACE_M || Math.abs(k.n - p.n) >= SAME_PLACE_M) {
        clash(r.name, `Point ${p.pointId} is at a different place here and in ${where(first)}. Imported points are never changed: check which is right, and give a corrected point a new number.`);
        continue;
      }
      if (z !== null && k.z !== null && Math.abs(k.z - z) >= SAME_PLACE_M) {
        clash(r.name, `Point ${p.pointId} has a different height here (${z}) and in ${where(k.files.find((j) => heights[j]) ?? first)} (${k.z}). Imported points are never changed: check which is right.`);
        continue;
      }
      if (code !== null && k.code !== null && code !== k.code) {
        clash(r.name, `Point ${p.pointId} has the code ${code} here and ${k.code} in ${where(k.files.find((j) => codes[j]) ?? first)}. Imported points are never changed: check which is right.`);
        continue;
      }
      // The same point: what this file adds (a height, a code) is kept with it.
      kept.set(p.pointId, { ...k, z: k.z ?? z, code: k.code ?? code, files: k.files.includes(i) ? k.files : [...k.files, i] });
      if (first !== i) {
        repeats[i]!.count++;
        repeats[i]!.of.add(ordered[first]!.name);
      }
    }
  });
  return { kept, clashes, repeats: repeats.map((x) => ({ ...x, of: [...x.of] })) };
}

/**
 * The points to import from the file at `index` in the order: every point as it's kept, so the first file stores it with the best the
 * files say and every later file's copy is the same, which the database keeps once. The file itself is kept as it was uploaded.
 */
export function importPointsOf(ordered: readonly FileRead[], index: number, kept: ReadonlyMap<string, KeptPoint>): FileRead["points"] {
  return ordered[index]!.points.map((p) => {
    const k = kept.get(p.pointId);
    return k ? { ...p, e: k.e, n: k.n, z: k.z, code: k.code } : p;
  });
}

/**
 * The files read together: one point number given two different places, codes or heights by two files (or two places in one) stops the
 * start, since imported points are never changed. Checked in the order files are imported, against every file that gave the point.
 */
export function pointClashes(reads: readonly FileRead[]): StartProblem[] {
  return readTogether(importOrder(reads)).clashes;
}

/**
 * Do the points fit the coordinate system the surveyor chose? Farbaek never works the system out from the numbers (several
 * Sri Lankan and UTM grids overlap); this only catches a wrong choice or swapped columns before anything is saved.
 */
export function gridProblem(points: readonly { e: number; n: number }[], crs: CrsRecord): StartProblem | null {
  if (points.length === 0 || !crs.plausibleRange) return null;
  const outside = implausiblePoints(points, crs);
  if (outside === 0) return null;
  if (looksSwapped(points, crs)) return { file: null, problem: `Every point falls outside ${crs.name} as read, and inside it with easting and northing swapped. Check the file's column order: Farbaek never swaps them by itself.` };
  return { file: null, problem: `${outside} of ${points.length} ${points.length === 1 ? "point falls" : "points fall"} outside the area ${crs.name} covers. Check that the survey is in this coordinate system, or choose the right one.` };
}

/** Whether to draw with the Survey Department's code list: when the files use at least two of its codes the project's list lacks. */
export function drawsWithDsrList(points: readonly ImportedPoint[], library: readonly CodeEntry[]): boolean {
  return dsrCodesIn(points.map((p) => codeBase(codeOf(p.code))).filter(Boolean), library).length >= 2;
}

/** The first survey date any file states, offered to the draft for the surveyor to check. */
export function statedSurveyDate(reads: readonly FileRead[]): string | null {
  return reads.find((r) => r.surveyDate)?.surveyDate ?? null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The project's name: the surveyor's own, or one made from the first data file and the day ("Survey from bankuwatta, 23 Nov 2026"). */
export function startName(title: string, firstFile: string | null, today: Date): string {
  const own = title.trim().replace(/\s+/g, " ");
  if (own) return own.slice(0, 120);
  const day = `${today.getUTCDate()} ${MONTHS[today.getUTCMonth()]} ${today.getUTCFullYear()}`;
  const stem = (firstFile ?? "").replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").trim().slice(0, 60);
  return stem ? `Survey from ${stem}, ${day}` : `Survey of ${day}`;
}

/** The coordinate system to show first: the one this surveyor last confirmed, when it's still one Farbaek knows. */
export function startingCrs(lastConfirmed: string | null): CrsRecord | null {
  return crsById(lastConfirmed);
}
