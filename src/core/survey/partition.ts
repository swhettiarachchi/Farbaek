/**
 * Partitioning a lot into shares (stage 193): where the dividing lines of a
 * sub division fall, computed by tested code, never by AI. The surveyor
 * chooses the lot, a leg the lines run parallel or square to (or a corner
 * they all pass through), which end the first share starts from, and the
 * shares (stated areas or widths, one of which may take what's left). The
 * engine finds each dividing line (by bisection for areas, at the stated
 * distance for widths, exactly along each leg for lines through a corner)
 * and reports:
 * - each share's area, its length along the chosen leg (its frontage when
 *   that leg is the road) and its extent across the dividing lines;
 * - the proposed corners where each line meets the lot's boundary, with the
 *   setting-out distance from the surveyed corner at the start of that leg;
 * - the area balance: the lot, the sum of the shares and the residual;
 * - what stops a share (a line that would cut it in pieces), and, when asked,
 *   the UDA minimums it doesn't meet.
 *
 * The result is a proposal to peg in the field. Its corners are not survey
 * points: they join a plan only once pegged, observed and imported (survey
 * skill, subdivision engine: a proposal is not proof of approval).
 */
import { bearingFromDeltas } from "./angles";
import { area, distance, orient, pointSegmentDistance, segmentsIntersect, selfIntersections, signedArea, type Point } from "./geometry";
import type { SurveyPoint } from "./parcel";
import { minimumText, remindersFor, shortOf, type RuleSet } from "./rules";

export const PARTITION_ENGINE = "partition/1.1.0";


export interface PartitionRequest {
  /** The lot's corners in order. */
  ring: readonly SurveyPoint[];
  /** The leg the dividing lines refer to (leg i runs from corner i to corner i + 1); for lines through a corner, the leg frontages are measured along. */
  leg: number;
  /** Lines parallel to that leg (shares one behind another, away from it), square to it (shares side by side along it), or through one corner (shares fanning out from it). */
  lines: "parallel" | "square" | "through";
  /** For lines through a corner: that corner, by its place in the ring. */
  corner?: number;
  /**
   * For square lines: the first share starts at the leg's first corner, or its second. For lines through a corner: the first share takes
   * the boundary leaving that corner forwards in the ring (start) or backwards (end).
   */
  from: "start" | "end";
  /** Each share's area in m² (or width in metres, with `by: "width"`), in order. One share may be null: it takes what's left. */
  shares: (number | null)[];
  /**
   * Shares by area (the default), or by width: for square lines, the width along the leg from its starting corner (a frontage, "30 ft along
   * the road"); for parallel lines, the distance from the leg (a strip, "Res. for Access, 10 ft wide").
   */
  by?: "area" | "width";
  /** The planning rules each share is checked against (rules.ts), or null for none. */
  rules: RuleSet | null;
}

export interface ProposedCorner {
  /** "P1", "P2"…: proposed, not a survey point. */
  name: string;
  e: number;
  n: number;
  /** Which dividing line it's on (0 for the first), and its position along that line. */
  cut: number;
  along: number;
  /** Set when the line passes through a surveyed corner (within 1 mm): then that corner is the line's end, and nothing new is set out. */
  existing?: SurveyPoint;
  /** The surveyed leg it's on, and its distance from that leg's first corner, for setting out. */
  from: SurveyPoint;
  to: SurveyPoint;
  distanceM: number;
}

export interface ShareCorner {
  name: string;
  e: number;
  n: number;
  proposed: boolean;
}

export interface Share {
  targetM2: number;
  areaM2: number;
  corners: ShareCorner[];
  /** Its length along the chosen leg: its frontage when that leg is the road. Zero when it doesn't touch the leg. */
  alongLegM: number;
  /** Its least depth: square lines, the least of its dividing lines' lengths and its mean depth (area over frontage); parallel lines, the distance between its two dividing lines. */
  depthM: number;
  /** What stops it being made as asked, and the rules' minimums it doesn't meet. */
  problems: string[];
}

