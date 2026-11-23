/**
 * Field-to-finish (ADR 0204): suggested linework from the codes a total
 * station recorded with each point, as survey CAD tools do. Suggestions only:
 * the surveyor accepts them, and nothing is drawn until they do.
 *
 * The rules, deliberately few and documented (docs/survey/CAD_ENGINE.md):
 * - Points are taken in the order they were imported (the order they were
 *   observed in the field).
 * - Consecutive points whose code is a line or outline code in the library
 *   join into one line. A number on the code keeps separate strings apart:
 *   "MW1" and "MW2" are two walls, "MW" one.
 * - A different code, or the same code with another number, ends the line.
 *   The word "END" after the code ends it after that point; "CLO" closes it.
 *   When both are written, the last one counts.
 * - The words after a code come from the plan's code grammar (grammar.ts,
 *   ADR 0243). The Carlson grammar adds BEG, JPN and PC/PT, and runs a line
 *   through other codes until it's ended.
 * - Outline codes (buildings) always close.
 * - Mark codes stay marks; they're written beside their points.
 * - A point can carry several codes ("CP MW": a post that also ends a wall),
 *   each with its own END or CLO; it joins every line its codes name.
 * - Anything after a slash is the crew's note ("St / found"), never a code.
 * - What reading can't use (a join with nothing to draw, an arc, a line of one
 *   point, a line code lost in a description) is said, never guessed at.
 */
import { codeText, lookupCode, type CodeEntry, type CodeKind } from "./codes";
import type { DrawingFeature } from "./document";
import { GRAMMAR, controlOf, type Control, type Grammar } from "./grammar";
import type { SurveyPoint } from "./parcel";

export interface SuggestedFeature extends Omit<DrawingFeature, "id"> {
  /** Point numbers, for the review list. */
  pointNumbers: string[];
  meaning: string;
}

/** Layers by code: the common list's, then the Survey Department's (DSR Chapter XXII annex 10) fences, walls, drains and tar edges. */
const LAYER_BY_CODE: Record<string, DrawingFeature["layer"]> = {
  MW: "WALLS",
  RW: "WALLS",
  BFDn: "WALLS",
  LF: "FENCES",
  NF: "FENCES",
  EDn: "DRAINS",
  MDn: "DRAINS",
  B: "WALLS",
  U: "WALLS",
  WF: "FENCES",
  WLF: "FENCES",
  WNF: "FENCES",
  DF: "FENCES",
  IF: "FENCES",
  Hg: "FENCES",
  SF: "WALLS",
  BW: "WALLS",
  Dh: "DRAINS",
  Dn: "DRAINS",
  TE: "ROADS",
};

interface CodeOnPoint {
  /** The code as written ("BM1"), its letters ("BM") and its string number ("1"). */
  word: string;
  base: string;
  string: string;
  controls: Control[];
  /** The point numbers a join word names. */
  joins: string[];
  line: boolean;
}

/** What the words on one point say: its codes, joins that have nothing to draw with or no point named, and line codes a description hid. */
interface PointWords {
  codes: CodeOnPoint[];
  orphans: { word: string; target: string | null }[];
  hidden: string[];
}

/**
 * "CP MW2 CLO" is code "CP", then code "MW" in string "2" with control "CLO".
 * The first word is the point's code, as always. Later words are more codes
 * only when every one of them is a code of the library written exactly (same
 * letters, same case), a control word of the grammar, or the point number a
 * join word takes; otherwise they're a description ("MW T jn"), and only the
 * first word, the control words and what a join names count. A control goes
 * with the last line code before it. A code written twice counts once.
 * Under a grammar whose codes win (Carlson), a word that is a code of the
 * library stays a code where the grammar would read it as a control, and in
 * a description only control words in capitals count ("gate pt" isn't PT).
 */
