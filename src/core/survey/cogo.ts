/**
 * Coordinate geometry a reviewer checks by hand (stage 192): the inverse
 * between any two points, the COGO "inverse" every survey CAD tool has.
 * Grid figures from the points as imported: whole-circle bearing from grid
 * north, horizontal grid distance, and the coordinate and height differences.
 * No scale factor is applied, as on the sheet.
 */
import { bearingFromDeltas } from "./angles";
import type { SurveyPoint } from "./parcel";

export interface Inverse {
  /** Whole-circle bearing, degrees clockwise from grid north; null when the points coincide. */
  bearing: number | null;
  distanceM: number;
  dE: number;
  dN: number;
  /** Height difference, or null when either point has no elevation. */
  dZ: number | null;
}

export function inverse(a: SurveyPoint, b: SurveyPoint): Inverse {
  const dE = b.e - a.e;
  const dN = b.n - a.n;
  return { bearing: bearingFromDeltas(dE, dN), distanceM: Math.hypot(dE, dN), dE, dN, dZ: a.z === null || b.z === null ? null : b.z - a.z };
}