export type PartitionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** True when every share can be made as asked (and meets the rules' minimums, when checked). */
      feasible: boolean;
      lotM2: number;
      shares: Share[];
      corners: ProposedCorner[];
      /** Each dividing line where it runs inside the lot, for a preview. */
      segments: { cut: number; a: Point; b: Point }[];
      /** The dividing lines' bearing, whole-circle from grid north, 0 to 180; null for lines through a corner, which each have their own. */
      bearing: number | null;
      /** Lines through a corner: each line's bearing from that corner and its length, for setting out by angle and distance. */
      rays?: { from: string; to: string; bearing: number; lengthM: number }[];
      sumM2: number;
      residualM2: number;
      /** The rule set's reminders that apply to this division, each with its section. */
      reminders: string[];
      engine: string;
    };

type Local = Point & { src: SurveyPoint | null };

const dot = (p: Point, n: Point) => p.e * n.e + p.n * n.n;

/** The part of a ring with p·n at or below s (or above, when `high`). Sutherland–Hodgman against one half-plane: exact for any simple ring. */
function clip(ring: readonly Local[], n: Point, s: number, high: boolean): Local[] {
  const out: Local[] = [];
  const side = (p: Point) => (high ? dot(p, n) - s : s - dot(p, n));
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const da = side(a);
    const db = side(b);
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push({ e: a.e + t * (b.e - a.e), n: a.n + t * (b.n - a.n), src: null });
    }
  }
  return out;
}

type Frame = { o: SurveyPoint; ring: Local[]; lotM2: number; a: Local; b: Local; len: number; u: Point; across: Point; n: Point; lo: number; hi: number };

/** The lot in local metres, its chosen leg, and the direction the shares follow one another in; or why it can't be divided that way. */
function frame(req: Pick<PartitionRequest, "ring" | "leg" | "lines" | "from">): Frame | string {
  if (req.ring.length < 3) return "The lot needs at least three corners.";
  if (!Number.isInteger(req.leg) || req.leg < 0 || req.leg >= req.ring.length) return "Choose a leg of the lot.";
  // Work in metres from the first corner, so grid-sized coordinates keep their precision.
  const o = req.ring[0]!;
  const ring: Local[] = req.ring.map((p) => ({ e: p.e - o.e, n: p.n - o.n, src: p }));
  const lotM2 = area(ring);
  if (!(lotM2 > 0)) return "The lot has no area.";
  if (selfIntersections(ring).length > 0) return "The lot's boundary crosses itself, so it can't be divided. Check the order of its corners.";
  const a = ring[req.leg]!;
  const b = ring[(req.leg + 1) % ring.length]!;
  const len = distance(a, b);
  if (len === 0) return "That leg has no length.";
  const u: Point = { e: (b.e - a.e) / len, n: (b.n - a.n) / len };
  // Square to the leg, pointing into the lot (left of the leg on an anticlockwise ring, right on a clockwise one).
  const across: Point = signedArea(ring) > 0 ? { e: -u.n, n: u.e } : { e: u.n, n: -u.e };
  // n: the direction the shares follow one another in.
  const n: Point = req.lines === "parallel" ? across : req.from === "start" ? u : { e: -u.e, n: -u.n };
  if (req.lines === "parallel" && Math.min(...ring.map((p) => dot(p, across))) < dot(a, across) - 0.001) {
    return "The lot reaches behind that leg's line, so the shares can't be stacked from it. Choose another leg, or lines square to it.";
  }
  const proj = ring.map((p) => dot(p, n));
  return { o, ring, lotM2, a, b, len, u, across, n, lo: Math.min(...proj), hi: Math.max(...proj) };
}

/**
 * What shares by width divide: the leg's length for square lines (frontages along it, from the starting corner), or the lot's depth from
 * the leg for parallel lines. Null when the lot can't be divided that way.
 */
export function widthRoom(req: Pick<PartitionRequest, "ring" | "leg" | "lines" | "from">): number | null {
  const f = frame(req);
  return typeof f === "string" ? null : req.lines === "square" ? f.len : f.hi - f.lo;
}

