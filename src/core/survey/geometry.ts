/**
 * Planar geometry on projected grid coordinates (survey skill, rules 3 and 5).
 * Coordinates are metres in the project's confirmed projected CRS (or a local
 * grid). Nothing here works on longitude and latitude: degrees are not metres.
 *
 * Large grid coordinates (about 500,000 m in SLD99) are translated to a local
 * origin before products are taken, so the shoelace sum keeps millimetre
 * accuracy instead of losing digits to values near 10^11.
 */

export interface Point {
  /** Easting, metres. */
  e: number;
  /** Northing, metres. */
  n: number;
}

export function distance(a: Point, b: Point): number {
  return Math.hypot(b.e - a.e, b.n - a.n);
}

/** A ring's vertices without a repeated closing vertex: [A, B, C, D], closing D→A implicitly. */
export type Ring = readonly Point[];

/** Drops a final vertex equal to the first, so callers can pass either form. */
export function openRing(ring: Ring): Ring {
  if (ring.length > 1) {
    const a = ring[0]!;
    const z = ring[ring.length - 1]!;
    if (a.e === z.e && a.n === z.n) return ring.slice(0, -1);
  }
  return ring;
}

/**
 * The signed area by the coordinate (shoelace) method, on coordinates moved
 * to the first vertex. Positive when the ring runs anticlockwise with E as x
 * and N as y; negative when clockwise.
 */
export function signedArea(ring: Ring): number {
  const r = openRing(ring);
  if (r.length < 3) return 0;
  const o = r[0]!;
  let twice = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i]!;
    const b = r[(i + 1) % r.length]!;
    twice += (a.e - o.e) * (b.n - o.n) - (b.e - o.e) * (a.n - o.n);
  }
  return twice / 2;
}

/** The enclosed area in m², whichever way the ring runs. Valid only for a simple (non-self-intersecting) ring. */
export function area(ring: Ring): number {
  return Math.abs(signedArea(ring));
}

export function isClockwise(ring: Ring): boolean {
  return signedArea(ring) < 0;
}

/** The length round a closed ring, closing leg included. */
export function perimeter(ring: Ring): number {
  const r = openRing(ring);
  let sum = 0;
  for (let i = 0; i < r.length; i++) sum += distance(r[i]!, r[(i + 1) % r.length]!);
  return sum;
}

export interface Bounds {
  minE: number;
  minN: number;
  maxE: number;
  maxN: number;
}

export function bounds(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
  for (const p of points) {
    if (p.e < minE) minE = p.e;
    if (p.e > maxE) maxE = p.e;
    if (p.n < minN) minN = p.n;
    if (p.n > maxN) maxN = p.n;
  }
  return { minE, minN, maxE, maxN };
}

/** The area-weighted centroid of a simple ring, for placing its label. Falls back to the vertex mean for degenerate rings. */
export function centroid(ring: Ring): Point {
  const r = openRing(ring);
  const o = r[0] ?? { e: 0, n: 0 };
  let a2 = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length; i++) {
    const p = r[i]!, q = r[(i + 1) % r.length]!;
    const x0 = p.e - o.e, y0 = p.n - o.n, x1 = q.e - o.e, y1 = q.n - o.n;
    const cross = x0 * y1 - x1 * y0;
    a2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (Math.abs(a2) < 1e-12) {
    const mean = r.reduce((s, p) => ({ e: s.e + p.e, n: s.n + p.n }), { e: 0, n: 0 });
    return r.length ? { e: mean.e / r.length, n: mean.n / r.length } : o;
  }
  return { e: o.e + cx / (3 * a2), n: o.n + cy / (3 * a2) };
}

/** Which side of line a→b point c lies: positive left, negative right, zero on the line (within tolerance, in m²). */
export function orient(a: Point, b: Point, c: Point): number {
  return (b.e - a.e) * (c.n - a.n) - (b.n - a.n) * (c.e - a.e);
}

