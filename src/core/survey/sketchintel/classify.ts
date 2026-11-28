/**
 * What a sketch's line, symbol or area is, from what is written at it and how it is drawn (stage 241, ADR 0249). Tested rules only:
 * a code in the plan's code library first (MW is the library's masonry wall), then words in English and Sinhala, then how the line is
 * drawn, which is weaker evidence and said to be. Nothing written is changed: the label is kept as written beside its reading.
 */
import { codeBase, codeOf, lookupCode, type CodeEntry } from "../codes";
import type { DrawingFeature } from "../document";
import type { SketchLineStyle, SketchSymbolKind } from "./drawing";

/** "building" is a wall of a building: a line with a building's code (P, Permanent Building), drawn as a line like any other. */
export const LINE_KINDS = ["wall", "fence", "drain", "road", "gate", "building", "line"] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface LineClass {
  kind: LineKind;
  /** The library entry the label names, when it names one. */
  code: CodeEntry | null;
  /** Why, in a phrase. */
  why: string;
  /** False when only the way it's drawn says what it is. */
  fromWriting: boolean;
  /** Set when the surveyor's own habit says what a line drawn this way is (stage 298): their word, so nothing is asked. */
  fromHabit?: boolean;
}

/** A surveyor's sketch habit (stage 298, ADR 0304): a line drawn this way, with nothing written along it, is this code on their sketches. */
export interface SketchHabit {
  style: "double" | "crossed";
  code: string;
}

/**
 * The kinds a habit for a style may name: walls for a double line; fences for a line with x marks, as wire fences are drawn, or a
 * building's walls, which some surveyors hatch (stage 298, the owner's word for their father's sketches).
 */
export const HABIT_KINDS: Record<SketchHabit["style"], readonly LineKind[]> = { double: ["wall"], crossed: ["fence", "building"] };

/** What a habit for a style may be, said: "a wall", "a fence or a building's wall". */
export const HABIT_TAKES: Record<SketchHabit["style"], string> = { double: "a wall", crossed: "a fence or a building's wall" };

/** How a style is said: "a double line", "a line with x marks". */
export const STYLE_WORDS: Record<SketchHabit["style"], string> = { double: "a double line", crossed: "a line with x marks" };

/** Whether a code list entry is one a habit for this style may name: a line or an outline of a kind the style is drawn for. */
const habitFits = (style: SketchHabit["style"], c: CodeEntry) => (c.kind === "line" || c.kind === "outline") && HABIT_KINDS[style].includes(kindOfEntry(c));

/**
 * The codes a habit for this style may name (stage 298): the code list's lines and outlines of the kinds the style is drawn for (walls for a
 * double line; fences or a building for x marks), the ones written most on this sketch first, at most three, with the first of each kind
 * among them so a building isn't crowded out by fences.
 */
export function habitChoices(style: SketchHabit["style"], codes: readonly CodeEntry[], written: readonly string[], limit = 3): CodeEntry[] {
  const count = (c: CodeEntry) => written.filter((w) => entryOf(w.trim(), codes)?.code === c.code).length;
  const fitting = codes
    .filter((c) => habitFits(style, c))
    .map((c, i) => ({ c, n: count(c), i }))
    .sort((a, b) => b.n - a.n || a.i - b.i)
    .map((x) => x.c);
  const chosen = new Set(HABIT_KINDS[style].flatMap((k) => fitting.filter((c) => kindOfEntry(c) === k).slice(0, 1)).slice(0, limit));
  for (const c of fitting) if (chosen.size < limit) chosen.add(c);
  return fitting.filter((c) => chosen.has(c));
}

/**
 * The code list's line or outline a habit names, of the kind its style is drawn for (MW the masonry wall, never MW the mark on a wall), or
 * null when this list has none: a habit carried onto a plan with another list does nothing there, and isn't said to.
 */
export function habitEntry(habit: SketchHabit, codes: readonly CodeEntry[]): CodeEntry | null {
  return codes.find((c) => c.code === habit.code && habitFits(habit.style, c)) ?? null;
}

/** "a masonry wall", "an iron fence": a code's meaning as a thing a line is. */
export const asThing = (meaning: string) => `${/^[aeiou]/i.test(meaning.trim()) ? "an" : "a"} ${meaning.trim().toLowerCase()}`;

/** What a line with this code is, said: "a masonry wall", or for a building's code "a wall of a permanent building". */
export const lineThing = (entry: CodeEntry) => (kindOfEntry(entry) === "building" ? `a wall of ${asThing(entry.meaning)}` : asThing(entry.meaning));

