/**
 * Traverse adjustment (stage 231, ADR 0241): a traverse's linear misclosure spread over its stations by the rule the surveyor
 * chooses, and never by default (survey skill, rule 7). Tested arithmetic only; the unadjusted observations stay in the source file.
 *
 * - **Compass rule (Bowditch):** each station moves by the misclosure times its distance along the traverse over the whole length.
 *   It suits a traverse whose angles and distances were measured with similar care.
 * - **Transit rule:** each station's easting moves by the easting misclosure times the sum of the eastings run so far over their
 *   whole sum (as sizes, without signs), and its northing the same way with the northings. It suits angles measured with more care
 *   than distances.
 *
 * Only the linear misclosure is spread: angles aren't balanced first, because the angular misclosure isn't worked out here, and
 * heights aren't adjusted. The closing point keeps its known coordinates; the start station doesn't move.
 */

export const ADJUST_ENGINE = "adjust/1.1.0";
export const ADJUST_METHODS = ["compass", "transit", "least_squares"] as const;
export type AdjustMethod = (typeof ADJUST_METHODS)[number];

/** As the surveyor reads them: the rule's name in a sentence. */
export const ADJUST_NAMES: Record<AdjustMethod, string> = { compass: "the compass rule (Bowditch)", transit: "the transit rule", least_squares: "least squares" };

/**
 * An instrument's stated precision, as its specification gives it (ISO 17123-3 and 17123-4): the standard deviation of one direction,
 * seconds, and of a distance, millimetres plus parts per million. An angle is the difference of two directions, so it is weighed at
 * √2 times the direction's figure.
 */
export interface InstrumentPrecision {
  angleSeconds: number;
  distanceMm: number;
  distancePpm: number;
  /** The instrument it was given for, when the surveyor gave it (an office profile's, ADR 0274): said with the result. */
  instrument?: string;
}

/**
 * The precision least squares weighs by when the surveyor gives none (stage 267, ADR 0274): a 5″ total station measuring 2 mm + 2 ppm,
 * the class most Sri Lankan cadastral work is done with. Always said with the result, so it's never mistaken for the instrument's own.
 */
export const DEFAULT_PRECISION: InstrumentPrecision = { angleSeconds: 5, distanceMm: 2, distancePpm: 2 };

/**
 * What least squares weighed by, in a sentence's words: the figures, and whose they are. A precision with no instrument named is the
 * typical one, wherever it was read back from.
 */
export function weighedBy(p: InstrumentPrecision): string {
  return `${p.angleSeconds}″ directions (${(p.angleSeconds * Math.SQRT2).toFixed(1)}″ an angle) and ${p.distanceMm} mm + ${p.distancePpm} ppm distances${p.instrument ? `, as the office profile gives for the ${p.instrument}` : ", a typical total station's, not necessarily the one used"}`;
}

/** The same, short, for a version's note: "5″, 2 mm + 2 ppm, typical". */
export function weighedShort(p: InstrumentPrecision): string {
  return `${p.angleSeconds}″, ${p.distanceMm} mm + ${p.distancePpm} ppm, ${p.instrument ? "from the office profile" : "typical"}`;
}

/** What least squares says about the fit, beside its corrections. */
export interface LeastSquaresStats {
  /** The a posteriori standard deviation of unit weight: about 1 when the observations agree with the precision they were weighted by. */
  sigma0: number;
  /** Observations beyond the unknowns: 2 for a traverse closing on a known point. */
  redundancy: number;
  /** Whether σ0² passes the χ² test at 95%: the misclosure is what the stated precision leads one to expect. */
  passes: boolean;
  /**
   * Which side of the test's range it fell on when it didn't pass: "high" when the observations fit worse than the precision explains,
   * "low" when better (an instrument that already adjusted them, a closure within rounding).
   */
  side: "low" | "high" | null;
  precision: InstrumentPrecision;
  /** The largest distance residual, mm, and the largest angle residual, seconds. */
  worstDistanceMm: number;
  worstAngleSeconds: number;
  /**
   * Each adjusted station's standard deviation in easting and northing, metres: from the stated precision, and scaled by σ0 only when
   * the test shows the observations worse than it, as adjustment programs report them. A fit better than the precision never makes a
   * station look surer than the instrument can make it.
   */
  stations: { station: string; sE: number; sN: number }[];
}

