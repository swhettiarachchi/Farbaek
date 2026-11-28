/**
 * The Sketch Intelligence Engine's interpretation (stage 241, ADR 0249): a sketch's drawing joined to the surveyed points, every
 * relationship tested against the coordinates, and each one turned into a proposal with its evidence, or a question with its reason.
 *
 * - Positions come only from the survey: a sketch says which points join and what a line is, never where anything is.
 * - Each proposal waits for the surveyor's confirmation. Its level says how much the evidence supports it: "strong" (every number
 *   matched as written, the line clearly drawn, and the coordinates agree within the tight tolerance) or "check" (anything less).
 * - Tolerances are Farbaek's defaults, said as such, and passed in: `onLine` decides whether a point lies on a straight side or is a
 *   corner, `tight` whether it lies close enough to be strong evidence. Neither is a rule of surveying: a point between the two is
 *   taken as on its side and asked about.
 * - A corner is judged by how far a point lies off the straight line between its neighbours, never by the angle it turns through: two
 *   points a few centimetres apart on a straight wall can turn by more than 10° between them and still lie on it.
 * - What the evidence can't settle (an unmatched number, a line with nothing written along it, a road without its width, a building
 *   without numbered corners) becomes a question for the surveyor; nothing is guessed in its place.
 */
import { fitArc, type ArcRun } from "../arcs";
import { codeOf, lookupCode, type CodeEntry } from "../codes";
import { cornerId, squareReference, type SquareCorner } from "../construct";
import type { DrawingFeature } from "../document";
import { area, distance, orient, pointSegmentDistance, segmentsIntersect, signedArea, type Point } from "../geometry";
import type { SurveyPoint } from "../parcel";
import { roadWidth } from "../roads";
import { printable } from "./apply";
import { buildingEntry, classifyArea, classifyLine, isRoadName, LAYER_OF, namesKind, symbolEntry, type LineKind, type SketchHabit } from "./classify";
import type { SketchArea, SketchDrawing, SketchLine } from "./drawing";
import { indexPoints, matchNote, matchPoint, type PointIndex } from "./match";
import { facesOf, within, type Face } from "./faces";
import { misplacedNumbers, photoPlaces, type PlacedNumber } from "./placement";

export interface InterpretOptions {
  /**
   * The numbers read with doubt on each photo (a 16 that may be 91, a number the reads disagreed on): a line through one is never
   * settled by reads agreeing, only by a sure read (stage 295 review).
   */
  doubtfulNumbers?: readonly { file: string; label: string }[];
  /** The surveyor's own sketch habits (stage 298): what a line drawn double, or with x marks, with nothing written along it, is. */
  habits?: readonly SketchHabit[];
  /** A point within this many metres of the straight line between its neighbours lies on that side; further off, it's a corner. Farbaek's default: 0.25 m. */
  onLineM?: number;
  /** Within this many metres, the coordinates are strong evidence for the line. Farbaek's default: 0.10 m. */
  tightM?: number;
  /** The extent stated for the land, m², to compare with the lot's computed area (never to choose an outline by). */
  statedM2?: number | null;
  /** Road widths written in the readings ("15'", "4.5 m"), as written. */
  widths?: readonly string[];
  /** Road names written in the readings, as written: with one, a road between two surveyed sides can be drawn (stage 243). */
  roadNames?: readonly string[];
  /**
   * Road widths and names read with doubt (stage 245, ADR 0253): never taken, and never a reason to draw a road, but counted, so a
   * conflict with a clear one is still asked about and a width written with doubt isn't said to be missing.
   */
  doubtfulWidths?: readonly string[];
  doubtfulRoadNames?: readonly string[];
  /** The point numbers the reader placed on each photo (stage 247): only to ask about a number written where another point belongs. */
  placed?: readonly PlacedNumber[];
  /**
   * Other writing the reader placed on each photo, as written (stage 254, ADR 0262): only to say which area the sketch's lines close
   * round a label is written in, never a position on the ground.
   */
  labels?: readonly { text: string; file: string; x: number; y: number }[];
  /**
   * Where each gate is written or drawn (stage 254), as the point numbers it's at: one for a word or a symbol at a point, the line's for a
   * gate drawn as a line. A gate in the lot's side opens onto a road or a path.
   */
  gates?: readonly (readonly string[])[];
}

export type Level = "strong" | "check";

interface Base {
  /** What it puts on the plan is called this: from its kind and its surveyed points, never from where the reader listed it (`itemId`). */
  id: string;
  /** The sketch element(s) it comes from: l3, s1, a2. */
  from: string[];
  file: string;
  evidence: string[];
  level: Level;
}

export interface LineProposal extends Base {
  kind: "line";
  feature: LineKind;
  layer: DrawingFeature["layer"];
  code: string;
  label: string;
  points: SurveyPoint[];
  closed: boolean;
  arcs: ArcRun[];
  /** Drawn dashed on the sketch (a roof's edge, a proposed line): drawn dashed on the plan too (stage 254). */
  dashed: boolean;
  /** Drawn on past its first or last point on the sketch, a neighbour's wall carrying on: drawn so on the plan (stage 261). */
  runsOn: "start" | "end" | "both" | null;
  /**
   * Where it runs is in no doubt (stage 294): every number on it matched a surveyed point exactly, its points lie on it, and the reader
   * was sure of the line or at least two separate reads drew it (stage 295). Its kind may still be asked about; that's a question of its own.
   */
  settled?: boolean;
}

export interface LotProposal extends Base {
  kind: "lot";
  label: string;
  corners: SurveyPoint[];
  /** Points the sketch draws on the lot's sides, which aren't corners of it. */
  onSides: SurveyPoint[];
  areaM2: number;
}

export interface SymbolProposal extends Base {
  kind: "symbol";
  code: string;
  meaning: string;
  point: SurveyPoint;
}

export interface BuildingProposal extends Base {
  kind: "building";
  code: string;
  label: string;
  points: SurveyPoint[];
}

/**
 * A road between two surveyed sides (stage 243): named on the sketch, its near side the lot's side facing it and the lines that carry
 * that side on, its far side a line drawn across from it. Every point is a surveyed one; its width is measured, never taken from writing.
 */
export interface RoadProposal extends Base {
  kind: "road";
  name: string;
  /** The near side, along the lot. */
  edgeA: SurveyPoint[];
  /** The far side, across from it, running the same way. */
  edgeB: SurveyPoint[];
  widthM: { min: number; max: number };
}

export type Proposal = LineProposal | LotProposal | SymbolProposal | BuildingProposal | RoadProposal;

export interface Question {
  from: string[];
  file: string;
  text: string;
  evidence: string[];
  /** The item the sketch put on the plan that the question is about (its id, sk-…), when there is one. */
  item?: string;
  /**
   * What answers it: confirming or removing that item, giving the lot its label, or drawing the road with both its edges. Without it,
   * it stays while the drawing says so.
   */
  answeredBy?: "confirm" | "label" | "road";
  /**
   * A correction the surveyor can make in one press (stage 249, ADR 0257): the reading on a photo, its number as the engine reads it,
   * and the one surveyed point the evidence points to. Never applied without that press.
   */
  suggest?: { file: string; reading: string; label: string; to: string };
  /**
   * Every line it bears on, when it's more than the item that answers it (stage 295): two lines that cross where no number is may carry
   * the misread number in either, so neither counts as settled until it's answered.
   */
  lines?: string[];
}

/**
 * A square corner the sketch draws between two surveyed points without a number (stage 262, ADR 0270): put between them in the lines
 * and outlines the sketch adds, as a recipe from surveyed points.
 */
export interface SquareCornerProposal extends SquareCorner {
  /** The two surveyed points it lies between, as the sketch draws it. */
  between: [string, string];
  sketch: string[];
  file: string;
}

export interface SketchInterpretation {
  proposals: Proposal[];
  /** Square corners drawn without a number; absent when the sketch has none. */
  corners?: SquareCornerProposal[];
  questions: Question[];
  /** Every point number written on the drawing, and how it matched. */
  matches: { label: string; pointId: string | null; how: string }[];
}

const m = (v: number) => `${v.toFixed(2)} m`;
const list = (xs: readonly string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const ids = (ps: readonly SurveyPoint[]) => ps.map((p) => p.pointId);
const deg = (r: number) => (r * 180) / Math.PI;

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** A ring of ids written one way: from its smallest id, in the direction whose next id is smaller. The same ring, however read, gives one key. */
export function ringKey(ring: readonly string[]): string {
  if (ring.length === 0) return "";
  let k = 0;
  ring.forEach((id, i) => {
    if (id < ring[k]!) k = i;
  });
  const fwd = [...ring.slice(k), ...ring.slice(0, k)];
  const back = [fwd[0]!, ...fwd.slice(1).reverse()];
  return (fwd[1] ?? "") <= (back[1] ?? "") ? fwd.join("|") : back.join("|");
}

/** Two FNV-1a hashes of a text, in base 36: short, stable, and different for different things in practice. */
function fingerprint(s: string): string {
  const fnv = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return h.toString(36).padStart(7, "0");
  };
  return `${fnv(0x811c9dc5)}${fnv(0x2f6b3a17)}`;
}

/**
 * The id of what a proposal puts on the plan, from what it is: its kind and its surveyed points (a line either way along it, a ring
 * from any start), and a symbol's code. So the same thing read twice has one id, and two different things never share one, whatever
 * order a reader lists them in.
 */