function codesIn(raw: string | null, codes: readonly CodeEntry[], g: Grammar): PointWords {
  const out: CodeOnPoint[] = [];
  const orphans: PointWords["orphans"] = [];
  const all = codeText(raw).split(/\s+/).filter(Boolean);
  const baseOf = (w: string) => /^([A-Za-z]+)\d*$/.exec(w)?.[1] ?? w;
  const isCode = (w: string) => codes.some((c) => c.code === baseOf(w));
  const control = (w: string | undefined, inText = false) => {
    if (w === undefined || (g.codesWin && isCode(w))) return null;
    if (inText && g.capitalsInText && w !== w.toUpperCase()) return null;
    return controlOf(g, w);
  };
  const afterJoin = (i: number, inText = false) => i > 0 && control(all[i - 1], inText) === "join";
  const exact = (w: string, i: number) => isCode(w) || control(w) !== null || afterJoin(i);
  const described = !all.slice(1).every((w, k) => exact(w, k + 1));
  // A description after the code: keep the first word, the control words and what a join word names.
  const words = described ? all.filter((w, i) => i === 0 || control(w, true) !== null || afterJoin(i, true)) : all;
  // Line codes of the library written in a description aren't taken: said, so a wall isn't lost unseen.
  const isLine = (w: string) => codes.some((c) => c.code === baseOf(w) && (c.kind === "line" || c.kind === "outline"));
  const hidden = described ? all.filter((w, i) => i > 0 && !words.includes(w) && isLine(w)) : [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!;
    const c = i > 0 ? control(w, described) : null;
    if (c) {
      const last = [...out].reverse().find((x) => x.line);
      if (c === "join") {
        // A join takes the next word as its point number, whatever it is.
        const target = words[i + 1] ?? null;
        if (target !== null) i++;
        if (last && target !== null) last.joins.push(target);
        else orphans.push({ word: w, target });
        continue;
      }
      if (last) last.controls.push(c);
      continue;
    }
    const m = /^([A-Za-z]+)(\d*)$/.exec(w);
    const base = m ? m[1]! : w;
    const entry = i === 0 ? lookupCode(codes, base) : codes.find((x) => x.code === base);
    if (i > 0 && !(entry && (entry.kind === "line" || entry.kind === "outline"))) continue;
    if (out.some((x) => x.base === base && x.string === (m ? m[2]! : ""))) continue;
    out.push({ word: w, base, string: m ? m[2]! : "", controls: [], joins: [], line: Boolean(entry && (entry.kind === "line" || entry.kind === "outline")) });
  }
  return { codes: out, orphans, hidden };
}

type Run = { entry: CodeEntry; tag: string; pts: SurveyPoint[]; closed: boolean; joined: boolean };

/** What reading the codes found that the surveyor should know: a join to a point that isn't there, a line of one point, an arc drawn straight. */
export interface CodeProblem {
  pointId: string;
  message: string;
  /** For a line of one point: the point's id and the line's code, so a plan that already draws it there isn't told it's missing. */
  id?: string;
  code?: string;
}

/**
 * The lines the codes make, read with the plan's grammar (Farbaek's when none is given). What reading them found is added to
 * `problems`: nothing is guessed or drawn in its place.
 */