/** One leg of a run: the station or point it ends at, and its easting and northing from the one before. */
export interface RunLeg {
  to: string;
  dE: number;
  dN: number;
}

export interface Correction {
  station: string;
  dE: number;
  dN: number;
}

export type Adjustment = { ok: true; corrections: Correction[]; largest: number; stats?: LeastSquaresStats } | { ok: false; problem: string };

/**
 * The corrections for each station of a run, in order: every leg's end but the last, which is the closing point and keeps its known
 * coordinates. `misclosure` is where the run's computed end falls from the closing point (computed minus known), so applying the
 * whole rule to the last leg would move it by exactly minus the misclosure.
 */
export function adjustRun(legs: readonly RunLeg[], misclosure: { dE: number; dN: number }, method: AdjustMethod, precision: InstrumentPrecision = DEFAULT_PRECISION): Adjustment {
  if (legs.length < 2) return { ok: false, problem: "A traverse needs at least one station between its start and the point it closes on." };
  if (!legs.every((l) => Number.isFinite(l.dE) && Number.isFinite(l.dN)) || !Number.isFinite(misclosure.dE) || !Number.isFinite(misclosure.dN)) {
    return { ok: false, problem: "The traverse's legs don't all work out to finite numbers, so it can't be adjusted." };
  }
  if (method === "least_squares") return leastSquares(legs, misclosure, precision);
  const corrections: Correction[] = [];
  if (method === "compass") {
    const length = legs.reduce((s, l) => s + Math.hypot(l.dE, l.dN), 0);
    if (!(length > 0)) return { ok: false, problem: "The traverse has no length to spread its misclosure over." };
    let run = 0;
    for (const leg of legs.slice(0, -1)) {
      run += Math.hypot(leg.dE, leg.dN);
      corrections.push({ station: leg.to, dE: (-misclosure.dE * run) / length, dN: (-misclosure.dN * run) / length });
    }
  } else {
    const sumE = legs.reduce((s, l) => s + Math.abs(l.dE), 0);
    const sumN = legs.reduce((s, l) => s + Math.abs(l.dN), 0);
    // A misclosure in a direction no leg runs in can't be spread in proportion to the legs: the rule doesn't apply.
    if (sumE === 0 && misclosure.dE !== 0) return { ok: false, problem: "Every leg runs due north or south, so the transit rule has no eastings to spread the easting misclosure over. Choose the compass rule, or keep the points as shot." };
    if (sumN === 0 && misclosure.dN !== 0) return { ok: false, problem: "Every leg runs due east or west, so the transit rule has no northings to spread the northing misclosure over. Choose the compass rule, or keep the points as shot." };
    let runE = 0;
    let runN = 0;
    for (const leg of legs.slice(0, -1)) {
      runE += Math.abs(leg.dE);
      runN += Math.abs(leg.dN);
      corrections.push({ station: leg.to, dE: sumE === 0 ? 0 : (-misclosure.dE * runE) / sumE, dN: sumN === 0 ? 0 : (-misclosure.dN * runN) / sumN });
    }
  }
  const largest = corrections.reduce((m, c) => Math.max(m, Math.hypot(c.dE, c.dN)), 0);
  return { ok: true, corrections, largest };
}

/** "1 in 34,360" for a precision ratio, or "exactly" when there's no misclosure to divide by. */
export function precisionText(precision: number | null): string {
  return precision === null ? "exactly" : `1 in ${Math.round(precision).toLocaleString("en-GB")}`;
}

/** The χ² bounds at 95% for 2 degrees of freedom: r·σ0² inside them passes. */
const CHI2_95_R2 = [0.0506, 7.3778] as const;

/**
 * The most legs least squares adjusts here. Its work grows with the cube of the stations and runs while the plan is drawn, so a long
 * chain (or a file made to be one) would hold everyone up: 100 legs take a tenth of a second, 500 take ten.
 */
export const LEAST_SQUARES_MAX_LEGS = 100;

/** An angle folded into (-π, π]. */
const wrap = (a: number) => {
  let x = a;
  while (x <= -Math.PI) x += 2 * Math.PI;
  while (x > Math.PI) x -= 2 * Math.PI;
  return x;
};

