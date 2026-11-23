/**
 * Field code grammars (stage 234, ADR 0243): the words a crew types after a point's code to say where a line begins, ends or closes,
 * kept as data, one preset per convention, instead of fixed in the drawing code.
 *
 * - **Farbaek** (the default, and what every plan used before): END ends a line after its point, CLO closes it. A line runs while
 *   consecutive points carry its code, so a different code in between ends it.
 * - **Carlson** (Carlson Survey, from Carlson's published help): BEG begins a line, END ends it, CLO closes it, and JPN n joins the
 *   point to point n. SurvPC's ST and EL aren't taken: ST would read a Sri Lankan crew's St (stake) as a begin. A line runs through other codes until it's ended, which is what numbered strings and
 *   begin and end words are for. PC and PT mark an arc's ends: they are read and reported, and the arc is drawn as straight segments
 *   between its surveyed points, since curves aren't drawn yet.
 *
 * Civil 3D and Trimble let each firm define its own words, and publish no default spellings, so they have no preset here.
 */

export const GRAMMARS = ["farbaek", "carlson"] as const;
export type GrammarId = (typeof GRAMMARS)[number];

export interface Grammar {
  id: GrammarId;
  /** The convention's name, and the words it reads, for a sentence. */
  label: string;
  words: string;
  /** Both, for a list: "Carlson (BEG, END, CLO, JPN, PC and PT)". */
  name: string;
  begin: readonly string[];
  end: readonly string[];
  close: readonly string[];
  /** Words followed by a point number: a segment from this point to that one. */
  join: readonly string[];
  /** Words marking an arc's first and last points. */
  arcStart: readonly string[];
  arcEnd: readonly string[];
  /** Whether a line runs on through points with other codes until it's ended (Carlson), or stops at the first one (Farbaek). */
  runsThrough: boolean;
  /** Whether a library code beats a control word spelled the same (Carlson: an office's PC power cable stays PC). Farbaek's END and CLO always count, as before. */
  codesWin: boolean;
  /** Whether, in a description after the codes, only control words in capitals count (Carlson: "gate pt" isn't PT). */
  capitalsInText: boolean;
}

export const GRAMMAR: Record<GrammarId, Grammar> = {
  farbaek: { id: "farbaek", label: "Farbaek", words: "END and CLO", name: "Farbaek (END, CLO)", begin: [], end: ["END"], close: ["CLO"], join: [], arcStart: [], arcEnd: [], runsThrough: false, codesWin: false, capitalsInText: false },
  carlson: { id: "carlson", label: "Carlson", words: "BEG, END, CLO, JPN, PC and PT", name: "Carlson (BEG, END, CLO, JPN, PC and PT)", begin: ["BEG"], end: ["END"], close: ["CLO"], join: ["JPN"], arcStart: ["PC"], arcEnd: ["PT"], runsThrough: true, codesWin: true, capitalsInText: true },
};

export type Control = "begin" | "end" | "close" | "join" | "arcStart" | "arcEnd";

/** What a word is in a grammar, ignoring case: a control word, or null for a code or description. */
export function controlOf(g: Grammar, word: string): Control | null {
  const w = word.toUpperCase();
  if (g.begin.includes(w)) return "begin";
  if (g.end.includes(w)) return "end";
  if (g.close.includes(w)) return "close";
  if (g.join.includes(w)) return "join";
  if (g.arcStart.includes(w)) return "arcStart";
  if (g.arcEnd.includes(w)) return "arcEnd";
  return null;
}

/**
 * The grammar an office's code library implies: a Carlson feature code list (.fcl) comes from a Carlson shop, whose crews write
 * Carlson's line words. Any other library says nothing about them, and the plan keeps its grammar.
 */
export function grammarForLibrary(fileName: string): GrammarId | null {
  return /\.fcl$/i.test(fileName.trim()) ? "carlson" : null;
}
