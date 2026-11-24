/**
 * Curved lot boundaries (stage 269, ADR 0276). A run of a lot's corners, from the start of a curve (PC) through points on it to its
 * end (PT), is a circular curve when every one of them lies within 2 cm of the circle through the first, middle and last (arcs.ts, the
 * same test as a line's curve, ADR 0247). The lot's area is then the area inside the curve, not inside the straight legs between its
 * points: the shoelace over the corners, plus each segment between a leg and the arc. Nothing is moved: the corners stay as surveyed,
 * and a run that doesn't fit stays straight and is said.
 */
import { bearingFromDeltas } from "./angles";
import { bulgeOf, chordsAlong, fitArc, type ArcRun, type Circle } from "./arcs";
import { signedArea, type Point } from "./geometry";

export interface LotCurve {
  /**
   * The ring indexes of its first and last points, `to` counting on past the ring's last corner when the curve runs through its
   * first: index k is corner k mod the ring's length.
   */
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
  /**
   * Each leg of the ring the curve spans (by the leg's index), the angle it turns along the arc (radians, positive anticlockwise, in the
   * ring's direction), and the area between the leg and the arc: positive when it adds to the lot.
   */
  segments: { leg: number; sweep: number; extraM2: number }[];
  /** What the curve adds to the lot's area over the straight legs between its points, m²: negative where it bows inward. */
  extraM2: number;
}

const point = (ring: readonly Point[], k: number) => ring[k % ring.length]!;

/**
 * The lot's curves, in ring order, and the runs that aren't one, with why. A run spans at least two legs and less than the whole ring,
 * may run on through the ring's first corner, and shares no leg with another.
 *
 * Its circle is fitted with its points in one order whichever way the ring runs (the end whose coordinates come first, first), so two
 * lots sharing a curve, which walk it in opposite directions, fit the same circle, and its segments cancel between them exactly.
 */
export function lotCurves(ring: readonly Point[], runs: readonly ArcRun[] | undefined): { curves: LotCurve[]; problems: { run: ArcRun; problem: string }[] } {
  const curves: LotCurve[] = [];
  const problems: { run: ArcRun; problem: string }[] = [];
  if (!runs || runs.length === 0 || ring.length < 3) return { curves, problems: ring.length < 3 && runs?.length ? runs.map((run) => ({ run, problem: "the lot has too few corners for a curve" })) : problems };
  const n = ring.length;
  const orient = Math.sign(signedArea(ring)) || 1;
  const used = new Set<number>();
  for (const run of [...runs].sort((a, b) => a.from - b.from)) {
    if (run.from < 0 || run.from >= n || run.to - run.from < 2 || run.to - run.from >= n) {
      problems.push({ run, problem: "a curve runs from one corner through at least one more to a later one, within the lot's corners" });
      continue;
    }
    const legs = Array.from({ length: run.to - run.from }, (_, k) => (run.from + k) % n);
    if (legs.some((l) => used.has(l))) {
      problems.push({ run, problem: "it shares a leg with another curve" });
      continue;
    }
    const pts = Array.from({ length: run.to - run.from + 1 }, (_, k) => point(ring, run.from + k));
    // One order for the fit, whichever way the ring runs: the end that comes first by easting, then northing, first.
    const [a0, b0] = [pts[0]!, pts[pts.length - 1]!];
    const flip = b0.e < a0.e || (b0.e === a0.e && b0.n < a0.n);
    const fit = fitArc(flip ? [...pts].reverse() : pts);
    if (!fit.ok) {
      problems.push({ run, problem: fit.problem });
      continue;
    }
    for (const l of legs) used.add(l);
    const r = fit.circle.r;
    // Each leg's turn in the ring's direction: the fit's turns reversed and negated when it was fitted the other way round.
    const sweeps = flip ? [...fit.sweeps].reverse().map((s) => -s) : fit.sweeps;
    // The area between a leg and its arc, signed with the arc's turn (r²/2 (θ − sin θ)), then made positive where it adds to the lot.
    const segments = sweeps.map((th, k) => ({ leg: legs[k]!, sweep: th, extraM2: orient * ((r * r) / 2) * (th - Math.sin(th)) }));
    const sweep = sweeps.reduce((s, x) => s + x, 0);
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

/** Each curved leg of the ring, by its index: its circle and its turn. */
const curvedLegs = (curves: readonly LotCurve[]) => new Map(curves.flatMap((c) => c.segments.map((s) => [s.leg, { circle: c.circle, sweep: s.sweep }] as const)));

/** The ring with its curves drawn as short chords (at most `sagitta` off the arc), for the sheet, the extent and GeoJSON. Closed: the first point isn't repeated. */
export function densifyRing(ring: readonly Point[], curves: readonly LotCurve[], sagitta: number): Point[] {
  if (curves.length === 0 || ring.length < 3) return [...ring];
  const curved = curvedLegs(curves);
  return ring.flatMap((p, i) => {
    const c = curved.get(i);
    return c ? chordsAlong(p, c.circle, c.sweep, sagitta) : [p];
  });
}

/** The ring's points along one curve, first to last, its arc drawn as short chords: for the sheet, which draws each curve once. */
export function densifyCurve(ring: readonly Point[], curve: LotCurve, sagitta: number): Point[] {
  const out = curve.segments.flatMap((s) => chordsAlong(ring[s.leg]!, curve.circle, s.sweep, sagitta));
  return [...out, point(ring, curve.to)];
}

/** The DXF bulge of each of the ring's legs, closing leg included: 0 for a straight one. */
export function ringBulges(ring: readonly Point[], curves: readonly LotCurve[]): number[] {
  const curved = curvedLegs(curves);
  return ring.map((_, i) => {
    const c = curved.get(i);
    return c ? bulgeOf(c.sweep) : 0;
  });
}

/**
 * A curve given by its points, in order (first, the points on it, last), as a run of the lot's corners: its points must be consecutive
 * corners, either way round; the last may be the first corner again. Null when they aren't.
 */
export function runOf(ring: readonly string[], ids: readonly string[]): ArcRun | null {
  const n = ring.length;
  if (ids.length < 3 || n < 3 || ids.length > n) return null;
  for (const seq of [ids, [...ids].reverse()]) {
    const from = ring.indexOf(seq[0]!);
    if (from < 0) continue;
    // Through the ring's first corner too: the run's end counts on past the last corner.
    if (seq.every((id, k) => ring[(from + k) % n] === id)) return { from, to: from + seq.length - 1 };
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
    if (r.from >= before.length || r.to - r.from >= before.length) {
      dropped++;
      continue;
    }
    const kept = runOf(after, runIds(before, r));
    if (kept) out.push(kept);
    else dropped++;
  }
  return { runs: out, dropped };
}
