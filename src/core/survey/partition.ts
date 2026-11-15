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
import { area, distance, selfIntersections, signedArea, type Point } from "./geometry";
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
  /** Its least depth: square lines, the shorter of its two sides running back from the leg; parallel lines, the distance between its two dividing lines. */
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
  if (selfIntersections(ring).length > 0) return fail("The lot's boundary crosses itself, so it can't be divided. Check the order of its corners.");

  const a = ring[req.leg]!;
  const b = ring[(req.leg + 1) % ring.length]!;
  const len = distance(a, b);
  if (len === 0) return fail("That leg has no length.");
  const u: Point = { e: (b.e - a.e) / len, n: (b.n - a.n) / len };
  // Square to the leg, pointing into the lot (left of the leg on an anticlockwise ring, right on a clockwise one).
  const across: Point = signedArea(ring) > 0 ? { e: -u.n, n: u.e } : { e: u.n, n: -u.e };
  // n: the direction the shares follow one another in.
  const n: Point = req.lines === "parallel" ? across : req.from === "start" ? u : { e: -u.e, n: -u.n };
  if (req.lines === "parallel" && Math.min(...ring.map((p) => dot(p, across))) < dot(a, across) - 0.001) {
    return fail("The lot reaches behind that leg's line, so the shares can't be stacked from it. Choose another leg, or lines square to it.");
  }

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
  // The lines run square to n, and are read from the leg into the lot (or along the leg from its first corner).
  const lineDir = req.lines === "parallel" ? u : across;
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
        let e = p.e + t * (q.e - p.e);
        let nn = p.n + t * (q.n - p.n);
        const fromP = Math.hypot(e - p.e, nn - p.n);
        const legLen = distance(p, q);
        // Within a millimetre of a surveyed corner, the line ends at that corner: nothing new to set out there.
        const at = fromP <= 0.001 ? p : legLen - fromP <= 0.001 ? q : null;
        if (at) [e, nn] = [at.e, at.n];
        if (at && here.some((h) => h.existing === at.src)) continue;
        here.push({ name: "", e: e + o.e, n: nn + o.n, cut: ci, along: e * lineDir.e + nn * lineDir.n, ...(at ? { existing: at.src! } : {}), from: p.src!, to: q.src!, distanceM: at === p ? 0 : at === q ? legLen : fromP });
      }
    }
    // Named along the line, so P1 and P2 are the two ends of the first line; an end on a surveyed corner keeps its number.
    here.sort((x, y) => x.along - y.along);
    for (const c of here) {
      if (c.existing) c.name = c.existing.pointId;
      else c.name = `P${corners.filter((k) => !k.existing).length + here.filter((h) => !h.existing && here.indexOf(h) <= here.indexOf(c)).length}`;
    }
    corners.push(...here);
    cutCorners.push(here);
    cutProblem.push(here.length === 2 ? null : `A dividing line crosses the lot's boundary ${here.length} times, so a share would fall in pieces. Try lines the other way, or another leg.`);
  }

  const legLo = Math.min(dot(a, n), dot(b, n));
  const legHi = Math.max(dot(a, n), dot(b, n));
  const bounds = [lo, ...cuts, hi];
  const shares: Share[] = targets.map((target, i) => {
    const piece = dedupe(clip(clip(ring, n, bounds[i + 1]!, false), n, bounds[i]!, true));
    const areaM2 = area(piece);
    const s0 = bounds[i]!;
    const s1 = bounds[i + 1]!;
    // Along the leg: for square lines, the part of the leg inside this share's slab; for parallel lines, the whole leg if it lies in it.
    const alongLegM = legHi - legLo < 1e-9 ? (legLo >= s0 - 1e-9 && legLo <= s1 + 1e-9 ? len : 0) : Math.max(0, Math.min(s1, legHi) - Math.max(s0, legLo));
    // Square lines: the share's sides running back from the leg are its dividing lines (or the lot's ends); its depth is the shorter one, so a tapering share can't pass on its deepest point.
    const depthM = req.lines === "square" ? Math.min(chord(ring, n, Math.min(s0 + 0.001, s1)), chord(ring, n, Math.max(s1 - 0.001, s0))) : s1 - s0;
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
      return { name: pc?.name ?? "?", e: p.e + o.e, n: p.n + o.n, proposed: !pc?.existing };
    };
    return { targetM2: target, areaM2, corners: piece.map(named), alongLegM, depthM, problems };
  });
  const sumM2 = shares.reduce((s, x) => s + x.areaM2, 0);
  const bearing = bearingFromDeltas(lineDir.e, lineDir.n)!;
  return { ok: true, feasible: shares.every((s) => s.problems.length === 0), lotM2, shares, corners, bearing: bearing >= 180 ? bearing - 180 : bearing, sumM2, residualM2: lotM2 - sumM2, engine: PARTITION_ENGINE };
}

/** Consecutive points within a millimetre of each other as one (keeping a surveyed corner over a computed point). */
function dedupe(piece: Local[]): Local[] {
  const out: Local[] = [];
  for (const p of piece) {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.e - p.e, last.n - p.n) <= 0.001) {
      if (!last.src && p.src) out[out.length - 1] = p;
      continue;
    }
    out.push(p);
  }
  if (out.length > 1 && Math.hypot(out[0]!.e - out[out.length - 1]!.e, out[0]!.n - out[out.length - 1]!.n) <= 0.001) {
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
