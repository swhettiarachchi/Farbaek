/**
 * GeoJSON points. RFC 7946 GeoJSON is WGS 84 longitude and latitude, in
 * degrees: those can't be used for a planar plan until a verified transform
 * exists (a later stage), so such a file is refused with that reason rather
 * than drawn wrongly. A file written with the older named "crs" member (as
 * QGIS and GDAL can) that names an EPSG code is read as that code's
 * coordinates; the person still confirms the CRS when they import.
 */
import type { ImportIssue, ImportedPoint } from "./delimited";
import { IMPORT_LIMITS } from "./delimited";

export interface GeoJsonResult {
  points: ImportedPoint[];
  issues: ImportIssue[];
  /** The EPSG code the file's "crs" member names, or null for RFC 7946 (WGS 84 degrees). */
  namedEpsg: number | null;
}

const EPSG_NAME = /^(?:urn:ogc:def:crs:EPSG::|EPSG:)(\d{4,6})$/i;

function fail(message: string): GeoJsonResult {
  return { points: [], issues: [{ code: "NOT_TEXT", severity: "error", line: null, message }], namedEpsg: null };
}

export function parseGeoJsonPoints(text: string): GeoJsonResult {
  if (new TextEncoder().encode(text).length > IMPORT_LIMITS.maxBytes) return fail(`The file is over ${IMPORT_LIMITS.maxBytes / 1024 / 1024} MB.`);
  let doc: unknown;
  try {
    doc = JSON.parse(text.replace(/^﻿/, ""));
  } catch {
    return fail("This isn't valid GeoJSON: it doesn't read as JSON.");
  }
  if (!doc || typeof doc !== "object") return fail("This isn't valid GeoJSON.");
  const root = doc as { type?: unknown; features?: unknown; crs?: { properties?: { name?: unknown } } };
  const name = root.crs?.properties?.name;
  const m = typeof name === "string" ? EPSG_NAME.exec(name.trim()) : null;
  const namedEpsg = m ? Number(m[1]) : null;
  if (namedEpsg === null || namedEpsg === 4326) {
    return fail("This GeoJSON is in WGS 84 longitude and latitude (the GeoJSON standard). Plans need projected grid coordinates in metres, and Farbaek doesn't transform coordinates yet. Export the points from your GIS in your survey grid as CSV, and import that.");
  }
  const features = root.type === "FeatureCollection" && Array.isArray(root.features) ? root.features : root.type === "Feature" ? [root] : null;
  if (!features) return fail("This GeoJSON has no features to import.");
  if (features.length > IMPORT_LIMITS.maxRows) return fail(`The file has ${features.length} features; the limit is ${IMPORT_LIMITS.maxRows}.`);
  const points: ImportedPoint[] = [];
  const issues: ImportIssue[] = [];
  const seen = new Set<string>();
  features.forEach((f, i) => {
    const feature = f as { geometry?: { type?: unknown; coordinates?: unknown }; properties?: Record<string, unknown> | null };
    const line = i + 1;
    const g = feature.geometry;
    if (!g || g.type !== "Point" || !Array.isArray(g.coordinates)) {
      issues.push({ code: "MISSING_COORDINATE", severity: "warning", line, message: `Feature ${line} isn't a point, so it was left out.` });
      return;
    }
    const [e, n, z] = g.coordinates as unknown[];
    if (typeof e !== "number" || typeof n !== "number" || !Number.isFinite(e) || !Number.isFinite(n)) {
      issues.push({ code: "NOT_A_NUMBER", severity: "error", line, message: `Feature ${line} has coordinates that aren't numbers.` });
      return;
    }
    const props = feature.properties ?? {};
    const rawId = props.point ?? props.Point ?? props.name ?? props.id ?? props.PNT ?? null;
    const pointId = rawId === null || rawId === undefined ? String(line) : String(rawId).trim().slice(0, IMPORT_LIMITS.maxPointIdLength);
    if (seen.has(pointId)) {
      issues.push({ code: "DUPLICATE_POINT_CONFLICT", severity: "error", line, message: `Feature ${line}: point ${pointId} is named twice. Rename one in the file.` });
      return;
    }
    seen.add(pointId);
    const rawCode = props.code ?? props.description ?? props.desc ?? null;
    points.push({ line, pointId, e, n, z: typeof z === "number" && Number.isFinite(z) ? z : null, code: rawCode === null ? null : String(rawCode).slice(0, IMPORT_LIMITS.maxCodeLength) });
  });
  return { points, issues, namedEpsg };
}