/** The shortest distance from point p to segment ab, in metres. */
export function pointSegmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.e - a.e;
  const dy = b.n - a.n;
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.e - a.e) * dx + (p.n - a.n) * dy) / l2));
  return Math.hypot(p.e - a.e - t * dx, p.n - a.n - t * dy);
}

/**
 * The shortest distance between segments ab and cd, in metres: zero when
 * they cross. Working in distances rather than orientation products keeps
 * the tolerance meaningful at grid-sized coordinates (eastings near 500 km),
 * where a product's rounding noise grows with the legs' lengths.
 */
export function segmentDistance(a: Point, b: Point, c: Point, d: Point): number {
  const o1 = orient(a, b, c), o2 = orient(a, b, d), o3 = orient(c, d, a), o4 = orient(c, d, b);
  if (((o1 > 0 && o2 < 0) || (o1 < 0 && o2 > 0)) && ((o3 > 0 && o4 < 0) || (o3 < 0 && o4 > 0))) return 0;
  return Math.min(pointSegmentDistance(c, a, b), pointSegmentDistance(d, a, b), pointSegmentDistance(a, c, d), pointSegmentDistance(b, c, d));
}

/** The distance under which two legs count as touching: half a millimetre, as for zero-length legs. */
export const TOUCH_TOLERANCE_M = 0.0005;

/** Whether segments ab and cd cross or come within `tolerance` metres of each other. */
export function segmentsIntersect(a: Point, b: Point, c: Point, d: Point, tolerance = TOUCH_TOLERANCE_M): boolean {
  return segmentDistance(a, b, c, d) <= tolerance;
}

/**
 * Pairs of legs (by index of their first vertex) that cross or touch. Legs
 * that aren't neighbours must stay apart everywhere; neighbours share their
 * joint, so they only count when one folds back along the other.
 */
export function selfIntersections(ring: Ring): [number, number][] {
  const r = openRing(ring);
  const n = r.length;
  const found: [number, number][] = [];
  if (n < 3) return found;
  const tol = TOUCH_TOLERANCE_M;
  for (let i = 0; i < n; i++) {
    const a = r[i]!, b = r[(i + 1) % n]!, c = r[(i + 2) % n]!;
    // A spike: the next leg runs back over this one (zero-length legs are reported on their own).
    if (distance(a, b) > tol && distance(b, c) > tol && (pointSegmentDistance(c, a, b) <= tol || pointSegmentDistance(a, b, c) <= tol)) found.push(i + 1 < n ? [i, (i + 1) % n] : [(i + 1) % n, i]);
    if (n < 4) continue;
    for (let j = i + 2; j < n; j++) {
      // The first and last legs are neighbours too.
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(r[i]!, r[(i + 1) % n]!, r[j]!, r[(j + 1) % n]!)) found.push([i, j]);
    }
  }
  return found;
}

/** Indexes of vertices that repeat the vertex before them (within the tolerance, metres): a zero-length leg. */
export function zeroLengthLegs(ring: Ring, tolerance = 0.0005): number[] {
  const r = openRing(ring);
  const found: number[] = [];
  for (let i = 0; i < r.length; i++) if (distance(r[i]!, r[(i + 1) % r.length]!) <= tolerance) found.push(i);
  return found;
}

/** The interior angle at each vertex of a simple ring, in degrees. */
export function interiorAngles(ring: Ring): number[] {
  const r = openRing(ring);
  const n = r.length;
  if (n < 3) return [];
  const ccw = signedArea(r) > 0;
  return r.map((p, i) => {
    const prev = r[(i - 1 + n) % n]!;
    const next = r[(i + 1) % n]!;
    const a1 = Math.atan2(prev.n - p.n, prev.e - p.e);
    const a2 = Math.atan2(next.n - p.n, next.e - p.e);
    let turn = ((a1 - a2) * 180) / Math.PI;
    turn = ((turn % 360) + 360) % 360;
    return ccw ? turn : 360 - turn;
  });
}
