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
import type { DrawingFeature } from "../document";
import { area, distance, orient, pointSegmentDistance, segmentsIntersect, type Point } from "../geometry";
import type { SurveyPoint } from "../parcel";
import { classifyArea, classifyLine, LAYER_OF, symbolEntry, type LineKind } from "./classify";
import type { SketchDrawing, SketchLine } from "./drawing";
import { indexPoints, matchNote, matchPoint, type PointIndex } from "./match";

export interface InterpretOptions {
  /** A point within this many metres of the straight line between its neighbours lies on that side; further off, it's a corner. Farbaek's default: 0.25 m. */
  onLineM?: number;
  /** Within this many metres, the coordinates are strong evidence for the line. Farbaek's default: 0.10 m. */
  tightM?: number;
  /** The extent stated for the land, m², to compare with the lot's computed area (never to choose an outline by). */
  statedM2?: number | null;
  /** Road widths written in the readings ("15'", "4.5 m"), as written. */
  widths?: readonly string[];
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

export type Proposal = LineProposal | LotProposal | SymbolProposal | BuildingProposal;

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
}

export interface SketchInterpretation {
  proposals: Proposal[];
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
  return `sk-${{ lot: "lot", line: "l", symbol: "s", building: "b" }[kind]}-${fingerprint(`${kind}#${key}#${extra}`)}`;
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
function matchLine(line: SketchLine, index: PointIndex): { points: SurveyPoint[]; notes: string[]; unmatched: string[]; exact: boolean; closes: boolean } {
  const r = matchPoints(line.points, index);
  const round = r.points.length >= 4 && r.points[0]!.id === r.points.at(-1)!.id;
  return { ...r, points: round ? r.points.slice(0, -1) : r.points, closes: (line.closes || round) && r.points.length - (round ? 1 : 0) >= 3 };
}

function matchPoints(labels: readonly string[], index: PointIndex): { points: SurveyPoint[]; notes: string[]; unmatched: string[]; exact: boolean } {
  const points: SurveyPoint[] = [];
  const notes: string[] = [];
  const unmatched: string[] = [];
  let exact = true;
  for (const label of labels) {
    const r = matchPoint(label, index);
    if (!r.point) {
      unmatched.push(matchNote(r) ?? label);
      continue;
    }
    if (r.how !== "exact") {
      exact = false;
      notes.push(matchNote(r)!);
    }
    if (points.at(-1)?.id !== r.point.id) points.push(r.point);
  }
  return { points, notes, unmatched, exact };
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

/**
 * A written width ("15'", "15 ft", "4.5 m") in metres, or null: feet are converted by the international foot. The unit must end the
 * word, so a number in a road's name ("Lane 5 Mawatha", "3 Mile Post Road") is never taken for a width.
 */
export function writtenWidth(text: string): number | null {
  const mm = /(\d+(?:\.\d+)?)\s*(m|mtrs?|metres?|meters?|ft|feet|'|′)(?![a-z])/i.exec(text);
  if (!mm) return null;
  const v = Number(mm[1]);
  if (!Number.isFinite(v) || v <= 0 || v > 60) return null;
  return /^(ft|feet|'|′)$/i.test(mm[2]!) ? v * 0.3048 : v;
}

export function interpretSketch(drawing: SketchDrawing, points: readonly SurveyPoint[], codes: readonly CodeEntry[], options: InterpretOptions = {}): SketchInterpretation {
  const onLine = options.onLineM ?? 0.25;
  const tight = options.tightM ?? 0.1;
  const index = indexPoints(points);
  const proposals: Proposal[] = [];
  const questions: Question[] = [];
  const matches: SketchInterpretation["matches"] = [];
  const ask = (from: string[], file: string, text: string, evidence: string[] = [], about?: Pick<Question, "item" | "answeredBy">) => questions.push({ from, file, text, evidence, ...about });

  for (const label of new Set([...drawing.lines.flatMap((l) => l.points), ...drawing.symbols.map((s) => s.at).filter(Boolean), ...drawing.areas.flatMap((a) => a.around)])) {
    const r = matchPoint(label, index);
    matches.push({ label, pointId: r.point?.pointId ?? null, how: r.how });
  }

  // ---- Lines: matched, classified, tested against the coordinates.
  const lines: { line: SketchLine; points: SurveyPoint[]; closes: boolean; kind: LineKind; proposal: LineProposal | null }[] = [];
  for (const line of drawing.lines) {
    const mt = matchLine(line, index);
    const cls = classifyLine(line.label, line.style, codes);
    const named = line.label ? `the line ${list(line.points)} ("${line.label}")` : `the line ${list(line.points)}`;
    if (mt.unmatched.length > 0) {
      ask([line.id], line.file, `${named[0]!.toUpperCase()}${named.slice(1)} wasn't drawn: ${list(mt.unmatched)}.`, ["Check the number on the sketch, or import the file that has the point."]);
      continue;
    }
    if (mt.points.length < 2) {
      ask([line.id], line.file, `${named[0]!.toUpperCase()}${named.slice(1)} joins a surveyed point to itself, so it wasn't drawn.`, ["Check its numbers on the sketch."]);
      continue;
    }
    const id = itemId("line", mt.points.map((p) => p.id));
    const evidence: string[] = [`Drawn on ${line.file} through ${list(ids(mt.points))}${line.label ? `, with "${line.label}" written along it` : ""}${line.style !== "single" ? ` (${line.style})` : ""}.`];
    evidence.push(`Read as a ${cls.kind === "line" ? "line of unknown kind" : cls.kind}: ${cls.why}.`);
    evidence.push(...mt.notes);
    let level: Level = mt.exact && line.certain && cls.fromWriting ? "strong" : "check";
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
    if (blocked) continue;
    if (!cls.fromWriting) ask([line.id], line.file, `What is ${named}? ${cls.why[0]!.toUpperCase()}${cls.why.slice(1)}.`, ["It's drawn as the sketch shows it; confirm what it is, or remove it."], { item: id, answeredBy: "confirm" });
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
    };
    lines.push({ line, points: mt.points, closes: mt.closes, kind: cls.kind, proposal });
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
    const edges = new Map<string, Set<string>>();
    const byId = new Map(points.map((p) => [p.id, p]));
    const owner = new Map<string, string>();
    for (const l of lines) {
      if (l.kind === "road" || l.line.style === "dashed") continue;
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
    const rings = cycles(edges)
      .map((c) => c.map((id) => byId.get(id)!))
      .filter((r) => simple(r))
      .map((r) => ({ r, a: area(r) }))
      .sort((x, y) => y.a - x.a);
    if (rings.length > 0 && rings[0]!.a > 1) {
      const best = rings[0]!;
      const used = new Set<string>();
      best.r.forEach((p, i) => {
        const q = best.r[(i + 1) % best.r.length]!;
        used.add(owner.get(p.id < q.id ? `${p.id}|${q.id}` : `${q.id}|${p.id}`) ?? "");
      });
      const from = [...used].filter(Boolean).sort();
      const label = lotAreas.length === 1 ? lotAreas[0]!.c.name : "";
      lot = lotProposal(best.r, from, drawing.lines.find((l) => l.id === from[0])?.file ?? "", label, [`The lines drawn on the sketch close round ${list(ids(best.r))}, the largest outline they make.`]);
      const lotId = lot.id;
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

  // ---- Roads: which side of the surveyed edge the road lies on, from where the lot is; and its width, only as written.
  for (const l of lines.filter((x) => x.kind === "road")) {
    const p = l.proposal!;
    const a = l.points[0]!;
    const b = l.points.at(-1)!;
    const widths = (options.widths ?? []).map((w) => ({ w, v: writtenWidth(w) })).filter((x) => x.v !== null);
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
      else ask(p.from, p.file, `The lot lies on both sides of the road edge ${list(ids(l.points))}, so which side the road is on isn't clear.`, [], { answeredBy: "road" });
      if (widths.length === 1 && oneSide) {
        ask(p.from, p.file, `The road is written as ${widths[0]!.w} wide (${m(widths[0]!.v!)}): its far edge would lie that far to the ${compass(mid, away)} of the surveyed edge.`, [
          "Farbaek doesn't draw a road from one surveyed edge yet: the far edge isn't drawn, and nothing is guessed in its place.",
        ], { answeredBy: "road" });
      }
    }
    // Answered once the plan draws a road with both its edges.
    if (widths.length === 0) ask(p.from, p.file, `The width of the road along ${list(ids(l.points))} isn't written on the sketch.`, ["Only its surveyed edge is drawn. Give its width, or survey its far edge."], { answeredBy: "road" });
    if (widths.length > 1) ask(p.from, p.file, `More than one road width is written on the sketch (${list(widths.map((w) => w.w))}): none was taken.`, [], { answeredBy: "road" });
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
        ...(fromLabel ? [] : [`Nothing is written at it: drawn as the code list's only ${s.kind}, ${entry.code}.`]),
      ],
      level: r.how === "exact" && fromLabel ? "strong" : "check",
      code: entry.code,
      meaning: entry.meaning,
      point: r.point,
    });
  }

  // ---- Areas: buildings with numbered corners become outlines; without them, a question.
  for (const a of drawing.areas) {
    const c = classifyArea(a.label, codes);
    if (c.kind !== "building") continue;
    const around = roundOff(a.around);
    const pts = around.map((l) => matchPoint(l, index).point);
    if (around.length >= 3 && pts.every((p): p is SurveyPoint => p !== null) && simple(pts)) {
      proposals.push({ kind: "building", id: itemId("building", pts.map((p) => p.id)), from: [a.id], file: a.file, evidence: [`"${a.label}" is written on ${a.file} inside the corners ${list(a.around)}: ${c.why}.`], level: "check", code: c.code?.code ?? "", label: a.label, points: pts });
    } else ask([a.id], a.file, `"${a.label}" is written on the sketch (${c.why}), but its corners aren't numbered${a.around.length ? ` (${list(a.around)} were read)` : ""}.`, ["Its outline can't be drawn from the sketch. Give its corners on the Lots step."]);
  }
  return { proposals, questions, matches };

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
    }
    ev.push(...strips(shape));
    return { kind: "lot", id, from, file, evidence: ev, level: "check", label, corners: shape, onSides, areaM2 };
  }
}