/** A habit as the surveyor said it: "a double line is a masonry wall (MW)", "a line with x marks is a wall of a permanent building (P)". */
export const habitSaid = (style: SketchHabit["style"], entry: CodeEntry) => `${STYLE_WORDS[style]} is ${lineThing(entry)} (${entry.code})`;

/** Words that name a kind of line, in English and Sinhala, tried in this order. */
const WORDS: { kind: LineKind; re: RegExp; why: string }[] = [
  // A road's name: "Temple Mawatha", "2nd Lane", "Station Road", or a name run together with an abbreviated Mawatha ("templemw2").
  // "Mw." needs its own pattern: a word boundary can't follow the dot.
  { kind: "road", re: /\b(road|rd|lane|mawatha|path|street|avenue|veediya|para)\b|[a-z]{3,}\s+mw\.?(?=\s|\d|$)|[a-z]{3,}mw\s?\d|(?:^|\s)(?:පාර|මාවත|වීදිය|පටු\s*මඟ)(?:\s|$)/i, why: "it names a road" },
  // A gate is an opening in the boundary, between its two posts: part of the lot's side, never a road.
  { kind: "gate", re: /\b(gate|gateway)\b|ගේට්ටු/i, why: "it names a gate, an opening in the boundary" },
  { kind: "drain", re: /\b(drain|canal|ela|ditch|culvert|gutter)\b|කාණු|ඇළ/i, why: "it names a drain" },
  { kind: "fence", re: /\b(fence|wire|barbed|hedge)\b|වැට/i, why: "it names a fence" },
  { kind: "wall", re: /\b(wall|parapet)\b|බිත්ති|තාප්ප/i, why: "it names a wall" },
];

