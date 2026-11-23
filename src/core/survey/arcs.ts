/**
 * Curves through surveyed points (stage 239, ADR 0247). A field crew codes a curve's first point PC and its last PT (Carlson's words,
 * ADR 0243) and shoots points along it. The curve is the circle through the first, middle and last of those points, drawn only when
 * every point between lies on it within ARC_FIT_M; otherwise it stays straight segments and the reason is said. No point moves: the
 * curve passes through every surveyed point exactly as recorded, and its radius is worked out here, never assumed.
 *
 * Coordinates are worked relative to the first point, so grid-sized eastings and northings keep their precision.
 */
import type { Point } from "./geometry";

/** How far a point between PC and PT may lie off the circle through the first, middle and last, metres. Farbaek's default, not a rule. */
export const ARC_FIT_M = 0.02;
/** A curve gentler than this (the sine of the angle at its middle point) is a straight line, metres per metre. */
const STRAIGHT = 1e-6;
/** Radii past this are drawn straight: a kilometre-wide circle over a few metres is a straight line with noise. */
const MAX_RADIUS_M = 100_000;
/** The most curves one line holds (the document's limit). */
export const ARCS_PER_LINE = 50;
/** The most a curve may turn between two of its points in a row: past a quarter circle, the shots don't follow the curve. */
const MAX_STEP = Math.PI / 2 + 1e-9;

export interface Circle {
  e: number;
  n: number;
  r: number;
}

/** The circle through three points, or null when they're in a straight line (or two are the same point). */
export function circleThrough(a: Point, b: Point, c: Point): Circle | null {
  const bx = b.e - a.e;
  const by = b.n - a.n;
  const cx = c.e - a.e;
  const cy = c.n - a.n;
  const lb = Math.hypot(bx, by);
  const lc = Math.hypot(cx, cy);
  const lbc = Math.hypot(c.e - b.e, c.n - b.n);
  if (lb === 0 || lc === 0 || lbc === 0) return null;
  const cross = bx * cy - by * cx;
  if (Math.abs(cross) / (lb * lc) < STRAIGHT) return null;
  const d = 2 * cross;
  const b2 = bx * bx + by * by;
  const c2 = cx * cx + cy * cy;
  const ux = (cy * b2 - by * c2) / d;
  const uy = (bx * c2 - cx * b2) / d;
  const r = Math.hypot(ux, uy);
  return r > MAX_RADIUS_M ? null : { e: a.e + ux, n: a.n + uy, r };
}

const TAU = Math.PI * 2;
const angleAt = (c: Circle, p: Point) => Math.atan2(p.n - c.n, p.e - c.e);
/** The angle turned anticlockwise from a to b, in [0, 2π). */
const ccw = (a: number, b: number) => (((b - a) % TAU) + TAU) % TAU;

export type ArcFit = { ok: true; circle: Circle; /** Signed angle of each segment, radians: positive anticlockwise (east to north). */ sweeps: number[] } | { ok: false; problem: string };

/**
 * Whether surveyed points, in order, make one circular curve: at least three, every one within ARC_FIT_M of the circle through the
 * first, middle and last, each further along than the one before, turning less than a full circle.
 */
