/**
 * A traverse in a total station job, its closure and, only when the surveyor chooses a rule, its adjustment (stage 231, ADR 0241).
 * Format-independent: the reader records each occupied station, every shot it reduced and which coordinate records are control,
 * and this finds the traverse in them.
 *
 * - **A traverse station** got its coordinates from an earlier station's shot: set up with none in its record (ADR 0236), or with the
 *   ones the instrument carried forward from that shot, within 5 mm plus 300 ppm of the shot's length (the instrument and Farbaek
 *   reduce to the grid separately). A station the file keys in, or that no earlier shot reached, is control and never moves.
 * - **The closure** is a shot from a traverse station to control: a point the file keys in (or takes from a control job, a resection,
 *   RTK or outside), or a control station such as the start of a loop. A shot back to the station it was set up from re-measures that
 *   leg and isn't a closure, and a loop needs three stations. The traverse through the most stations is reported, closing on its own
 *   start when that ties; any other closure is a check like any other.
 * - **The adjustment** spreads that misclosure by the chosen rule (`adjustRun`). Each traverse station moves by its correction, a
 *   station branching off it moves with it, and every point shot from a station moves with that station: their observations from it
 *   are unchanged. Control, the closing point and heights don't move.
 */
import { ADJUST_ENGINE, ADJUST_NAMES, type AdjustMethod, adjustRun, type Correction, DEFAULT_PRECISION, type InstrumentPrecision, precisionText, type RunLeg, weighedBy } from "../adjust";
import type { ImportIssue } from "./delimited";
import { gap } from "./reduce";

/** A coordinate record within this of Farbaek's own reduction of the shot it follows, plus `CARRIED_PER_M` of the shot's length, was carried from it. */
export const CARRIED_BASE_M = 0.005;
export const CARRIED_PER_M = 0.0003;
/** A misclosure or a move under this is said as "within half a millimetre": the file's own rounding, not a measurement. */
export const HALF_MM = 0.0005;
/** Sokkia's derivation codes for coordinates an instrument computed from its own observations: topography, traverse, corrected measurement. */
export const COMPUTED_DERIVATIONS: ReadonlySet<string> = new Set(["TP", "TV", "MC"]);
/** Sokkia's derivation codes for control: keyed in, from a control job, externally derived, RTK, a resection. */
export const CONTROL_DERIVATIONS: ReadonlySet<string> = new Set(["KI", "CJ", "XD", "RK", "RE"]);
/** What the import keeps of a long traverse: its settings hold 8 KB, so the stations named and their corrections are capped. */
export const KEPT_STATIONS = 40;

/** An occupied station, at its first setup: where it stood, and the station whose shot gave it those coordinates (null for control). */
export interface StationRecord {
  e: number;
  n: number;
  line: number;
  from: string | null;
}

/** A position with the line it was recorded on. */
export interface At {
  e: number;
  n: number;
  line: number;
}
/** A shot's reduced position, with the station it was shot from. */
export interface ShotAt extends At {
  from: string;
}

export interface TraverseClosure {
  start: string;
  /** The traverse's stations after the start, up to `KEPT_STATIONS` of them; `stations` counts them all. */
  through: string[];
  stations: number;
  closesOn: string;
  /** The traverse's length, metres, closing leg included. */
  length: number;
  /** Where the traverse's computed end falls from the closing point (computed minus known), metres. */
  misclosure: { dE: number; dN: number; linear: number };
  /** 1 : length ÷ misclosure, or null when it closes exactly. */
  precision: number | null;
  /** The rule the surveyor chose, and what it did (corrections to 0.1 mm, the first `KEPT_STATIONS`); null when the points are as shot. */
  adjusted: { method: AdjustMethod; engine: string; largest: number; corrections: Correction[]; stats?: { sigma0: number; passes: boolean; side?: "low" | "high" | null; precision: InstrumentPrecision } } | null;
}

/** How far a carried record may sit from Farbaek's reduction of the shot: 5 mm plus 300 ppm of the shot's length from its station. */
export function carriedTolerance(shot: ShotAt, station: { e: number; n: number } | undefined): number {
  return CARRIED_BASE_M + CARRIED_PER_M * (station ? gap(shot, station) : 0);
}

/** The shot a coordinate record was carried from: the last shot to the point before the record, when the record sits within tolerance of it. */
export function carriedShot(record: At, shots: readonly ShotAt[] | undefined, stations: ReadonlyMap<string, StationRecord>): ShotAt | null {
  let last: ShotAt | null = null;
  for (const s of shots ?? []) if (s.line < record.line && (!last || s.line > last.line)) last = s;
  return last && gap(record, last) <= carriedTolerance(last, stations.get(last.from)) ? last : null;
}

