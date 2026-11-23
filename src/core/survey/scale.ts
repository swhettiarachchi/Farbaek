/**
 * The grid scale factor (stage 223, shared from stage 225): what a horizontal distance on the ground is multiplied by to give the
 * distance on a transverse Mercator grid, from the projection's point scale where the line is and the land's height. Used to reduce
 * measured distances to the grid (observations) and to compare written distances with grid ones (sketches). A local grid has no
 * projection, so its factor is 1.
 *
 * k = k0 (1 + x² / 2R²) for a point x metres from the central meridian, and R / (R + h) for a height h: the standard first-order
 * forms, good to well under 1 mm per kilometre within a Sri Lankan grid's extent. R is the Everest 1830 ellipsoid's mean radius,
 * rounded; heights are taken as the points give them.
 */
import type { CrsRecord } from "./crs";

export const EARTH_RADIUS_M = 6_377_000;

export function gridScaleFactor(crs: CrsRecord, e: number, heightM: number | null): number {
  if (!crs.tm) return 1;
  const x = (e - crs.tm.falseEasting) / crs.tm.k0;
  const pointScale = crs.tm.k0 * (1 + (x * x) / (2 * EARTH_RADIUS_M * EARTH_RADIUS_M));
  return pointScale * (EARTH_RADIUS_M / (EARTH_RADIUS_M + (heightM ?? 0)));
}
