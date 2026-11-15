/**
 * Several lots on one plan (ADR 0203): each lot's parcel, how the lots fit
 * together, and the entire land they make. Lots are surveyed partitions:
 * their corners are surveyed points, shared between neighbouring lots, so the
 * topology is read from point ids and, where one lot's corner sits on
 * another's leg (a T-junction), from that leg within half a millimetre.
 * Nothing is moved or repaired: problems are reported for the surveyor.
 */
import { area, distance, orient, pointSegmentDistance, TOUCH_TOLERANCE_M, type Point } from "./geometry";
import type { Lot } from "./document";
import { computeParcel, type ParcelResult, type SurveyPoint } from "./parcel";

export interface LotResult {
  lot: Lot;
  /** The parcel, or the point ids that are missing from the project. */
  parcel: ParcelResult | null;
  missing: string[];
}

export interface PlanLots {
  lots: LotResult[];
  /** The entire land's outline, as points in order, when the lots join into one piece without holes. */
  outline: SurveyPoint[] | null;
  /** The sum of the lots' areas, m². */
  sumAreaM2: number;
  /** The outline's own area, m², when there is one outline. */
  outlineAreaM2: number | null;
  /** Pairs of lots (by index) that overlap. */
  overlaps: [number, number][];
  /** How many separate pieces the lots form, and how many holes lie between them. */
  pieces: number;
  holes: number;
  /** Distinct corner points closer than NEAR_DUPLICATE_M: likely one mark shot twice under two numbers. */
  nearDuplicates: { a: SurveyPoint; b: SurveyPoint; distanceM: number }[];
  /** Corners lying close to another lot's leg without being on it (between half a millimetre and NEAR_LEG_M): a T-junction that doesn't quite meet. */
  nearLegs: { corner: SurveyPoint; lot: Lot; from: SurveyPoint; to: SurveyPoint; distanceM: number }[];
}

/** A corner this close to another lot's leg, without touching it, is reported (5 cm). */
export const NEAR_LEG_M = 0.05;

/** The key a surveyor's "keep as surveyed" answer is stored under, the same whichever way round the points are. */
export const nearKey = {
  duplicate: (a: string, b: string) => `dup:${[a, b].sort().join("|")}`,
  leg: (corner: string, from: string, to: string) => `leg:${corner}:${[from, to].sort().join("|")}`,
};

/** Two different corner numbers of different lots closer than this are reported as possibly one mark (5 cm). */
export const NEAR_DUPLICATE_M = 0.05;

type Edge = { a: SurveyPoint; b: SurveyPoint };

