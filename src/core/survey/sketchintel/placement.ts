/**
 * Where each number is written on a sketch (stage 247, ADR 0255). A field sketch isn't drawn to scale, but it keeps the survey's rough
 * shape: fitting the places the reader gave for the point numbers to their surveyed points shows a number written where a different
 * point belongs, which is the mark of a misread (an upside-down 20 read as 10, where 10 is another point). It is only ever a question:
 * no position is taken from a photo, no number is changed, and nothing is moved.
 *
 * Places are in the photo's own frame, 0 to 1000 across and down, as the reader gave them (approximate). The fit is affine, so a photo
 * taken turned, at a slant or of a sketch drawn squashed still fits. It's found by consensus, so a few misreads or a far station can't
 * steer it: exact fits through three numbers at a time are tried (all of them for a small sketch, a fixed sample for a large one), the
 * one the most numbers agree with is kept, and least squares over those numbers refines it.
 */
import type { SurveyPoint } from "../parcel";
import { indexPoints, matchPoint } from "./match";

/** A point number as the reader placed it on a photo; `id` is the reading's, when it came from one. */
export interface PlacedNumber {
  label: string;
  file: string;
  x: number;
  y: number;
  id?: string;
}

/** A number written where another surveyed point would be. `pointId` is the point it was matched to, or null when none was. */
export interface Misplaced {
  label: string;
  file: string;
  x: number;
  y: number;
  id?: string;
  pointId: string | null;
  /** How far, in photo units, the number is from where its own point would be (Infinity when it matched none). */
  off: number;
  /** The point whose place it's written at by the fit, and how far the number is from that place. */
  likely: string;
  likelyOff: number;
  /**
   * Whether that point's own number is written at that point's place too. Then the number isn't likely to be that point: it's only far
   * from where its own point would be.
   */
  likelyWritten: boolean;
  /**
   * Whether the same number is written again at its own point's place (stage 254): that one is the point's, so this one is most likely
   * another number misread as it, and is said rather than asked about.
   */
  alsoAtOwn: boolean;
}

/**
 * Farbaek's defaults, in photo units (a thousandth of the photo's width or height): at least six numbers to fit, and that many agreeing
 * with the fit; a number agrees within 120. A number is said to be out of place when it's 150 from its own point and within 80 of
 * another point's place, and nearer that one by half. Measured on one real sketch (ADR 0255): its well-read numbers fit within about 130.
 */
export const PLACEMENT = { minNumbers: 6, agreeWithin: 120, outOfPlace: 150, nearOther: 80, triples: 400 } as const;

type Frame = { e0: number; n0: number; s: number };
type Affine = { ax: [number, number, number]; ay: [number, number, number] };
type Pair = { p: SurveyPoint; x: number; y: number };

const det3 = (a: readonly number[]) => a[0]! * (a[4]! * a[8]! - a[5]! * a[7]!) - a[1]! * (a[3]! * a[8]! - a[5]! * a[6]!) + a[2]! * (a[3]! * a[7]! - a[4]! * a[6]!);

/** Solves the 3 by 3 system m·[a b c] = v (row-major m) by Cramer's rule, or null when its determinant is under `least` (nearly singular). */
function solve3(m: readonly number[], vs: readonly (readonly number[])[], least: number): [number, number, number][] | null {
  const d = det3(m);
  if (!Number.isFinite(d) || Math.abs(d) < least) return null;
  return vs.map((v) => {
    const col = (k: number) => m.map((x, i) => (i % 3 === k ? v[Math.floor(i / 3)]! : x));
    return [det3(col(0)) / d, det3(col(1)) / d, det3(col(2)) / d];
  });
}

const uv = (f: Frame, p: SurveyPoint) => [(p.e - f.e0) / f.s, (p.n - f.n0) / f.s] as const;
const placeOf = (f: Frame, a: Affine, p: SurveyPoint) => {
  const [u, v] = uv(f, p);
  return { x: a.ax[0] * u + a.ax[1] * v + a.ax[2], y: a.ay[0] * u + a.ay[1] * v + a.ay[2] };
};
const offOf = (f: Frame, a: Affine, q: Pair) => {
  const at = placeOf(f, a, q.p);
  return Math.hypot(at.x - q.x, at.y - q.y);
};

