/**
 * Codes the points carry that the code library doesn't know, and what each might be (stage 238, ADR 0246). A suggestion is only ever
 * offered: the surveyor presses to add the code to the library with the suggested meaning, and the points keep their codes exactly as
 * the instrument recorded them. Three kinds, strongest first:
 * - the same code in the Survey Department's list or the common list, when the project's library doesn't have it;
 * - a library code whose meaning holds the code as a word ("WALL" and "Masonry Wall");
 * - a library code one letter away ("Wel" and "Well"), for codes of three letters or more, where one letter is a slip of the
 *   keypad rather than a different code.
 */
import { isRoadEdgeCode } from "./autodraft";
import { COMMON_CODES, DSR_CODES, codeBase, lookupCode, type CodeEntry } from "./codes";
import { codeReport } from "./fieldToFinish";
import { GRAMMAR, controlOf, type Grammar } from "./grammar";
import type { SurveyPoint } from "./parcel";

export interface CodeHint {
  /** The library entry to copy, under the unknown code. */
  entry: CodeEntry;
  /** Why it's suggested, in a phrase: "in the Survey Department's list". */
  why: string;
}

/** The longest code a library entry holds (codes.ts), counted as the schema counts it. */
export const CODE_MAX = 12;

/** A road edge with its side or string (RD1, RDL, ROAD2): it draws the road, so it's never a library code. */
export const sidedRoadEdge = (code: string) => isRoadEdgeCode(code) && /(?:1|2|L|R|A|B)$/i.test(code) && !/^(?:RD|ROAD|RE)$/i.test(code);

/**
 * An unknown code, and why it can't simply be added, when it can't:
 * - "road": a road-edge code with no side (RD, ROAD), which keeps the road from being drawn; adding it to the library would also
 *   capture RD1 and RD2, which the library reads by their letters;
 * - "word": one of the grammar's line words written with no code before it, which ends or joins nothing; adding it would make it a
 *   code on every point under a grammar where codes win over words.
 */
export interface UnknownCode {
  code: string;
  count: number;
  not?: "road" | "word";
}

/**
 * Every code on the points that the library doesn't know, with how many points carry it, most used first. Numbered strings of one code
 * ("TREE1", "TREE2") are that code, as the library reads them, so they're offered once, unless their letters are a road edge's (RD3
 * stays RD3: adding "RD" would capture the road). Road edges with a side (RD1, RD2) draw the road and aren't listed.
 */
export function unknownCodes(points: readonly SurveyPoint[], codes: readonly CodeEntry[], grammar: Grammar = GRAMMAR.farbaek): UnknownCode[] {
  const merged = new Map<string, number>();
  for (const c of codeReport(points, codes, grammar).counts) {
    if (c.kind !== null || sidedRoadEdge(c.code)) continue;
    const base = codeBase(c.code);
    const as = base !== c.code && isRoadEdgeCode(base) ? c.code : base;
    merged.set(as, (merged.get(as) ?? 0) + c.count);
  }
  return [...merged]
    .map(([code, count]): UnknownCode => ({ code, count, ...(isRoadEdgeCode(code) ? { not: "road" as const } : controlOf(grammar, code) ? { not: "word" as const } : {}) }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
}

/** Damerau-Levenshtein distance of at most one, ignoring case: one letter added, dropped, changed, or two swapped. */
export function oneApart(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  if (x === y) return false;
  if (Math.abs(x.length - y.length) > 1) return false;
  if (x.length === y.length) {
    const diff = [...x].flatMap((c, i) => (c === y[i] ? [] : [i]));
    if (diff.length === 1) return true;
    return diff.length === 2 && diff[1] === diff[0]! + 1 && x[diff[0]!] === y[diff[1]!] && x[diff[1]!] === y[diff[0]!];
  }
  const [short, long] = x.length < y.length ? [x, y] : [y, x];
  for (let i = 0; i < long.length; i++) if (long.slice(0, i) + long.slice(i + 1) === short) return true;
  return false;
}

const words = (meaning: string) => meaning.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
/** What a press would add, apart from the code: two suggestions that add the same are one. */
const adds = (e: CodeEntry) => [e.meaning.trim().toLowerCase(), e.kind, e.line, e.legend].join("\u0000");

/** Up to three suggestions for an unknown code, strongest first, never two of the same entry. */
export function codeHints(code: string, library: readonly CodeEntry[]): CodeHint[] {
  const c = code.trim();
  if (!c || c.length > CODE_MAX || lookupCode(library, c)) return [];
  const out: CodeHint[] = [];
  const seen = new Set<string>();
  const offer = (entry: CodeEntry, why: string) => {
    if (out.length >= 3 || seen.has(adds(entry))) return;
    seen.add(adds(entry));
    out.push({ entry, why });
  };
  const lists: { entries: readonly CodeEntry[]; name: string }[] = [
    { entries: DSR_CODES, name: "the Survey Department's list" },
    { entries: COMMON_CODES, name: "the common list" },
  ];
  for (const l of lists) {
    const e = lookupCode(l.entries, c);
    if (e) offer(e, `in ${l.name}`);
  }
  const others = [...DSR_CODES, ...COMMON_CODES];
  // A meaning that ends with the word names that thing ("Live Fence" for FENCE) before one that only mentions it ("Fence Post").
  if (c.length >= 3) {
    const word = c.toLowerCase();
    const named = [library, others].flatMap((pool, p) => pool.flatMap((e, i) => (words(e.meaning).includes(word) ? [{ e, rank: words(e.meaning).at(-1) === word ? 0 : 1, p, i }] : [])));
    named.sort((a, b) => a.rank - b.rank || a.p - b.p || a.i - b.i);
    for (const n of named) offer(n.e, `its meaning has "${c}" in it`);
  }
  for (const pool of [library, others]) {
    if (c.length >= 3) for (const e of pool) if (e.code.length >= 3 && oneApart(c, e.code)) offer(e, `one letter from ${e.code}`);
  }
  return out;
}

/**
 * The library entry a press adds: the suggestion's meaning and drawing under the code as the points carry it, or a blank to fill in.
 * Only offered for a code of CODE_MAX or fewer, so it is never cut (a cut code would never match the points).
 */
export function adoptCode(code: string, hint: CodeHint | null): CodeEntry {
  const c = code.trim();
  return hint ? { ...hint.entry, code: c } : { code: c, meaning: "Describe it", kind: "mark", line: "solid", legend: true };
}
