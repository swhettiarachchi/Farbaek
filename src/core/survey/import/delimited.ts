/**
 * Delimited point files: CSV, TXT, and space- or tab-separated exports in the
 * point-number, northing/easting, elevation, description orders instruments
 * and office software write (PNEZD, PENZD, PNEZ, PENZ, PNE, PEN), or any order
 * the person maps by hand. Files are untrusted input (survey skill, rule 11):
 * sizes are capped, every row is checked, and nothing is guessed. A row that
 * can't be read for certain is reported with its line number, never repaired.
 *
 * Whether a file's numbers are metres or feet, and which CRS they are in, is
 * never read from the file: the person states both when they import.
 */

export const IMPORT_LIMITS = { maxBytes: 2 * 1024 * 1024, maxRows: 20_000, maxPointIdLength: 32, maxCodeLength: 64 } as const;

export type Delimiter = "," | "\t" | ";" | "whitespace";

export type ColumnRole = "point" | "easting" | "northing" | "elevation" | "code" | "ignore";

/** Column orders by name. "PNEZD" is point, northing, easting, elevation, description. */
export const COLUMN_ORDERS = {
  PNEZD: ["point", "northing", "easting", "elevation", "code"],
  PENZD: ["point", "easting", "northing", "elevation", "code"],
  PNEZ: ["point", "northing", "easting", "elevation"],
  PENZ: ["point", "easting", "northing", "elevation"],
  PNE: ["point", "northing", "easting"],
  PEN: ["point", "easting", "northing"],
} as const satisfies Record<string, readonly ColumnRole[]>;

export type ColumnOrder = keyof typeof COLUMN_ORDERS;

export interface DelimitedPreview {
  delimiter: Delimiter;
  /** True when the first row reads as column names rather than a point. */
  hasHeader: boolean;
  header: string[] | null;
  /** The first rows, split, for the person to check the mapping against. */
  rows: string[][];
  totalRows: number;
  columnCount: number;
}

export interface ImportedPoint {
  /** The 1-based line number in the source file. */
  line: number;
  pointId: string;
  e: number;
  n: number;
  z: number | null;
  code: string | null;
}

export type ImportIssueCode =
  | "FILE_TOO_LARGE"
  | "TOO_MANY_ROWS"
  | "NOT_TEXT"
  | "NO_ROWS"
  | "MISSING_MAPPING"
  | "WRONG_COLUMN_COUNT"
  | "MISSING_POINT_ID"
  | "POINT_ID_TOO_LONG"
  | "NOT_A_NUMBER"
  | "MISSING_COORDINATE"
  | "DUPLICATE_POINT_SAME"
  | "DUPLICATE_POINT_CONFLICT";

export interface ImportIssue {
  code: ImportIssueCode;
  severity: "error" | "warning";
  line: number | null;
  message: string;
}

export interface DelimitedResult {
  points: ImportedPoint[];
  issues: ImportIssue[];
}

/** Splits the text into lines, drops blank lines and a byte-order mark, and keeps each line's number. */
function lines(text: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const all = text.replace(/^﻿/, "").split(/\r\n|\r|\n/);
  for (let i = 0; i < all.length; i++) {
    const t = all[i]!.trim();
    if (t !== "" && !t.startsWith("#")) out.push({ line: i + 1, text: t });
  }
  return out;
}

function splitRow(text: string, delimiter: Delimiter): string[] {
  if (delimiter === "whitespace") return text.split(/\s+/);
  // Quoted CSV fields, so a description such as "Wall, masonry" stays one field.
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cur += ch;
    } else if (ch === '"' && cur.trim() === "") quoted = true;
    else if (ch === delimiter) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

/** Strict decimal number: optional sign, digits, optional decimal point. No thousands separators, no exponents. */
const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
export function readNumber(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const t = cell.trim();
  return NUMBER.test(t) ? Number(t) : null;
}

function detectDelimiter(sample: string[]): Delimiter {
  const counts = (d: string) => sample.map((l) => l.split(d).length - 1);
  for (const d of ["\t", ",", ";"] as const) {
    const c = counts(d);
    if (c.length > 0 && c.every((n) => n > 0 && n === c[0])) return d;
  }
  for (const d of ["\t", ",", ";"] as const) if (counts(d).some((n) => n > 0)) return d;
  return "whitespace";
}

/** Reads the start of the file to suggest a delimiter and whether there is a header row. The person confirms both. */
export function previewDelimited(text: string, maxRows = 12): DelimitedPreview | { error: ImportIssue } {
  const guard = guardText(text);
  if (guard) return { error: guard };
  const ls = lines(text);
  if (ls.length === 0) return { error: { code: "NO_ROWS", severity: "error", line: null, message: "The file has no rows to import." } };
  const delimiter = detectDelimiter(ls.slice(0, 20).map((l) => l.text));
  const first = splitRow(ls[0]!.text, delimiter);
  // A header has no numeric cells where coordinates would be: if fewer than two of its cells are numbers, it's names.
  const hasHeader = first.filter((c) => readNumber(c) !== null).length < 2;
  const body = (hasHeader ? ls.slice(1) : ls).map((l) => splitRow(l.text, delimiter));
  return {
    delimiter,
    hasHeader,
    header: hasHeader ? first : null,
    rows: body.slice(0, maxRows),
    totalRows: body.length,
    columnCount: Math.max(first.length, ...body.slice(0, 50).map((r) => r.length)),
  };
}

