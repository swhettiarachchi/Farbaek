/**
 * A firm's code library as a file (stage 226, ADR 0237): Carlson's `.fcl`, which is plain CSV with a published minimum header (Code,
 * Linework, 3D Linework, Layer), or any CSV with a Code column and a Description, Layer or Linework one and no coordinate column. It
 * becomes the plan's code library, as the firm wrote it, for the surveyor to check like any list: how a column maps to a code's kind
 * is Farbaek's reading.
 *
 * - Kind: a Linework value naming a line or polyline (or yes, 1, true) joins consecutive points; anything else is a mark beside a point.
 * - Style: a Linetype naming dashes is dashed; otherwise solid.
 * - Meaning: the Description, else the Layer, else the code itself.
 * - A code longer than a plan's 12 characters is refused by name, never cut short (two would collide); only an exact repeat is a repeat.
 * A plan holds 80 codes, so a larger library contributes the codes the survey files use first, and how many were left out is said.
 * Source: research, "Survey Field to Finish automation" (Carlson SurvPC help, Feature Code List).
 */
import { codeBase, codeEntrySchema, codeOf, type CodeEntry } from "./codes";
import { roleOfHeader } from "./import/columns";

/** 500 KB: with 5 MB of survey data, the request stays under the 6 MB a form may carry. */
export const LIBRARY_LIMITS = { codes: 80, rows: 5_000, bytes: 500_000, codeLength: 12 } as const;

/** The file's records and cells, with double quotes understood: a quoted comma or line break stays in its cell. */
function records(text: string): string[][] {
  const out: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let quoted = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cur.trim());
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cur.trim());
      if (row.some((x) => x !== "")) out.push(row);
      row = [];
      cur = "";
    } else cur += c;
  }
  row.push(cur.trim());
  if (row.some((x) => x !== "")) out.push(row);
  return out;
}

const plain = (h: string) => h.trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
const CODE = /^(?:field ?)?code$/;
const DESCRIPTION = /^(?:description|desc)$/;
const LAYER = /^layer$/;
const LINEWORK = /^(?:linework|2d linework|line ?work)$/;
const LINETYPE = /^line ?type$/;

/**
 * Whether a file is a code library: an .fcl file, or a CSV whose header has a Code column and a Description, Layer or Linework one,
 * and no column the points reader would take for a coordinate ("Easting (m)", "NORTHING_M", "X") or a latitude or longitude.
 */
export function looksLikeCodeLibrary(name: string, text: string): boolean {
  if (/\.fcl$/i.test(name)) return true;
  if (!/\.(csv|txt)$/i.test(name)) return false;
  const header = records(text.slice(0, 4_000))[0] ?? [];
  const h = header.map(plain);
  const has = (re: RegExp) => h.some((c) => re.test(c));
  const coordinate = header.some((c) => {
    const role = roleOfHeader(c);
    return role === "easting" || role === "northing" || role === "x" || role === "y" || /^(?:lat(?:itude)?|lon(?:gitude)?|lng)$/.test(plain(c));
  });
  return has(CODE) && (has(DESCRIPTION) || has(LAYER) || has(LINEWORK)) && !coordinate;
}

export type LibraryRead = { ok: true; entries: CodeEntry[]; total: number; repeated: number; tooLong: string[] } | { ok: false; problem: string };

