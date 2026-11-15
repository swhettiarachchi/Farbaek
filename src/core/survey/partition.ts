/**
 * Partitioning a lot into shares (stage 193): where the dividing lines of a
 * sub division fall, computed by tested code, never by AI. The surveyor
 * chooses the lot, a leg the lines run parallel or square to, which end the
 * first share starts from, and the shares (stated areas, one of which may take
 * what's left). The engine finds each dividing line by bisection and reports:
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
import { area, distance, type Point } from "./geometry";
import type { SurveyPoint } from "./parcel";

export const PARTITION_ENGINE = "partition/1.0.0";

/** UDA regulations 9(a) and 14(1), for UDA-declared areas, unless a Development Plan says otherwise (docs/survey/STANDARDS_RESEARCH.md). */
export const UDA_MINIMUMS = { areaM2: 150, frontageM: 6, depthM: 12 } as const;

export interface PartitionRequest {
  /** The lot's corners in order. */
  ring: readonly SurveyPoint[];
  /** The leg the dividing lines refer to: leg i runs from corner i to corner i + 1. */
  leg: number;
  /** Lines parallel to that leg (shares one behind another, away from it), or square to it (shares side by side along it). */
  lines: "parallel" | "square";
  /** For square lines: the first share starts at the leg's first corner, or its second. */
  from: "start" | "end";
  /** Each share's area in m², in order. One share may be null: it takes what's left. */
  shares: (number | null)[];
  /** Check the UDA minimums. */
  uda: boolean;
}

export interface ProposedCorner {
  /** "P1", "P2"…: proposed, not a survey point. */
  name: string;
  e: number;
  n: number;
  /** Which dividing line it's on (0 for the first), and its position along that line. */
  cut: number;
  along: number;
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
  /** Its depth: square lines, how far it runs back from the leg; parallel lines, the distance between its two dividing lines. */
  depthM: number;
  /** What stops it being made as asked, and the UDA minimums it doesn't meet. */
  problems: string[];
}

export type PartitionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** True when every share can be made as asked (and meets the UDA minimums, when checked). */
      feasible: boolean;
      lotM2: number;
      shares: Share[];
      corners: ProposedCorner[];
      /** The dividing lines' bearing, whole-circle from grid north, 0 to 180. */
      bearing: number;
      sumM2: number;
      residualM2: number;
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