export function partitionLot(req: PartitionRequest): PartitionResult {
  const fail = (error: string): PartitionResult => ({ ok: false, error });
  const width = req.by === "width";
  if (req.shares.length < 2 || req.shares.length > 50) return fail("Divide the lot into 2 to 50 shares.");
  if (req.shares.filter((x) => x === null).length > 1) return fail("Only one share can take what's left.");
  if (req.shares.some((x) => x !== null && !(Number.isFinite(x) && x > 0))) return fail(width ? "Every stated share needs a width above zero." : "Every stated share needs an area above zero.");
  if (width && req.lines === "through") return fail("Lines through a corner divide by area. Give the shares as areas.");
  if (req.rules && !Object.values(req.rules.minimums).every((x) => Number.isFinite(x) && x >= 0)) return fail("Give each minimum as a number of zero or more.");
  const f = frame(req);
  if (typeof f === "string") return fail(f);
  const { o, ring, lotM2, a, b, len, u, across, n, lo, hi } = f;

  const below = (s: number) => area(clip(ring, n, s, false));
  const rest = req.shares.some((x) => x === null);
  const stated = req.shares.reduce<number>((s, x) => s + (x ?? 0), 0);
  const cuts: number[] = [];
  let targets: number[] = [];
  if (!width) {
    if (stated > lotM2 + 0.005) return fail(`The stated shares come to ${stated.toFixed(2)} m², more than the lot's ${lotM2.toFixed(2)} m².`);
    if (!rest && Math.abs(stated - lotM2) > 0.01) return fail(`The shares come to ${stated.toFixed(2)} m², not the lot's ${lotM2.toFixed(2)} m². Let one share take what's left.`);
    if (rest && lotM2 - stated < 0.01) return fail("The stated shares take the whole lot, so nothing is left for the share left empty.");
    targets = req.shares.map((x) => x ?? lotM2 - stated);
  }
  if (req.lines === "through") return fan(req, f, targets);
  if (width) {
    // By width: each line at its stated distance. Square lines measure along the leg from the starting corner, so the widths share the
    // leg (a lot reaching past either end of it adds to the end shares); parallel lines measure from the leg, so they share the depth.
    const square = req.lines === "square";
    const base = square ? dot(req.from === "start" ? a : b, n) : dot(a, n);
    const room = square ? len : hi - base;
    const what = square ? `the leg's ${room.toFixed(3)} m` : `the lot's depth of ${room.toFixed(3)} m from that leg`;
    if (stated > room + 0.0005) return fail(`The stated widths come to ${stated.toFixed(3)} m, more than ${what}.`);
    if (!rest && Math.abs(stated - room) > 0.005) return fail(`The widths come to ${stated.toFixed(3)} m, not ${what}. Let one share take what's left.`);
    if (rest && room - stated < 0.001) return fail(`The stated widths take all of ${what}, so nothing is left for the share left empty.`);
    const widths = req.shares.map((x) => x ?? room - stated);
    let at = base;
    for (let i = 0; i < widths.length - 1; i++) cuts.push((at += widths[i]!));
    const edges = [lo, ...cuts, hi];
    targets = widths.map((_, i) => below(edges[i + 1]!) - below(edges[i]!));
  } else {
    // Each dividing line by bisection on its offset: the area below it grows steadily from 0 to the whole lot.
    let cum = 0;
    for (let i = 0; i < targets.length - 1; i++) {
      cum += targets[i]!;
      let l = lo;
      let h = hi;
      for (let k = 0; k < 100; k++) {
        const m = (l + h) / 2;
        if (below(m) < cum) l = m;
        else h = m;
      }
      cuts.push((l + h) / 2);
    }
  }

  // Where each line meets the boundary: the proposed corners.
  // The lines run square to n, and are read from the leg into the lot (or along the leg from its first corner).
  const lineDir = req.lines === "parallel" ? u : across;
  const corners: ProposedCorner[] = [];
  const cutCorners: ProposedCorner[][] = [];
  const cutProblem: (string | null)[] = [];
  const segments: { cut: number; a: Point; b: Point }[] = [];
  // A computed end moved onto a surveyed corner: the shares' outlines use the corner too.
  const snaps: { at: Point; to: Local }[] = [];
  for (const [ci, s] of cuts.entries()) {
    const met = meet(ring, n, s, lineDir);
    const here: ProposedCorner[] = [];
    const add = (x: Meeting, segLen: number) => {
      const found = here.find((h) => Math.hypot(h.e - o.e - x.e, h.n - o.n - x.n) <= 1e-9 || (x.vertex && h.existing === x.vertex.src));
      if (found) return found;
      let c: ProposedCorner;
      if (x.vertex) {
        const v = x.vertex;
        c = { name: "", e: v.e + o.e, n: v.n + o.n, cut: ci, along: x.along, existing: v.src!, from: v.src!, to: v.src!, distanceM: 0 };
      } else {
        const p = ring[x.edge]!;
        const q = ring[(x.edge + 1) % ring.length]!;
        const fromP = Math.hypot(x.e - p.e, x.n - p.n);
        const legLen = distance(p, q);
        // Within a millimetre of a surveyed corner the line ends at that corner, when that moves little enough (SNAP_AREA_M2).
        const near = fromP <= 0.001 ? p : legLen - fromP <= 0.001 ? q : null;
        const at = near && 0.5 * segLen * distance(near, x) <= SNAP_AREA_M2 ? near : null;
        if (at) {
          snaps.push({ at: { e: x.e, n: x.n }, to: at });
          const same = here.find((h) => h.existing === at.src);
          if (same) return same;
        }
        c = { name: "", e: (at ?? x).e + o.e, n: (at ?? x).n + o.n, cut: ci, along: x.along, ...(at ? { existing: at.src! } : {}), from: p.src!, to: q.src!, distanceM: at === p ? 0 : at === q ? legLen : fromP };
      }
      here.push(c);
      return c;
    };
    const stretches: [ProposedCorner, ProposedCorner][] = [];
    for (const [a0, b0] of met.inside) {
      const len0 = Math.abs(b0.along - a0.along);
      const ca = add(a0, len0);
      const cb = add(b0, len0);
      stretches.push([ca, cb]);
      segments.push({ cut: ci, a: { e: ca.e, n: ca.n }, b: { e: cb.e, n: cb.n } });
    }
    // Named along the line, so P1 and P2 are the two ends of the first line; an end on a surveyed corner keeps its number.
    here.sort((x, y) => x.along - y.along);
    for (const c of here) {
      if (c.existing) c.name = c.existing.pointId;
      else c.name = `P${corners.filter((k) => !k.existing).length + here.filter((h) => !h.existing && here.indexOf(h) <= here.indexOf(c)).length}`;
    }
    corners.push(...here);
    cutCorners.push(here);
    // One stretch inside the lot is a clean line. Between two stretches the line either passes through a corner pointing into the lot
    // (the stretches share that corner), runs along one of its legs, or leaves the lot and comes back.
    let problem: string | null = null;
    for (let k = 0; k + 1 < stretches.length && !problem; k++) {
      const end = stretches[k]![1];
      const next = stretches[k + 1]![0];
      if (end === next) problem = `A dividing line runs through corner ${end.name}, which points into the lot, so a share would fall in two pieces joined there. Try lines the other way, other shares, or another leg.`;
      else if (onBoundary({ e: (end.e + next.e) / 2 - o.e, n: (end.n + next.n) / 2 - o.n }, ring)) problem = `A dividing line runs along the leg ${end.name} to ${next.name} between two parts of the lot, so a share would fall in pieces. Try lines the other way, other shares, or another leg.`;
    }
    if (!problem && stretches.length > 1) problem = `A dividing line crosses the lot's boundary ${stretches.length * 2} times, so a share would fall in pieces. Try lines the other way, or another leg.`;
    cutProblem.push(problem);
  }
  const snapped = (piece: Local[]) => piece.map((p) => (p.src ? p : (snaps.find((x) => Math.hypot(x.at.e - p.e, x.at.n - p.n) <= 1e-6)?.to ?? p)));

  const bounds = [lo, ...cuts, hi];
  const shares: Share[] = targets.map((target, i) => {
    const piece = dedupe(unspike(dedupe(snapped(clip(clip(ring, n, bounds[i + 1]!, false), n, bounds[i]!, true)))));
    const areaM2 = area(piece);
    const s0 = bounds[i]!;
    const s1 = bounds[i + 1]!;
    // Along the leg: the length of this share's outline lying on the chosen leg, after any snap onto a corner.
    const alongLegM = alongLeg(piece, a, b);
    // Square lines: the least of its dividing lines' lengths and its mean depth (area over frontage), so a share that tapers away can't pass on its deepest side.
    const sides = [i > 0 ? chord(ring, n, s0) : Infinity, i < targets.length - 1 ? chord(ring, n, s1) : Infinity];
    const mean = alongLegM > 0 ? areaM2 / alongLegM : Infinity;
    const depthM = req.lines === "square" ? Math.min(...sides, mean) : s1 - s0;
    const problems = judge(areaM2, target, alongLegM, depthM, [cutProblem[i - 1], cutProblem[i]], req.rules, width);
    return { targetM2: target, areaM2, corners: piece.map((p) => nameCorner(p, [...(cutCorners[i - 1] ?? []), ...(cutCorners[i] ?? [])], o)), alongLegM, depthM, problems };
  });
  const sumM2 = shares.reduce((s, x) => s + x.areaM2, 0);
  const bearing = bearingFromDeltas(lineDir.e, lineDir.n)!;
  return { ok: true, feasible: shares.every((s) => s.problems.length === 0), lotM2, shares, corners, segments, bearing: bearing >= 180 ? bearing - 180 : bearing, sumM2, residualM2: lotM2 - sumM2, reminders: req.rules ? remindersFor(req.rules, lotM2, shares.length) : [], engine: PARTITION_ENGINE };
}

