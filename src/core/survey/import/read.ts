/**
 * One entry point for every point file (stage 194): the format detected or
 * chosen, read by its own strict reader, giving points and issues in the same
 * shape. The server reads the stored file again with this same code, so what
 * the surveyor previewed is what is imported.
 */
import type { CrsRecord } from "../crs";
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
}

export interface PointsRead {
  points: ImportedPoint[];
  issues: ImportIssue[];
  /** The survey date the file states (yyyy-mm-dd), when it does: offered to the draft, for the surveyor to check. */
  surveyDate: string | null;
  /** When points were worked out from observations: the engine and counts, recorded with the import (ADR 0236). */
  reduction?: { engine: string; points: number; stations: number } | null;
}

export function readPoints(format: ImportFormat, text: string, o: ReadOptions): PointsRead {
  const plain = (r: { points: ImportedPoint[]; issues: ImportIssue[] }): PointsRead => ({ points: r.points, issues: r.issues, surveyDate: null });
  if (format === "geojson") return plain(parseGeoJsonPoints(text, o.crs?.epsg ?? null));
  if (format === "gsi") {
    const r = parseGsi(text, o.crs);
    return { points: r.points, issues: r.issues, surveyDate: null, reduction: r.reduced ? { engine: REDUCTION_ENGINE, ...r.reduced } : null };
  }
  if (format === "sdr") {
    const r = parseSdr(text, o.crs);
    return { points: r.points, issues: r.issues, surveyDate: null, reduction: r.reduced ? { engine: REDUCTION_ENGINE, ...r.reduced } : null };
  }
  if (format === "landxml") return plain(parseLandXml(text));
  if (format === "jobxml") return parseJobXml(text);
  if (format === "fieldbook") return plain(parseFieldBook(text, o.known ?? []));
  return plain(parseDelimited(text, { delimiter: o.delimiter, hasHeader: o.hasHeader, columns: o.columns }));
}
