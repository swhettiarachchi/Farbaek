/**
 * What every point-file reader shares (stage 194): the size and text guard,
 * and one rule for repeated point numbers, so a GSI, SDR or LandXML file is
 * held to the same standard as a CSV. Identical repeats are kept once with a
 * warning; a number repeated with different values is refused outright and
 * Farbaek picks neither.
 */
import { IMPORT_LIMITS, type ImportedPoint, type ImportIssue } from "./delimited";

/** A file's text checked before reading: not too large, not binary. Null when fine. */
export function guardFile(text: string, binaryHint: string): ImportIssue | null {
  if (new TextEncoder().encode(text).length > IMPORT_LIMITS.maxBytes) {
    return { code: "FILE_TOO_LARGE", severity: "error", line: null, message: `The file is over ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB. Split it, or export only the points this plan needs.` };
  }
  if (text.includes("\u0000")) return { code: "NOT_TEXT", severity: "error", line: null, message: binaryHint };
  return null;
}

/** Splits text into numbered lines (CR, LF or CR LF), dropping a byte-order mark. */
export function numberedLines(text: string): { line: number; text: string }[] {
  return text
    .replace(/^﻿/, "")
    .split(/\r\n|\r|\n/)
    .map((t, i) => ({ line: i + 1, text: t }));
}

/** A point number as it may be stored: 1 to 32 characters, no control characters. */
export function pointIdProblem(id: string): string | null {
  if (!id) return "has no point number";
  if (id.length > IMPORT_LIMITS.maxPointIdLength || /[\u0000-\u001f\u007f]/.test(id)) return "has a point number that's too long or has control characters";
  return null;
}

/** A code as it may be stored, or the problem with it. */
export function codeProblem(code: string | null): string | null {
  if (code && (code.length > IMPORT_LIMITS.maxCodeLength || /[\u0000-\u001f\u007f]/.test(code))) return `has a code longer than ${IMPORT_LIMITS.maxCodeLength} characters or with control characters`;
  return null;
}

/** Applies the repeated-number rule to points read in file order. */
export function finishPoints(read: ImportedPoint[], issues: ImportIssue[]): { points: ImportedPoint[]; issues: ImportIssue[] } {
  const seen = new Map<string, ImportedPoint>();
  const conflicted = new Set<string>();
  const points: ImportedPoint[] = [];
  for (const p of read) {
    const prior = seen.get(p.pointId);
    if (prior) {
      if (prior.e === p.e && prior.n === p.n && prior.z === p.z && prior.code === p.code) {
        issues.push({ code: "DUPLICATE_POINT_SAME", severity: "warning", line: p.line, message: `Line ${p.line}: point ${p.pointId} repeats line ${prior.line} exactly. The first is kept.` });
      } else {
        conflicted.add(p.pointId);
        issues.push({ code: "DUPLICATE_POINT_CONFLICT", severity: "error", line: p.line, message: `Line ${p.line}: point ${p.pointId} differs from line ${prior.line} in its coordinates, elevation or code. Rename one of them in the instrument or the file.` });
      }
      continue;
    }
    seen.set(p.pointId, p);
    points.push(p);
  }
  if (read.length > IMPORT_LIMITS.maxRows) return { points: [], issues: [{ code: "TOO_MANY_ROWS", severity: "error", line: null, message: `The file has ${read.length} points; the limit is ${IMPORT_LIMITS.maxRows}.` }] };
  return { points: points.filter((p) => !conflicted.has(p.pointId)), issues };
}

/** A decimal from an integer string and a count of implied decimals, through text so 0.001 stays 0.001: ("-", "00000992", 3) is -0.992. */
export function impliedDecimal(sign: "+" | "-", digits: string, decimals: number): number {
  const d = digits.padStart(decimals + 1, "0");
  const text = `${sign === "-" ? "-" : ""}${d.slice(0, d.length - decimals)}${decimals > 0 ? `.${d.slice(d.length - decimals)}` : ""}`;
  return Number(text) === 0 ? 0 : Number(text);
}