/**
 * The most one line end's snap onto a surveyed corner may move between two shares, in m². A share has at most four line ends (two
 * lines, two ends each), so its snaps together move under 0.01 m², the area check.
 */
const SNAP_AREA_M2 = 0.002;

/** How far under a minimum a figure must be to count as under it: the rounding it's shown with (0.01 m², 1 mm). */
const AREA_TOLERANCE_M2 = 0.005;
const LENGTH_TOLERANCE_M = 0.0005;

/** The length of an outline lying on the segment a to b (within a millimetre). */
function alongLeg(piece: readonly Point[], a: Point, b: Point): number {
  const on = (p: Point) => pointSegmentDistance(p, a, b) <= 0.001;
  let total = 0;
  for (let j = 0; j < piece.length; j++) {
    const x = piece[j]!;
    const y = piece[(j + 1) % piece.length]!;
    if (on(x) && on(y) && on({ e: (x.e + y.e) / 2, n: (x.n + y.n) / 2 })) total += distance(x, y);
  }
  return total;
}

/** Whether a point lies on a ring's boundary (within 0.1 µm). */
function onBoundary(p: Point, ring: readonly Point[]): boolean {
  for (let i = 0; i < ring.length; i++) if (pointSegmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!) <= 1e-7) return true;
  return false;
}

