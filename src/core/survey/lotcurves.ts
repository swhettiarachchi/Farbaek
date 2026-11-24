/**
 * Curved lot boundaries (stage 269, ADR 0276). A run of a lot's corners, from the start of a curve (PC) through points on it to its
 * end (PT), is a circular curve when every one of them lies within 2 cm of the circle through the first, middle and last (arcs.ts, the
 * same test as a line's curve, ADR 0247). The lot's area is then the area inside the curve, not inside the straight legs between its
 * points: the shoelace over the corners, plus each segment between a leg and the arc. Nothing is moved: the corners stay as surveyed,
 * and a run that doesn't fit stays straight and is said.
 */
import { bearingFromDeltas } from "./angles";
import { bulges, densify, fitArc, type ArcRun, type Circle } from "./arcs";
import { signedArea, type Point } from "./geometry";

export interface LotCurve {
  /** The ring indexes of its first and last points; `to` may be the ring's length, meaning its first point again. */
  from: number;
  to: number;
  circle: Circle;
  /** The angle turned along it, radians, positive anticlockwise. */
  sweep: number;
  radius: number;
  /** Its length along the arc, metres. */
  arcLength: number;
  /** From its first point to its last, in a straight line: the chord's bearing (degrees) and length (metres). */
  chordBearing: number | null;
  chordDistance: number;
  /** Each leg of the ring the curve spans (by the leg's index), and the area between that leg and the arc: positive when it adds to the lot. */
  segments: { leg: number; extraM2: number }[];
  /** What the curve adds to the lot's area over the straight legs between its points, m²: negative where it bows inward. */
  extraM2: number;
}

const point = (ring: readonly Point[], k: number) => ring[k % ring.length]!;

/**
 * The lot's curves, in ring order, and the runs that aren't one, with why. A run must span at least two legs, lie within the ring
 * (its end may be the ring's first point again), and not share a leg with another.
 */
export function lotCurves(ring: readonly Point[], runs: readonly ArcRun[] | undefined): { curves: LotCurve[]; problems: { run: ArcRun; problem: string }[] } {
  const curves: LotCurve[] = [];
  const problems: { run: ArcRun; problem: string }[] = [];
  if (!runs || runs.length === 0 || ring.length < 3) return { curves, problems: ring.length < 3 && runs?.length ? runs.map((run) => ({ run, problem: "the lot has too few corners for a curve" })) : problems };
  const orient = Math.sign(signedArea(ring)) || 1;
  let lastTo = -1;
  for (const run of [...runs].sort((a, b) => a.from - b.from)) {
    if (run.from < 0 || run.to > ring.length || run.to - run.from < 2) {
      problems.push({ run, problem: "a curve runs from one corner through at least one more to a later one, within the lot's corners" });
      continue;
    }
    if (run.from < lastTo) {
      problems.push({ run, problem: "it shares a leg with another curve" });
      continue;
    }
    const pts = Array.from({ length: run.to - run.from + 1 }, (_, k) => point(ring, run.from + k));
    const fit = fitArc(pts);
    if (!fit.ok) {
      problems.push({ run, problem: fit.problem });
      continue;
    }
    lastTo = run.to;
    const r = fit.circle.r;
    // The area between a leg and its arc, signed with the arc's turn (r²/2 (θ − sin θ)), then made positive where it adds to the lot.
    const segments = fit.sweeps.map((th, k) => ({ leg: (run.from + k) % ring.length, extraM2: orient * ((r * r) / 2) * (th - Math.sin(th)) }));
    const sweep = fit.sweeps.reduce((s, x) => s + x, 0);
    const [a, b] = [pts[0]!, pts[pts.length - 1]!];
    curves.push({
      from: run.from,
      to: run.to,
      circle: fit.circle,
      sweep,
      radius: r,
      arcLength: r * Math.abs(sweep),
      chordBearing: bearingFromDeltas(b.e - a.e, b.n - a.n),
      chordDistance: Math.hypot(b.e - a.e, b.n - a.n),
      segments,
      extraM2: segments.reduce((s, x) => s + x.extraM2, 0),
    });
  }
  return { curves, problems };
}

/** The curve a leg of the ring belongs to, if any, and whether it's the curve's first leg. */
export function curveOfLeg(curves: readonly LotCurve[], leg: number, ringLength: number): { curve: LotCurve; first: boolean } | null {
  for (const c of curves) {
    for (let k = c.from; k < c.to; k++) if (k % ringLength === leg) return { curve: c, first: k === c.from };
  }
  return null;
}

/** The ring with its curves drawn as short chords (at most `sagitta` off the arc), for the sheet, the extent and GeoJSON. Closed: the first point isn't repeated. */
export function densifyRing(ring: readonly Point[], curves: readonly LotCurve[], sagitta: number): Point[] {
  if (curves.length === 0 || ring.length < 3) return [...ring];
  return densify([...ring, ring[0]!], curves.map((c) => ({ from: c.from, to: c.to })), sagitta).slice(0, -1);
}

/** The DXF bulge of each of the ring's legs, closing leg included: 0 for a straight one. */
export function ringBulges(ring: readonly Point[], curves: readonly LotCurve[]): number[] {
  if (curves.length === 0) return ring.map(() => 0);
  return bulges([...ring, ring[0]!], curves.map((c) => ({ from: c.from, to: c.to }))).slice(0, ring.length);
}

/**
 * A curve given by its points, in order (first, the points on it, last), as a run of the lot's corners: its points must be consecutive
 * corners, either way round; the last may be the first corner again. Null when they aren't.
 */
export function runOf(ring: readonly string[], ids: readonly string[]): ArcRun | null {
  const n = ring.length;
  if (ids.length < 3 || n < 3 || ids.length > n + 1) return null;
  for (const seq of [ids, [...ids].reverse()]) {
    const from = ring.indexOf(seq[0]!);
    if (from < 0) continue;
    if (seq.every((id, k) => ring[(from + k) % n] === id) && from + seq.length - 1 <= n) return { from, to: from + seq.length - 1 };
  }
  return null;
}

/** The ids of a run's points, in order. */
export function runIds(ring: readonly string[], run: ArcRun): string[] {
  return Array.from({ length: run.to - run.from + 1 }, (_, k) => ring[(run.from + k) % ring.length]!);
}

/** A lot's curves carried to its new corners: each kept where its points are still consecutive corners, and counted where not. */
export function remapRuns(before: readonly string[], after: readonly string[], runs: readonly ArcRun[] | undefined): { runs: ArcRun[]; dropped: number } {
  const out: ArcRun[] = [];
  let dropped = 0;
  for (const r of runs ?? []) {
    if (r.to > before.length) {
      dropped++;
      continue;
    }
    const kept = runOf(after, runIds(before, r));
    if (kept) out.push(kept);
    else dropped++;
  }
  return { runs: out, dropped };
}