/** Solves the symmetric positive definite system M x = b, and gives M's inverse too (for the stations' standard deviations); null if singular. */
function solveSpd(m: number[][], b: number[]): { x: number[]; inverse: number[][] } | null {
  const n = b.length;
  // Gauss-Jordan on [M | I | b], with partial pivoting: n is at most a few hundred.
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)), b[i]!]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(a[r]![c]!) > Math.abs(a[p]![c]!)) p = r;
    if (Math.abs(a[p]![c]!) < 1e-18) return null;
    [a[c], a[p]] = [a[p]!, a[c]!];
    const pivot = a[c]![c]!;
    for (let k = c; k < 2 * n + 1; k++) a[c]![k]! /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = a[r]![c]!;
      if (f === 0) continue;
      for (let k = c; k < 2 * n + 1; k++) a[r]![k]! -= f * a[c]![k]!;
    }
  }
  return { x: a.map((row) => row[2 * n]!), inverse: a.map((row) => row.slice(n, 2 * n)) };
}

/**
 * Least squares (stage 267, ADR 0274): the traverse's stations placed where their observations, each weighted by the instrument's
 * precision, fit best while the run ends exactly on its closing point. The observations are those the legs were reduced from: each leg's
 * horizontal distance, the first leg's direction (from the station's orientation) and the angle between each leg and the next. The
 * stations' coordinates are the unknowns, solved by Gauss-Newton on the weighted normal equations. With the start and the closing point
 * fixed, two observations are more than the unknowns need: the misclosure is what's spread, and σ0 says whether it's what the stated
 * precision leads one to expect.
 */