/** An outline without fold-backs: a corner the outline reaches and turns straight back from (a line lying along a leg leaves one). */
function unspike(piece: Local[]): Local[] {
  const out = [...piece];
  let changed = true;
  while (changed && out.length > 3) {
    changed = false;
    for (let i = 0; i < out.length; i++) {
      const p = out[(i - 1 + out.length) % out.length]!;
      const v = out[i]!;
      const q = out[(i + 1) % out.length]!;
      const span = distance(p, q);
      const off = span <= 1e-9 ? distance(p, v) : Math.abs(orient(p, q, v)) / span;
      const back = (v.e - p.e) * (q.e - v.e) + (v.n - p.n) * (q.n - v.n) < 0;
      if ((span <= 1e-9 || off <= 1e-7) && back) {
        out.splice(i, 1);
        changed = true;
        break;
      }
    }
  }
  return out;
}

/** What stops a share being made as asked: its dividing lines' problems, an area it can't be given, and the rules' minimums when checked. */
function judge(areaM2: number, targetM2: number, alongLegM: number, depthM: number, lineProblems: (string | null | undefined)[], rules: RuleSet | null, byWidth = false): string[] {
  const problems = [...new Set(lineProblems.filter((x): x is string => Boolean(x)))];
  if (Math.abs(areaM2 - targetM2) > 0.01) problems.push(byWidth ? `Its outline comes to ${areaM2.toFixed(2)} m², not the ${targetM2.toFixed(2)} m² between its lines.` : `Its lines give it ${areaM2.toFixed(2)} m², not the ${targetM2.toFixed(2)} m² asked for.`);
  if (rules) {
    const min = rules.minimums;
    if (areaM2 < min.areaM2 - AREA_TOLERANCE_M2) problems.push(`It's ${shortOf(areaM2, min.areaM2)} m², under ${rules.label} of ${minimumText(min.areaM2, false)} m².`);
    if (min.frontageM > 0 && alongLegM < LENGTH_TOLERANCE_M) problems.push("It doesn't touch the chosen leg, so it has no frontage on it.");
    else if (alongLegM < min.frontageM - LENGTH_TOLERANCE_M) problems.push(`Its frontage is ${shortOf(alongLegM, min.frontageM)} m, under ${rules.label} of ${minimumText(min.frontageM, true)} m.`);
    if (depthM < min.depthM - LENGTH_TOLERANCE_M) problems.push(`Its depth is ${shortOf(depthM, min.depthM)} m, under ${rules.label} of ${minimumText(min.depthM, true)} m.`);
  }
  return problems;
}

