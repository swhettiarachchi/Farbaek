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

/**
 * The Survey Department's codes: Departmental Survey Regulations, Chapter XXII ("Digital Data Management"), annex 3 (boundary point
 * and instrument station codes) and annex 10 (line and point symbols), survey.gov.lk, read 2026-11-15. Official for departmental
 * surveys; whether licensed surveyors are bound by it isn't settled. The station codes' meanings were paired from a misaligned copy of
 * the annex, so the surveyor checks them like any list. Note that here MW is a mark on a wall, a point, where common usage has MW for a
 * masonry wall, a line.
 */
export const DSR_CODES: readonly CodeEntry[] = [
  entry("CoP", "Concrete Fence Post", "mark"),
  entry("WoP", "Wooden Fence Post", "mark"),
  entry("IN", "Iron Nail", "mark"),
  entry("CN", "Concrete Nail", "mark"),
  entry("BN", "Brass Nail", "mark"),
  entry("IRa", "Iron Rail", "mark"),
  entry("IR", "Iron Rod", "mark"),
  entry("L", "Landmark", "mark"),
  entry("MC", "Mark on Cement", "mark"),
  entry("MR", "Mark on Rock", "mark"),
  entry("MW", "Mark on Wall", "mark"),
  entry("OL", "Old Landmark", "mark"),
  entry("St", "Stake", "mark"),
  entry("OTB", "Other Boundary Point", "mark"),
  entry("EP", "Electric Post", "mark"),
  entry("TP", "Telephone Post", "mark"),
  entry("RL", "Rock Landmark", "mark"),
  entry("LR", "Landmark (RDA)", "mark"),
  entry("stncp", "Station: Cement Picket", "mark", "solid", false),
  entry("stnrpb", "Station: Rock Picket Below Surface", "mark", "solid", false),
  entry("stnrp", "Station: Rock Picket", "mark", "solid", false),
  entry("stnss", "Station: Sunk Stone", "mark", "solid", false),
  entry("stngps", "Station: GPS Observation Point", "mark", "solid", false),
  entry("stnotp", "Station: Other Picket", "mark", "solid", false),
  entry("stnlp", "Station: Landmark Picket", "mark", "solid", false),
  entry("stntcp", "Station: Traverse Cement Picket", "mark", "solid", false),
  entry("LF", "Live Fence", "line", "dashed"),
  entry("WF", "Wire Fence", "line", "dashed"),
  entry("WLF", "Wire Live Fence", "line", "dashed"),
  entry("WNF", "Wire Net Fence", "line", "dashed"),
  entry("BW", "Boundary Wall", "line"),
  entry("DF", "Dry Fence", "line", "dashed"),
  entry("IF", "Iron Fence", "line", "dashed"),
  entry("SF", "Stone Fence", "line"),
  entry("Hg", "Hedge", "line", "dashed"),
  entry("TE", "Tar Edge", "line"),
  entry("U", "Undefined", "line"),
  entry("Dh", "Ditch", "line", "dashed"),
  entry("Dn", "Earth Drain", "line", "dashed"),
  entry("Mh", "Manhole", "symbol"),
  entry("SM", "Surface Monument", "symbol"),
  entry("GP", "Geodetic Control Point", "symbol"),
  entry("Tr", "Tree", "symbol", "solid", false),
  entry("kmP", "Kilometre Post", "symbol"),
];

export function dsrCodes(): CodeEntry[] {
  return DSR_CODES.map((c) => ({ ...c }));
}

/** True while the library is exactly the Survey Department's list, which the surveyor checks like any list. */
export function codesAreDsrList(codes: readonly CodeEntry[]): boolean {
  return codes.length === DSR_CODES.length && codes.every((c, i) => JSON.stringify(c) === JSON.stringify(DSR_CODES[i]));
}

/** How many of a file's codes are the Survey Department's and not in the given library: a hint to offer its list. */
export function dsrCodesIn(fileCodes: readonly string[], library: readonly CodeEntry[]): string[] {
  return [...new Set(fileCodes)].filter((c) => !library.some((e) => e.code === c) && DSR_CODES.some((e) => e.code === c));
}

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

/** The letters of a numbered code: "MW1" and "MW2" are two strings of code "MW". A code without a number is itself. */
export function codeBase(code: string): string {
  return /^([A-Za-z]+)\d+$/.exec(code)?.[1] ?? code;
}

/** The library entry for a point's code: its first word as written, else the letters of a numbered code ("MW1" is "MW"). */
export function entryFor(codes: readonly CodeEntry[], raw: string | null | undefined): CodeEntry | null {
  const c = codeOf(raw);
  return lookupCode(codes, c) ?? (codeBase(c) !== c ? lookupCode(codes, codeBase(c)) : null);
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
