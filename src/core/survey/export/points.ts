/**
 * Point and parcel exports that keep the coordinate system with the data.
 *
 * CSV: point, easting, northing, elevation, code (a PENZD order), full stored
 * precision, with the CRS in the file name the server gives it.
 *
 * GeoJSON: RFC 7946 allows only WGS 84 longitude and latitude, which these
 * grid coordinates are not. So the file keeps the grid coordinates and names
 * its CRS with the older "crs" member, which QGIS and GDAL read. It says so
 * in its properties; a tool that insists on RFC 7946 must reproject it.
 */
import type { CrsRecord } from "../crs";
import type { ParcelResult, SurveyPoint } from "../parcel";
import { SURVEY_ENGINE_VERSION } from "../version";

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** A spreadsheet opening a cell that starts with = + - @ would run it as a formula: such text gets a leading apostrophe. */
function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

export function pointsCsv(points: readonly SurveyPoint[]): string {
  const rows = ["point,easting,northing,elevation,code"];
  for (const p of points) {
    rows.push([csvCell(safeText(p.pointId)), String(p.e), String(p.n), p.z === null ? "" : String(p.z), csvCell(safeText(p.code ?? ""))].join(","));
  }
  return `${rows.join("\r\n")}\r\n`;
}

export function surveyGeoJson(input: { points: readonly SurveyPoint[]; parcel: ParcelResult | null; crs: CrsRecord | null; projectName: string; lot: string }): string {
  const { crs, parcel } = input;
  const features: unknown[] = input.points.map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: p.z === null ? [p.e, p.n] : [p.e, p.n, p.z] },
    properties: { point: p.pointId, code: p.code, kind: "survey_point" },
  }));
  if (parcel && parcel.vertices.length >= 3 && parcel.crossings.length === 0) {
    const ring = parcel.vertices.map((v) => [v.e, v.n]);
    // GeoJSON polygons repeat the first position at the end, and run anticlockwise for exterior rings (RFC 7946 §3.1.6).
    const ccw = parcel.clockwise ? [...ring].reverse() : ring;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...ccw, ccw[0]]] },
      properties: { kind: "parcel", lot: input.lot || null, area_m2: parcel.areaM2, perimeter_m: parcel.perimeterM, area_method: parcel.method, engine: parcel.engine },
    });
  }
  const doc = {
    type: "FeatureCollection",
    name: input.projectName,
    ...(crs?.epsg ? { crs: { type: "name", properties: { name: `urn:ogc:def:crs:EPSG::${crs.epsg}` } } } : {}),
    farbaek: {
      coordinate_system: crs ? crs.name : "not set",
      note: crs?.epsg ? "Grid coordinates in metres, named by the crs member (not RFC 7946 longitude and latitude)." : "Local or unset coordinates in metres; no coordinate system is named.",
      engine: SURVEY_ENGINE_VERSION,
    },
    features,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