interface Meeting extends Point {
  along: number;
  /** The ring edge it lies inside (edge i runs from corner i to corner i + 1), or the corner it is. */
  edge: number;
  vertex: Local | null;
}

/**
 * Where the line p·n = s meets a ring: every crossing inside a leg and every corner lying on the line (within a nanometre), in order
 * along the line, then the stretches between them whose middle is inside the ring. A corner pointing into the ring that the line runs
 * through ends one stretch and starts the next; a leg lying along the line is boundary, not inside.
 */
function meet(ring: readonly Local[], n: Point, s: number, dir: Point): { inside: [Meeting, Meeting][] } {
  const EPS = 1e-9;
  const d = ring.map((p) => dot(p, n) - s);
  const side = d.map((x) => (Math.abs(x) <= EPS ? 0 : x > 0 ? 1 : -1));
  const events: Meeting[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    if (side[i] === 0) events.push({ e: p.e, n: p.n, along: dot(p, dir), edge: i, vertex: p });
    const j = (i + 1) % ring.length;
    if (side[i] !== 0 && side[j] !== 0 && side[i] !== side[j]) {
      const t = d[i]! / (d[i]! - d[j]!);
      const x = { e: p.e + t * (q.e - p.e), n: p.n + t * (q.n - p.n) };
      events.push({ ...x, along: dot(x, dir), edge: i, vertex: null });
    }
  }
  events.sort((x, y) => x.along - y.along);
  const inside: [Meeting, Meeting][] = [];
  for (let k = 0; k + 1 < events.length; k++) {
    const a = events[k]!;
    const b = events[k + 1]!;
    if (b.along - a.along <= EPS) continue;
    const mid = { e: (a.e + b.e) / 2, n: (a.n + b.n) / 2 };
    let clear = Infinity;
    for (let i = 0; i < ring.length; i++) clear = Math.min(clear, pointSegmentDistance(mid, ring[i]!, ring[(i + 1) % ring.length]!));
    if (clear > 1e-7 && inside_(mid, ring)) inside.push([a, b]);
  }
  return { inside };
}

/** A share's corner by name: a surveyed corner keeps its number; a computed one takes the name of the nearest new corner on its lines. */
function nameCorner(p: Local, near: readonly ProposedCorner[], o: Point): ShareCorner {
  if (p.src) return { name: p.src.pointId, e: p.src.e, n: p.src.n, proposed: false };
  const pc = near.reduce<ProposedCorner | null>((best, c) => (!best || Math.hypot(c.e - o.e - p.e, c.n - o.n - p.n) < Math.hypot(best.e - o.e - p.e, best.n - o.n - p.n) ? c : best), null);
  return { name: pc?.name ?? "?", e: p.e + o.e, n: p.n + o.n, proposed: !pc?.existing };
}

/** Whether a point lies inside a ring (crossing count). */
function inside_(p: Point, ring: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.n > p.n !== b.n > p.n && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) c = !c;
  }
  return c;
}

