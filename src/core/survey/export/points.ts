/**
 * Point and parcel exports that keep the coordinate system with the data.
 *
 * CSV: point, easting, northing, elevation, code (a PENZD order), full stored
 * precision. A CSV can't name its coordinate system: the project's PDF, DXF and
 * GeoJSON do.
 *
 * GeoJSON: RFC 7946 allows only WGS 84 longitude and latitude, which these
 * grid coordinates are not. So the file keeps the grid coordinates and names
 * its CRS with the older "crs" member, which QGIS and GDAL read. It says so
 * in its properties; a tool that insists on RFC 7946 must reproject it.
 */
import type { CrsRecord } from "../crs";
import type { PlanLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { SURVEY_ENGINE_VERSION } from "../version";

function csvCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * A spreadsheet opening a cell that starts with = + - @ would run it as a formula: such text gets a leading
 * apostrophe. A plain number such as -1 can't run, and stays exactly as it is, so point numbers survive a round trip.
 */
function safeText(s: string): string {
  return /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
}

export function pointsCsv(points: readonly SurveyPoint[]): string {
  const rows = ["point,easting,northing,elevation,code"];
  for (const p of points) {
    rows.push([csvCell(safeText(p.pointId)), String(p.e), String(p.n), p.z === null ? "" : String(p.z), csvCell(safeText(p.code ?? ""))].join(","));
  }
  return `${rows.join("\r\n")}\r\n`;
}

export function surveyGeoJson(input: { points: readonly SurveyPoint[]; lots: PlanLots; crs: CrsRecord | null; crsConfirmed: boolean; status: string; projectName: string }): string {
  const { crs } = input;
  const features: unknown[] = input.points.map((p) => ({
    type: "Feature",
    geometry: { type: "Point", coordinates: p.z === null ? [p.e, p.n] : [p.e, p.n, p.z] },
    properties: { point: p.pointId, code: p.code, kind: "survey_point" },
  }));
  for (const r of input.lots.lots) {
    const parcel = r.parcel;
    if (!parcel || parcel.vertices.length < 3 || parcel.crossings.length > 0) continue;
    const ring = parcel.vertices.map((v) => [v.e, v.n]);
    // GeoJSON polygons repeat the first position at the end, and run anticlockwise for exterior rings (RFC 7946 §3.1.6).
    const ccw = parcel.clockwise ? [...ring].reverse() : ring;
    features.push({
      type: "Feature",
      geometry: { type: "Polygon", coordinates: [[...ccw, ccw[0]]] },
      properties: { kind: "parcel", lot: `${r.lot.label}${r.lot.sup}`, note: r.lot.note || null, area_m2: parcel.areaM2, perimeter_m: parcel.perimeterM, area_method: parcel.method, engine: parcel.engine },
    });
  }
  const doc = {
    type: "FeatureCollection",
    name: input.projectName,
    ...(crs?.epsg ? { crs: { type: "name", properties: { name: `urn:ogc:def:crs:EPSG::${crs.epsg}` } } } : {}),
    farbaek: {
      coordinate_system: crs ? crs.name : "not set",
      coordinate_system_confirmed: input.crsConfirmed,
      status: input.status,
      note: crs?.epsg ? "Grid coordinates in metres, named by the crs member (not RFC 7946 longitude and latitude)." : "Local or unset coordinates in metres; no coordinate system is named.",
      engine: SURVEY_ENGINE_VERSION,
    },
    features,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}