function guardText(text: string): ImportIssue | null {
  if (new TextEncoder().encode(text).length > IMPORT_LIMITS.maxBytes) {
    return { code: "FILE_TOO_LARGE", severity: "error", line: null, message: `The file is over ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Split it, or import only the points this plan needs.` };
  }
  if (text.includes("\u0000")) return { code: "NOT_TEXT", severity: "error", line: null, message: "This isn't a text file. Export the points as CSV or TXT and try again." };
  return null;
}

/**
 * Reads every row with the mapping the person chose. Duplicate point numbers
 * are reported: identical coordinates as a warning (the first is kept),
 * different coordinates as an error (neither is chosen for them).
 */
export function parseDelimited(text: string, options: { delimiter: Delimiter; hasHeader: boolean; columns: readonly ColumnRole[] }): DelimitedResult {
  const issues: ImportIssue[] = [];
  const guard = guardText(text);
  if (guard) return { points: [], issues: [guard] };
  const idx = (role: ColumnRole) => options.columns.indexOf(role);
  const [pi, ei, ni, zi, ci] = [idx("point"), idx("easting"), idx("northing"), idx("elevation"), idx("code")];
  if (pi < 0 || ei < 0 || ni < 0) {
    return { points: [], issues: [{ code: "MISSING_MAPPING", severity: "error", line: null, message: "Choose which columns hold the point number, the easting and the northing." }] };
  }
  const ls = lines(text).slice(options.hasHeader ? 1 : 0);
  if (ls.length === 0) return { points: [], issues: [{ code: "NO_ROWS", severity: "error", line: null, message: "The file has no rows to import." }] };
  if (ls.length > IMPORT_LIMITS.maxRows) {
    return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The file has ${ls.length} rows; the limit is ${IMPORT_LIMITS.maxRows}.` }] };
  }
  const needed = Math.max(pi, ei, ni) + 1;
  const points: ImportedPoint[] = [];
  const seen = new Map<string, ImportedPoint>();
  const conflicted = new Set<string>();
  for (const { line, text: row } of ls) {
    const cells = splitRow(row, options.delimiter);
    if (cells.length < needed) {
      issues.push({ code: "WRONG_COLUMN_COUNT", severity: "error", line, message: `Line ${line} has ${cells.length} columns; the mapping needs at least ${needed}.` });
      continue;
    }
    const pointId = (cells[pi] ?? "").trim();
    if (!pointId) {
      issues.push({ code: "MISSING_POINT_ID", severity: "error", line, message: `Line ${line} has no point number.` });
      continue;
    }
    if (pointId.length > IMPORT_LIMITS.maxPointIdLength || /[\u0000-\u001f\u007f]/.test(pointId)) {
      issues.push({ code: "POINT_ID_TOO_LONG", severity: "error", line, message: `Line ${line}: the point number is too long or has control characters.` });
      continue;
    }
    const e = readNumber(cells[ei]);
    const n = readNumber(cells[ni]);
    if (e === null || n === null) {
      const which = e === null ? "easting" : "northing";
      const cell = cells[e === null ? ei : ni];
      issues.push({ code: cell ? "NOT_A_NUMBER" : "MISSING_COORDINATE", severity: "error", line, message: `Line ${line}, point ${pointId}: the ${which} ${cell ? `"${cell}" isn't a plain number` : "is missing"}.` });
      continue;
    }
    let z: number | null = null;
    if (zi >= 0 && cells[zi] !== undefined && cells[zi] !== "") {
      z = readNumber(cells[zi]);
      if (z === null) {
        issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Line ${line}, point ${pointId}: the elevation "${cells[zi]}" isn't a plain number.` });
        continue;
      }
    }
    const rawCode = ci >= 0 ? (cells.slice(ci).join(options.delimiter === "whitespace" ? " " : ", ").trim() || null) : null;
    const code = rawCode ? rawCode.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, IMPORT_LIMITS.maxCodeLength) : null;
    const point: ImportedPoint = { line, pointId, e, n, z, code };
    const prior = seen.get(pointId);
    if (prior) {
      if (prior.e === e && prior.n === n && prior.z === z) {
        issues.push({ code: "DUPLICATE_POINT_SAME", severity: "warning", line, message: `Line ${line}: point ${pointId} repeats line ${prior.line} exactly. The first is kept.` });
      } else {
        conflicted.add(pointId);
        issues.push({ code: "DUPLICATE_POINT_CONFLICT", severity: "error", line, message: `Line ${line}: point ${pointId} has different coordinates from line ${prior.line}. Rename one of them in the file.` });
      }
      continue;
    }
    seen.set(pointId, point);
    points.push(point);
  }
  // A point named twice with different coordinates is removed altogether: Farbaek doesn't pick one.
  return { points: points.filter((p) => !conflicted.has(p.pointId)), issues };
}
