/**
 * Which importer a file needs, from its name and its first characters. The
 * person sees the result and can change it; nothing is imported on a guess.
 */
export type ImportFormat = "delimited" | "geojson";

export const IMPORT_FORMATS: { id: ImportFormat; label: string; extensions: readonly string[]; detail: string }[] = [
  { id: "delimited", label: "Point file (CSV or TXT)", extensions: [".csv", ".txt", ".pnezd", ".penzd", ".xyz", ".asc"], detail: "Point number, coordinates, elevation and code, separated by commas, tabs, semicolons or spaces." },
  { id: "geojson", label: "GeoJSON points", extensions: [".geojson", ".json"], detail: "Points with a named EPSG coordinate system. Longitude and latitude can't be used yet." },
];

export function detectFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".geojson") || lower.endsWith(".json")) return "geojson";
  const start = text.replace(/^﻿/, "").trimStart();
  if (start.startsWith("{") && /"type"\s*:\s*"(?:FeatureCollection|Feature)"/.test(start.slice(0, 4000))) return "geojson";
  return "delimited";
}