export function itemId(kind: Proposal["kind"], pointIds: readonly string[], extra = ""): string {
  const fwd = pointIds.join("|");
  const back = [...pointIds].reverse().join("|");
  const key = kind === "lot" || kind === "building" ? ringKey(pointIds) : fwd <= back ? fwd : back;
  return `sk-${{ lot: "lot", line: "l", symbol: "s", building: "b", road: "r" }[kind]}-${fingerprint(`${kind}#${key}#${extra}`)}`;
}

/** The points between two corners, by index, going forward (round the end of a ring when `b` comes first). */
const between = (n: number, a: number, b: number) => (b > a ? range(a + 1, b) : [...range(a + 1, n), ...range(0, b)]);

/**
 * Where a run of points (or a ring, when closed) turns, by index. One at a time, the point lying closest to the straight line between
 * its neighbours is taken as on that line, while it lies within `onLine` metres of it; then any point left more than `onLine` off its
 * side is a corner after all. So every point that isn't a corner lies within `onLine` of the straight side it's on. Nothing is moved.
 */
export function cornerIndexes(pts: readonly Point[], closed: boolean, onLine: number): number[] {
  const n = pts.length;
  let kept = range(0, n);
  const min = closed ? 3 : 2;
  while (kept.length > min) {
    let best = -1;
    let bestOff = Infinity;
    for (let j = closed ? 0 : 1; j < (closed ? kept.length : kept.length - 1); j++) {
      const off = pointSegmentDistance(pts[kept[j]!]!, pts[kept[(j - 1 + kept.length) % kept.length]!]!, pts[kept[(j + 1) % kept.length]!]!);
      if (off < bestOff) [best, bestOff] = [j, off];
    }
    if (best < 0 || bestOff > onLine) break;
    kept = kept.filter((_, j) => j !== best);
  }
  for (let changed = true; changed; ) {
    changed = false;
    for (let s = 0; s < (closed ? kept.length : kept.length - 1) && !changed; s++) {
      const [a, b] = [kept[s]!, kept[(s + 1) % kept.length]!];
      const worst = between(n, a, b).reduce(
        (w, i) => {
          const off = pointSegmentDistance(pts[i]!, pts[a]!, pts[b]!);
          return off > w.off ? { i, off } : w;
        },
        { i: -1, off: onLine },
      );
      if (worst.i >= 0) {
        kept = [...kept, worst.i].sort((x, y) => x - y);
        changed = true;
      }
    }
  }
  return kept;
}

/** Each point that isn't a corner, with the side it lies on (by index) and how far off that side's straight line it lies. */
function sideOffsets(pts: readonly SurveyPoint[], kept: readonly number[], closed: boolean): { i: number; a: number; b: number; off: number }[] {
  const out: { i: number; a: number; b: number; off: number }[] = [];
  for (let s = 0; s < (closed ? kept.length : kept.length - 1); s++) {
    const [a, b] = [kept[s]!, kept[(s + 1) % kept.length]!];
    for (const i of between(pts.length, a, b)) out.push({ i, a, b, off: pointSegmentDistance(pts[i]!, pts[a]!, pts[b]!) });
  }
  return out;
}

/**
 * Matches a line's numbers: the points, in order, or the reasons it can't be drawn. A line that ends on the number it starts with is
 * a closed outline written round to its start: the repeat is dropped and the line is closed.
 */
function matchLine(line: SketchLine, index: PointIndex): { points: SurveyPoint[]; notes: string[]; unmatched: string[]; exact: boolean; closes: boolean; corners: [SurveyPoint, SurveyPoint][] } {
  const r = matchPoints(line.points, index);
  const round = r.points.length >= 4 && r.points[0]!.id === r.points.at(-1)!.id;
  const points = round ? r.points.slice(0, -1) : r.points;
  const closes = (line.closes || round) && points.length >= 3;
  // A corner written after the last number of a closed outline lies on its closing leg.
  const corners = closes && r.cornerAtEnd ? [...r.corners, [points.at(-1)!, points[0]!] as [SurveyPoint, SurveyPoint]] : r.corners;
  return { ...r, points, closes, corners };
}

/** The word the reader writes where a line turns a square corner that has no number (stage 262). */
export const isCornerWord = (label: string) => /^corner$/i.test(label.trim());

function matchPoints(labels: readonly string[], index: PointIndex): { points: SurveyPoint[]; notes: string[]; unmatched: string[]; exact: boolean; corners: [SurveyPoint, SurveyPoint][]; cornerAtEnd: boolean } {
  const points: SurveyPoint[] = [];
  const notes: string[] = [];
  const unmatched: string[] = [];
  // A square corner without a number lies between the points before and after it; at an end, or next to another, it's let go.
  const corners: [SurveyPoint, SurveyPoint][] = [];
  let pending = false;
  let exact = true;
  for (const label of labels) {
    if (isCornerWord(label)) {
      pending = points.length > 0;
      continue;
    }
    const r = matchPoint(label, index);
    if (!r.point) {
      unmatched.push(matchNote(r) ?? label);
      continue;
    }
    if (r.how !== "exact") {
      exact = false;
      notes.push(matchNote(r)!);
    }
    if (points.at(-1)?.id !== r.point.id) {
      if (pending) corners.push([points.at(-1)!, r.point]);
      points.push(r.point);
    }
    pending = false;
  }
  return { points, notes, unmatched, exact, corners, cornerAtEnd: pending };
}

/** Surveyed points the sketch doesn't write along a straight run, but which lie on it: said, never added. */
function unwrittenOnRun(run: readonly SurveyPoint[], all: readonly SurveyPoint[], onLine: number, taken: ReadonlySet<string>): { p: SurveyPoint; off: number }[] {
  const a = run[0]!;
  const b = run.at(-1)!;
  const len = distance(a, b);
  if (len < 1) return [];
  return all
    .filter((p) => !taken.has(p.id))
    .map((p) => ({ p, off: pointSegmentDistance(p, a, b), t: ((p.e - a.e) * (b.e - a.e) + (p.n - a.n) * (b.n - a.n)) / (len * len) }))
    .filter((x) => x.off <= onLine && x.t > 0.02 && x.t < 0.98)
    .map(({ p, off }) => ({ p, off }));
}

/** Simple cycles in an undirected graph of point ids, at most `cap` of them, each at most `maxLen` long. */
function cycles(edges: ReadonlyMap<string, ReadonlySet<string>>, cap = 400, maxLen = 60, budget = 60_000): string[][] {
  const out: string[][] = [];
  const seen = new Set<string>();
  let steps = 0;
  const nodes = [...edges.keys()].sort();
  for (const start of nodes) {
    const stack: { node: string; path: string[] }[] = [{ node: start, path: [start] }];
    while (stack.length > 0 && out.length < cap && steps++ < budget) {
      const { node, path } = stack.pop()!;
      for (const next of edges.get(node) ?? []) {
        if (next === start && path.length >= 3) {
          // The same ring found from its other end; two rings through the same points in another order are different rings.
          const key = ringKey(path);
          if (!seen.has(key)) {
            seen.add(key);
            out.push(path);
          }
        } else if (!path.includes(next) && next > start && path.length < maxLen) stack.push({ node: next, path: [...path, next] });
      }
    }
  }
  return out;
}

type LineRef = { line: SketchLine; points: SurveyPoint[]; closes: boolean; kind: LineKind; written: boolean; proposal: LineProposal | null };
/** A line that could be a road's far side, with the lot's side facing it (its ends a and b) and how far off it lies. */
type RoadCandidate = { far: LineRef; a: SurveyPoint; b: SurveyPoint; d: number };

/**
 * Whether two legs cross each other through both their insides, more than `clear` metres from all four ends: a shared end, a touch, or
 * a point lying on the other leg isn't a crossing.
 */
export function crossesAway(a: Point, b: Point, c: Point, d: Point, clear = 0.1): boolean {
  const [d1, d2, d3, d4] = [orient(a, b, c), orient(a, b, d), orient(c, d, a), orient(c, d, b)];
  if (!(d1 * d2 < 0 && d3 * d4 < 0)) return false;
  const t = d3 / (d3 - d4);
  const p = { e: a.e + t * (b.e - a.e), n: a.n + t * (b.n - a.n) };
  // No end within `clear` of the crossing, nor of the other leg: a wall built along a boundary, its ends a centimetre either side of
  // it, meets the boundary rather than crossing it.
  return [a, b, c, d].every((q) => distance(p, q) > clear) && pointSegmentDistance(a, c, d) > clear && pointSegmentDistance(b, c, d) > clear && pointSegmentDistance(c, a, b) > clear && pointSegmentDistance(d, a, b) > clear;
}

