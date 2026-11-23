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

/**
 * Control and invisible formatting characters: C0 and C1 controls, the soft hyphen, zero-width characters, direction marks and
 * overrides, line and paragraph separators, the byte-order mark. A point number or code holding one reads the same as another that
 * doesn't, so two different points could look alike. Every reader refuses them, through `hasInvisible`.
 */
export const INVISIBLE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u2028-\u202e\u2060-\u2069\ufeff\ufff9-\ufffb]/;

/** Letters of the Indic scripts, Sinhala and Tamil among them (U+0900 to U+0DFF). */
const INDIC = /[\u0900-\u0dff]/;

/**
 * Whether text holds a control or invisible character. The zero-width joiner and non-joiner are part of writing Sinhala (the yansaya
 * and rakaransaya: "ප්‍ර") and Tamil, so they're allowed between two letters of those scripts and refused anywhere else.
 */
export function hasInvisible(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (c === "\u200c" || c === "\u200d") {
      if (INDIC.test(text[i - 1] ?? "") && INDIC.test(text[i + 1] ?? "")) continue;
      return true;
    }
    if (INVISIBLE.test(c)) return true;
  }
  return false;
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
  | "DUPLICATE_POINT_CONFLICT"
  | "CODE_NOT_READABLE"
  | "EXTRA_COLUMNS"
  /** An XML file cut short or not well formed where Farbaek reads it. */
  | "FILE_CUT_SHORT"
  /** Records the reader leaves out on purpose (observations, RTK values, references), counted for the surveyor. */
  | "RECORDS_LEFT_OUT"
  /** A point stored again with new values, where the format's own rule is that the later record replaces the earlier. */
  | "DUPLICATE_POINT_REPLACED"
  /** Points worked out from a total station's observations, and how (ADR 0236). */
  | "OBSERVATIONS_REDUCED"
  /** A point worked out twice (given in the file and shot, or shot from two stations), and how far apart. */
  | "OBSERVATION_CHECK"
  /** A field book's legs closing on a known point: the misclosure, never adjusted. */
  | "CLOSURE"
  /** A total station job's traverse closing on a known point: its misclosure, and how it was adjusted when the surveyor chose a rule (ADR 0241). */
  | "TRAVERSE_CLOSURE"
  /** A rule chosen to adjust a traverse by that can't be used: nothing to adjust, or the rule doesn't apply (ADR 0241). */
  | "TRAVERSE_NOT_ADJUSTED"
  /** Something in the file to check by eye: mixed GSI widths, an instrument display setting. */
  | "CHECK_FILE";

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
  // Full-width commas, as some Chinese controller software writes them, are ordinary commas here.
  const all = text.replace(/^﻿/, "").replace(/，/g, ",").split(/\r\n|\r|\n/);
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
/** The most common row length (the longer one on a tie), so one wide row doesn't widen the mapping. */
function usualLength(rows: string[][]): number {
  const counts = new Map<number, number>();
  for (const r of rows) counts.set(r.length, (counts.get(r.length) ?? 0) + 1);
  let best = 0;
  let seen = 0;
  for (const [len, n] of counts) if (n > seen || (n === seen && len > best)) [best, seen] = [len, n];
  return best;
}

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
    // The usual row length, not the widest: a description with spaces in one row mustn't add columns to the mapping.
    columnCount: usualLength(hasHeader ? [first, ...body.slice(0, 50)] : body.slice(0, 50)),
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
    if (pointId.length > IMPORT_LIMITS.maxPointIdLength || hasInvisible(pointId)) {
      issues.push({ code: "POINT_ID_TOO_LONG", severity: "error", line, message: `Line ${line}: the point number is longer than ${IMPORT_LIMITS.maxPointIdLength} characters or has control or invisible characters.` });
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
    // The code is its own cell. A row with more cells than the mapping is read only where the extra cells
    // can only be the rest of a description: a space-separated file whose last column is the code. Anything
    // else is refused with its line, so no text is ever dropped without the person knowing.
    const codeLast = ci >= 0 && ci === options.columns.length - 1;
    if (cells.length > options.columns.length && !(options.delimiter === "whitespace" && codeLast)) {
      issues.push({ code: "EXTRA_COLUMNS", severity: "error", line, message: `Line ${line}, point ${pointId}: the row has ${cells.length} columns and the mapping has ${options.columns.length}. ${options.delimiter === "whitespace" ? "Make the code the last column, or" : "Put quotes around text that contains the separator, or"} map the extra columns.` });
      continue;
    }
    const codeCells = ci < 0 ? [] : codeLast ? cells.slice(ci) : [cells[ci] ?? ""];
    const code = codeCells.join(" ").trim() || null;
    if (code && (code.length > IMPORT_LIMITS.maxCodeLength || hasInvisible(code))) {
      issues.push({ code: "CODE_NOT_READABLE", severity: "error", line, message: `Line ${line}, point ${pointId}: the code is longer than ${IMPORT_LIMITS.maxCodeLength} characters or has control or invisible characters. Nothing is cut short for you.` });
      continue;
    }
    const point: ImportedPoint = { line, pointId, e, n, z, code };
    const prior = seen.get(pointId);
    if (prior) {
      if (prior.e === e && prior.n === n && prior.z === z && prior.code === code) {
        issues.push({ code: "DUPLICATE_POINT_SAME", severity: "warning", line, message: `Line ${line}: point ${pointId} repeats line ${prior.line} exactly. The first is kept.` });
      } else {
        conflicted.add(pointId);
        issues.push({ code: "DUPLICATE_POINT_CONFLICT", severity: "error", line, message: `Line ${line}: point ${pointId} differs from line ${prior.line} in its coordinates, elevation or code. Rename one of them in the file.` });
      }
      continue;
    }
    seen.set(pointId, point);
    points.push(point);
  }
  // A point named twice with different coordinates is removed altogether: Farbaek doesn't pick one.
  return { points: points.filter((p) => !conflicted.has(p.pointId)), issues };
}
