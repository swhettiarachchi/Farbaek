/**
 * Roads from their two surveyed edges (ADR 0203). The width written on the
 * plan is computed here, never typed: the shortest and longest distance
 * across, measured from each edge's corners square to the other edge, only
 * where the other edge runs alongside (so a longer edge's overhang doesn't
 * count as width).
 */
import type { Point } from "./geometry";

export interface RoadWidth {
  minM: number;
  maxM: number;
  /** How many measurements the range comes from. */
  samples: number;
}

/** The foot of the perpendicular from p onto polyline q, when it falls within a segment (not beyond its ends). */
function squareDistance(p: Point, q: readonly Point[]): number | null {
  let best: number | null = null;
  for (let i = 0; i + 1 < q.length; i++) {
    const a = q[i]!;
    const b = q[i + 1]!;
    const dx = b.e - a.e;
    const dy = b.n - a.n;
    const l2 = dx * dx + dy * dy;
    if (l2 === 0) continue;
    const t = ((p.e - a.e) * dx + (p.n - a.n) * dy) / l2;
    if (t < 0 || t > 1) continue;
    const d = Math.hypot(p.e - a.e - t * dx, p.n - a.n - t * dy);
    if (best === null || d < best) best = d;
  }
  return best;
}

/** The road's width range, or null when the edges don't run alongside each other anywhere. */
export function roadWidth(edgeA: readonly Point[], edgeB: readonly Point[]): RoadWidth | null {
  if (edgeA.length < 2 || edgeB.length < 2) return null;
  const ds = [...edgeA.map((p) => squareDistance(p, edgeB)), ...edgeB.map((p) => squareDistance(p, edgeA))].filter((d): d is number => d !== null && d > 0);
  if (ds.length === 0) return null;
  return { minM: Math.min(...ds), maxM: Math.max(...ds), samples: ds.length };
}

/** The line midway between the edges, from the corners of the longer edge to their foot on the other: where the road's name is written. */
export function roadCentreline(edgeA: readonly Point[], edgeB: readonly Point[]): Point[] {
  if (edgeB.length < 2) return [...edgeA];
  const [main, other] = edgeA.length >= edgeB.length ? [edgeA, edgeB] : [edgeB, edgeA];
  const foot = (p: Point): Point | null => {
    let best: { d: number; f: Point } | null = null;
    for (let i = 0; i + 1 < other.length; i++) {
      const a = other[i]!;
      const b = other[i + 1]!;
      const dx = b.e - a.e;
      const dy = b.n - a.n;
      const l2 = dx * dx + dy * dy;
      if (l2 === 0) continue;
      const t = Math.max(0, Math.min(1, ((p.e - a.e) * dx + (p.n - a.n) * dy) / l2));
      const f = { e: a.e + t * dx, n: a.n + t * dy };
      const d = Math.hypot(p.e - f.e, p.n - f.n);
      if (!best || d < best.d) best = { d, f };
    }
    return best?.f ?? null;
  };
  return main.map((p) => {
    const f = foot(p);
    return f ? { e: (p.e + f.e) / 2, n: (p.n + f.n) / 2 } : p;
  });
}