// Signed to the millimetre, as said: a value that rounds to nothing has no sign.
const signed = (v: number) => {
  const r = Math.round(v * 1000) / 1000;
  return `${r > 0 ? "+" : r < 0 ? "-" : ""}${Math.abs(r).toFixed(3)} m`;
};
const names = (ids: readonly string[]) => (ids.length <= 6 ? (ids.length === 1 ? ids[0]! : `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}`) : `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more`);
const tenth = (v: number) => Math.round(v * 10_000) / 10_000;

export type ClosureResult =
  | {
      ok: true;
      closure: TraverseClosure | null;
      /** The point the traverse closes on, whose check the closure reports. */
      closesOn: string | null;
      issues: ImportIssue[];
      /**
       * Where a point ends up. A station is given at its setup position; any other point with the station it was shot (or carried)
       * from, or null for one that doesn't move with a station. Unchanged unless the traverse was adjusted.
       */
      place: (pointId: string, at: { e: number; n: number }, from: string | null) => { e: number; n: number };
    }
  | { ok: false; issue: ImportIssue };

/**
 * Finds the traverse that closes, reports its closure, and when `method` is given, adjusts it. A method with nothing to adjust, or one
 * that doesn't apply, is refused rather than ignored: the surveyor asked for it.
 */
export function closeTraverse(
  stations: ReadonlyMap<string, StationRecord>,
  control: ReadonlyMap<string, At>,
  shots: ReadonlyMap<string, readonly ShotAt[]>,
  method: AdjustMethod | null,
  instrument: InstrumentPrecision | null = null,
): ClosureResult {
  // The stations from the control one the traverse starts at to `last`, or null when the chain doesn't reach control.
  const chain = (last: string): string[] | null => {
    const path = [last];
    const seen = new Set(path);
    let st = stations.get(last);
    while (st && st.from !== null) {
      if (seen.has(st.from)) return null;
      seen.add(st.from);
      path.unshift(st.from);
      st = stations.get(st.from);
    }
    return st ? path : null;
  };

  let best: { path: string[]; closesOn: string; shot: ShotAt; known: At } | null = null;
  const better = (a: NonNullable<typeof best>, b: typeof best) =>
    !b || a.path.length > b.path.length || (a.path.length === b.path.length && (Number(a.closesOn === a.path[0]) - Number(b.closesOn === b.path[0]) || a.shot.line - b.shot.line) > 0);
  for (const [id, known] of control) {
    for (const shot of shots.get(id) ?? []) {
      const from = stations.get(shot.from);
      // A shot back to the station this one was set up from re-measures the leg: a check, not a closure.
      if (!from || from.from === null || from.from === id) continue;
      const path = chain(shot.from);
      if (!path || path.length < 2 || (path[0] === id && path.length < 3)) continue;
      const c = { path, closesOn: id, shot, known };
      if (better(c, best)) best = c;
    }
  }

  const unchanged = { ok: true as const, closure: null, closesOn: null, issues: [], place: (_: string, at: { e: number; n: number }) => at };
  if (!best) {
    if (method) return { ok: false, issue: { code: "TRAVERSE_NOT_ADJUSTED", severity: "error", line: null, message: `You chose to adjust by ${ADJUST_NAMES[method]}, and this job has no traverse that closes on a point with known coordinates, so there's nothing to adjust. Keep the points as shot.` } };
    return unchanged;
  }

  const { path, closesOn, shot, known } = best;
  const at = (id: string) => stations.get(id)!;
  const legs: RunLeg[] = path.slice(1).map((id, i) => ({ to: id, dE: at(id).e - at(path[i]!).e, dN: at(id).n - at(path[i]!).n }));
  const last = at(path.at(-1)!);
  legs.push({ to: closesOn, dE: shot.e - last.e, dN: shot.n - last.n });
  const length = legs.reduce((s, l) => s + Math.hypot(l.dE, l.dN), 0);
  const dE = shot.e - known.e;
  const dN = shot.n - known.n;
  const linear = Math.hypot(dE, dN);
  const precision = linear < 1e-9 ? null : length / linear;
  const closure: TraverseClosure = { start: path[0]!, through: path.slice(1, 1 + KEPT_STATIONS), stations: path.length - 1, closesOn, length, misclosure: { dE, dN, linear }, precision, adjusted: null };
  const route = `The traverse from station ${path[0]} through ${names(path.slice(1))} closes on point ${closesOn}`;
  const miss = linear < HALF_MM ? `within half a millimetre over ${length.toFixed(2)} m` : `${linear.toFixed(3)} m out (easting ${signed(dE)}, northing ${signed(dN)}) over ${length.toFixed(2)} m, ${precisionText(precision)}`;

  if (!method) return { ...unchanged, closure, closesOn, issues: [{ code: "TRAVERSE_CLOSURE", severity: "warning", line: shot.line, message: `${route} ${miss}. Nothing was adjusted.` }] };
  const r = adjustRun(legs, { dE, dN }, method, instrument ?? DEFAULT_PRECISION);
  if (!r.ok) return { ok: false, issue: { code: "TRAVERSE_NOT_ADJUSTED", severity: "error", line: shot.line, message: `${route} ${miss}, and it can't be adjusted by ${ADJUST_NAMES[method]}: ${r.problem}` } };

  const own = new Map(r.corrections.map((c) => [c.station, c]));
  const memo = new Map<string, { dE: number; dN: number }>();
  // A station's correction: its own on the traverse, its parent's for one branching off it, none for control.
  const correction = (id: string, seen = new Set<string>()): { dE: number; dN: number } => {
    const hit = own.get(id) ?? memo.get(id);
    if (hit) return hit;
    const st = stations.get(id);
    const c = !st || st.from === null || seen.has(id) ? { dE: 0, dN: 0 } : correction(st.from, seen.add(id));
    memo.set(id, c);
    return c;
  };
  const place = (pointId: string, p: { e: number; n: number }, from: string | null) => {
    const st = stations.get(pointId);
    if (st) {
      if (st.from === null) return p;
      const c = correction(pointId);
      return { e: st.e + c.dE, n: st.n + c.dN };
    }
    if (from === null) return p;
    const c = correction(from);
    return { e: p.e + c.dE, n: p.n + c.dN };
  };
  // How far any station moved, branches included: a station is given at its setup position as shot, so this is its correction.
  let moved = 0;
  for (const [id, st] of stations) if (st.from !== null) moved = Math.max(moved, Math.hypot(correction(id).dE, correction(id).dN));
  closure.adjusted = {
    method,
    engine: ADJUST_ENGINE,
    largest: moved,
    corrections: r.corrections.slice(0, KEPT_STATIONS).map((c) => ({ station: c.station, dE: tenth(c.dE), dN: tenth(c.dN) })),
    ...(r.stats ? { stats: { sigma0: Math.round(r.stats.sigma0 * 1000) / 1000, passes: r.stats.passes, side: r.stats.side, precision: r.stats.precision } } : {}),
  };
  const said0 = moved < HALF_MM ? `Adjusted by ${ADJUST_NAMES[method]}, as you chose: no station moved by as much as half a millimetre.` : `Adjusted by ${ADJUST_NAMES[method]}, as you chose: the stations moved by up to ${moved.toFixed(3)} m, and the points shot from each station moved with it.`;
  // Least squares (ADR 0274) says what it weighed by and how well the observations fit, so its result is never taken on trust.
  const s = r.stats;
  const worstSd = s ? Math.max(0, ...s.stations.map((x) => Math.hypot(x.sE, x.sN))) : 0;
  const fit = s
    ? ` Weighted for ${weighedBy(s.precision)}: σ0 is ${s.sigma0.toFixed(2)}, ${
        s.side === null
          ? "which passes the χ² test at 95%, so the misclosure is what that precision leads one to expect"
          : s.side === "high"
            ? "above the χ² test's range at 95%, so the misclosure is more than that precision leads one to expect: check the observations, or the precision"
            : "below the χ² test's range at 95%, so the observations agree better than that precision leads one to expect, as when the instrument already adjusted them or the closure is within rounding"
      }. The largest residuals are ${s.worstDistanceMm.toFixed(1)} mm on a distance and ${s.worstAngleSeconds.toFixed(1)}″ on an angle, and the least certain station has a standard deviation of ${(worstSd * 1000).toFixed(1)} mm${s.side === "high" ? ", scaled by σ0" : ", from the stated precision"}.`
    : "";
  const said = said0 + fit;
  return {
    ok: true,
    closure,
    closesOn,
    place,
    issues: [{ code: "TRAVERSE_CLOSURE", severity: "warning", line: shot.line, message: `${route} ${miss}. ${said} ${method === "least_squares" ? "Angles and distances were adjusted together; heights weren't adjusted." : "Angles weren't balanced first, since the angular misclosure isn't worked out, and heights weren't adjusted."}` }],
  };
}