/** The frame a set of points is fitted in: centred on them, scaled by their RMS spread. */
function frameOf(pairs: readonly Pair[]): Frame {
  const n = pairs.length;
  const e0 = pairs.reduce((s, q) => s + q.p.e, 0) / n;
  const n0 = pairs.reduce((s, q) => s + q.p.n, 0) / n;
  return { e0, n0, s: Math.sqrt(pairs.reduce((t, q) => t + (q.p.e - e0) ** 2 + (q.p.n - n0) ** 2, 0) / n) || 1 };
}

/** The exact affine map through three numbers, or null when their points are (nearly) in a line. */
function through(f: Frame, three: readonly Pair[]): Affine | null {
  const rows = three.map((q) => [...uv(f, q.p), 1]);
  // Twice the triangle's area against its longest side squared, so a small triangle among far points is judged by its own shape: under
  // 0.02, the three points are too nearly in a line to fix a map.
  const d2 = (i: number, j: number) => (rows[i]![0]! - rows[j]![0]!) ** 2 + (rows[i]![1]! - rows[j]![1]!) ** 2;
  const side2 = Math.max(d2(0, 1), d2(1, 2), d2(0, 2));
  const s = solve3(rows.flat(), [three.map((q) => q.x), three.map((q) => q.y)], 0.02 * side2);
  return s && side2 > 0 ? { ax: s[0]!, ay: s[1]! } : null;
}

/** Least squares over the agreeing numbers, in their own frame, or null when their points are (nearly) in a line. */
function leastSquares(pairs: readonly Pair[]): { f: Frame; a: Affine } | null {
  const f = frameOf(pairs);
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const bx = [0, 0, 0];
  const by = [0, 0, 0];
  for (const q of pairs) {
    const r = [...uv(f, q.p), 1];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i * 3 + j]! += r[i]! * r[j]!;
      bx[i]! += r[i]! * q.x;
      by[i]! += r[i]! * q.y;
    }
  }
  const s = solve3(m, [bx, by], 1e-6 * pairs.length ** 3);
  return s ? { f, a: { ax: s[0]!, ay: s[1]! } } : null;
}

/** A fixed sample of index triples: all of them for up to 14 numbers, else a repeatable pseudo-random set. */
function triples(n: number, most: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  if (n <= 14) {
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) out.push([i, j, k]);
    return out;
  }
  let seed = 0x2545f491;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % n;
  };
  while (out.length < most) {
    const [i, j, k] = [next(), next(), next()];
    if (i !== j && j !== k && i !== k) out.push([i, j, k]);
  }
  return out;
}

/** The fit most of the photo's numbers agree with, refined over them; null when too few agree. */
function consensus(pairs: readonly Pair[], limits: typeof PLACEMENT): { f: Frame; a: Affine } | null {
  const n = pairs.length;
  const f = frameOf(pairs);
  let best: { a: Affine; agree: Pair[]; err: number } | null = null;
  for (const [i, j, k] of triples(n, limits.triples)) {
    const a = through(f, [pairs[i]!, pairs[j]!, pairs[k]!]);
    if (!a) continue;
    const offs = pairs.map((q) => offOf(f, a, q));
    const agree = pairs.filter((_, x) => offs[x]! <= limits.agreeWithin);
    const err = offs.reduce((t, d) => t + Math.min(d, limits.agreeWithin), 0);
    if (!best || agree.length > best.agree.length || (agree.length === best.agree.length && err < best.err)) best = { a, agree, err };
  }
  if (!best || best.agree.length < limits.minNumbers) return null;
  // Refined twice over the numbers that agree; a refinement that fails keeps the fit it started from.
  let fit = { f, a: best.a };
  let agree = best.agree;
  for (let round = 0; round < 2; round++) {
    const refined = leastSquares(agree);
    if (!refined) break;
    const now = pairs.filter((q) => offOf(refined.f, refined.a, q) <= limits.agreeWithin);
    if (now.length < limits.minNumbers) break;
    fit = refined;
    agree = now;
  }
  return fit;
}