function leastSquares(legs: readonly RunLeg[], misclosure: { dE: number; dN: number }, precision: InstrumentPrecision): Adjustment {
  const { angleSeconds, distanceMm, distancePpm } = precision;
  if (!(angleSeconds > 0) || !(distanceMm >= 0) || !(distancePpm >= 0) || !(distanceMm > 0 || distancePpm > 0)) return { ok: false, problem: "The instrument's precision must be greater than nothing to weigh the observations by." };
  const n = legs.length;
  if (n > LEAST_SQUARES_MAX_LEGS) return { ok: false, problem: `Least squares here adjusts a traverse of up to ${LEAST_SQUARES_MAX_LEGS} legs, and this one has ${n}. Choose the compass or transit rule, or keep the points as shot.` };
  if (legs.some((l) => Math.hypot(l.dE, l.dN) < 1e-6)) return { ok: false, problem: "A leg of the traverse has no length, so its direction can't be weighed." };
  // Stations 0 (the start, fixed) to n (the closing point, fixed at its known place); 1 to n-1 are the unknowns.
  const asShot: { e: number; n: number }[] = [{ e: 0, n: 0 }];
  for (const l of legs) asShot.push({ e: asShot.at(-1)!.e + l.dE, n: asShot.at(-1)!.n + l.dN });
  const pts = asShot.map((p) => ({ ...p }));
  pts[n] = { e: asShot[n]!.e - misclosure.dE, n: asShot[n]!.n - misclosure.dN };
  // The observations, as shot.
  const az = (a: { e: number; n: number }, b: { e: number; n: number }) => Math.atan2(b.e - a.e, b.n - a.n);
  const dist = legs.map((l) => Math.hypot(l.dE, l.dN));
  const azimuths = legs.map((l) => Math.atan2(l.dE, l.dN));
  const angles = azimuths.slice(1).map((z, k) => wrap(z - azimuths[k]!));
  const rho = Math.PI / 648_000;
  const sd = dist.map((d) => distanceMm / 1000 + (distancePpm * 1e-6) * d);
  // A direction's standard deviation, as stated; an angle (and leg 1's direction from the start's orientation) is the difference of two.
  const sa = Math.SQRT2 * angleSeconds * rho;
  const u = 2 * (n - 1);
  const col = (k: number) => (k >= 1 && k <= n - 1 ? 2 * (k - 1) : -1);
  type Row = { a: number[]; w: number; p: number; kind: "d" | "a" };
  let rows: Row[] = [];
  const build = () => {
    rows = [];
    const row = () => new Array<number>(u).fill(0);
    const put = (r: number[], k: number, dE: number, dN: number) => {
      const c = col(k);
      if (c >= 0) {
        r[c]! += dE;
        r[c + 1]! += dN;
      }
    };
    // Distances: d = |P_i - P_(i-1)|.
    for (let i = 1; i <= n; i++) {
      const [a, b] = [pts[i - 1]!, pts[i]!];
      const d = Math.hypot(b.e - a.e, b.n - a.n);
      const r = row();
      put(r, i, (b.e - a.e) / d, (b.n - a.n) / d);
      put(r, i - 1, -(b.e - a.e) / d, -(b.n - a.n) / d);
      rows.push({ a: r, w: dist[i - 1]! - d, p: 1 / sd[i - 1]! ** 2, kind: "d" });
    }
    // The direction of leg 1 from the start's orientation, and each angle between consecutive legs.
    const azRow = (r: number[], i: number, sign: number) => {
      const [a, b] = [pts[i - 1]!, pts[i]!];
      const d2 = (b.e - a.e) ** 2 + (b.n - a.n) ** 2;
      put(r, i, (sign * (b.n - a.n)) / d2, (sign * -(b.e - a.e)) / d2);
      put(r, i - 1, (sign * -(b.n - a.n)) / d2, (sign * (b.e - a.e)) / d2);
    };
    {
      const r = row();
      azRow(r, 1, 1);
      rows.push({ a: r, w: wrap(azimuths[0]! - az(pts[0]!, pts[1]!)), p: 1 / sa ** 2, kind: "a" });
    }
    for (let k = 1; k < n; k++) {
      const r = row();
      azRow(r, k + 1, 1);
      azRow(r, k, -1);
      const computed = wrap(az(pts[k]!, pts[k + 1]!) - az(pts[k - 1]!, pts[k]!));
      rows.push({ a: r, w: wrap(angles[k - 1]! - computed), p: 1 / sa ** 2, kind: "a" });
    }
  };
  let inverse: number[][] = [];
  for (let iter = 0; iter < 20; iter++) {
    build();
    const normal = Array.from({ length: u }, () => new Array<number>(u).fill(0));
    const rhs = new Array<number>(u).fill(0);
    for (const r of rows)
      for (let i = 0; i < u; i++) {
        if (r.a[i] === 0) continue;
        rhs[i]! += r.a[i]! * r.p * r.w;
        for (let j = 0; j < u; j++) normal[i]![j]! += r.a[i]! * r.p * r.a[j]!;
      }
    const s = solveSpd(normal, rhs);
    if (!s) return { ok: false, problem: "The traverse's observations don't fix its stations (its legs may double back on one line), so least squares can't place them." };
    inverse = s.inverse;
    for (let k = 1; k < n; k++) {
      pts[k] = { e: pts[k]!.e + s.x[col(k)]!, n: pts[k]!.n + s.x[col(k) + 1]! };
    }
    if (Math.max(...s.x.map(Math.abs)) < 1e-10) break;
  }
  // Residuals at the solution: computed minus observed (the misclosures of the last linearisation, negated).
  build();
  const redundancy = rows.length - u;
  const vpv = rows.reduce((t, r) => t + r.p * r.w * r.w, 0);
  const s0sq = redundancy > 0 ? vpv / redundancy : 0;
  const corrections: Correction[] = legs.slice(0, -1).map((l, i) => ({ station: l.to, dE: pts[i + 1]!.e - asShot[i + 1]!.e, dN: pts[i + 1]!.n - asShot[i + 1]!.n }));
  const largest = corrections.reduce((m, c) => Math.max(m, Math.hypot(c.dE, c.dN)), 0);
  const side = redundancy === 2 ? (redundancy * s0sq < CHI2_95_R2[0] ? "low" : redundancy * s0sq > CHI2_95_R2[1] ? "high" : null) : null;
  // The stations' standard deviations from the stated precision, scaled up by σ0 only when the observations fit worse than it.
  const scale = side === "high" ? s0sq : 1;
  const stats: LeastSquaresStats = {
    sigma0: Math.sqrt(s0sq),
    redundancy,
    passes: side === null,
    side,
    precision,
    worstDistanceMm: Math.max(0, ...rows.filter((r) => r.kind === "d").map((r) => Math.abs(r.w) * 1000)),
    worstAngleSeconds: Math.max(0, ...rows.filter((r) => r.kind === "a").map((r) => Math.abs(r.w) / rho)),
    stations: legs.slice(0, -1).map((l, i) => ({ station: l.to, sE: Math.sqrt(Math.max(0, scale * inverse[2 * i]![2 * i]!)), sN: Math.sqrt(Math.max(0, scale * inverse[2 * i + 1]![2 * i + 1]!)) })),
  };
  return { ok: true, corrections, largest, stats };
}
