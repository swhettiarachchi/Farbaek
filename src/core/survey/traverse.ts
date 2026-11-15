/**
 * Traverse computation (survey skill, rule 7): coordinates from a start point
 * and a run of observed legs, each a whole-circle bearing and a horizontal
 * distance. The misclosure is computed and reported, never adjusted away:
 * no Bowditch or transit adjustment runs here (that needs a surveyor's
 * authorisation and an explicitly chosen method, in a later stage).
 */
import { deltasFromBearing } from "./angles";
import type { Point } from "./geometry";

export interface TraverseLeg {
  /** Whole-circle bearing in degrees, clockwise from grid north. */
  bearing: number;
  /** Horizontal distance, metres. */
  distance: number;
}

export interface TraverseResult {
  /** The computed station coordinates: the start, then one per leg. Unadjusted. */
  points: Point[];
  /** Sum of the leg distances, metres. */
  length: number;
  /** For a closed traverse: where the last computed point falls short of the closing point. */
  misclosure: { dE: number; dN: number; linear: number; /** 1 : N, or null when the misclosure is zero. */ precision: number | null } | null;
}

/**
 * Runs the legs from the start. When `closeOn` is given (the known closing
 * point, often the start itself), the result carries the linear misclosure
 * and its precision ratio, length ÷ misclosure.
 */
export function computeTraverse(start: Point, legs: readonly TraverseLeg[], closeOn?: Point): TraverseResult {
  for (const [i, leg] of legs.entries()) {
    if (!Number.isFinite(leg.bearing) || !Number.isFinite(leg.distance) || leg.distance <= 0) {
      throw new RangeError(`Leg ${i + 1} needs a finite bearing and a positive distance.`);
    }
  }
  const points: Point[] = [start];
  let length = 0;
  let cur = start;
  for (const leg of legs) {
    const { dE, dN } = deltasFromBearing(leg.bearing, leg.distance);
    cur = { e: cur.e + dE, n: cur.n + dN };
    points.push(cur);
    length += leg.distance;
  }
  if (!closeOn) return { points, length, misclosure: null };
  const dE = cur.e - closeOn.e;
  const dN = cur.n - closeOn.n;
  const linear = Math.hypot(dE, dN);
  return { points, length, misclosure: { dE, dN, linear, precision: linear === 0 ? null : length / linear } };
}