/** The numbers written on one photo, matched to the survey, and the fit most of them agree with; null when too few agree. */
function photoFit(here: readonly PlacedNumber[], index: ReturnType<typeof indexPoints>, limits: typeof PLACEMENT) {
  // A label written twice on one photo can't say which place is its own, and a number two surveyed points share can't say which
  // point is its own: neither is fitted, and a shared number is never said to be out of place.
  const counts = new Map<string, number>();
  for (const p of here) counts.set(p.label, (counts.get(p.label) ?? 0) + 1);
  const matched = here.map((p) => ({ ...p, m: matchPoint(p.label, index) })).filter((x) => x.m.how !== "ambiguous");
  const pairs = matched.filter((x) => x.m.point && counts.get(x.label) === 1).map((x) => ({ p: x.m.point!, x: x.x, y: x.y }));
  if (pairs.length < limits.minNumbers) return null;
  const fit = consensus(pairs, limits);
  return fit ? { fit, matched, counts } : null;
}

/**
 * Where each surveyed point is on one photo (stage 254, ADR 0262): where its number is written, when it's written there once and agrees
 * with the fit of the others, else where the fit puts it. Null when too few numbers agree. Only to say which drawn area a label is
 * written in, never a position on the ground.
 */
export function photoPlaces(placed: readonly PlacedNumber[], points: readonly SurveyPoint[], file: string, limits = PLACEMENT): ((p: SurveyPoint) => { x: number; y: number }) | null {
  const got = photoFit(
    placed.filter((p) => p.file === file),
    indexPoints(points),
    limits,
  );
  if (!got) return null;
  const { fit, matched, counts } = got;
  return (p) => {
    const at = placeOf(fit.f, fit.a, p);
    const own = matched.find((x) => x.m.point?.id === p.id && counts.get(x.label) === 1);
    return own && Math.hypot(own.x - at.x, own.y - at.y) <= limits.agreeWithin ? { x: own.x, y: own.y } : at;
  };
}

/** The numbers on each photo written where a different surveyed point would be, by the fit of all the others. */
export function misplacedNumbers(placed: readonly PlacedNumber[], points: readonly SurveyPoint[], limits = PLACEMENT): Misplaced[] {
  const index = indexPoints(points);
  const out: Misplaced[] = [];
  for (const file of [...new Set(placed.map((p) => p.file))]) {
    const got = photoFit(
      placed.filter((p) => p.file === file),
      index,
      limits,
    );
    if (!got) continue;
    const { fit, matched } = got;
    // Every surveyed point's place on this photo, worked out once.
    const places = points.map((p) => ({ p, ...placeOf(fit.f, fit.a, p) }));
    const placeOfId = new Map(places.map((q) => [q.p.id, q] as const));
    for (const x of matched) {
      const own = x.m.point ? placeOfId.get(x.m.point.id)! : null;
      const off = own ? Math.hypot(own.x - x.x, own.y - x.y) : Infinity;
      if (off < limits.outOfPlace) continue;
      // The same number written again at its own point's place (stage 254): that one is the point's, so this one is most likely another
      // number misread as it (a 23 read as 22).
      const alsoAtOwn = own !== null && matched.some((o) => o !== x && o.m.point?.id === x.m.point!.id && Math.hypot(own.x - o.x, own.y - o.y) < limits.outOfPlace);
      let nearest: { p: SurveyPoint; x: number; y: number; d: number } | null = null;
      for (const q of places) {
        if (q.p.id === x.m.point?.id || q.p.pointId === x.label) continue;
        const d = Math.hypot(q.x - x.x, q.y - x.y);
        if (!nearest || d < nearest.d) nearest = { ...q, d };
      }
      if (!nearest || nearest.d > limits.nearOther || nearest.d > off / 2) continue;
      const near = nearest;
      // "There": the other point's own number written at that point's place, not merely somewhere on the photo (a swap of 4 and 8).
      const likelyWritten = matched.some((o) => o !== x && o.m.point?.id === near.p.id && Math.hypot(o.x - near.x, o.y - near.y) <= limits.nearOther);
      // A number the survey doesn't have, beside another that's written too, is already asked about as not in the survey.
      if (!x.m.point && likelyWritten) continue;
      out.push({ label: x.label, file, x: x.x, y: x.y, ...(x.id ? { id: x.id } : {}), pointId: x.m.point?.pointId ?? null, off, likely: near.p.pointId, likelyOff: near.d, likelyWritten, alsoAtOwn });
    }
  }
  return out;
}
