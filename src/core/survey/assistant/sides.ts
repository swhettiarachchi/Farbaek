/**
 * Which leg of a lot faces north, east, south or west (stage 195), so "the
 * eastern boundary" names a leg by geometry, worked out by code, never by the
 * model. A leg faces the way its outward normal points (grid north is up).
 * When two legs face a side about equally, both are offered to the surveyor.
 */
import { signedArea, type Point } from "../geometry";

export type Side = "north" | "east" | "south" | "west";

const DIRECTION: Record<Side, [number, number]> = { north: [0, 1], east: [1, 0], south: [0, -1], west: [-1, 0] };

export type LegFacing = { leg: number } | { candidates: number[] } | null;

/**
 * The leg (index i runs from corner i to corner i + 1) whose outward side faces `side` most squarely, weighting by length so a short
 * jog doesn't win over the long boundary beside it. Within 15% of the best, legs are candidates for the surveyor to choose.
 */
export function legFacing(ring: readonly Point[], side: Side): LegFacing {
  if (ring.length < 3) return null;
  const ccw = signedArea(ring as Point[]) > 0;
  const [dx, dy] = DIRECTION[side];
  const scores = ring.map((a, i) => {
    const b = ring[(i + 1) % ring.length]!;
    const [ex, ey] = [b.e - a.e, b.n - a.n];
    const len = Math.hypot(ex, ey);
    if (len === 0) return 0;
    // The outward normal: right of the direction of travel for an anticlockwise ring, left for a clockwise one.
    const [nx, ny] = ccw ? [ey / len, -ex / len] : [-ey / len, ex / len];
    const facing = nx * dx + ny * dy;
    // Only legs that face the side at least half-squarely (within 60°) count.
    return facing >= 0.5 ? facing * len : 0;
  });
  const best = Math.max(...scores);
  if (!(best > 0)) return null;
  const near = scores.map((s, i) => [s, i] as const).filter(([s]) => s >= best * 0.85).map(([, i]) => i);
  return near.length === 1 ? { leg: near[0]! } : { candidates: near };
}