/**
 * Lines through one corner, fanning out across the lot. With the corner fixed and the far end of a line moving along one leg, the area
 * cut off changes linearly, so each line's end is solved exactly on every leg that can give the area; the first that stays inside the
 * lot is used. A lot the fan can't cover from that corner (an L seen round its bend) gets a line that leaves it, and says so.
 */
function fan(req: PartitionRequest, f: Frame, targets: number[]): PartitionResult {
  const { o, ring, lotM2, a, b } = f;
  const k = req.corner ?? -1;
  if (!Number.isInteger(k) || k < 0 || k >= ring.length) return { ok: false, error: "Choose the corner the lines pass through." };
  const m = ring.length;
  const P = ring[k]!;
  // The boundary from the corner's neighbour round to its other neighbour, in the chosen direction.
  const path = Array.from({ length: m - 1 }, (_, j) => ring[(k + (req.from === "start" ? j + 1 : m - j - 1)) % m]!);
  const sign = signedArea([P, ...path]) >= 0 ? 1 : -1;
  // The area cut off with the line's end at each path corner, from 0 to the whole lot.
  const at = [0];
  for (let j = 0; j + 1 < path.length; j++) at.push(at[j]! + (sign * orient(P, path[j]!, path[j + 1]!)) / 2);

  const ok = (q: Point, j: number, snap: Local | null) => {
    for (let i = 0; i < m; i++) {
      const e0 = ring[i]!;
      const e1 = ring[(i + 1) % m]!;
      if (e0 === P || e1 === P) continue;
      if (snap ? e0 === snap || e1 === snap : (e0 === path[j] && e1 === path[j + 1]) || (e1 === path[j] && e0 === path[j + 1])) continue;
      const besideEnd = snap ? false : e0 === path[j] || e1 === path[j] || e0 === path[j + 1] || e1 === path[j + 1];
      if (segmentsIntersect(P, q, e0, e1, besideEnd ? 0 : undefined)) return false;
    }
    return inside_({ e: (P.e + q.e) / 2, n: (P.n + q.n) / 2 }, ring);
  };
  type End = { t: number; j: number; q: Local; snap: Local | null; good: boolean };
  const ends: End[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < targets.length; i++) {
    acc += targets[i]!;
    const found: End[] = [];
    for (let j = 0; j + 1 < path.length; j++) {
      const c0 = at[j]!;
      const c1 = at[j + 1]!;
      if (c0 === c1 || (acc - c0) * (acc - c1) > 0) continue;
      const r = (acc - c0) / (c1 - c0);
      const p0 = path[j]!;
      const p1 = path[j + 1]!;
      const q = { e: p0.e + r * (p1.e - p0.e), n: p0.n + r * (p1.n - p0.n) };
      // Within a millimetre of a surveyed corner the line ends at that corner, when that moves less than 0.005 m² between the shares.
      const nearer = distance(q, p0) <= 0.001 ? p0 : distance(q, p1) <= 0.001 ? p1 : null;
      const snap = nearer && 0.5 * distance(P, q) * distance(q, nearer) <= SNAP_AREA_M2 ? nearer : null;
      const end = snap ?? { ...q, src: null };
      found.push({ t: j + r, j, q: end, snap, good: ok(end, j, snap) });
    }
    const after = found.filter((x) => x.t > (ends[ends.length - 1]?.t ?? 0));
    const pick = after.find((x) => x.good) ?? after[0] ?? found[0];
    if (!pick) return { ok: false, error: "Those shares can't be cut off with lines through that corner." };
    ends.push(pick);
  }

  const corners: ProposedCorner[] = ends.map((x, ci) => {
    const p0 = path[x.j]!;
    const p1 = path[x.j + 1]!;
    // Setting out runs along the leg in the ring's own order, from its first corner.
    const [first, second] = req.from === "start" ? [p0, p1] : [p1, p0];
    const name = x.snap ? x.snap.src!.pointId : `P${ends.slice(0, ci + 1).filter((y) => !y.snap).length}`;
    return { name, e: x.q.e + o.e, n: x.q.n + o.n, cut: ci, along: distance(P, x.q), ...(x.snap ? { existing: x.snap.src! } : {}), from: first.src!, to: second.src!, distanceM: distance(first, x.q) };
  });
  const lineProblem = ends.map((x, ci) => (x.good ? null : `The line from corner ${P.src!.pointId} to ${corners[ci]!.name} leaves the lot or crosses its boundary, so a share would fall in pieces. Try going round the other way, another corner, or lines square to a leg.`));

  const legOn = (p: Point) => pointSegmentDistance(p, a, b) <= 0.001;
  const shares: Share[] = targets.map((target, i) => {
    const t0 = i === 0 ? 0 : ends[i - 1]!.t;
    const t1 = i === ends.length ? path.length - 1 : ends[i]!.t;
    const start = i === 0 ? path[0]! : ends[i - 1]!.q;
    const end = i === ends.length ? path[path.length - 1]! : ends[i]!.q;
    const piece = dedupe([P, start, ...path.filter((_, j) => j > t0 + 1e-12 && j < t1 - 1e-12), end]);
    const areaM2 = area(piece);
    let alongLegM = 0;
    for (let j = 0; j < piece.length; j++) {
      const x = piece[j]!;
      const y = piece[(j + 1) % piece.length]!;
      if (legOn(x) && legOn(y) && legOn({ e: (x.e + y.e) / 2, n: (x.n + y.n) / 2 })) alongLegM += distance(x, y);
    }
    const sides = [i > 0 ? distance(P, start) : Infinity, i < ends.length ? distance(P, end) : Infinity];
    const depthM = Math.min(...sides, alongLegM > 0 ? areaM2 / alongLegM : Infinity);
    const near = [corners[i - 1], corners[i]].filter((c): c is ProposedCorner => Boolean(c));
    return { targetM2: target, areaM2, corners: piece.map((p) => nameCorner(p, near, o)), alongLegM, depthM: Number.isFinite(depthM) ? depthM : 0, problems: judge(areaM2, target, alongLegM, depthM, [lineProblem[i - 1], lineProblem[i]], req.rules) };
  });
  const sumM2 = shares.reduce((s, x) => s + x.areaM2, 0);
  const from = { e: P.e + o.e, n: P.n + o.n };
  return {
    ok: true,
    feasible: shares.every((s) => s.problems.length === 0),
    lotM2,
    shares,
    corners,
    segments: corners.map((c) => ({ cut: c.cut, a: from, b: { e: c.e, n: c.n } })),
    bearing: null,
    rays: ends.map((x, ci) => ({ from: P.src!.pointId, to: corners[ci]!.name, bearing: bearingFromDeltas(x.q.e - P.e, x.q.n - P.n) ?? 0, lengthM: distance(P, x.q) })),
    sumM2,
    residualM2: lotM2 - sumM2,
    reminders: req.rules ? remindersFor(req.rules, lotM2, shares.length) : [],
    engine: PARTITION_ENGINE,
  };
}

