/**
 * What a sketch's line, symbol or area is, from what is written at it and how it is drawn (stage 241, ADR 0249). Tested rules only:
 * a code in the plan's code library first (MW is the library's masonry wall), then words in English and Sinhala, then how the line is
 * drawn, which is weaker evidence and said to be. Nothing written is changed: the label is kept as written beside its reading.
 */
import { codeBase, codeOf, lookupCode, type CodeEntry } from "../codes";
import type { DrawingFeature } from "../document";
import type { SketchLineStyle, SketchSymbolKind } from "./drawing";

export const LINE_KINDS = ["wall", "fence", "drain", "road", "line"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface LineClass {
  kind: LineKind;
  /** The library entry the label names, when it names one. */
  code: CodeEntry | null;
  /** Why, in a phrase. */
  why: string;
  /** False when only the way it's drawn says what it is. */
  fromWriting: boolean;
}

/** Words that name a kind of line, in English and Sinhala, tried in this order. */
const WORDS: { kind: LineKind; re: RegExp; why: string }[] = [
  // A road's name: "Janatha Mawatha", "5th Lane", "Station Road", or a name run together with an abbreviated Mawatha ("janathamw5").
  // "Mw." needs its own pattern: a word boundary can't follow the dot.
  { kind: "road", re: /\b(road|rd|lane|mawatha|path|street|avenue|veediya|para)\b|[a-z]{3,}\s+mw\.?(?=\s|\d|$)|[a-z]{3,}mw\s?\d|පාර|මාවත|වීදිය|පටුමඟ/i, why: "it names a road" },
  { kind: "drain", re: /\b(drain|canal|ela|ditch|culvert|gutter)\b|කාණු|ඇළ/i, why: "it names a drain" },
  { kind: "fence", re: /\b(fence|wire|barbed|hedge)\b|වැට/i, why: "it names a fence" },
  { kind: "wall", re: /\b(wall|parapet)\b|බිත්ති|තාප්ප/i, why: "it names a wall" },
];

/** A library entry's kind of line, from its meaning. */
function kindOfEntry(e: CodeEntry): LineKind {
  const m = e.meaning.toLowerCase();
  if (/\bwall\b/.test(m)) return "wall";
  if (/\b(fence|hedge)\b/.test(m)) return "fence";
  if (/\b(drain|ditch|canal)\b/.test(m)) return "drain";
  if (/\b(road|tar edge|edge)\b/.test(m)) return "road";
  return "line";
}

/** A label that is one code, or a numbered string of one (MW, MW2): the library's entry for it, or null. */
function entryOf(label: string, codes: readonly CodeEntry[]): CodeEntry | null {
  const word = codeOf(label);
  if (!word || word !== label.trim()) return null;
  return lookupCode(codes, word) ?? (codeBase(word) !== word ? lookupCode(codes, codeBase(word)) : null);
}

export function classifyLine(label: string, style: SketchLineStyle, codes: readonly CodeEntry[]): LineClass {
  const t = label.trim();
  const entry = t ? entryOf(t, codes) : null;
  if (entry && (entry.kind === "line" || entry.kind === "outline")) return { kind: kindOfEntry(entry), code: entry, why: `${t} is the code list's ${entry.meaning.toLowerCase()}`, fromWriting: true };
  for (const w of WORDS) if (t && w.re.test(t)) return { kind: w.kind, code: null, why: w.why, fromWriting: true };
  if (style === "double") return { kind: "wall", code: null, why: "it's drawn as a double line, as walls are, with nothing written along it", fromWriting: false };
  if (style === "crossed") return { kind: "fence", code: null, why: "it's drawn with x marks along it, as wire fences are, with nothing written along it", fromWriting: false };
  return { kind: "line", code: null, why: t ? `"${t}" isn't a code in the code list or a word Farbaek knows` : "nothing is written along it", fromWriting: false };
}

/** The drawing layer a kind of line goes on. */
export const LAYER_OF: Record<LineKind, DrawingFeature["layer"]> = { wall: "WALLS", fence: "FENCES", drain: "DRAINS", road: "ROADS", line: "BUILDINGS" };

/**
 * The code list's entry for a symbol: by its label as a code, else the library's only symbol or mark whose meaning names the kind
 * (Well). When more than one does (a post: concrete, electric, wooden…), none is chosen: `candidates` says which could be.
 */
export function symbolEntry(kind: SketchSymbolKind, label: string, codes: readonly CodeEntry[]): { entry: CodeEntry | null; fromLabel: boolean; candidates: CodeEntry[] } {
  const byLabel = label.trim() ? entryOf(label.trim(), codes) : null;
  if (byLabel && (byLabel.kind === "symbol" || byLabel.kind === "mark")) return { entry: byLabel, fromLabel: true, candidates: [byLabel] };
  const word: Record<SketchSymbolKind, RegExp | null> = { well: /\bwell\b/i, tree: /\btree\b/i, post: /\bpost\b/i, gate: /\bgate\b/i, other: null };
  const re = word[kind];
  const candidates = re ? codes.filter((c) => (c.kind === "symbol" || c.kind === "mark") && re.test(c.meaning)) : [];
  return { entry: candidates.length === 1 ? candidates[0]! : null, fromLabel: false, candidates };
}

export type AreaKind = "building" | "lot" | "land";

/** What a labelled area is: a building (P, house), a lot (its letter, or "lot X"), or someone's land (any other writing). */
export function classifyArea(label: string, codes: readonly CodeEntry[]): { kind: AreaKind; name: string; code: CodeEntry | null; why: string } {
  const t = label.trim();
  const entry = entryOf(t, codes);
  if (entry && entry.kind === "outline") return { kind: "building", name: t, code: entry, why: `${t} is the code list's ${entry.meaning.toLowerCase()}` };
  if (/\b(house|building|bldg|shop|shed)\b|ගෙය|නිවස|ගොඩනැගිල්ල/i.test(t)) return { kind: "building", name: t, code: null, why: "it names a building" };
  // "Lot 12", "lot 3A", "Lot B": a lot by name. A single letter ("B") is a lot too, even where it's also a mark's or symbol's code: only
  // an outline's code (P, a building) is read as the outline, above. A longer code (MW, CP2) written in an area isn't a lot's name.
  const named = /^lot\s+(\d{1,4}[A-Z]?|[A-Z]{1,2}\d{0,3})$/i.exec(t);
  if (named) return { kind: "lot", name: named[1]!.toUpperCase(), code: null, why: "it names a lot" };
  const letter = /^([A-Z]{1,2}\d{0,3})$/i.exec(t);
  if (letter && (t.length === 1 || !entry)) return { kind: "lot", name: letter[1]!.toUpperCase(), code: null, why: "a letter alone marks a lot" };
  return { kind: "land", name: t, code: null, why: "other writing in an area, such as an owner's name" };
}