const key = (a: SurveyPoint, b: SurveyPoint) => (a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`);

/** A ring's legs, with any other lot corner lying on a leg inserted into it, so shared legs split the same way on both sides. */
function refinedEdges(ring: SurveyPoint[], corners: SurveyPoint[]): Edge[] {
  const out: Edge[] = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    const len = distance(a, b);
    const on = corners
      .filter((c) => c.id !== a.id && c.id !== b.id && pointSegmentDistance(c, a, b) <= TOUCH_TOLERANCE_M)
      .map((c) => ({ c, t: ((c.e - a.e) * (b.e - a.e) + (c.n - a.n) * (b.n - a.n)) / (len * len || 1) }))
      .filter((x) => x.t > 0 && x.t < 1)
      .sort((x, y) => x.t - y.t);
    let from = a;
    for (const { c } of on) {
      out.push({ a: from, b: c });
      from = c;
    }
    out.push({ a: from, b });
  }
  return out;
}

/** Ray-casting point-in-polygon, strictly inside (points within half a millimetre of an edge count as on it, not inside). */
function strictlyInside(p: Point, ring: readonly Point[]): boolean {
  for (let i = 0; i < ring.length; i++) if (pointSegmentDistance(p, ring[i]!, ring[(i + 1) % ring.length]!) <= TOUCH_TOLERANCE_M) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.n > p.n !== b.n > p.n && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) inside = !inside;
  }
  return inside;
}

/**
 * A point strictly inside a simple ring: the middle of the widest span a
 * horizontal line cuts through it, tried at several heights. Null for a ring
 * with no inside (all on one line).
 */
export function interiorPoint(ring: readonly Point[]): Point | null {
  const ns = ring.map((p) => p.n);
  const lo = Math.min(...ns);
  const hi = Math.max(...ns);
  let best: { p: Point; w: number } | null = null;
  for (const f of [0.5, 0.37, 0.63, 0.25, 0.75, 0.13, 0.87, 0.06, 0.94]) {
    const y = lo + (hi - lo) * f;
    const xs: number[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const b = ring[(i + 1) % ring.length]!;
      if (a.n > y !== b.n > y) xs.push(a.e + ((y - a.n) * (b.e - a.e)) / (b.n - a.n));
    }
    xs.sort((u, v) => u - v);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const w = xs[i + 1]! - xs[i]!;
      if (w > 2 * TOUCH_TOLERANCE_M && (!best || w > best.w)) best = { p: { e: (xs[i]! + xs[i + 1]!) / 2, n: y }, w };
    }
  }
  return best ? best.p : null;
}

/** Whether two rings overlap in area: a leg of one crosses a leg of the other, a corner or leg midpoint of one lies inside the other, or a point inside one lies inside the other (which catches a lot entered twice). Shared legs and corners don't count. */
function ringsOverlap(r1: readonly Point[], r2: readonly Point[]): boolean {
  for (let i = 0; i < r1.length; i++) {
    const a = r1[i]!;
    const b = r1[(i + 1) % r1.length]!;
    for (let j = 0; j < r2.length; j++) {
      const c = r2[j]!;
      const d = r2[(j + 1) % r2.length]!;
      // A proper crossing: each segment's ends strictly on opposite sides of the other.
      const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
      const tol = (s: Point, t: Point) => TOUCH_TOLERANCE_M * distance(s, t);
      const side = (o: number, s: Point, t: Point) => (Math.abs(o) <= tol(s, t) ? 0 : Math.sign(o));
      if (side(o1, a, b) * side(o2, a, b) < 0 && side(o3, c, d) * side(o4, c, d) < 0) return true;
    }
  }
  // Midpoints of legs and corners, so a lot lying wholly inside another is caught too.
  const probes = (r: readonly Point[]) => r.flatMap((p, i) => [p, { e: (p.e + r[(i + 1) % r.length]!.e) / 2, n: (p.n + r[(i + 1) % r.length]!.n) / 2 }]);
  if (probes(r1).some((p) => strictlyInside(p, r2)) || probes(r2).some((p) => strictlyInside(p, r1))) return true;
  const i1 = interiorPoint(r1);
  const i2 = interiorPoint(r2);
  return (i1 !== null && strictlyInside(i1, r2)) || (i2 !== null && strictlyInside(i2, r1));
}

/** Splits a ring that passes through one corner twice (a figure of eight, where a gap pinches the outline at a corner) into simple rings. */
function splitAtRepeats(ring: SurveyPoint[]): SurveyPoint[][] {
  const out: SurveyPoint[][] = [];
  const stack: SurveyPoint[] = [];
  for (const p of ring) {
    const k = stack.findIndex((q) => q.id === p.id);
    if (k >= 0) {
      const loop = stack.splice(k);
      if (loop.length >= 3) out.push(loop);
    }
    stack.push(p);
  }
  if (stack.length >= 3) out.push(stack);
  return out;
}

/** Joins edges used once into closed rings. */
function chain(edges: Edge[]): SurveyPoint[][] {
  const left = [...edges];
  const rings: SurveyPoint[][] = [];
  while (left.length > 0) {
    const first = left.shift()!;
    const ring = [first.a, first.b];
    for (let guard = 0; guard < edges.length && ring[ring.length - 1]!.id !== ring[0]!.id; guard++) {
      const tail = ring[ring.length - 1]!;
      const i = left.findIndex((e) => e.a.id === tail.id || e.b.id === tail.id);
      if (i < 0) break;
      const e = left.splice(i, 1)[0]!;
      ring.push(e.a.id === tail.id ? e.b : e.a);
    }
    if (ring[ring.length - 1]!.id === ring[0]!.id) ring.pop();
    rings.push(...splitAtRepeats(ring));
  }
  return rings;
}

export function computeLots(points: readonly SurveyPoint[], lots: readonly Lot[]): PlanLots {
  const results: LotResult[] = lots.map((lot) => {
    if (lot.points.length === 0) return { lot, parcel: null, missing: [] };
    const r = computeParcel(points, lot.points);
    return r.ok ? { lot, parcel: r.parcel, missing: [] } : { lot, parcel: null, missing: r.missing };
  });
  const usable = results.map((r, i) => ({ r, i })).filter((x): x is { r: LotResult & { parcel: ParcelResult }; i: number } => x.r.parcel !== null && x.r.parcel.vertices.length >= 3 && x.r.parcel.crossings.length === 0);
  const sumAreaM2 = usable.reduce((s, x) => s + x.r.parcel.areaM2, 0);

  const overlaps: [number, number][] = [];
  for (let a = 0; a < usable.length; a++) {
    for (let b = a + 1; b < usable.length; b++) {
      if (ringsOverlap(usable[a]!.r.parcel.vertices, usable[b]!.r.parcel.vertices)) overlaps.push([usable[a]!.i, usable[b]!.i]);
    }
  }

  // Two different numbers a few centimetres apart, used as corners of different lots: perhaps one mark observed twice.
  // All of them, found through a grid of 5 cm cells so a large plan stays quick.
  const lotsOf = new Map<string, Set<string>>();
  for (const x of usable) for (const v of x.r.parcel.vertices) (lotsOf.get(v.id) ?? lotsOf.set(v.id, new Set()).get(v.id)!).add(x.r.lot.id);
  const cornerList = [...new Map(usable.flatMap((x) => x.r.parcel.vertices).map((p) => [p.id, p])).values()];
  const cell = (v: number) => Math.floor(v / NEAR_DUPLICATE_M);
  const grid = new Map<string, SurveyPoint[]>();
  for (const p of cornerList) (grid.get(`${cell(p.e)}|${cell(p.n)}`) ?? grid.set(`${cell(p.e)}|${cell(p.n)}`, []).get(`${cell(p.e)}|${cell(p.n)}`)!).push(p);
  const nearDuplicates: PlanLots["nearDuplicates"] = [];
  for (const p of cornerList) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of grid.get(`${cell(p.e) + dx}|${cell(p.n) + dy}`) ?? []) {
          if (q.id <= p.id) continue;
          const d = distance(p, q);
          const shareALot = [...lotsOf.get(p.id)!].some((l) => lotsOf.get(q.id)!.has(l));
          // Within 1 cm always (even on one lot); up to 5 cm only between different lots, where it leaves a sliver.
          if (d < NEAR_DUPLICATE_M && (d < 0.01 || !shareALot)) nearDuplicates.push({ a: p, b: q, distanceM: d });
        }
      }
    }
  }
  nearDuplicates.sort((x, y) => x.distanceM - y.distanceM);

  // Corners a few centimetres off another lot's leg: the lots nearly meet there, and leave a sliver or an overlap.
  const nearLegs: PlanLots["nearLegs"] = [];
  for (const x of usable) {
    for (const c of x.r.parcel.vertices) {
      for (const y of usable) {
        if (y === x) continue;
        const ring = y.r.parcel.vertices;
        for (let k = 0; k < ring.length; k++) {
          const a = ring[k]!;
          const b = ring[(k + 1) % ring.length]!;
          if (c.id === a.id || c.id === b.id) continue;
          const d = pointSegmentDistance(c, a, b);
          const len = distance(a, b);
          const t = len > 0 ? ((c.e - a.e) * (b.e - a.e) + (c.n - a.n) * (b.n - a.n)) / (len * len) : 0;
          // Near a leg's end it's a corner near a corner, reported above.
          if (d > TOUCH_TOLERANCE_M && d < NEAR_LEG_M && t > 0 && t < 1 && distance(c, a) >= NEAR_DUPLICATE_M && distance(c, b) >= NEAR_DUPLICATE_M) {
            // One finding per corner and leg, even when two lots share the leg.
            if (!nearLegs.some((n) => n.corner.id === c.id && ((n.from.id === a.id && n.to.id === b.id) || (n.from.id === b.id && n.to.id === a.id)))) nearLegs.push({ corner: c, lot: y.r.lot, from: a, to: b, distanceM: d });
          }
        }
      }
    }
  }

  if (usable.length === 0) return { lots: results, outline: null, sumAreaM2, outlineAreaM2: null, overlaps, pieces: 0, holes: 0, nearDuplicates, nearLegs };

  // Legs used by one lot form the outline; legs two lots share cancel out.
  const corners = usable.flatMap((x) => x.r.parcel.vertices);
  const count = new Map<string, { edge: Edge; n: number }>();
  for (const x of usable) {
    for (const e of refinedEdges(x.r.parcel.vertices, corners)) {
      const k = key(e.a, e.b);
      const c = count.get(k);
      if (c) c.n++;
      else count.set(k, { edge: e, n: 1 });
    }
  }
  const rings = chain([...count.values()].filter((c) => c.n === 1).map((c) => c.edge));
  // A ring inside another is a hole: land between the lots that no lot covers.
  const holes = rings.filter((r, i) => rings.some((o, j) => j !== i && area(o) > area(r) && r.every((p) => strictlyInside(p, o) || o.some((q) => q.id === p.id)))).length;
  const pieces = rings.length - holes;
  const single = rings.length === 1 ? rings[0]! : null;
  return { lots: results, outline: single, sumAreaM2, outlineAreaM2: single ? area(single) : null, overlaps, pieces, holes, nearDuplicates, nearLegs };
}