const heading = (a: Point, b: Point) => Math.atan2(b.e - a.e, b.n - a.n);
/** Whether two headings run alongside each other, either way, within some degrees. */
function alongside(h1: number, h2: number, maxDeg: number): boolean {
  let d = Math.abs(deg(h1 - h2)) % 180;
  if (d > 90) d = 180 - d;
  return d <= maxDeg;
}
const polyOff = (p: Point, poly: readonly Point[]) => Math.min(...poly.slice(1).map((q, i) => pointSegmentDistance(p, poly[i]!, q)));
/** Where a point's foot falls along a line from a to b: below 0 before a, above 1 past b. */
const along = (p: Point, a: Point, b: Point) => ((p.e - a.e) * (b.e - a.e) + (p.n - a.n) * (b.n - a.n)) / (distance(a, b) ** 2 || 1);
/** The nearest point to p on a polyline. */
function foot(p: Point, poly: readonly Point[]): Point {
  let best: { d: number; f: Point } | null = null;
  for (let i = 0; i + 1 < poly.length; i++) {
    const [a, b] = [poly[i]!, poly[i + 1]!];
    const t = Math.max(0, Math.min(1, along(p, a, b)));
    const f = { e: a.e + t * (b.e - a.e), n: a.n + t * (b.n - a.n) };
    const d = distance(p, f);
    if (!best || d < best.d) best = { d, f };
  }
  return best?.f ?? p;
}
/** Whether a segment crosses one of a ring's sides, leaving out the sides it starts from. */
const crossesLot = (ring: readonly Point[], p: Point, q: Point, skip: readonly number[]) =>
  ring.some((a, i) => !skip.includes(i) && segmentsIntersect(p, q, a, ring[(i + 1) % ring.length]!));

/** A ring's numbers written round to the first again ("1, 2, 3, 4, 1"): the repeat dropped. */
const roundOff = (labels: readonly string[]) => (labels.length >= 4 && labels[0] === labels.at(-1) ? labels.slice(0, -1) : [...labels]);

/** Whether a point lies inside a ring (crossing count). */
function inside(p: Point, ring: readonly Point[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [a, b] = [ring[i]!, ring[j]!];
    if (a.n > p.n !== b.n > p.n && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) hit = !hit;
  }
  return hit;
}

const simple = (ring: readonly Point[]) => {
  for (let i = 0; i < ring.length; i++)
    for (let j = i + 1; j < ring.length; j++) {
      if (j === i + 1 || (i === 0 && j === ring.length - 1)) continue;
      if (segmentsIntersect(ring[i]!, ring[(i + 1) % ring.length]!, ring[j]!, ring[(j + 1) % ring.length]!)) return false;
    }
  return true;
};

/** Narrow parts of an outline: two of its sides nearly parallel, overlapping, and close together. Said as a strip and its width. */
function strips(ring: readonly SurveyPoint[], maxWidth = 3): string[] {
  const out: string[] = [];
  const n = ring.length;
  for (let i = 0; i < n; i++)
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      const [a, b, c, d] = [ring[i]!, ring[(i + 1) % n]!, ring[j]!, ring[(j + 1) % n]!];
      const h1 = Math.atan2(b.e - a.e, b.n - a.n);
      const h2 = Math.atan2(d.e - c.e, d.n - c.n);
      let diff = Math.abs(deg(h1 - h2)) % 180;
      if (diff > 90) diff = 180 - diff;
      if (diff > 5) continue;
      const w = Math.min(pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b), pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d));
      if (w < 0.3 || w > maxWidth) continue;
      if (Math.min(distance(a, b), distance(c, d)) < 1) continue;
      out.push(`The lot narrows to a strip ${m(w)} wide between its sides ${a.pointId} to ${b.pointId} and ${c.pointId} to ${d.pointId}.`);
    }
  return out;
}

/** An area in whole perches (25.29285264 m² each), when it's one to within 0.005 P, or null. Deeds' extents usually are; computed ones rarely. */
export function roundPerches(m2: number): number | null {
  const p = m2 / 25.29285264;
  return p >= 1 && Math.abs(p - Math.round(p)) < 0.005 ? Math.round(p) : null;
}

/**
 * A written width ("15'", "15 ft", "4.5 m") in metres, or null: feet are converted by the international foot. The unit must end the
 * word, so a number in a road's name ("Lane 5 Mawatha", "3 Mile Post Road") is never taken for a width.
 */
