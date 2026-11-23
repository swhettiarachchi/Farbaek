/**
 * One entry point for every point file (stage 194): the format detected or
 * chosen, read by its own strict reader, giving points and issues in the same
 * shape. The server reads the stored file again with this same code, so what
 * the surveyor previewed is what is imported.
 */
import { ADJUST_NAMES, type AdjustMethod } from "../adjust";
import type { CrsRecord } from "../crs";
import type { TraverseClosure } from "./closure";
import { parseDelimited, type ColumnRole, type Delimiter, type ImportedPoint, type ImportIssue } from "./delimited";
import type { ImportFormat } from "./detect";
import { parseFieldBook } from "./fieldbook";
import { parseGeoJsonPoints } from "./geojson";
import { parseGsi } from "./gsi";
import { parseJobXml } from "./jobxml";
import { parseLandXml } from "./landxml";
import { REDUCTION_ENGINE } from "./reduce";
import { parseSdr } from "./sdr";

export interface ReadOptions {
  delimiter: Delimiter;
  hasHeader: boolean;
  columns: readonly ColumnRole[];
  crs: CrsRecord | null;
  /** The project's points, which a field book's legs may start from or close on. */
  known?: readonly { pointId: string; e: number; n: number }[];
  /** The rule the surveyor chose to adjust a traverse by (ADR 0241): only an SDR job's traverse is adjusted, and only when chosen. */
  adjust?: AdjustMethod | null;
}

export interface PointsRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  /** The survey date the file states (yyyy-mm-dd), when it does: offered to the draft, for the surveyor to check. */
  surveyDate: string | null;
  /** When points were worked out from observations: the engine and counts, recorded with the import (ADR 0236). */
  reduction?: { engine: string; points: number; stations: number; traverse?: TraverseClosure | null } | null;
}

export function readPoints(format: ImportFormat, text: string, o: ReadOptions): PointsRead {
  const plain = (r: { points: ImportedPoint[]; issues: ImportIssue[] }): PointsRead => ({ points: r.points, issues: r.issues, surveyDate: null });
  // A rule chosen for a file that has no traverse Farbaek adjusts is refused, not ignored: the surveyor asked for it.
  if (o.adjust && format !== "sdr") return { points: [], issues: [{ code: "TRAVERSE_NOT_ADJUSTED", severity: "error", line: null, message: `You chose to adjust by ${ADJUST_NAMES[o.adjust]}, and Farbaek adjusts only a Sokkia SDR job's traverse. Keep the points as shot.` }], surveyDate: null };
  if (format === "geojson") return plain(parseGeoJsonPoints(text, o.crs?.epsg ?? null));
  if (format === "gsi") {
    const r = parseGsi(text, o.crs);
    return { points: r.points, issues: r.issues, surveyDate: null, reduction: r.reduced ? { engine: REDUCTION_ENGINE, ...r.reduced } : null };
  }
  if (format === "sdr") {
    const r = parseSdr(text, o.crs, o.adjust ?? null);
    return { points: r.points, issues: r.issues, surveyDate: null, reduction: r.reduced ? { engine: REDUCTION_ENGINE, ...r.reduced } : null };
  }
  if (format === "landxml") return plain(parseLandXml(text));
  if (format === "jobxml") return parseJobXml(text);
  if (format === "fieldbook") return plain(parseFieldBook(text, o.known ?? []));
  return plain(parseDelimited(text, { delimiter: o.delimiter, hasHeader: o.hasHeader, columns: o.columns }));
}