/** Consecutive points at the same place (within a micrometre: clipping's rounding) as one, keeping a surveyed corner over a computed point. Snaps onto corners are made before this, and only when they move little enough. */
const SAME_M = 1e-6;

function dedupe(piece: Local[]): Local[] {
  const out: Local[] = [];
  for (const p of piece) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.e - p.e, last.n - p.n) <= SAME_M) {
      if (!last.src && p.src) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0]!.e - out[out.length - 1]!.e, out[0]!.n - out[out.length - 1]!.n) <= SAME_M) {
    const end = out.pop()!;
    if (!out[0]!.src && end.src) out[0] = end;
  }
  return out;
}

/** How long the line p·n = s is inside the ring. */
function chord(ring: readonly Point[], n: Point, s: number): number {
  const dir = { e: -n.n, n: n.e };
  const at: number[] = [];
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    const dp = dot(p, n) - s;
    const dq = dot(q, n) - s;
    if (dp < 0 !== dq < 0 && dp !== dq) {
      const t = dp / (dp - dq);
      at.push((p.e + t * (q.e - p.e)) * dir.e + (p.n + t * (q.n - p.n)) * dir.n);
    }
  }
  at.sort((x, y) => x - y);
  let total = 0;
  for (let i = 0; i + 1 < at.length; i += 2) total += at[i + 1]! - at[i]!;
  return total;
}
