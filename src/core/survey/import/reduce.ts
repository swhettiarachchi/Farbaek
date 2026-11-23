/**
 * Reducing a total station's observations to coordinates (stage 225, ADR 0236): radiation from each occupied station, by tested
 * arithmetic, the same for any format that records stations, backsights and shots (Sokkia SDR first).
 *
 * - A shot's horizontal circle reading is turned into an azimuth with the station's backsight (the azimuth to the backsight point
 *   minus the circle reading there), or is already one when the instrument recorded it corrected.
 * - The slope distance and zenith angle give the horizontal and vertical distances. The horizontal distance is reduced to the grid
 *   with the projection's scale factor at the station and the station's height (`gridScaleFactor`); a local grid's factor is 1.
 * - Heights: the station's, plus the instrument height, plus the vertical distance, minus the target height, when all are known.
 *   Earth curvature and refraction aren't applied: a few millimetres at 200 m, said with the result.
 * - Two or more shots to one point from one setup (face left and right, or repeats) are averaged, and a spread over 2 cm is said.
 * - Nothing is adjusted. A point the file also gives coordinates for, or that is shot again from another station, is a check: the
 *   difference is reported, never spread out (adjusting needs the surveyor's chosen method: survey skill, rule 7).
 * Raw observations stay in the source file as recorded; the computed points carry the line of the shot they came from.
 */
import { deltasFromBearing, normaliseDegrees } from "../angles";
import type { CrsRecord } from "../crs";
import { gridScaleFactor } from "../scale";

export const REDUCTION_ENGINE = "reduce/1.0.0";

/** Shots to one point from one setup further apart than this are said, and averaged anyway. */
export const SPREAD_LIMIT_M = 0.02;
/** A check (a point given in the file, or shot from two stations) closer than this is said as agreeing. */
export const CHECK_LIMIT_M = 0.02;

export interface Setup {
  line: number;
  station: string;
  e: number;
  n: number;
  z: number | null;
  instrumentHeight: number | null;
  /** Degrees added to a circle reading to make it an azimuth, from the backsight; null until one is taken. */
  orientation: number | null;
  backsight: string | null;
}

/** One shot, its angles already in degrees. */
export type Shot =
  /** `orientation` is the setup's backsight orientation when the shot was taken: a later backsight never re-orients earlier shots. */
  | { kind: "polar"; line: number; to: string; code: string | null; targetHeight: number | null; horizontal: number; oriented: boolean; orientation: number | null; zenith: number; slope: number }
  | { kind: "reduced"; line: number; to: string; code: string | null; targetHeight: number | null; azimuth: number; horizontal: number; vertical: number };

export interface ReducedPoint {
  line: number;
  pointId: string;
  e: number;
  n: number;
  z: number | null;
  code: string | null;
  /** The station it was shot from, and how many shots were averaged. */
  from: string;
  shots: number;
  /** The grid scale factor used at that station. */
  scale: number;
}