export function partitionLot(req: PartitionRequest): PartitionResult {
  const fail = (error: string): PartitionResult => ({ ok: false, error });
  if (req.ring.length < 3) return fail("The lot needs at least three corners.");
  if (!Number.isInteger(req.leg) || req.leg < 0 || req.leg >= req.ring.length) return fail("Choose a leg of the lot.");
  if (req.shares.length < 2 || req.shares.length > 50) return fail("Divide the lot into 2 to 50 shares.");
  if (req.shares.filter((x) => x === null).length > 1) return fail("Only one share can take what's left.");
  if (req.shares.some((x) => x !== null && !(Number.isFinite(x) && x > 0))) return fail("Every stated share needs an area above zero.");

  // Work in metres from the first corner, so grid-sized coordinates keep their precision.
  const o = req.ring[0]!;
  const ring: Local[] = req.ring.map((p) => ({ e: p.e - o.e, n: p.n - o.n, src: p }));
  const lotM2 = area(ring);
  if (!(lotM2 > 0)) return fail("The lot has no area.");

  const a = ring[req.leg]!;
  const b = ring[(req.leg + 1) % ring.length]!;
  const len = distance(a, b);
  if (len === 0) return fail("That leg has no length.");
  const u: Point = { e: (b.e - a.e) / len, n: (b.n - a.n) / len };
  const across: Point = { e: -u.n, n: u.e };
  // n: the direction the shares follow one another in.
  let n: Point;
  if (req.lines === "parallel") {
    const centre = ring.reduce((s, p) => s + dot(p, across), 0) / ring.length;
    n = centre >= dot(a, across) ? across : { e: -across.e, n: -across.n };
  } else n = req.from === "start" ? u : { e: -u.e, n: -u.n };

  const stated = req.shares.reduce<number>((s, x) => s + (x ?? 0), 0);
  const rest = req.shares.some((x) => x === null);
  if (stated > lotM2 + 0.005) return fail(`The stated shares come to ${stated.toFixed(2)} m², more than the lot's ${lotM2.toFixed(2)} m².`);
  if (!rest && Math.abs(stated - lotM2) > 0.01) return fail(`The shares come to ${stated.toFixed(2)} m², not the lot's ${lotM2.toFixed(2)} m². Let one share take what's left.`);
  if (rest && lotM2 - stated < 0.01) return fail("The stated shares take the whole lot, so nothing is left for the last share.");
  const targets = req.shares.map((x) => x ?? lotM2 - stated);

  const proj = ring.map((p) => dot(p, n));
  const lo = Math.min(...proj);
  const hi = Math.max(...proj);
  const below = (s: number) => area(clip(ring, n, s, false));
  // Each dividing line by bisection on its offset: the area below it grows steadily from 0 to the whole lot.
  const cuts: number[] = [];
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

  // Where each line meets the boundary: the proposed corners.
  const corners: ProposedCorner[] = [];
  const cutCorners: ProposedCorner[][] = [];
  const cutProblem: (string | null)[] = [];
  for (const [ci, s] of cuts.entries()) {
    const here: ProposedCorner[] = [];
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[(i + 1) % ring.length]!;
      const dp = dot(p, n) - s;
      const dq = dot(q, n) - s;
      if (dp < 0 !== dq < 0 && dp !== dq) {
        const t = dp / (dp - dq);
        const e = p.e + t * (q.e - p.e);
        const nn = p.n + t * (q.n - p.n);
        here.push({ name: "", e: e + o.e, n: nn + o.n, cut: ci, along: e * lineDirOf(req, u, across).e + nn * lineDirOf(req, u, across).n, from: p.src!, to: q.src!, distanceM: Math.hypot(e - p.e, nn - p.n) });
      }
    }
    // Named along the line, so P1 and P2 are the two ends of the first line.
    here.sort((x, y) => x.along - y.along);
    for (const c of here) c.name = `P${corners.length + here.indexOf(c) + 1}`;
    corners.push(...here);
    cutCorners.push(here);
    cutProblem.push(here.length === 2 ? null : `A dividing line crosses the lot's boundary ${here.length} times, so a share would fall in pieces. Try lines the other way, or another leg.`);
  }

  const legLo = Math.min(dot(a, n), dot(b, n));
  const legHi = Math.max(dot(a, n), dot(b, n));
  const bounds = [lo, ...cuts, hi];
  const shares: Share[] = targets.map((target, i) => {
    const piece = clip(clip(ring, n, bounds[i + 1]!, false), n, bounds[i]!, true);
    const areaM2 = area(piece);
    const s0 = bounds[i]!;
    const s1 = bounds[i + 1]!;
    // Along the leg: for square lines, the part of the leg inside this share's slab; for parallel lines, the whole leg if it lies in it.
    const alongLegM = legHi - legLo < 1e-9 ? (legLo >= s0 - 1e-9 && legLo <= s1 + 1e-9 ? len : 0) : Math.max(0, Math.min(s1, legHi) - Math.max(s0, legLo));
    const depthM = req.lines === "square" ? span(piece, across) : s1 - s0;
    const problems = [cutProblem[i - 1], cutProblem[i]].filter((x): x is string => Boolean(x));
    if (req.uda) {
      if (areaM2 < UDA_MINIMUMS.areaM2) problems.push(`It's ${areaM2.toFixed(2)} m², under the UDA minimum of ${UDA_MINIMUMS.areaM2} m².`);
      if (alongLegM === 0) problems.push("It doesn't touch the chosen leg, so it has no frontage on it.");
      else if (alongLegM < UDA_MINIMUMS.frontageM) problems.push(`Its frontage is ${alongLegM.toFixed(2)} m, under the UDA minimum of 6.0 m.`);
      if (depthM < UDA_MINIMUMS.depthM) problems.push(`Its depth is ${depthM.toFixed(2)} m, under the UDA minimum of 12.0 m.`);
    }
    const named = (p: Local): ShareCorner => {
      if (p.src) return { name: p.src.pointId, e: p.src.e, n: p.src.n, proposed: false };
      const pc = [...(cutCorners[i - 1] ?? []), ...(cutCorners[i] ?? [])].reduce<ProposedCorner | null>((best, c) => (!best || Math.hypot(c.e - o.e - p.e, c.n - o.n - p.n) < Math.hypot(best.e - o.e - p.e, best.n - o.n - p.n) ? c : best), null);
      return { name: pc?.name ?? "?", e: p.e + o.e, n: p.n + o.n, proposed: true };
    };
    return { targetM2: target, areaM2, corners: piece.map(named), alongLegM, depthM, problems };
  });
  const sumM2 = shares.reduce((s, x) => s + x.areaM2, 0);
  const lineDir = req.lines === "parallel" ? u : across;
  const bearing = bearingFromDeltas(lineDir.e, lineDir.n)!;
  return { ok: true, feasible: shares.every((s) => s.problems.length === 0), lotM2, shares, corners, bearing: bearing >= 180 ? bearing - 180 : bearing, sumM2, residualM2: lotM2 - sumM2, engine: PARTITION_ENGINE };
}

/** The direction the dividing lines run in. */
const lineDirOf = (req: PartitionRequest, u: Point, across: Point) => (req.lines === "parallel" ? u : across);

/** How far a piece reaches along a direction. */
function span(piece: readonly Point[], dir: Point): number {
  const p = piece.map((x) => dot(x, dir));
  return p.length ? Math.max(...p) - Math.min(...p) : 0;
}
