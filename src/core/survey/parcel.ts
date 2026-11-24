/**
 * A parcel from its boundary points, in order: the legs (bearing and distance),
 * the area by the coordinate method, the perimeter, and the ring checks.
 * Every figure is computed from the imported coordinates at full precision;
 * rounding happens only where a figure is shown (survey skill, rule 10).
 */
import { bearingFromDeltas } from "./angles";
import type { ArcRun } from "./arcs";
import { area, centroid, distance, interiorAngles, isClockwise, perimeter, selfIntersections, signedArea, zeroLengthLegs, type Point } from "./geometry";
import { lotCurves, type LotCurve } from "./lotcurves";
import { SURVEY_ENGINE_VERSION } from "./version";

export interface SurveyPoint extends Point {
  /** The stored point's id (database row), stable across versions. */
  id: string;
  /** The point number as written in the field data. */
  pointId: string;
  z: number | null;
  code: string | null;
}

export interface Leg {
  from: SurveyPoint;
  to: SurveyPoint;
  /** Whole-circle bearing, degrees clockwise from grid north. Null for a zero-length leg. */
  bearing: number | null;
  /** Horizontal grid distance, metres. */
  distance: number;
}

export interface ParcelResult {
  vertices: SurveyPoint[];
  legs: Leg[];
  /** Grid area by the coordinate method, m², with any curves' segments (ADR 0276). Meaningful only when the ring is simple. */
  areaM2: number;
  perimeterM: number;
  clockwise: boolean;
  /** Index pairs of legs that cross or touch. */
  crossings: [number, number][];
  /** Indexes of legs shorter than half a millimetre (TOUCH_TOLERANCE_M). */
  zeroLegs: number[];
  /** Point numbers named more than once in the ring. */
  repeatedPoints: string[];
  interiorAngles: number[];
  labelAt: Point;
  /** Its curved legs (ADR 0276), and runs given as curves that aren't one, with why: those stay straight. */
  curves: LotCurve[];
  curveProblems: { run: ArcRun; problem: string }[];
  method: "coordinate (shoelace) method on grid coordinates" | "coordinate (shoelace) method on grid coordinates, with the circular segments of its curves";
  engine: typeof SURVEY_ENGINE_VERSION;
}

/**
 * Builds the parcel from the boundary's point ids, in the order the surveyor
 * gave. Ids that aren't in the point list are returned as missing; nothing
 * is skipped silently or reordered.
 */
export function computeParcel(points: readonly SurveyPoint[], boundary: readonly string[], arcs?: readonly ArcRun[]): { ok: true; parcel: ParcelResult } | { ok: false; missing: string[] } {
  const byId = new Map(points.map((p) => [p.id, p]));
  const missing = boundary.filter((id) => !byId.has(id));
  if (missing.length > 0) return { ok: false, missing };
  const vertices = boundary.map((id) => byId.get(id)!);
  const counts = new Map<string, number>();
  for (const v of vertices) counts.set(v.id, (counts.get(v.id) ?? 0) + 1);
  const repeatedPoints = vertices.filter((v, i) => (counts.get(v.id) ?? 0) > 1 && vertices.findIndex((w) => w.id === v.id) === i).map((v) => v.pointId);
  const legs: Leg[] = vertices.map((from, i) => {
    const to = vertices[(i + 1) % vertices.length]!;
    return { from, to, bearing: bearingFromDeltas(to.e - from.e, to.n - from.n), distance: distance(from, to) };
  });
  // Curves (ADR 0276): the area inside each arc rather than its straight legs, and its length along the arc in the perimeter.
  const { curves, problems: curveProblems } = lotCurves(vertices, arcs);
  const extra = curves.reduce((s, c) => s + c.extraM2, 0);
  const alongArcs = curves.reduce((s, c) => s + c.arcLength - c.segments.reduce((t, x) => t + legs[x.leg]!.distance, 0), 0);
  return {
    ok: true,
    parcel: {
      vertices,
      legs: vertices.length >= 2 ? legs : [],
      areaM2: vertices.length >= 3 ? area(vertices) + extra : 0,
      perimeterM: vertices.length >= 2 ? perimeter(vertices) + alongArcs : 0,
      clockwise: vertices.length >= 3 ? signedArea(vertices) < 0 && isClockwise(vertices) : false,
      crossings: selfIntersections(vertices),
      zeroLegs: zeroLengthLegs(vertices),
      repeatedPoints,
      interiorAngles: vertices.length >= 3 ? interiorAngles(vertices) : [],
      labelAt: centroid(vertices),
      curves,
      curveProblems,
      method: curves.length > 0 ? "coordinate (shoelace) method on grid coordinates, with the circular segments of its curves" : "coordinate (shoelace) method on grid coordinates",
      engine: SURVEY_ENGINE_VERSION,
    },
  };
}