/** One shot worked out from its setup, or why it can't be. */
export function reduceShot(setup: Setup, shot: Shot, crs: CrsRecord | null): Omit<ReducedPoint, "shots"> | { problem: string } {
  let azimuth: number;
  let ground: number;
  let vertical: number;
  if (shot.kind === "polar") {
    if (!(shot.slope > 0) || !Number.isFinite(shot.slope)) return { problem: `the shot to ${shot.to} has no slope distance` };
    if (!(shot.zenith > 0 && shot.zenith < 180)) return { problem: `the shot to ${shot.to} has a vertical angle that isn't between the zenith and the nadir` };
    if (shot.oriented) azimuth = normaliseDegrees(shot.horizontal);
    else if (shot.orientation === null) return { problem: `station ${setup.station} has no backsight, so its circle readings can't be turned into bearings` };
    else azimuth = normaliseDegrees(shot.horizontal + shot.orientation);
    const z = (shot.zenith * Math.PI) / 180;
    ground = shot.slope * Math.sin(z);
    vertical = shot.slope * Math.cos(z);
  } else {
    if (!(shot.horizontal > 0) || !Number.isFinite(shot.horizontal)) return { problem: `the reduced shot to ${shot.to} has no horizontal distance` };
    azimuth = normaliseDegrees(shot.azimuth);
    ground = shot.horizontal;
    vertical = shot.vertical;
  }
  // A station height no land has (the height factor divides by the earth's radius plus it) is refused, not worked through.
  if (setup.z !== null && Math.abs(setup.z) > 10_000) return { problem: `station ${setup.station}'s height, ${setup.z} m, isn't a height on land` };
  const scale = crs ? gridScaleFactor(crs, setup.e, setup.z) : 1;
  const { dE, dN } = deltasFromBearing(azimuth, ground * scale);
  const z = setup.z !== null && setup.instrumentHeight !== null && shot.targetHeight !== null && Number.isFinite(vertical) ? setup.z + setup.instrumentHeight + vertical - shot.targetHeight : null;
  const e = setup.e + dE;
  const n = setup.n + dN;
  if (!Number.isFinite(e) || !Number.isFinite(n) || (z !== null && !Number.isFinite(z))) return { problem: `the shot to ${shot.to} doesn't work out to finite coordinates` };
  return { line: shot.line, pointId: shot.to, e, n, z, code: shot.code, from: setup.station, scale };
}

/** The shots of one setup, averaged per point: what the setup adds, and what its averaging found. */
export function reduceSetup(setup: Setup, shots: readonly Shot[], crs: CrsRecord | null): { points: ReducedPoint[]; problems: { line: number; message: string }[]; spreads: { pointId: string; spread: number }[] } {
  const problems: { line: number; message: string }[] = [];
  const groups = new Map<string, Omit<ReducedPoint, "shots">[]>();
  for (const shot of shots) {
    const r = reduceShot(setup, shot, crs);
    if ("problem" in r) {
      problems.push({ line: shot.line, message: r.problem });
      continue;
    }
    const group = groups.get(r.pointId);
    if (group) group.push(r);
    else groups.set(r.pointId, [r]);
  }
  const points: ReducedPoint[] = [];
  const spreads: { pointId: string; spread: number }[] = [];
  for (const [pointId, rs] of groups) {
    const mean = (f: (r: Omit<ReducedPoint, "shots">) => number) => rs.reduce((s, r) => s + f(r), 0) / rs.length;
    const e = mean((r) => r.e);
    const n = mean((r) => r.n);
    const zs = rs.map((r) => r.z);
    const z = zs.every((v): v is number => v !== null) ? zs.reduce((s, v) => s + v, 0) / zs.length : null;
    // The largest gap between any two shots to the point: exactly for up to 200 shots; beyond that (no real job shoots one point so
    // often) from the shot farthest from the mean to every other, which finds the same gap in practice and stays quick.
    let spread = 0;
    if (rs.length <= 200) {
      for (let i = 0; i < rs.length; i++) for (let j = i + 1; j < rs.length; j++) spread = Math.max(spread, Math.hypot(rs[i]!.e - rs[j]!.e, rs[i]!.n - rs[j]!.n));
    } else {
      const far = rs.reduce((best, r) => (Math.hypot(r.e - e, r.n - n) > Math.hypot(best.e - e, best.n - n) ? r : best), rs[0]!);
      for (const r of rs) spread = Math.max(spread, Math.hypot(r.e - far.e, r.n - far.n));
    }
    if (rs.length > 1 && spread > SPREAD_LIMIT_M) spreads.push({ pointId, spread });
    // The last shot's line and code: the SDR's rule is that the later record is the one that stands.
    const last = rs[rs.length - 1]!;
    points.push({ line: last.line, pointId, e, n, z, code: last.code ?? rs.find((r) => r.code)?.code ?? null, from: setup.station, shots: rs.length, scale: last.scale });
  }
  return { points, problems, spreads };
}

/** How far apart two positions of one point are, on the plane. */
export const gap = (a: { e: number; n: number }, b: { e: number; n: number }) => Math.hypot(a.e - b.e, a.n - b.n);