/** A library entry's kind of line, from its meaning. */
function kindOfEntry(e: CodeEntry): LineKind {
  const m = e.meaning.toLowerCase();
  if (/\bwall\b/.test(m)) return "wall";
  // A building's outline code on a line is a wall of that building (P, Permanent Building), never a free-standing wall.
  if (e.kind === "outline" && /\bbuilding\b/.test(m)) return "building";
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

export function classifyLine(label: string, style: SketchLineStyle, codes: readonly CodeEntry[], habits: readonly SketchHabit[] = []): LineClass {
  const t = label.trim();
  const entry = t ? entryOf(t, codes) : null;
  if (entry && (entry.kind === "line" || entry.kind === "outline")) return { kind: kindOfEntry(entry), code: entry, why: `${t} is the code list's ${entry.meaning.toLowerCase()}`, fromWriting: true };
  for (const w of WORDS) if (t && w.re.test(t)) return { kind: w.kind, code: null, why: w.why, fromWriting: true };
  // Nothing written along it, and the surveyor has said what a line drawn this way is on their sketches (stage 298): their word.
  const habit = !t && (style === "double" || style === "crossed") ? habits.find((h) => h.style === style) : undefined;
  const own = habit ? habitEntry(habit, codes) : null;
  if (habit && own) return { kind: kindOfEntry(own), code: own, why: `it's drawn as ${STYLE_WORDS[habit.style]}, which is ${lineThing(own)} (${own.code}) on your sketches, as you said`, fromWriting: false, fromHabit: true };
  if (style === "double") return { kind: "wall", code: null, why: "it's drawn as a double line, as walls are, with nothing written along it", fromWriting: false };
  if (style === "crossed") return { kind: "fence", code: null, why: "it's drawn with x marks along it, as wire fences are, with nothing written along it", fromWriting: false };
  return { kind: "line", code: null, why: t ? `"${t}" isn't a code in the code list or a word Farbaek knows` : "nothing is written along it", fromWriting: false };
}

/** The drawing layer a kind of line goes on. */
export const LAYER_OF: Record<LineKind, DrawingFeature["layer"]> = { wall: "WALLS", fence: "FENCES", drain: "DRAINS", road: "ROADS", gate: "FENCES", building: "BUILDINGS", line: "BUILDINGS" };

/** Words that name each kind of symbol, in English and Sinhala: a well (ළිඳ), a tree (ගස), a post (කණුව), a gate (ගේට්ටුව). */
const KIND_WORDS: Record<SketchSymbolKind, RegExp | null> = { well: /\bwell\b|ළිඳ/i, tree: /\btree\b|(?:^|\s)ගස(?:\s|$)/i, post: /\bpost\b|කණුව/i, gate: /\bgate\b|ගේට්ටු/i, other: null };

/** Whether a symbol's label is a word for its kind ("well", "ළිඳ"). */
export const namesKind = (kind: SketchSymbolKind, label: string) => Boolean(KIND_WORDS[kind]?.test(label));

/**
 * The code list's entry for a symbol: by its label as a code, else the library's only symbol or mark whose meaning names the kind
 * (Well). When more than one does (a post: concrete, electric, wooden…), none is chosen: `candidates` says which could be.
 */
export function symbolEntry(kind: SketchSymbolKind, label: string, codes: readonly CodeEntry[]): { entry: CodeEntry | null; fromLabel: boolean; candidates: CodeEntry[] } {
  const byLabel = label.trim() ? entryOf(label.trim(), codes) : null;
  if (byLabel && (byLabel.kind === "symbol" || byLabel.kind === "mark")) return { entry: byLabel, fromLabel: true, candidates: [byLabel] };
  const word = KIND_WORDS;
  const re = word[kind];
  const candidates = re ? codes.filter((c) => (c.kind === "symbol" || c.kind === "mark") && re.test(c.meaning)) : [];
  return { entry: candidates.length === 1 ? candidates[0]! : null, fromLabel: false, candidates };
}

export type AreaKind = "building" | "lot" | "road" | "land";

/** The code list's only outline whose meaning is a building (the common list's P, Permanent Building), or null when none or several are. */
export function buildingEntry(codes: readonly CodeEntry[]): CodeEntry | null {
  const found = codes.filter((c) => c.kind === "outline" && /\bbuilding\b/i.test(c.meaning));
  return found.length === 1 ? found[0]! : null;
}

/** Whether writing names a gate (gate, ගේට්ටුව). */
export const isGateWord = (text: string) => /\b(gate|gateway)\b|ගේට්ටු/i.test(text.trim());

/** A road's name written in an area: English, an abbreviated Mawatha, or Sinhala (පාර, මාවත, වීදිය, පටු මඟ). */
const ROAD_NAME = /(?:^|\s)(?:road|rd|lane|mawatha|street|avenue|veediya|para|path|mw)\.?(?:\s+(?:no\.?\s*)?\d+[a-z]?)?$|(?:^|\s)(?:පාර|මාවත|වීදිය|පටු\s*මඟ)(?:\s+\d+)?$/i;
/** Writing about someone's land or a lot, which may name the road beside it: never a road's name. */
const LAND_WORDS = /^(?:land|lands|property|premises|lot)\b|\b(?:land of|claimed by|owned by|property of)\b|ඉඩම/i;

/** Whether writing is a road's name: it ends in a road word (Temple Road, 2nd Lane, පන්සල පාර), and isn't about someone's land. */
export const isRoadName = (text: string) => ROAD_NAME.test(text.trim()) && !LAND_WORDS.test(text.trim());

/** What a labelled area is: a building (P, house), a lot (its letter, or "lot X"), a road (its name), or someone's land (any other writing). */
export function classifyArea(label: string, codes: readonly CodeEntry[]): { kind: AreaKind; name: string; code: CodeEntry | null; why: string } {
  const t = label.trim();
  const entry = entryOf(t, codes);
  if (entry && entry.kind === "outline") return { kind: "building", name: t, code: entry, why: `${t} is the code list's ${entry.meaning.toLowerCase()}` };
  // Never writing about someone's land ("Land of NHDA", "Home garden of …"): a building's word inside it names the land, not a building.
  if (!LAND_WORDS.test(t) && /\b(house|building|bldg|shop|shed)\b|ගෙය|ගෙදර|නිවස|ගොඩනැගිල්ල/i.test(t)) return { kind: "building", name: t, code: null, why: "it names a building" };
  if (isRoadName(t)) return { kind: "road", name: t, code: null, why: "it names a road" };
  // "Lot 12", "lot 3A", "Lot B": a lot by name. A single letter ("B") is a lot too, even where it's also a mark's or symbol's code: only
  // an outline's code (P, a building) is read as the outline, above. A longer code (MW, CP2) written in an area isn't a lot's name.
  const named = /^lot\s+(\d{1,4}[A-Z]?|[A-Z]{1,2}\d{0,3})$/i.exec(t);
  if (named) return { kind: "lot", name: named[1]!.toUpperCase(), code: null, why: "it names a lot" };
  const letter = /^([A-Z]{1,2}\d{0,3})$/i.exec(t);
  if (letter && (t.length === 1 || !entry)) return { kind: "lot", name: letter[1]!.toUpperCase(), code: null, why: "a letter alone marks a lot" };
  return { kind: "land", name: t, code: null, why: "other writing in an area, such as an owner's name" };
}
