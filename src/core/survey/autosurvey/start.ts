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

/**
 * The files read together: one point number given two different places by two files (or two places in one) stops the start,
 * since imported points are never changed; an exact repeat is kept once.
 */
export function pointClashes(reads: readonly FileRead[]): StartProblem[] {
  const seen = new Map<string, { e: number; n: number; z: number | null; file: string }>();
  const clashes: StartProblem[] = [];
  for (const r of reads) {
    for (const p of r.points) {
      const before = seen.get(p.pointId);
      if (!before) {
        seen.set(p.pointId, { e: p.e, n: p.n, z: p.z, file: r.name });
        continue;
      }
      if (before.e === p.e && before.n === p.n && before.z === p.z) continue;
      if (clashes.length < 5) clashes.push({ file: r.name, problem: `Point ${p.pointId} is at different coordinates here and in ${before.file === r.name ? "an earlier line of the same file" : before.file}. Imported points are never changed: check which is right, and give a corrected point a new number.` });
    }
  }
  return clashes;
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