export function suggestFeatures(points: readonly SurveyPoint[], codes: readonly CodeEntry[], grammar: Grammar = GRAMMAR.farbaek, problems: CodeProblem[] = []): SuggestedFeature[] {
  const out: SuggestedFeature[] = [];
  const byNumber = new Map(points.map((p) => [p.pointId, p]));
  // Lines being collected, by code and string: a point with two line codes adds to two lines.
  const runs = new Map<string, Run>();
  // An arc begun on a line, by the line, with the point it began at.
  const arcs = new Map<string, string>();
  const say = (pointId: string, message: string) => problems.push({ pointId, message });
  const feature = (entry: CodeEntry, pts: SurveyPoint[], closed: boolean): SuggestedFeature => ({
    layer: entry.kind === "outline" ? "BUILDINGS" : (LAYER_BY_CODE[entry.code] ?? "WALLS"),
    code: entry.code,
    closed,
    points: pts.map((p) => p.id),
    pointNumbers: pts.map((p) => p.pointId),
    meaning: entry.meaning,
  });
  // An arc still open when its line ends, or when another begins on it, is drawn straight and said.
  const openArc = (tag: string, why: string) => {
    const from = arcs.get(tag);
    if (from === undefined) return;
    arcs.delete(tag);
    say(from, `The arc that begins at point ${from} ${why}, so it's drawn as straight segments.`);
  };
  const flush = (tag: string) => {
    const run = runs.get(tag);
    runs.delete(tag);
    openArc(tag, "has no end before its line ends");
    if (!run) return;
    if (run.pts.length >= 2) out.push(feature(run.entry, run.pts, run.entry.kind === "outline" || (run.closed && run.pts.length >= 3)));
    // A point whose only drawing is a join to another point has its segment: it isn't a line of one point.
    else if (!run.joined) problems.push({ pointId: run.pts[0]!.pointId, id: run.pts[0]!.id, code: run.entry.code, message: `The ${run.entry.meaning.toLowerCase()} line at point ${run.pts[0]!.pointId} has only that point, so it isn't drawn.` });
  };
  for (const p of points) {
    const read = codesIn(p.code, codes, grammar);
    for (const o of read.orphans) {
      say(p.pointId, o.target === null ? `Point ${p.pointId} has ${o.word} with no point number after it, so nothing is joined.` : `Point ${p.pointId} joins to point ${o.target} but carries no line code to draw it with, so nothing is joined.`);
    }
    if (read.hidden.length > 0) {
      say(p.pointId, `Point ${p.pointId}'s code "${codeText(p.code)}" reads as ${read.codes[0]?.word ?? "its first word"} with a description, so ${read.hidden.join(" and ")} in it ${read.hidden.length === 1 ? "isn't" : "aren't"} taken as a line. Write the codes on their own, with any description after a slash.`);
    }
    const here = read.codes.flatMap((c) => {
      const entry = lookupCode(codes, c.base);
      return entry && (entry.kind === "line" || entry.kind === "outline") ? [{ entry, tag: `${entry.code}#${c.string}`, controls: c.controls, joins: c.joins }] : [];
    });
    // A line this point doesn't carry ends before it, unless the grammar runs lines through other codes until they're ended.
    if (!grammar.runsThrough) for (const tag of [...runs.keys()]) if (!here.some((h) => h.tag === tag)) flush(tag);
    for (const h of here) {
      // A begin word starts the line afresh: whatever of it was open ends first.
      if (h.controls.includes("begin")) flush(h.tag);
      const run = runs.get(h.tag) ?? { entry: h.entry, tag: h.tag, pts: [], closed: false, joined: false };
      runs.set(h.tag, run);
      run.pts.push(p);
      // Join to a point: one segment from here to that point, beside the line, which carries on from here.
      for (const target of h.joins) {
        const to = byNumber.get(target);
        if (!to) say(p.pointId, `Point ${p.pointId} joins to point ${target}, which isn't in the survey, so that segment isn't drawn.`);
        else if (to.id === p.id) say(p.pointId, `Point ${p.pointId} joins to itself, so nothing is joined.`);
        else {
          out.push(feature(h.entry, [p, to], false));
          run.joined = true;
        }
      }
      if (h.controls.includes("arcStart")) {
        openArc(h.tag, `has no end before point ${p.pointId} begins another`);
        arcs.set(h.tag, p.pointId);
      }
      if (h.controls.includes("arcEnd")) {
        const from = arcs.get(h.tag);
        arcs.delete(h.tag);
        say(p.pointId, from ? `The arc from point ${from} to point ${p.pointId} is drawn as straight segments between its surveyed points: curves aren't drawn yet.` : `Point ${p.pointId} ends an arc that no point began, so nothing is drawn as an arc.`);
      }
      // END or CLO: when both are written, the last one counts.
      const stop = [...h.controls].reverse().find((c) => c === "end" || c === "close");
      if (stop === "close") {
        run.closed = true;
        flush(h.tag);
      } else if (stop === "end") flush(h.tag);
    }
  }
  for (const tag of [...runs.keys()]) flush(tag);
  for (const tag of [...arcs.keys()]) openArc(tag, "has no end");
  return out;
}

/** Every code a survey's points use, how many points carry it, and what the library says it is (null for a code it doesn't know). */
export interface CodeCount {
  code: string;
  count: number;
  kind: CodeKind | null;
  meaning: string | null;
}

/**
 * The code report (stage 234): before anything is drawn, the codes the points carry, which the library knows, the lines they make
 * and what reading them found, so an unknown code or a broken line is seen, not discovered on the plan. A code is matched as the
 * library does (as written, then its letters), counted once per point, and shown as the library names it, or as written when unknown.
 */
export function codeReport(points: readonly SurveyPoint[], codes: readonly CodeEntry[], grammar: Grammar = GRAMMAR.farbaek): { counts: CodeCount[]; lines: number; problems: CodeProblem[] } {
  const tally = new Map<string, { count: number; entry: CodeEntry | null }>();
  for (const p of points) {
    const seen = new Set<string>();
    for (const c of codesIn(p.code, codes, grammar).codes) {
      const entry = lookupCode(codes, c.word) ?? lookupCode(codes, c.base);
      const key = entry?.code ?? c.word;
      if (seen.has(key)) continue;
      seen.add(key);
      const t = tally.get(key) ?? { count: 0, entry };
      t.count++;
      tally.set(key, t);
    }
  }
  const counts = [...tally]
    .map(([code, t]) => ({ code, count: t.count, kind: t.entry?.kind ?? null, meaning: t.entry?.meaning ?? null }))
    .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
  const problems: CodeProblem[] = [];
  const lines = suggestFeatures(points, codes, grammar, problems).length;
  return { counts, lines, problems };
}
