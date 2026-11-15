/**
 * The lot schedule as CSV (stage 192): each lot's corners and area in square
 * metres, hectares (5 decimals) and acres, roods and perches, then the sum of
 * the lots and the entire land, from the same engine figures as the sheet.
 * Numbers are plain (no thousands separators), so spreadsheets read them as
 * numbers. Text cells are guarded against formulas, as the points CSV is.
 */
import { lotName } from "../document";
import { arpClassic, hectares } from "../formats";
import type { PlanLots } from "../lots";
import { roundTo, toArp } from "../units";

/** A CSV cell that a spreadsheet can't run as a formula, quoted when it has to be. */
export const cell = (s: string) => {
  const safe = /^[=+\-@\t\r]/.test(s) && !/^[+-]?\d+(\.\d+)?$/.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
};

export function lotScheduleCsv(lots: PlanLots, perchDecimals: number): string {
  const row = (name: string, corners: string, m2: number | null) =>
    [cell(name), cell(corners), m2 === null ? "" : roundTo(m2, 3).toFixed(3), m2 === null ? "" : hectares(m2), m2 === null ? "" : cell(arpClassic(toArp(m2, perchDecimals)))].join(",");
  const rows = ["lot,corners,area_m2,hectares,acres_roods_perches"];
  for (const r of lots.lots) {
    rows.push(row(`Lot ${lotName(r.lot) || "without a label"}`, r.parcel ? r.parcel.vertices.map((v) => v.pointId).join(" ") : "", r.parcel ? r.parcel.areaM2 : null));
  }
  rows.push(row("Sum of the lots", "", lots.sumAreaM2));
  rows.push(row("Entire land", lots.outline ? lots.outline.map((v) => v.pointId).join(" ") : "", lots.outlineAreaM2));
  return `${rows.join("\r\n")}\r\n`;
}
