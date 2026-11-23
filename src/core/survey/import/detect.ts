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
  { id: "gsi", label: "Leica GSI (GSI-8 or GSI-16)", extensions: [".gsi"], detail: "Point numbers with easting, northing and height (words 11, 81 to 83) and a remark or code, and stations with their shots, worked out by radiation from each station." },
  { id: "sdr", label: "Sokkia SDR (SDR2x or SDR33)", extensions: [".sdr"], detail: "Coordinate records (08), stations (02) and the instrument's observations (09, 11), in metres. Observations are worked out by radiation, and a traverse that closes can be adjusted by the rule you choose." },
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
  // Topcon GTS-7: its "GTS-7" version record, or a GTS-7 keyword padded to 8 columns with the comma in column 9. A CSV whose rows start
  // with STN or HD has its comma right after the word, so it isn't one.
  const first = text.slice(0, 4000).replace(/^[\ufeff\u0002]+/, "").split(/\r\n|\r|\n/).find((l) => l.trim() !== "") ?? "";
  if (/^\s*GTS-7/i.test(first) || (first[8] === "," && /^(?:JOB|VER|INST|UNITS|STN|XYZ|BS|FS|SS|CTL|HV|SD|HD|SCALE|ATMOS|NOTE) *$/.test(first.slice(0, 8)))) return "This looks like a Topcon GTS-7 job file, whose coordinate layout Farbaek couldn't confirm. Export the points from the instrument or Topcon software as CSV (point, northing, easting, height, code).";
  // A printout (stage 198): text laid out for printing, with headings above a table, not one point a line. The SDR, XML and JSON
  // readers know their own files, so only a file that would otherwise go to the point-file reader can be one.
  const printout = printoutSource(text);
  if (printout && !looksLikeSdr(text) && !/^[<{]/.test(text.replace(/^[﻿\u0002]+/, "").trimStart())) {
    if (printout.kind === "sokkia") return sokkiaPrintoutMessage(printout);
    if (detectFormat(fileName, text) === "delimited") {
      const shown = printout.labels.slice(0, 3).join(", ");
      return `This file starts with headings (${shown}), not points, so it looks like a printed report. Upload the instrument's job file or a points file instead. If the points follow the headings, delete the heading lines and upload it again.`;
    }
  }
  return null;
}

/** What a printout says about the job it was printed from (stage 198). */
export interface PrintoutSource {
  /** Sokkia Link's printout of an SDR job, or another report that starts with headings and values. */
  kind: "sokkia" | "report";
  /** The job's name, such as BANKUWATTA. */
  job: string | null;
  /** The job file it was printed from, such as bankuwatta.sdr. */
  file: string | null;
  /** The folder that file was in, as the printout says. */
  folder: string | null;
  /** The job file's full path, to copy, when the printout gives enough of it. */
  path: string | null;
  /** The headings the file starts with ("Project", "Print Date"), for the sentence. */
  labels: string[];
}

/** A "Heading : value" line, as a printout's header has. The heading starts with a letter and holds no digits, so a time (10:30) isn't one. */
const HEADING_LINE = /^\s*([A-Za-z][A-Za-z .\/()#-]{0,30}?)\s*:\s*(\S.*)$/;

/**
 * Whether a file is a printout, and what it names of its job: null when it isn't one. Sokkia Link's printout is known by at least two
 * of its own marks (the JOB NM line, "Theo Desc:", a SOKKIA Link path, "Print Date" with "Distance Unit", the Record Type table);
 * any other report by three or more "Heading : value" lines among its first fifteen. Only the first 40 lines are read.
 */
export function printoutSource(text: string): PrintoutSource | null {
  const lines = text
    .slice(0, 8000)
    .replace(/^[﻿\u0002]+/, "")
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trimEnd())
    .filter((l) => l.trim() !== "")
    .slice(0, 40);
  const head = lines.join("\n");
  const marks = [
    lines.some((l) => /^\s*JOB\s+NM\s+Job\s*ID\s*:/i.test(l)),
    /\bTheo\s+Desc\s*:/i.test(head),
    /SOKKIA\s*Link/i.test(head),
    /^\s*Print\s+Date\s*:/im.test(head) && /^\s*Distance\s+Unit\s*:/im.test(head),
    /\bPt\.?\s+Record\s+Type\b/i.test(head) && /North\s*\/\s*Hor/i.test(head),
  ].filter(Boolean).length;
  const labels = lines
    .slice(0, 15)
    .map((l) => HEADING_LINE.exec(l)?.[1]?.replace(/\s+/g, " ").trim())
    .filter((l): l is string => Boolean(l));
  const kind = marks >= 2 ? "sokkia" : labels.length >= 3 ? "report" : null;
  if (!kind) return null;

  const value = (re: RegExp) => {
    const v = re.exec(head)?.[1]?.trim();
    return v && v.length <= 260 ? v : null;
  };
  const job = (value(/Job\s*ID\s*:\s*(\S.*)$/im) ?? value(/^\s*Project\s*:\s*(\S.*)$/im))?.slice(0, 80) ?? null;
  const named = value(/^\s*File\s*Name\s*:\s*(\S.*)$/im);
  const cut = named ? Math.max(named.lastIndexOf("\\"), named.lastIndexOf("/")) : -1;
  const folder = named && cut > 0 ? named.slice(0, cut) : null;
  const sdrInPath = named && /\.sdr$/i.test(named) ? named.slice(cut + 1) : null;
  const file = sdrInPath ?? /(?:^|[\s\\/])([^\s\\/:*?"<>|]{1,120}\.sdr)\b/im.exec(head)?.[1] ?? null;
  const sep = named?.includes("\\") ? "\\" : "/";
  const path = folder && file ? `${folder}${sep}${file}` : null;
  return { kind, job, file, folder, path, labels };
}

function sokkiaPrintoutMessage(p: PrintoutSource): string {
  const job = p.job ? ` of the job ${p.job}` : "";
  const where = p.file && p.folder ? `${p.file}, in ${p.folder}` : p.file ? p.file : p.folder ? `the job's .sdr file, in ${p.folder}` : "the job's .sdr file, in Sokkia Link's project folder";
  return `This is Sokkia Link's printout${job}, made for printing, so its lines aren't one point each. Upload the job file itself instead: ${where}. Or export the job's coordinates from Sokkia Link as a CSV (point, northing, easting, height, code).`;
}
