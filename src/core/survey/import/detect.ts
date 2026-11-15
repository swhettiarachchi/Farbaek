/**
 * Which importer a file needs, from its name and its first characters. The
 * person sees the result and can change it; nothing is imported on a guess.
 * Files Farbaek can't read (raw job databases, formats whose layout couldn't
 * be confirmed) are named, with what to export instead.
 */
import { looksLikeFieldBook } from "./fieldbook";
import { looksLikeGsi } from "./gsi";
import { looksLikeJobXml } from "./jobxml";
import { looksLikeLandXml } from "./landxml";
import { looksLikeSdr } from "./sdr";

export type ImportFormat = "delimited" | "geojson" | "gsi" | "sdr" | "landxml" | "jobxml" | "fieldbook";

export const IMPORT_FORMATS: { id: ImportFormat; label: string; extensions: readonly string[]; detail: string }[] = [
  { id: "delimited", label: "Point file (CSV, TXT or DAT)", extensions: [".csv", ".txt", ".dat", ".pnezd", ".penzd", ".xyz", ".asc"], detail: "Point number, coordinates, elevation and code, separated by commas, tabs, semicolons or spaces. PNEZC, as the Survey Department asks, and CASS .dat files included." },
  { id: "geojson", label: "GeoJSON points", extensions: [".geojson", ".json"], detail: "Points with a named EPSG coordinate system. Longitude and latitude can't be used yet." },
  { id: "gsi", label: "Leica GSI (GSI-8 or GSI-16)", extensions: [".gsi"], detail: "Point numbers with easting, northing and height (words 11, 81 to 83) and a remark or code on the same line." },
  { id: "sdr", label: "Sokkia SDR (SDR2x or SDR33)", extensions: [".sdr"], detail: "Coordinate records (08) and stations (02), in metres." },
  { id: "landxml", label: "LandXML", extensions: [".xml", ".landxml"], detail: "CgPoints: northing, easting and elevation, with their names and codes." },
  { id: "jobxml", label: "Trimble JobXML", extensions: [".jxl", ".jobxml"], detail: "The job's final grid coordinates, from its reductions." },
  { id: "fieldbook", label: "Bearings and distances (field book)", extensions: [], detail: "Points worked out from a starting point by whole-circle bearings and horizontal distances, unadjusted; a leg onto a known point is a check." },
];

export function detectFormat(fileName: string, text: string): ImportFormat {
  const lower = fileName.toLowerCase();
  const start = text.replace(/^\uFEFF/, "").trimStart();
  if (lower.endsWith(".geojson") || (lower.endsWith(".json") && !looksLikeJobXml(start))) return "geojson";
  if (start.startsWith("{") && /"type"\s*:\s*"(?:FeatureCollection|Feature)"/.test(start.slice(0, 4000))) return "geojson";
  if (looksLikeFieldBook(text)) return "fieldbook";
  if (looksLikeJobXml(start) || lower.endsWith(".jxl")) return "jobxml";
  if (looksLikeLandXml(start)) return "landxml";
  if (looksLikeSdr(text) || lower.endsWith(".sdr")) return "sdr";
  if (lower.endsWith(".gsi") || looksLikeGsi(text)) return "gsi";
  return "delimited";
}

/** Files Farbaek can't read, with what to export instead; null when the file can be read. */
export function unreadableFile(fileName: string, text: string): string | null {
  const lower = fileName.toLowerCase();
  if (/\.(?:dbx|xcf|x\d\d|scd|smd|raw\.bin)$/.test(lower) || text.includes("\u0000")) return "This is an instrument's own job database, which isn't a text export. Export the points from the instrument or its software as CSV (point, northing, easting, height, code), GSI-16, SDR33, LandXML or JobXML.";
  if (lower.endsWith(".dc") && !looksLikeSdr(text)) return "This is a Trimble DC file, whose layout isn't published. Export the job from Trimble Access as JobXML, or as CSV with the point, northing, easting, elevation and code.";
  const head = text.split(/\r\n|\r|\n/).slice(0, 15).join("\n");
  if (/^(?:JOB|VER|INST|UNITS|STN|XYZ|BS|FS|SS|CTL|HV|SD|HD)\s*,/m.test(head) && !/^\s*[\w.-]+\s*,\s*-?\d/.test(head)) return "This looks like a Topcon GTS-7 job file, whose coordinate layout Farbaek couldn't confirm. Export the points from the instrument or Topcon software as CSV (point, northing, easting, height, code).";
  return null;
}
