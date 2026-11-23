/**
 * Coordinate reference systems a project can be confirmed in (survey skill,
 * rule 3). A CRS is never inferred: the person picks it and confirms it, and
 * the project records who did. Coordinate ranges are used only to check that
 * a claimed CRS is plausible; several Sri Lankan and UTM ranges overlap, so a
 * plausible range proves nothing on its own.
 *
 * Definitions and their sources: docs/survey/STANDARDS_RESEARCH.md.
 * No transformation between systems runs in this stage.
 */
import type { Bounds } from "./geometry";

export type CrsKind = "projected" | "local";

export interface CrsRecord {
  /** Stable id stored on projects: "EPSG:5235", or "LOCAL" for an unreferenced site grid. */
  id: string;
  epsg: number | null;
  name: string;
  kind: CrsKind;
  datum: string;
  projection: string;
  units: "metre";
  /** Easting first, northing second: how Survey Studio stores coordinates. */
  axisOrder: "E,N";
  /** Rough grid extent of the system's area of use, for the plausibility check only. Null for local grids. */
  plausibleRange: Bounds | null;
  /**
   * The Transverse Mercator projection's scale at the central meridian and its false easting, from the definition above. Only to
   * tell a taped ground distance from a grid distance when comparing them (autosurvey/sketch.ts); no coordinate is ever changed with it.
   */
  tm?: { k0: number; falseEasting: number };
  /** Where the definition comes from, and how well it is established. */
  source: string;
  status: "verified_official" | "verified_secondary" | "professional_configuration_required" | "not_verified";
}

export const LOCAL_CRS: CrsRecord = {
  id: "LOCAL",
  epsg: null,
  name: "Local coordinates (not georeferenced)",
  kind: "local",
  datum: "None: a site grid with an arbitrary origin",
  projection: "None",
  units: "metre",
  axisOrder: "E,N",
  plausibleRange: null,
  source: "Chosen by the surveyor. Bearings are then relative to the site grid's own north.",
  status: "professional_configuration_required",
};

export const CRS_REGISTRY: readonly CrsRecord[] = [
  {
    id: "EPSG:5235",
    epsg: 5235,
    name: "SLD99 / Sri Lanka Grid 1999",
    kind: "projected",
    datum: "Sri Lanka Datum 1999, Everest 1830 (1937 Adjustment) ellipsoid (a = 6,377,276.345 m, 1/f = 300.8017)",
    projection: "Transverse Mercator: origin 7.00047152777778° N, 80.7717130833333° E; scale 0.9999238418; false easting and northing 500,000 m",
    units: "metre",
    axisOrder: "E,N",
    // EPSG's easting extent is about 374,654 to 630,461 m; northings are from the skill's summary, padded.
    plausibleRange: { minE: 370_000, minN: 370_000, maxE: 635_000, maxN: 830_000 },
    tm: { k0: 0.9999238418, falseEasting: 500_000 },
    source: "EPSG dataset v13.102 (EPSG:5235), read on epsg.io 2026-11-15; agrees with a 2007 Survey Department thesis",
    status: "verified_secondary",
  },
  {
    id: "EPSG:5234",
    epsg: 5234,
    name: "Kandawala / Sri Lanka Grid",
    kind: "projected",
    datum: "Kandawala, Everest 1830 (1937 Adjustment) ellipsoid (a = 6,377,276.345 m, 1/f = 300.8017)",
    projection: "Transverse Mercator: origin 7.00048027777778° N, 80.7717111111111° E; scale 0.9999238418; false easting and northing 200,000 m",
    units: "metre",
    axisOrder: "E,N",
    // EPSG's easting extent is about 74,454 to 330,261 m: no overlap with SLD99 eastings. Northings overlap.
    plausibleRange: { minE: 70_000, minN: 70_000, maxE: 335_000, maxN: 530_000 },
    tm: { k0: 0.9999238418, falseEasting: 200_000 },
    source: "EPSG dataset v13.102 (EPSG:5234), read on epsg.io 2026-11-15",
    status: "verified_secondary",
  },
  {
    id: "EPSG:32644",
    epsg: 32644,
    name: "WGS 84 / UTM zone 44N",
    kind: "projected",
    datum: "World Geodetic System 1984 ensemble (about 2 m)",
    projection: "Transverse Mercator (UTM zone 44N)",
    units: "metre",
    axisOrder: "E,N",
    plausibleRange: { minE: 160_000, minN: 0, maxE: 840_000, maxN: 9_400_000 },
    // Every UTM zone: scale 0.9996 at the central meridian, false easting 500,000 m.
    tm: { k0: 0.9996, falseEasting: 500_000 },
    source: "EPSG Geodetic Parameter Dataset, EPSG:32644 (standard UTM zone 44N). The plausible range is Farbaek's own broad box for the zone, only for questioning a choice.",
    status: "verified_secondary",
  },
];

export function crsById(id: string | null | undefined): CrsRecord | null {
  if (!id) return null;
  if (id === LOCAL_CRS.id) return LOCAL_CRS;
  return CRS_REGISTRY.find((c) => c.id === id) ?? null;
}

/** How many of the points fall outside the CRS's plausible range. Zero proves nothing; many suggests the wrong CRS or swapped axes. */
export function implausiblePoints(points: readonly { e: number; n: number }[], crs: CrsRecord): number {
  const r = crs.plausibleRange;
  if (!r) return 0;
  return points.filter((p) => p.e < r.minE || p.e > r.maxE || p.n < r.minN || p.n > r.maxN).length;
}

/** Would the points sit in range if easting and northing were swapped? A common import mistake, reported, never fixed silently. */
export function looksSwapped(points: readonly { e: number; n: number }[], crs: CrsRecord): boolean {
  const r = crs.plausibleRange;
  if (!r || points.length === 0) return false;
  const swapped = points.map((p) => ({ e: p.n, n: p.e }));
  return implausiblePoints(points, crs) === points.length && implausiblePoints(swapped, crs) === 0;
}
