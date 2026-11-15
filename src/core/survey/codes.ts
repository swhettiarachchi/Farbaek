/**
 * The code library: what each field code means on a plan and how it's drawn
 * (ADR 0204). Total stations record a short code with every point; the
 * library turns those codes into marks, lines, outlines and symbols, and the
 * legend ("Reference") lists only the codes a plan uses.
 *
 * The defaults are the vocabulary seen on real Sri Lankan plans
 * (docs/survey/REFERENCE_PLANS_ANALYSIS.md). They are common usage, not an
 * official list: the sheet's legend says so until the surveyor reviews them,
 * and every entry can be changed per project.
 */
import { z } from "zod";

export const CODE_KINDS = ["mark", "line", "outline", "symbol"] as const;
export type CodeKind = (typeof CODE_KINDS)[number];
export const LINE_STYLES = ["solid", "dashed", "ticked"] as const;
export type LineStyle = (typeof LINE_STYLES)[number];

const text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u001f\u007f]/g, "").trim());

export const codeEntrySchema = z.object({
  code: text(12).pipe(z.string().min(1)),
  meaning: text(60).pipe(z.string().min(1)),
  /** mark: a code written beside a point; line: consecutive points joined; outline: joined and closed; symbol: drawn as a symbol. */
  kind: z.enum(CODE_KINDS),
  line: z.enum(LINE_STYLES),
  /** Listed in the legend when used. Off for codes written out in words on the plan, like "Well". */
  legend: z.boolean(),
});
export type CodeEntry = z.infer<typeof codeEntrySchema>;

const entry = (code: string, meaning: string, kind: CodeKind, line: LineStyle = "solid", legend = true): CodeEntry => ({ code, meaning, kind, line, legend });

/** Common Sri Lankan usage, as seen on practising surveyors' plans. Not an official list. */
export const COMMON_CODES: readonly CodeEntry[] = [
  entry("B", "Bank", "line", "ticked"),
  entry("BFDn", "Boundary Foundation", "line"),
  entry("EDn", "Earth Drain", "line", "dashed"),
  entry("MDn", "Masonry Drain", "line", "dashed"),
  entry("MW", "Masonry Wall", "line"),
  entry("RW", "Retaining Wall", "line"),
  entry("LF", "Live Fence", "line", "dashed"),
  entry("NF", "Net Fence", "line", "dashed"),
  entry("U", "Undefined", "line"),
  entry("CP", "Concrete Post", "mark"),
  entry("EP", "Electric Post", "mark"),
  entry("TP", "Telephone Post", "mark"),
  entry("St", "Stake", "mark"),
  entry("OSt", "Old Stake", "mark"),
  entry("M", "Mark", "mark"),
  entry("Cul", "Culvert", "mark"),
  entry("P", "Permanent Building", "outline"),
  entry("T", "Toilet", "outline"),
  entry("Well", "Well", "symbol", "solid", false),
];

export function commonCodes(): CodeEntry[] {
  return COMMON_CODES.map((c) => ({ ...c }));
}

/** True while the library is still exactly the common list, so the legend can say it hasn't been reviewed. */
export function codesAreCommonList(codes: readonly CodeEntry[]): boolean {
  return codes.length === COMMON_CODES.length && codes.every((c, i) => JSON.stringify(c) === JSON.stringify(COMMON_CODES[i]));
}

/** The library entry for a point's code, matched exactly first, then ignoring case. */
export function lookupCode(codes: readonly CodeEntry[], code: string | null | undefined): CodeEntry | null {
  const c = (code ?? "").trim();
  if (!c) return null;
  return codes.find((e) => e.code === c) ?? codes.find((e) => e.code.toLowerCase() === c.toLowerCase()) ?? null;
}

/** The first word of a field code: total stations often record "MW wall corner", where the code is "MW". */
export function codeOf(raw: string | null | undefined): string {
  return codeText(raw).split(/\s+/)[0] ?? "";
}

/** A point's codes without its note: the field note after a slash ("St / found") is the crew's, not a code. */
export function codeText(raw: string | null | undefined): string {
  return (raw ?? "").split("/")[0]!.trim();
}

/** The note after a slash in a point's code, or empty. */
export function codeNote(raw: string | null | undefined): string {
  const i = (raw ?? "").indexOf("/");
  return i < 0 ? "" : raw!.slice(i + 1).trim();
}