/** The library's entries, each checked as a code-library entry. */
export function parseCodeLibrary(text: string): LibraryRead {
  if (text.length > LIBRARY_LIMITS.bytes) return { ok: false, problem: `This code library is larger than ${LIBRARY_LIMITS.bytes / 1_000} KB.` };
  const rows = records(text);
  const h = (rows[0] ?? []).map(plain);
  const col = (re: RegExp) => h.findIndex((c) => re.test(c));
  const code = col(CODE);
  if (code < 0) return { ok: false, problem: "This code library has no Code column in its first line." };
  const [description, layer, linework, linetype] = [col(DESCRIPTION), col(LAYER), col(LINEWORK), col(LINETYPE)];
  if (rows.length - 1 > LIBRARY_LIMITS.rows) return { ok: false, problem: `This code library has more than ${LIBRARY_LIMITS.rows} codes.` };
  const entries: CodeEntry[] = [];
  const seen = new Set<string>();
  const tooLong: string[] = [];
  let repeated = 0;
  for (const c of rows.slice(1)) {
    const value = (i: number) => (i >= 0 ? (c[i] ?? "") : "");
    const raw = value(code);
    if (raw.length > LIBRARY_LIMITS.codeLength) {
      tooLong.push(raw.slice(0, 40));
      continue;
    }
    // A meaning is one line on the plan: a quoted line break becomes a space.
    const meaning = (value(description) || value(layer) || raw).split(/\s+/).join(" ").slice(0, 60);
    const joins = /poly|line|^yes$|^y$|^1$|^true$/i.test(value(linework)) && !/^(?:none|no|n|0|false)$/i.test(value(linework));
    const parsed = codeEntrySchema.safeParse({ code: raw, meaning, kind: joins ? "line" : "mark", line: /dash|hidden|dot/i.test(value(linetype)) ? "dashed" : "solid", legend: true });
    if (!parsed.success) continue;
    // Only an exact repeat is one: "BM1" and "BM2", or "P" and "p", are different codes to the plan.
    if (seen.has(parsed.data.code)) {
      repeated++;
      continue;
    }
    seen.add(parsed.data.code);
    entries.push(parsed.data);
  }
  if (entries.length === 0) return { ok: false, problem: tooLong.length > 0 ? `No code in this library could be used: ${tooLong.length === 1 ? "its code is" : "its codes are"} longer than ${LIBRARY_LIMITS.codeLength} characters.` : "No code in this library could be read: each line needs a code, and a description or layer." };
  return { ok: true, entries, total: entries.length, repeated, tooLong };
}

/** A point's code as the plan matches it to the library: its first word, the letters of a numbered code ("MW2 wall" is "MW"). */
const used = (raw: string) => codeBase(codeOf(raw));

/**
 * The library a plan takes: every entry when it fits, otherwise the entries the survey files use (read the way the plan reads a
 * point's code) first, then the rest in the library's order, up to the plan's limit. How many were left out is said.
 */
export function libraryFor(entries: readonly CodeEntry[], usedCodes: readonly string[]): { codes: CodeEntry[]; leftOut: number } {
  if (entries.length <= LIBRARY_LIMITS.codes) return { codes: [...entries], leftOut: 0 };
  const inFiles = new Set(usedCodes.map(used).filter(Boolean));
  const first = entries.filter((e) => inFiles.has(e.code) || inFiles.has(codeBase(e.code)));
  const rest = entries.filter((e) => !first.includes(e));
  const codes = [...first, ...rest].slice(0, LIBRARY_LIMITS.codes);
  return { codes, leftOut: entries.length - codes.length };
}

/** What the start screen says about a library: its size, and what won't be kept. */
export function librarySummary(read: Extract<LibraryRead, { ok: true }>, usedCodes: readonly string[]): string {
  const { leftOut } = libraryFor(read.entries, usedCodes);
  const notes = [
    leftOut > 0 ? `a plan holds ${LIBRARY_LIMITS.codes} codes, so the ones these files use come first and ${leftOut} are left out` : "",
    read.repeated > 0 ? `${read.repeated} repeated ${read.repeated === 1 ? "code" : "codes"} left out` : "",
    read.tooLong.length > 0 ? `${read.tooLong.length} ${read.tooLong.length === 1 ? "code" : "codes"} over ${LIBRARY_LIMITS.codeLength} characters left out (${read.tooLong.slice(0, 3).join(", ")}${read.tooLong.length > 3 ? " and more" : ""})` : "",
  ].filter(Boolean);
  return `Office code library, ${read.total} ${read.total === 1 ? "code" : "codes"}${notes.length ? `: ${notes.join("; ")}` : ""}. It becomes this plan's code list, for you to check once.`;
}