export function fitArc(points: readonly Point[], tolerance = ARC_FIT_M): ArcFit {
  if (points.length < 3) return { ok: false, problem: "a curve needs a point between its first and last, and it has none" };
  const first = points[0]!;
  const last = points[points.length - 1]!;
  if (first.e === last.e && first.n === last.n) return { ok: false, problem: "it ends where it began: code a full circle as two curves" };
  const middle = points[Math.floor(points.length / 2)]!;
  const circle = circleThrough(first, middle, last);
  if (!circle) return { ok: false, problem: "its points lie in a straight line" };
  const off = Math.max(...points.map((p) => Math.abs(Math.hypot(p.e - circle.e, p.n - circle.n) - circle.r)));
  if (off > tolerance) return { ok: false, problem: `its points don't lie on one circle (one is ${off.toFixed(3)} m off the circle through the first, middle and last)` };
  // The direction of travel: anticlockwise when the middle comes before the last going anticlockwise from the first.
  const a0 = angleAt(circle, first);
  const anticlockwise = ccw(a0, angleAt(circle, middle)) < ccw(a0, angleAt(circle, last));
  const sweeps: number[] = [];
  let turned = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    const from = angleAt(circle, points[i]!);
    const to = angleAt(circle, points[i + 1]!);
    const step = anticlockwise ? ccw(from, to) : -ccw(to, from);
    if (step === 0) return { ok: false, problem: "two of its points are at the same place" };
    // Three points always lie on some circle: shots out of order, or too far apart, would make one turn most of the way round.
    if (Math.abs(step) > MAX_STEP) return { ok: false, problem: "two of its points in a row are more than a quarter circle apart along it, so its points don't follow one curve" };
    sweeps.push(step);
    turned += Math.abs(step);
  }
  if (turned >= TAU - 1e-9) return { ok: false, problem: "its points go round more than a full circle, or not in order along it" };
  return { ok: true, circle, sweeps };
}

/** The DXF bulge of a segment that turns `sweep` radians: tan(sweep / 4), positive anticlockwise. */
export const bulgeOf = (sweep: number) => Math.tan(sweep / 4);

/**
 * Points along one curved segment from p to the next point, on `circle`, close enough that no chord strays more than `sagitta`
 * metres from the curve: the segment's own end is left out, so segments join without repeats. At most 256 pieces a segment.
 */
export function chordsAlong(p: Point, circle: Circle, sweep: number, sagitta: number): Point[] {
  const step = sagitta >= circle.r ? Math.PI / 2 : 2 * Math.acos(1 - sagitta / circle.r);
  const pieces = Math.min(256, Math.max(1, Math.ceil(Math.abs(sweep) / step)));
  const start = angleAt(circle, p);
  const out: Point[] = [p];
  for (let i = 1; i < pieces; i++) {
    const t = start + (sweep * i) / pieces;
    out.push({ e: circle.e + circle.r * Math.cos(t), n: circle.n + circle.r * Math.sin(t) });
  }
  return out;
}

/** A run of a line's points drawn as a curve: from the point at index `from` to the one at `to` (at least two apart). */
export interface ArcRun {
  from: number;
  to: number;
}

/**
 * A line's points with its curved runs replaced by chords fine enough for `sagitta`, for drawing on paper. Runs that don't fit a
 * circle (the document is checked when saved, but a point may have changed since) stay straight.
 */
export function densify(points: readonly Point[], runs: readonly ArcRun[] | undefined, sagitta: number): Point[] {
  if (!runs || runs.length === 0) return [...points];
  const curved = new Map<number, { circle: Circle; sweep: number }>();
  for (const r of runs) {
    if (r.from < 0 || r.to >= points.length || r.to - r.from < 2) continue;
    const fit = fitArc(points.slice(r.from, r.to + 1));
    if (!fit.ok) continue;
    fit.sweeps.forEach((sweep, i) => curved.set(r.from + i, { circle: fit.circle, sweep }));
  }
  const out: Point[] = [];
  points.forEach((p, i) => {
    const c = curved.get(i);
    if (c && i + 1 < points.length) out.push(...chordsAlong(p, c.circle, c.sweep, sagitta));
    else out.push(p);
  });
  return out;
}

/** The DXF bulge for each vertex of a line, 0 where its next segment is straight. */
export function bulges(points: readonly Point[], runs: readonly ArcRun[] | undefined): number[] {
  const out = points.map(() => 0);
  for (const r of runs ?? []) {
    if (r.from < 0 || r.to >= points.length || r.to - r.from < 2) continue;
    const fit = fitArc(points.slice(r.from, r.to + 1));
    if (fit.ok) fit.sweeps.forEach((sweep, i) => (out[r.from + i] = bulgeOf(sweep)));
  }
  return out;
}