export function writtenWidth(text: string): number | null {
  const si = /(\d+(?:\.\d+)?)\s*(අඩි|මීටර්?)|(අඩි|මීටර්?)\s*(\d+(?:\.\d+)?)/.exec(text);
  if (si) {
    const v = Number(si[1] ?? si[4]);
    if (!Number.isFinite(v) || v <= 0 || v > 60) return null;
    return (si[2] ?? si[3])!.startsWith("අඩි") ? v * 0.3048 : v;
  }
  const mm = /(\d+(?:\.\d+)?)\s*(m|mtrs?|metres?|meters?|ft|feet|'|′)(?![a-z])/i.exec(text);
  if (!mm) return null;
  const v = Number(mm[1]);
  if (!Number.isFinite(v) || v <= 0 || v > 60) return null;
  return /^(ft|feet|'|′)$/i.test(mm[2]!) ? v * 0.3048 : v;
}

export function interpretSketch(given: SketchDrawing, points: readonly SurveyPoint[], codes: readonly CodeEntry[], options: InterpretOptions = {}): SketchInterpretation {
  // An area's corners are numbers: a corner word written among them is left out (stage 262), never taken for a point.
  const drawing: SketchDrawing = given.areas.some((a) => a.around.some(isCornerWord)) ? { ...given, areas: given.areas.map((a) => ({ ...a, around: a.around.filter((p) => !isCornerWord(p)) })) } : given;
  const onLine = options.onLineM ?? 0.25;
  const tight = options.tightM ?? 0.1;
  // Numbers read with doubt, by photo: reads agreeing never settle a line through one (stage 295 review).
  const doubtedNumbers = new Set((options.doubtfulNumbers ?? []).map((d) => `${d.file}|${d.label}`));
  const index = indexPoints(points);
  const proposals: Proposal[] = [];
  const questions: Question[] = [];
  const matches: SketchInterpretation["matches"] = [];
  const ask = (from: string[], file: string, text: string, evidence: string[] = [], about?: Pick<Question, "item" | "answeredBy" | "suggest" | "lines">) => questions.push({ from, file, text, evidence, ...about });

  for (const label of new Set([...drawing.lines.flatMap((l) => l.points).filter((p) => !isCornerWord(p)), ...drawing.symbols.map((s) => s.at).filter(Boolean), ...drawing.areas.flatMap((a) => a.around)])) {
    const r = matchPoint(label, index);
    matches.push({ label, pointId: r.point?.pointId ?? null, how: r.how });
  }

  // ---- Lines: matched, classified, tested against the coordinates.
  const lines: LineRef[] = [];
  // Lines the sketch draws that couldn't be drawn (a number not surveyed, one point twice, crossing itself), with the points they did match.
  const dropped: { line: SketchLine; ids: Set<string> }[] = [];
  // Square corners drawn without a number (stage 262), from the lines that match.
  const squares: { a: SurveyPoint; b: SurveyPoint; line: SketchLine }[] = [];
  for (const line of drawing.lines) {
    const mt = matchLine(line, index);
    if (mt.unmatched.length === 0) for (const [a, b] of mt.corners) if (a.id !== b.id) squares.push({ a, b, line });
    const cls = classifyLine(line.label, line.style, codes, options.habits ?? []);
    const named = line.label ? `the line ${list(line.points)} ("${line.label}")` : `the line ${list(line.points)}`;
    if (mt.unmatched.length > 0) {
      ask([line.id], line.file, `${named[0]!.toUpperCase()}${named.slice(1)} wasn't drawn: ${list(mt.unmatched)}.`, ["Check the number on the sketch, or import the file that has the point."]);
      dropped.push({ line, ids: new Set(mt.points.map((p) => p.id)) });
      continue;
    }
    if (mt.points.length < 2) {
      ask([line.id], line.file, `${named[0]!.toUpperCase()}${named.slice(1)} joins a surveyed point to itself, so it wasn't drawn.`, ["Check its numbers on the sketch."]);
      dropped.push({ line, ids: new Set(mt.points.map((p) => p.id)) });
      continue;
    }
    const id = itemId("line", mt.points.map((p) => p.id));
    const evidence: string[] = [`Drawn on ${line.file} through ${list(ids(mt.points))}${line.label ? `, with "${line.label}" written along it` : ""}${line.style !== "single" ? ` (${line.style})` : ""}.`];
    evidence.push(`Read as a ${cls.kind === "line" ? "line of unknown kind" : cls.kind}: ${cls.why}.`);
    evidence.push(...mt.notes);
    // The surveyor's habit says what it is as surely as writing would (stage 298).
    let level: Level = mt.exact && line.certain && (cls.fromWriting || cls.fromHabit) ? "strong" : "check";
    // Nothing about where it runs is in doubt (stage 294): every number matched exactly, its points lie on it, and the reader was sure of
    // it or at least two separate reads of the sketch drew it through the same numbers (stage 295: on a hand sketch the reader is rarely
    // sure of any one line, and two reads agreeing is what the lot is built from).
    let settled = mt.exact && (line.certain || ((line.reads ?? 1) >= 2 && !line.points.some((label) => doubtedNumbers.has(`${line.file}|${label}`))));
    const arcs: ArcRun[] = [];
    let blocked = false;
    if (line.style === "curved" && mt.points.length >= 3) {
      const fit = fitArc(mt.points);
      if (fit.ok) {
        arcs.push({ from: 0, to: mt.points.length - 1 });
        evidence.push(`Drawn curved: the points lie on a circle of radius ${m(fit.circle.r)}.`);
      } else evidence.push(`Drawn curved, but ${fit.problem}: drawn as straight segments.`);
    } else {
      const kept = cornerIndexes(mt.points, false, onLine);
      const sides = sideOffsets(mt.points, kept, false);
      for (let s = 0; s + 1 < kept.length; s++) {
        const run = mt.points.slice(kept[s]!, kept[s + 1]! + 1);
        if (run.length < 3) continue;
        const worst = sides.filter((x) => x.a === kept[s]).reduce((w, o) => (o.off > w.off ? o : w));
        const said = `${list(ids(run.slice(1, -1)))} lie${run.length === 3 ? "s" : ""} within ${m(worst.off)} of the straight line from ${run[0]!.pointId} to ${run.at(-1)!.pointId}`;
        if (worst.off <= tight) evidence.push(`${said}.`);
        else {
          evidence.push(`${said}: ${mt.points[worst.i]!.pointId} is more than ${m(tight)} off it.`);
          level = "check";
          settled = false;
        }
        const unwritten = unwrittenOnRun(run, points, Math.min(onLine, tight), new Set(mt.points.map((p) => p.id)));
        if (unwritten.length > 0) evidence.push(`${list(unwritten.map((u) => u.p.pointId))} also lie${unwritten.length === 1 ? "s" : ""} on it (within ${m(Math.max(...unwritten.map((u) => u.off)))}), but ${unwritten.length === 1 ? "isn't" : "aren't"} written on the sketch: not added.`);
      }
    }
    // A line crossing itself is drawn wrong or read wrong; a closed one's closing leg counts, beside every leg but its neighbours.
    const legs = mt.points.length - 1 + (mt.closes ? 1 : 0);
    const end = (k: number) => mt.points[(k + 1) % mt.points.length]!;
    for (let i = 0; i < legs && !blocked; i++)
      for (let j = i + 2; j < legs; j++)
        if (!(i === 0 && j === legs - 1 && mt.closes) && segmentsIntersect(mt.points[i]!, end(i), mt.points[j]!, end(j))) {
          ask([line.id], line.file, `${named[0]!.toUpperCase()}${named.slice(1)} crosses itself through the surveyed points, so it wasn't drawn.`, ["Check the order of its numbers on the sketch."]);
          blocked = true;
          break;
        }
    if (blocked) {
      dropped.push({ line, ids: new Set(mt.points.map((p) => p.id)) });
      continue;
    }
    if (!cls.fromWriting && !cls.fromHabit) ask([line.id], line.file, `What is ${named}? ${cls.why[0]!.toUpperCase()}${cls.why.slice(1)}.`, ["It's drawn as the sketch shows it; confirm what it is, or remove it."], { item: id, answeredBy: "confirm" });
    const proposal: LineProposal = {
      kind: "line",
      id,
      from: [line.id],
      file: line.file,
      evidence,
      level,
      feature: cls.kind,
      layer: LAYER_OF[cls.kind],
      code: cls.code?.code ?? "",
      label: line.label,
      // A closed line of unknown kind is drawn round to its start, never as a closed outline: on its layer that would be a building.
      points: cls.kind === "line" && mt.closes ? [...mt.points, mt.points[0]!] : mt.points,
      closed: mt.closes && cls.kind !== "line",
      arcs,
      dashed: line.style === "dashed",
      runsOn: mt.closes ? null : (line.runsOn ?? null),
      settled,
    };
    lines.push({ line, points: mt.points, closes: mt.closes, kind: cls.kind, written: cls.fromWriting, proposal });
  }

  // ---- The lot: a lot area with numbered corners, else the largest closed cycle the boundary lines make.
  const lotAreas = drawing.areas.map((a) => ({ a, c: classifyArea(a.label, codes) })).filter((x) => x.c.kind === "lot");
  let lot: LotProposal | null = null;
  const lotFromArea = lotAreas.find((x) => roundOff(x.a.around).length >= 3);
  if (lotFromArea) {
    const pts = roundOff(lotFromArea.a.around).map((l) => matchPoint(l, index)).map((r) => r.point);
    if (pts.every((p): p is SurveyPoint => p !== null) && simple(pts)) lot = lotProposal(pts, [lotFromArea.a.id], lotFromArea.a.file, lotFromArea.c.name, [`Lot ${lotFromArea.c.name} is written on ${lotFromArea.a.file} with its corners numbered ${list(lotFromArea.a.around)}.`]);
    else ask([lotFromArea.a.id], lotFromArea.a.file, `Lot ${lotFromArea.c.name}'s corners ${list(lotFromArea.a.around)} don't make an outline from the surveyed points.`, ["Check the numbers, or draw the lot on the Lots step."]);
  }
  if (!lot) {
    // Boundary lines: walls, fences, hedges, drains and lines of unknown kind; never roads, and never dashed lines (proposed or roof lines).
    const byId = new Map(points.map((p) => [p.id, p]));
    const owner = new Map<string, string>();
    const ringsFrom = (take: (l: LineRef) => boolean) => {
      const edges = new Map<string, Set<string>>();
      for (const l of lines) {
        if (l.kind === "road" || l.line.style === "dashed" || !take(l)) continue;
        // A closed line's closing leg is a side like the others.
        for (let i = 0; i + 1 < l.points.length + (l.closes ? 1 : 0); i++) {
          const [a, b] = [l.points[i]!.id, l.points[(i + 1) % l.points.length]!.id];
          if (!edges.has(a)) edges.set(a, new Set());
          if (!edges.has(b)) edges.set(b, new Set());
          edges.get(a)!.add(b);
          edges.get(b)!.add(a);
          owner.set(a < b ? `${a}|${b}` : `${b}|${a}`, l.line.id);
        }
      }
      return cycles(edges)
        .map((c) => c.map((id) => byId.get(id)!))
        .filter((r) => simple(r))
        .map((r) => ({ r, a: area(r) }))
        .sort((x, y) => y.a - x.a);
    };
    // Read more than once and merged (stage 257, ADR 0265): the lot comes from the lines at least two reads drew, while those close round
    // one; a line only one read drew is drawn as read, but doesn't move the lot. Single reads, and reads from before, use every line.
    const merged = lines.some((l) => l.line.reads !== undefined);
    const agreed = (l: LineRef) => (l.line.reads ?? 2) >= 2;
    const everyRing = ringsFrom(() => true);
    const agreedRings = merged ? ringsFrom(agreed) : everyRing;
    const rings = agreedRings.length > 0 && agreedRings[0]!.a > 1 ? agreedRings : everyRing;
    if (rings.length > 0 && rings[0]!.a > 1) {
      const best = rings[0]!;
      const used = new Set<string>();
      best.r.forEach((p, i) => {
        const q = best.r[(i + 1) % best.r.length]!;
        used.add(owner.get(p.id < q.id ? `${p.id}|${q.id}` : `${q.id}|${p.id}`) ?? "");
      });
      const from = [...used].filter(Boolean).sort();
      const label = lotAreas.length === 1 ? lotAreas[0]!.c.name : "";
      const fromAgreed = merged && rings === agreedRings;
      lot = lotProposal(best.r, from, drawing.lines.find((l) => l.id === from[0])?.file ?? "", label, [
        fromAgreed
          ? `The lines at least two reads of the sketch drew close round ${list(ids(best.r))}, the largest outline they make.`
          : `The lines drawn on the sketch close round ${list(ids(best.r))}, the largest outline they make.`,
      ]);
      const lotId = lot.id;
      // A larger outline that a line only one read drew would make: said and asked, never taken.
      const wider = fromAgreed ? everyRing.find((x) => ringKey(x.r.map((p) => p.id)) !== ringKey(best.r.map((p) => p.id)) && x.a > best.a + 0.01) : undefined;
      if (wider) {
        const once = lines.filter((l) => !agreed(l) && l.points.some((p) => wider.r.some((q) => q.id === p.id)) && l.points.some((p) => !best.r.some((q) => q.id === p.id)));
        ask(from, lot.file, `Only one read of the sketch drew ${once.length ? `the line through ${once.map((l) => list(ids(l.points))).join("; ")}` : "a line"}, which would make the lot ${list(ids(wider.r))}, ${wider.a.toFixed(2)} m², instead.`, [
          "The lot is drawn from the lines the reads agree on. Check the sketch, and correct the lot on the Lots step if it's the other outline.",
        ], { item: lotId, answeredBy: "confirm" });
      }
      if (rings.length > 1 && rings[1]!.a > best.a * 0.8)
        ask(from, lot.file, `The sketch's lines close round more than one outline of a similar size: the largest was taken for the lot.`, [`The next is through ${list(ids(rings[1]!.r))}, ${m(rings[1]!.a).replace(" m", " m²")}.`], { item: lotId, answeredBy: "confirm" });
      // Lines across the outline that close a smaller one inside it: the outline may hold a neighbour's land, or more than one lot.
      const inner = rings.slice(1).find((x) => x.a < best.a - 0.01 && x.r.every((p) => best.r.some((q) => q.id === p.id) || inside(p, best.r)));
      if (inner)
        ask(from, lot.file, `The sketch's lines also close round a smaller outline inside the lot taken, through ${list(ids(inner.r))}: the lot may hold a neighbour's land, or more than one lot.`, [`The smaller outline is ${inner.a.toFixed(2)} m². Confirm the lot as drawn, or correct it on the Lots step.`], { item: lotId, answeredBy: "confirm" });
      if (!label) ask(from, lot.file, "The lot's letter or number isn't written on the sketch.", ["Give it on the Lots step."], { item: lotId, answeredBy: "label" });
    }
  }
  if (lot) proposals.push(lot);

  for (const l of lines) if (l.proposal) proposals.push(l.proposal);

  // ---- A road between two surveyed sides (stage 243), when the sketch names one: its near side is the lot's side facing a line drawn
  // across from it, carried on by the lines drawn on from that side's ends; its far side is that line. Measured, never taken from writing.
  const asWidths = (xs: readonly string[] | undefined) => (xs ?? []).map((w) => ({ w, v: writtenWidth(w) })).filter((x): x is { w: string; v: number } => x.v !== null);
  const widths = asWidths(options.widths);
  const unsureWidths = asWidths(options.doubtfulWidths);
  // Every width written, clear or with doubt, for counting; only a single clear one is ever taken.
  const allWidths = [...widths, ...unsureWidths.map((x) => ({ ...x, w: `${x.w} (read with doubt)` }))];
  const takenWidth = allWidths.length === 1 && widths.length === 1 ? widths[0]! : null;
  // A road's name read with doubt doesn't name a road, even where the reader also gave it as an area (as it's asked to).
  const doubtfulNames = new Set((options.doubtfulRoadNames ?? []).map((x) => x.trim()));
  const roadNames = [...new Set([...drawing.areas.filter((a) => classifyArea(a.label, codes).kind === "road" && !doubtfulNames.has(a.label.trim())).map((a) => a.label), ...(options.roadNames ?? [])])];
  const unsureNames = [...doubtfulNames].filter((x) => isRoadName(x) && !roadNames.includes(x));
  let between: RoadProposal | null = null;
  if (lot && roadNames.length + unsureNames.length > 0) {
    const found = roadCandidates(lot);
    const far = [...new Set(found.map((x) => x.far))];
    const named = [...roadNames.map((x) => `"${x}"`), ...unsureNames.map((x) => `"${x}" (read with doubt)`)];
    // Never chosen between: two lines that could each be the far side, or two names for the one road drawn, are asked about.
    if (far.length > 1)
      ask(far.map((x) => x.line.id), lot.file, `The sketch names a road, and lines on more than one side of the lot could be its far side: through ${far.map((x) => list(ids(x.points))).join("; and through ")}.`, [
        "Which one is the road isn't settled by the sketch, so no road is drawn. Draw it on the Lots step.",
      ]);
    else if (far.length === 1 && named.length > 1)
      ask(far.map((x) => x.line.id), lot.file, `The sketch names more than one road (${list(named)}), and only one is drawn across from the lot: which it is isn't settled.`, [
        "No road is drawn. Draw it on the Lots step, with its name.",
      ]);
    else if (far.length === 1 && roadNames.length === 0)
      ask(far.map((x) => x.line.id), lot.file, `A road's name is written on the sketch as ${named[0]}, so no road is drawn from it.`, ["Check the name on the sketch, and draw the road on the Lots step if it's there."]);
    else if (far.length === 1) between = roadBetween(lot, roadNames[0]!, found.filter((x) => x.far === far[0]).sort((x, y) => x.d - y.d)[0]!);
  } else if (lot && (options.gates ?? []).length > 0) {
    // No road's name is read, but a gate is written in the lot's side (stage 254, ADR 0262): a gate opens onto a road or a path, so the
    // one line drawn across from that side is taken as its far side. Drawn without a name, which is asked for; never chosen between two.
    // The sides each gate is in: a gate at a corner may be in either side there, one on a side is in that side, and a gate drawn as a line
    // is in the side all its points are on.
    const ring = lot.corners;
    const sideIndex = (a: SurveyPoint, b: SurveyPoint) => ring.findIndex((p, i) => p.id === a.id && ring[(i + 1) % ring.length]!.id === b.id);
    const gateSides = (options.gates ?? [])
      .map((g) => g.map((l) => matchPoint(l, index).point).filter((p): p is SurveyPoint => p !== null))
      .filter((ps) => ps.length > 0)
      .map((ps) => {
        const on = ps.map((p) => new Set(ring.map((_, i) => i).filter((i) => pointSegmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!) <= onLine)));
        return [...on[0]!].filter((i) => on.every((s) => s.has(i)));
      });
    const all = roadCandidates(lot);
    const sides = new Set(gateSides.flatMap((s) => s.filter((i) => all.some((x) => sideIndex(x.a, x.b) === i))));
    const found = all.filter((x) => sides.has(sideIndex(x.a, x.b)));
    const far = [...new Set(found.map((x) => x.far))];
    if (far.length === 1 && sides.size === 1) {
      const pick = found.filter((x) => x.far === far[0]).sort((x, y) => x.d - y.d)[0]!;
      between = roadBetween(lot, "", pick);
      if (between) ask(between.from, between.file, "The road's name isn't read from the sketch.", ["The road is drawn without its name. Give the name as the plan should print it, on the Lots step."], { item: between.id, answeredBy: "confirm" });
    } else if (found.length > 0)
      ask(far.map((x) => x.line.id), lot.file, `A gate is written in the lot's side, but which side, or which line across from it is the road it opens onto, isn't settled: through ${far.map((x) => list(ids(x.points))).join("; or through ")}.`, [
        "Which one is the road isn't settled by the sketch, so no road is drawn. Draw it on the Lots step.",
      ]);
  }
  if (between) {
    proposals.push(between);
    // The sheet can't print Sinhala or Tamil yet: the road goes on the plan without its name, which is asked for.
    if (between.name && !printable(between.name))
      ask(between.from, between.file, `The road's name is written as "${between.name}", which the sheet can't print yet.`, ["The road is drawn without its name. Give the name as the plan should print it, on the Lots step."], { item: between.id, answeredBy: "confirm" });
    const [lo, hi] = [between.widthM.min, between.widthM.max];
    if (takenWidth) {
      const w = takenWidth;
      if (w.v < lo - 0.3 || w.v > hi + 0.3)
        ask(between.from, between.file, `The road is written as ${w.w} wide (${m(w.v)}), and it measures ${m(lo)} to ${m(hi)} between its surveyed sides.`, [
          "A written width is often the road's reserved width rather than what's on the ground. The plan draws what was surveyed: confirm the road, and say on the plan which width is stated.",
        ], { item: between.id, answeredBy: "confirm" });
      else between.evidence.push(`It agrees with the ${w.w} written on the sketch.`);
    } else if (allWidths.length > 0) between.evidence.push(`A width is written on the sketch (${list(allWidths.map((x) => x.w))}), but none was taken: ${allWidths.length > 1 ? "more than one is written" : "it was read with doubt"}.`);
  }

  // ---- Roads: which side of the surveyed edge the road lies on, from where the lot is; and its width, only as written.
  const drawnAsRoad = new Set([...(between?.edgeA ?? []), ...(between?.edgeB ?? [])].map((p) => p.id));
  for (const l of lines.filter((x) => x.kind === "road" && !between?.from.includes(x.line.id) && !x.points.every((p) => drawnAsRoad.has(p.id)))) {
    const p = l.proposal!;
    const a = l.points[0]!;
    const b = l.points.at(-1)!;
    if (lot) {
      // A corner within the on-line tolerance of the edge is on it, not across it.
      const len = distance(a, b) || 1;
      const sides = lot.corners.map((c) => (Math.abs(orient(a, b, c) / len) <= onLine ? 0 : Math.sign(orient(a, b, c))));
      const lotSide = Math.sign(sides.reduce((s, x) => s + x, 0));
      const oneSide = sides.every((s) => s === lotSide || s === 0) && lotSide !== 0;
      // Square off the edge, on the side away from the lot (orient is positive when the lot is to the left of a to b).
      const mid = { e: (a.e + b.e) / 2, n: (a.n + b.n) / 2 };
      const [de, dn] = [b.e - a.e, b.n - a.n];
      const away = lotSide > 0 ? { e: mid.e + dn, n: mid.n - de } : { e: mid.e - dn, n: mid.n + de };
      const toward = { e: 2 * mid.e - away.e, n: 2 * mid.n - away.n };
      const compass = (from: Point, to: Point) => ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round((((deg(Math.atan2(to.e - from.e, to.n - from.n)) % 360) + 360) % 360) / 45) % 8];
      if (oneSide) p.evidence.push(`The lot lies wholly on one side of this edge (to its ${compass(mid, toward)}), so the road lies on the other side, to its ${compass(mid, away)}.`);
      else ask(p.from, p.file, `The lot lies on both sides of the road edge ${list(ids(l.points))}, so which side the road is on isn't clear.`, [], { item: p.id, answeredBy: "road" });
      if (takenWidth && oneSide) {
        ask(p.from, p.file, `The road is written as ${takenWidth.w} wide (${m(takenWidth.v)}): its far edge would lie that far to the ${compass(mid, away)} of the surveyed edge.`, [
          "Farbaek doesn't draw a road from one surveyed edge yet: the far edge isn't drawn, and nothing is guessed in its place.",
        ], { item: p.id, answeredBy: "road" });
      }
    }
    // Answered once the plan draws a road with both its edges.
    if (allWidths.length === 0) ask(p.from, p.file, `The width of the road along ${list(ids(l.points))} isn't written on the sketch.`, ["Only its surveyed edge is drawn. Give its width, or survey its far edge."], { item: p.id, answeredBy: "road" });
    else if (allWidths.length > 1) ask(p.from, p.file, `More than one road width is written on the sketch (${list(allWidths.map((w) => w.w))}): none was taken.`, [], { item: p.id, answeredBy: "road" });
    else if (!takenWidth) ask(p.from, p.file, `The road's width is written on the sketch as ${allWidths[0]!.w}, so it wasn't taken.`, ["Check it on the sketch, and give the width, or survey the road's far edge."], { item: p.id, answeredBy: "road" });
  }

  // ---- Symbols: a well drawn at a numbered point.
  for (const s of drawing.symbols) {
    const { entry, fromLabel, candidates } = symbolEntry(s.kind, s.label, codes);
    if (!s.at) {
      ask([s.id], s.file, `A ${s.kind}${s.label ? ` ("${s.label}")` : ""} is drawn on the sketch with no point number at it.`, ["Its place can't come from the sketch. Survey it, or give the point it's at."]);
      continue;
    }
    const r = matchPoint(s.at, index);
    if (!r.point) {
      ask([s.id], s.file, `A ${s.kind} is drawn at ${s.at}, but ${matchNote(r)}.`);
      continue;
    }
    if (!entry && candidates.length > 1) {
      ask([s.id], s.file, `A ${s.kind} is drawn at point ${r.point.pointId}, and the code list has more than one: ${list(candidates.map((c) => `${c.code} (${c.meaning.toLowerCase()})`))}.`, [
        "Which one isn't written beside it, so nothing is drawn at the point. Write its code on the sketch and read it again.",
      ]);
      continue;
    }
    if (!entry) {
      ask([s.id], s.file, `A ${s.kind} is drawn at point ${r.point.pointId}, but the code list has no ${s.kind} to draw it with.`, ["Add it to the code list, then read the sketch again."]);
      continue;
    }
    // The point's own surveyed code stands: a sketch that draws something else there is asked about, never drawn over it.
    const own = lookupCode(codes, codeOf(r.point.code));
    if (own && (own.kind === "mark" || own.kind === "symbol")) {
      if (own.code !== entry.code)
        ask([s.id], s.file, `Point ${r.point.pointId} is coded ${own.code} (${own.meaning.toLowerCase()}) in the survey, and the sketch draws a ${s.kind} there.`, [
          "The survey's code is kept and drawn. If the point is the sketch's, correct its code in the instrument's file.",
        ]);
      continue;
    }
    proposals.push({
      kind: "symbol",
      id: itemId("symbol", [r.point.id], entry.code),
      from: [s.id],
      file: s.file,
      evidence: [
        `A ${s.kind} is drawn on ${s.file} at point ${s.at}${s.label ? `, with "${s.label}" written at it` : ""}.`,
        ...(matchNote(r) ? [matchNote(r)!] : []),
        ...(fromLabel ? [] : [s.label ? `"${s.label}" names a ${s.kind}, not a code: drawn as the code list's only ${s.kind}, ${entry.code}.` : `Nothing is written at it: drawn as the code list's only ${s.kind}, ${entry.code}.`]),
      ],
      // Strong only when what's written settles it: its code, or a word for the symbol (well, ළිඳ) with one such code in the list.
      level: r.how === "exact" && (fromLabel || (s.label !== "" && namesKind(s.kind, s.label))) ? "strong" : "check",
      code: entry.code,
      meaning: entry.meaning,
      point: r.point,
    });
  }

  // ---- Areas: buildings with numbered corners become outlines. One whose corners aren't all written is the area the sketch's lines
  // close round where its label is written (stage 254, ADR 0262), when that's settled; otherwise a question.
  let faces: Face[] | null = null;
  // The lines drawn as a building's walls, by their proposal's id: a doubt about one of them is the building's.
  const absorbed = new Map<string, BuildingProposal>();
  for (const a of drawing.areas) {
    const c = classifyArea(a.label, codes);
    if (c.kind !== "building") continue;
    // Its code: the one written, else the code list's only building (P, Permanent Building), said as such.
    const listed = c.code ? null : buildingEntry(codes);
    const code = c.code?.code ?? listed?.code ?? "";
    const codeSaid = listed ? [`Drawn as the code list's only building, ${listed.meaning} (${listed.code}).`] : [];
    const around = roundOff(a.around);
    const pts = around.map((l) => matchPoint(l, index).point);
    const notSurveyed = around.filter((_, i) => pts[i] === null);
    const cannot = (why: string) =>
      ask([a.id], a.file, `"${a.label}" is written on the sketch (${c.why}), but its outline can't be drawn from the sketch: ${why}.`, ["Give its corners on the Lots step."]);
    if (notSurveyed.length > 0) {
      cannot(`${list(notSurveyed)}, written at its corners, ${notSurveyed.length === 1 ? "isn't a surveyed point" : "aren't surveyed points"}`);
      continue;
    }
    const named = pts.filter((p): p is SurveyPoint => p !== null);
    if (around.length >= 3 && simple(named)) {
      proposals.push({ kind: "building", id: itemId("building", named.map((p) => p.id)), from: [a.id], file: a.file, evidence: [`"${a.label}" is written on ${a.file} inside the corners ${list(a.around)}: ${c.why}.`, ...codeSaid], level: "check", code, label: a.label, points: named });
      continue;
    }
    faces ??= facesOf(
      lines.filter((l) => l.proposal && l.kind !== "road" && l.line.style !== "dashed").map((l) => ({ points: l.points, closed: l.closes })),
      onLine,
    );
    const face = labelledFace(a, named, faces);
    if (!face) {
      cannot(`its corners aren't numbered${a.around.length ? ` (${list(a.around)} were read)` : ""}, and no one area the sketch's lines close round holds where it's written`);
      continue;
    }
    const onFace = new Set(face.points.map((p) => p.id));
    const onLot = new Set(lot ? [...lot.corners, ...lot.onSides].map((p) => p.id) : []);
    // Its walls: lines along its outline with nothing written to say they're something else, at least one of them inside the lot (a side
    // of the lot drawn as a plain line stays the lot's). Those wholly on its outline are drawn as it; one that runs on past a corner stays.
    const bounding = lines.filter((l) => l.proposal && !absorbed.has(l.proposal.id) && !l.written && l.kind !== "road" && l.line.style !== "dashed" && legsAlong(l, face.points) && l.points.some((p) => !onLot.has(p.id)));
    const walls = bounding.filter((l) => l.points.every((p) => onFace.has(p.id)));
    // A side written as a fence, a drain or a gate says the area is something else; a line through its corners that couldn't be drawn
    // leaves its outline unsettled.
    const other = lines.find((l) => l.proposal && l.written && l.kind !== "wall" && legsAlong(l, face.points));
    const lost = dropped.find((d) => [...d.ids].some((id) => onFace.has(id)));
    if (bounding.length === 0 || other || lost) {
      cannot(
        bounding.length === 0
          ? "no wall of it is drawn inside the lot"
          : other
            ? `the area holding it is bounded by the line through ${list(ids(other.points))}, written as a ${other.kind}`
            : `the line ${list(lost!.line.points)} through its corners wasn't drawn`,
      );
      continue;
    }
    for (const w of walls) {
      const k = proposals.indexOf(w.proposal!);
      if (k >= 0) proposals.splice(k, 1);
      for (let q = questions.length - 1; q >= 0; q--) if (questions[q]!.item === w.proposal!.id) questions.splice(q, 1);
    }
    const meets = face.points.some((p) => onLot.has(p.id));
    const building: BuildingProposal = {
      kind: "building",
      id: itemId("building", face.points.map((p) => p.id)),
      from: [a.id, ...walls.map((w) => w.line.id)],
      file: a.file,
      evidence: [
        `"${a.label}" is written on ${a.file}: ${c.why}.`,
        `Its corners aren't all numbered, so it's drawn as the area the sketch's lines close round where "${a.label}" is written: through ${list(ids(face.points))}.`,
        `Its walls are the lines drawn through ${bounding.map((w) => list(ids(w.points))).join("; ")}${meets ? ", and the lot's boundary where they meet it" : ""}.`,
        `Its area from the coordinates is ${face.areaM2.toFixed(2)} m².`,
        ...codeSaid,
      ],
      level: "check",
      code,
      label: a.label,
      points: face.points,
    };
    for (const w of walls) absorbed.set(w.proposal!.id, building);
    proposals.push(building);
  }
  /** What a line's doubts are about: the building it was drawn as a wall of, or the line itself. */
  const ownerOf = (l: LineRef | undefined): Proposal | null => (l?.proposal ? (absorbed.get(l.proposal.id) ?? l.proposal) : null);

  // ---- Lines that cross in the survey where no number is (stage 246, ADR 0254). A sketch's lines meet at numbered points, so two lines
  // crossing at a place with no number most likely carry a misread number (an upside-down 20 read as 10 that also exists). Asked about,
  // never corrected; at most five, so a badly read sketch doesn't bury the rest.
  // Dashed lines (roof edges, proposed lines) can pass over others, so they're left out; each line's legs and box are built once, pairs
  // whose boxes are apart are skipped, and the work is capped, so a drawing at its limits stays quick.
  const solid = lines
    .filter((l) => l.line.style !== "dashed" && l.proposal)
    .map((l) => {
      const pts = l.closes && l.points.length > 2 ? [...l.points, l.points[0]!] : l.points;
      const legs = pts.slice(1).map((q, i) => [pts[i]!, q] as const);
      return { l, legs, box: [Math.min(...pts.map((p) => p.e)), Math.min(...pts.map((p) => p.n)), Math.max(...pts.map((p) => p.e)), Math.max(...pts.map((p) => p.n))] as const };
    });
  const asked = new Set<string>();
  const crossed: [LineRef, LineRef][] = [];
  let crossings = 0;
  let work = 0;
  for (let i = 0; i < solid.length && crossings < 5 && work < 200_000; i++) {
    for (let j = i + 1; j < solid.length && crossings < 5 && work < 200_000; j++) {
      const [sx, sy] = [solid[i]!, solid[j]!];
      const [x, y] = [sx.l, sy.l];
      // The same line read twice, or a pair already asked about, isn't asked again.
      const pair = [x.proposal!.id, y.proposal!.id].sort().join("|");
      if (x.proposal!.id === y.proposal!.id || asked.has(pair)) continue;
      if (sx.box[2] < sy.box[0] || sy.box[2] < sx.box[0] || sx.box[3] < sy.box[1] || sy.box[3] < sx.box[1]) continue;
      work += sx.legs.length * sy.legs.length;
      if (!sx.legs.some(([a, b]) => sy.legs.some(([c, d]) => crossesAway(a, b, c, d)))) continue;
      asked.add(pair);
      crossings++;
      const doubtful = [x, y].filter((l) => !l.line.certain);
      const about = ownerOf(doubtful[0] ?? x);
      if (about?.kind === "building") {
        about.evidence.push(`Its walls include the line through ${list(ids((doubtful[0] ?? x).points))}, which crosses another where no number is: one of their numbers may be misread.`);
        about.level = "check";
      }
      ask(
        [x.line.id, y.line.id],
        x.line.file,
        `The line through ${list(ids(x.points))} crosses the line through ${list(ids(y.points))} in the survey, at a place with no number.`,
        [
          "A sketch's lines meet at numbered points, so one of their numbers may be misread. Check them on the sketch, and correct or remove the line on the Lots step.",
          ...(doubtful.length === 2 ? ["Both were read with doubt."] : doubtful.length === 1 ? [`The line through ${list(ids(doubtful[0]!.points))} was read with doubt.`] : []),
        ],
        // Both lines are named: the misread number may be in either (stage 295).
        { ...(about ? { item: about.id, answeredBy: "confirm" as const } : {}), lines: [x.proposal!.id, y.proposal!.id] },
      );
      crossed.push([x, y]);
    }
  }

  // ---- Numbers written where another point would be (stage 247, ADR 0255), by the fit of where the other numbers are written. Asked
  // about; the lot or the line that uses the number answers it when confirmed or corrected.
  const lotIds = new Set(lot ? [...lot.corners, ...lot.onSides].map((p) => p.pointId) : []);
  // Once per number (two photos of one sketch can raise it twice), and only where the number is used by the lot or a line: a number
  // nothing on the plan uses is left to the sketch report, where it's listed first.
  const seenNumbers = new Set<string>();
  const misplaced = misplacedNumbers(options.placed ?? [], points).filter((m) => {
    const key = m.pointId ?? m.label;
    if (seenNumbers.has(key)) return false;
    seenNumbers.add(key);
    return true;
  });
  let placeQuestions = 0;
  for (const m of misplaced) {
    const uses = lot && m.pointId && lotIds.has(m.pointId) ? lot : ownerOf(lines.find((l) => m.pointId && l.points.some((p) => p.pointId === m.pointId)));
    if (!uses) continue;
    // Written again at its own point's place (stage 254): that one is the point's, so this one is most likely another number misread as
    // it. Said on what uses the number, not asked.
    if (m.alsoAtOwn) {
      if (uses.kind !== "lot") uses.evidence.push(`${m.label} is also written on the sketch beside where ${m.likely} would be; the ${m.label} written at its own point was taken.`);
      continue;
    }
    if (uses.kind === "building") {
      uses.evidence.push(`Its corner ${m.label} may be misread: it's written on the sketch ${m.likelyWritten ? `far from where point ${m.label} would be` : `where point ${m.likely} would be`}.`);
      uses.level = "check";
    }
    if (placeQuestions >= 5) continue;
    placeQuestions++;
    // One press is offered only when it's plain: the other point's own number isn't written, exactly one surveyed point has that number,
    // and the reading is known, so the press corrects that reading and no other.
    const offer = !m.likelyWritten && m.id !== undefined && points.filter((p) => p.pointId === m.likely).length === 1;
    ask(
      uses.from,
      m.file,
      m.likelyWritten
        ? `The number read as ${m.label} is written on the sketch far from where point ${m.label} would be, beside where ${m.likely} is written, going by where the other numbers are written.`
        : `The number read as ${m.label} is written on the sketch where point ${m.likely} would be, going by where the other numbers are written.`,
      [
        offer
          ? `It may be ${m.likely}, misread. A sketch isn't drawn to scale, so this only asks: check the number on the sketch, and if it's ${m.likely}, use ${m.likely} for it in one press on the Plan step, and what it drew is redrawn.`
          : `${m.likelyWritten ? "It may be misread" : `It may be ${m.likely}, misread`}. A sketch isn't drawn to scale, so this only asks: check the number on the sketch, and correct the plan on the Lots step if it's wrong.`,
        "Nothing was changed.",
      ],
      {
        item: uses.id,
        answeredBy: "confirm",
        ...(offer ? { suggest: { file: m.file, reading: m.id!, label: m.label, to: m.likely } } : {}),
        // Every line through the doubted number bears on it, whichever item answers it (stage 295 review): none is settled until then.
        ...(m.pointId ? { lines: lines.filter((l) => l.proposal && l.points.some((p) => p.pointId === m.pointId)).map((l) => l.proposal!.id) } : {}),
      },
    );
  }

  // The lot's own card says what speaks against it, so confirming it is never blind to a doubt raised elsewhere.
  if (lot) {
    // A line is the lot's when the lot was built from it, or (for a lot written as an area) when it runs between two of its points.
    const ofLot = (l: LineRef) => lot!.from.includes(l.line.id) || l.points.filter((p) => lotIds.has(p.pointId)).length >= 2;
    for (const [x, y] of crossed) {
      if (ofLot(x) || ofLot(y))
        lot.evidence.push(`Its outline uses the line through ${list(ids(x.points))} or ${list(ids(y.points))}, which cross each other where no number is: one of their numbers may be misread.`);
    }
    for (const m of misplaced)
      if (m.pointId && lotIds.has(m.pointId))
        lot.evidence.push(
          m.alsoAtOwn
            ? `Its corner ${m.label} is also written on the sketch beside where ${m.likely} would be; the ${m.label} written at its own point was taken.`
            : `Its corner ${m.label} may be misread: it's written on the sketch ${m.likelyWritten ? `far from where point ${m.label} would be` : `where point ${m.likely} would be`}.`,
        );
    if (lot.evidence.some((e) => e.includes("may be misread"))) lot.level = "check";
  }
  // ---- Square corners without numbers (stage 262, ADR 0270): squared to the longest surveyed line at either of their points, as a
  // surveyor squares an outline off the wall it stands against. Without one, the line stays straight between them, and that's asked.
  const corners: SquareCornerProposal[] = [];
  if (squares.length > 0) {
    const polylines = proposals.flatMap((p): SurveyPoint[][] =>
      p.kind === "lot" ? [[...p.corners, p.corners[0]!]] : p.kind === "building" ? [[...p.points, p.points[0]!]] : p.kind === "line" ? [p.closed ? [...p.points, p.points[0]!] : p.points] : p.kind === "road" ? [p.edgeA, p.edgeB] : [],
    );
    for (const s of squares) {
      const cid = cornerId(s.a.id, s.b.id);
      const existing = corners.find((c) => c.id === cid);
      if (existing) {
        if (!existing.sketch.includes(s.line.id)) existing.sketch.push(s.line.id);
        continue;
      }
      const ref = squareReference(s.a, s.b, polylines);
      if (!ref) {
        ask([s.line.id], s.line.file, `A corner drawn square between ${s.a.pointId} and ${s.b.pointId} wasn't surveyed, and no surveyed line at either point shows which way it's square, so it's drawn straight between them.`, ["Survey the corner, or add it in the editor."]);
        continue;
      }
      corners.push({ id: cid, kind: "square", ...ref, between: [s.a.id, s.b.id], sketch: [s.line.id], file: s.line.file });
    }
    // A lot's corners are surveyed: where the lot runs straight between two of its corners that the sketch joins round a square corner,
    // its area leaves that corner's land out. Asked, never guessed.
    const lotP = proposals.find((p): p is LotProposal => p.kind === "lot");
    if (lotP) {
      const ring = lotP.corners.map((p) => p.id);
      for (const s of squares) {
        const i = ring.indexOf(s.a.id);
        const j = ring.indexOf(s.b.id);
        if (i < 0 || j < 0 || (Math.abs(i - j) !== 1 && Math.abs(i - j) !== ring.length - 1)) continue;
        ask([s.line.id], s.line.file, `The sketch turns a square corner that wasn't surveyed between ${s.a.pointId} and ${s.b.pointId}, where the lot runs straight between its corners: the lot's area leaves that corner's land out.`, ["A lot's corners are surveyed points: survey the corner, or confirm the lot as drawn on the Lots step."], { item: lotP.id, answeredBy: "confirm" });
      }
    }
  }
  return { proposals, ...(corners.length > 0 ? { corners } : {}), questions, matches };

  /**
   * The one area the sketch's lines close round that holds an area's label where it's written on the photo, and every corner the area
   * names; null when none or more than one does, when the label's place wasn't read, or when too few numbers place the photo. The whole
   * lot is never a building's area.
   */
  function labelledFace(a: SketchArea, named: readonly SurveyPoint[], all: readonly Face[]): Face | null {
    const at = (options.labels ?? []).filter((x) => x.file === a.file && x.text.trim() === a.label.trim());
    if (!lot || at.length === 0 || all.length === 0) return null;
    const place = photoPlaces(options.placed ?? [], points, a.file);
    if (!place) return null;
    const hits = all.filter((f) => named.every((p) => f.points.some((q) => q.id === p.id)) && (!lot || f.areaM2 < lot.areaM2 * 0.95) && at.every((w) => within(w, f.points.map(place))));
    return hits.length === 1 ? hits[0]! : null;
  }

  /** Whether a side of a face's outline lies along a leg of a line: both its ends on that leg, as when a wall's end joins it partway. */
  function legsAlong(l: LineRef, ring: readonly SurveyPoint[]): boolean {
    const pts = l.closes && l.points.length > 2 ? [...l.points, l.points[0]!] : l.points;
    const legs = pts.slice(1).map((q, k) => [pts[k]!, q] as const);
    return ring.some((r, i) => {
      const s = ring[(i + 1) % ring.length]!;
      return legs.some(([p, q]) => pointSegmentDistance(r, p, q) <= onLine && pointSegmentDistance(s, p, q) <= onLine);
    });
  }

  /**
   * Lines that could be a named road's far side, each with the lot side facing it. A far line touches neither the lot nor its inside,
   * is at least 3 m long, and runs alongside one of the lot's sides (within 20°), 2 to 20 m off, past that side's middle. It lies outside
   * that side, judged by which way round the lot's outline runs (never by its centre, which a concave lot can lie outside), and neither
   * it nor the way across to it crosses the lot.
   */
  function roadCandidates(lotP: LotProposal): RoadCandidate[] {
    const ring = lotP.corners;
    const onLot = new Set([...lotP.corners, ...lotP.onSides].map((p) => p.id));
    const inward = Math.sign(signedArea(ring));
    const found: RoadCandidate[] = [];
    for (const l of lines) {
      if (l.line.style === "dashed" || l.points.length < 2 || l.points.some((p) => onLot.has(p.id) || inside(p, ring))) continue;
      if (l.points.slice(1).reduce((s, q, i) => s + distance(l.points[i]!, q), 0) < 3) continue;
      if (l.points.slice(1).some((q, i) => crossesLot(ring, l.points[i]!, q, []))) continue;
      const fh = heading(l.points[0]!, l.points.at(-1)!);
      for (let i = 0; i < ring.length; i++) {
        const [a, b] = [ring[i]!, ring[(i + 1) % ring.length]!];
        if (!alongside(heading(a, b), fh, 20)) continue;
        const [da, db] = [polyOff(a, l.points), polyOff(b, l.points)];
        if (Math.min(da, db) < 2 || Math.max(da, db) > 20) continue;
        if (l.points.some((p) => Math.sign(orient(a, b, p)) !== -inward)) continue;
        const mid = { e: (a.e + b.e) / 2, n: (a.n + b.n) / 2 };
        const t = along(mid, l.points[0]!, l.points.at(-1)!);
        if (t < 0 || t > 1) continue;
        // The way across, from the side's ends and middle to the far line, stays off the lot.
        const prev = (i - 1 + ring.length) % ring.length;
        const next = (i + 1) % ring.length;
        if (crossesLot(ring, a, foot(a, l.points), [prev, i]) || crossesLot(ring, b, foot(b, l.points), [i, next]) || crossesLot(ring, mid, foot(mid, l.points), [i])) continue;
        found.push({ far: l, a, b, d: (da + db) / 2 });
      }
    }
    return found;
  }

  /**
   * The road between the lot's side and the far line across from it. Its near side is that side, carried on at each end by a drawn line
   * that leaves the lot (never into it or across it) running alongside the far side at
   * a road's distance: the neighbours' walls along the road. Every point is a surveyed one; its width is measured.
   */
  function roadBetween(lotP: LotProposal, name: string, pick: RoadCandidate): RoadProposal | null {
    const ring = lotP.corners;
    const onLot = new Set([...lotP.corners, ...lotP.onSides].map((p) => p.id));
    const { far, a, b } = pick;
    const fh = heading(far.points[0]!, far.points.at(-1)!);
    const corner = (p: SurveyPoint) => ring.findIndex((q) => q.id === p.id);
    const sidesAt = (p: SurveyPoint) => {
      const k = corner(p);
      return k < 0 ? [] : [k, (k - 1 + ring.length) % ring.length];
    };
    const carried = (end: SurveyPoint, before: boolean): SurveyPoint[] => {
      for (const x of lines) {
        if (x === far || x.line.style === "dashed") continue;
        const k = x.points.findIndex((p) => p.id === end.id);
        const run = k === 0 ? x.points.slice(1) : k === x.points.length - 1 && k > 0 ? x.points.slice(0, -1).reverse() : null;
        if (!run || run.length === 0 || run.some((p) => onLot.has(p.id) || inside(p, ring))) continue;
        if ([end, ...run].slice(1).some((q, i) => crossesLot(ring, [end, ...run][i]!, q, i === 0 ? sidesAt(end) : []))) continue;
        if (!alongside(heading(end, run.at(-1)!), fh, 25)) continue;
        if (run.some((p) => polyOff(p, far.points) < 2 || polyOff(p, far.points) > 20)) continue;
        if (!run.every((p) => (before ? along(p, a, b) < 0 : along(p, a, b) > 1))) continue;
        return run;
      }
      return [];
    };
    const edgeA = [...carried(a, true).reverse(), a, b, ...carried(b, false)];
    // The far side runs the same way as the near side.
    const same = (edgeA.at(-1)!.e - edgeA[0]!.e) * (far.points.at(-1)!.e - far.points[0]!.e) + (edgeA.at(-1)!.n - edgeA[0]!.n) * (far.points.at(-1)!.n - far.points[0]!.n) >= 0;
    const edgeB = same ? [...far.points] : [...far.points].reverse();
    const width = roadWidth(edgeA, edgeB);
    if (!width || width.minM < 2 || width.maxM > 20 || width.maxM - width.minM > 2) return null;
    const ft = (v: number) => (v / 0.3048).toFixed(1);
    const extra = edgeA.length > 2 ? ", carried on by the lines drawn from its ends" : "";
    return {
      kind: "road",
      id: itemId("road", [...edgeA.map((p) => p.id), "/", ...edgeB.map((p) => p.id)]),
      from: [far.line.id],
      file: far.line.file,
      evidence: [
        name ? `"${name}" is written on the sketch, naming a road.` : `A gate is written in the lot's side from ${a.pointId} to ${b.pointId}, and a gate opens onto a road or a path: no name is read for it.`,
        `Its near side runs along ${list(ids(edgeA))}: the lot's side from ${a.pointId} to ${b.pointId}${extra}. Its far side runs along ${list(ids(edgeB))}, drawn across from it.`,
        `Between them it measures ${m(width.minM)} to ${m(width.maxM)} (${ft(width.minM)} to ${ft(width.maxM)} ft), from the surveyed points.`,
      ],
      level: "check",
      name,
      edgeA,
      edgeB,
      widthM: { min: width.minM, max: width.maxM },
    };
  }

  function lotProposal(ring: SurveyPoint[], from: string[], file: string, label: string, evidence: string[]): LotProposal {
    // The corners are where the outline turns; points on its straight sides stay on the walls that run through them.
    const kept = cornerIndexes(ring, true, onLine);
    const shape = kept.map((i) => ring[i]!);
    const sides = sideOffsets(ring, kept, true);
    const onSides = sides.map((x) => ring[x.i]!);
    const areaM2 = area(shape);
    const id = itemId("lot", shape.map((p) => p.id));
    const ev = [...evidence, `Its corners, where it turns (each more than ${m(onLine)} off the straight line between its neighbours): ${list(ids(shape))}.`];
    if (sides.length > 0) ev.push(`${list(ids(onSides))} lie${onSides.length === 1 ? "s" : ""} on its sides, within ${m(Math.max(...sides.map((x) => x.off)))}.`);
    ev.push(`Its area from the coordinates is ${areaM2.toFixed(2)} m².`);
    // A point between the two tolerances could be a corner the boundary turns at: asked, with what the area would be.
    for (const x of sides.filter((y) => y.off > tight)) {
      const withIt = area([...kept, x.i].sort((p, q) => p - q).map((i) => ring[i]!));
      ask(from, file, `${ring[x.i]!.pointId} lies ${m(x.off)} off the lot's side from ${ring[x.a]!.pointId} to ${ring[x.b]!.pointId}: it was taken as a point on that side, not a corner.`, [
        `As a corner, the lot's area would be ${withIt.toFixed(2)} m² (${Math.abs(withIt - areaM2).toFixed(2)} m² ${withIt > areaM2 ? "more" : "less"}). If the boundary turns at it, add it to the lot's corners on the Lots step.`,
      ], { item: id, answeredBy: "confirm" });
    }
    if (options.statedM2) {
      const diff = ((areaM2 - options.statedM2) / options.statedM2) * 100;
      ev.push(`The stated extent is ${options.statedM2.toFixed(2)} m²: the outline is ${Math.abs(diff).toFixed(1)}% ${diff > 0 ? "larger" : "smaller"}. The outline wasn't chosen to match it.`);
      const round = roundPerches(options.statedM2);
      if (round !== null && roundPerches(areaM2) === null && Math.abs(diff) > 1) ev.push(`The stated extent comes to ${round}.00 perches, a round figure as a deed's extent usually is: it may be the title's extent, not this survey's.`);
    }
    ev.push(...strips(shape));
    return { kind: "lot", id, from, file, evidence: ev, level: "check", label, corners: shape, onSides, areaM2 };
  }
}

