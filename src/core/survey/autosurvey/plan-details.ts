/**
 * The plan's details Farbaek fills in by itself (stage 304, ADR 0310), as a practising surveyor asked: the title block shouldn't be typed
 * again on every plan. Each goes only into an empty field, never over anything typed, and each is marked as drawn for the surveyor:
 *
 * - The plan number: the next after the surveyor's own latest numbered plan here ("2933" to "2934", "LS/12/0099" to "LS/12/0100"). It
 *   waits for the surveyor's own confirmation, since a plan's number is its identity.
 * - Where the land is, as far as the district: the district, province, DS division, korale and pattu of the surveyor's latest plan that
 *   gives a district, since a surveyor mostly works in one area. Each waits for the surveyor's own confirmation, said as taken from that
 *   plan. The village and the Grama Niladhari division belong to each land, and are never carried.
 * - The survey date: the date the surveyor wrote on the field sketch ("14/10"), in the latest year that puts it on or before the day the
 *   sketch was read. It waits for the surveyor's confirmation; when the sketch gives more than one date, the first is taken.
 *
 * Nothing here comes from a model, and nothing about the land itself (its name, owners, extent, boundaries) is ever carried from another
 * plan: those come from the deed, the surveyor's words, or the surveyor.
 */
import type { SheetFields, SurveyDocument } from "../document";
import type { EarlierPlan } from "./defaults";

/** The fields where a land is, carried from the surveyor's latest plan that gives a district. */
export const REGION_FIELDS = ["district", "province", "dsDivision", "korale", "pattu"] as const;
export type RegionField = (typeof REGION_FIELDS)[number];

/** How each carried field is said on its card. */
export const REGION_WORDS: Record<RegionField, string> = { district: "district", province: "province", dsDivision: "DS division", korale: "korale", pattu: "pattu" };

export interface CarriedDetails {
  /** The next plan number, and the plan whose number it follows. */
  planNumber: { value: string; after: string; from: string } | null;
  /** Where the surveyor's latest land was, and the plan it's from. */
  region: { values: Partial<Record<RegionField, string>>; from: string } | null;
}

const TRAILING = /^(.*?)(\d{1,9})$/;
const YEAR_END = /[/.-](?:19|20)\d{2}$/;

/**
 * The number after the surveyor's latest numbered plan, newest first: the highest number with the same lettering before it, plus one, its
 * zeros kept ("0099" to "0100"). Null when no plan has a number ending in digits.
 */
export function nextPlanNumber(numbers: readonly string[]): { value: string; after: string } | null {
  // A number ending in a year ("1234/2026") gives no next: whether it goes on to 1235/2026 or starts again in a new year is the surveyor's.
  const written = numbers.map((n) => n.trim()).filter((n) => TRAILING.test(n) && !YEAR_END.test(n));
  const newest = written[0];
  if (!newest) return null;
  const prefix = TRAILING.exec(newest)![1]!;
  const same = written.map((n) => TRAILING.exec(n)!).filter((m) => m[1] === prefix);
  const top = same.reduce((best, m) => (Number(m[2]) > Number(best[2]) ? m : best));
  const digits = String(Number(top[2]) + 1).padStart(top[2]!.length, "0");
  return { value: `${prefix}${digits}`, after: top[0]! };
}

/** What a new plan takes from the surveyor's recent plans, newest first. */
export function carriedDetails(earlier: readonly EarlierPlan[]): CarriedDetails {
  const numbered = earlier.filter((p) => TRAILING.test(p.document.sheet.planNumber.trim()) && !YEAR_END.test(p.document.sheet.planNumber.trim()));
  const next = nextPlanNumber(numbered.map((p) => p.document.sheet.planNumber));
  const from = next ? numbered.find((p) => p.document.sheet.planNumber.trim() === next.after) : undefined;
  const placed = earlier.find((p) => p.document.sheet.district.trim() !== "");
  const values = placed ? Object.fromEntries(REGION_FIELDS.map((k) => [k, placed.document.sheet[k].trim()]).filter(([, v]) => v !== "")) : {};
  return {
    planNumber: next && from ? { ...next, from: from.name } : null,
    region: placed ? { values, from: placed.name } : null,
  };
}

/** A new plan with the carried details in its empty fields, each marked as drawn for the surveyor. */
export function withCarriedDetails(doc: SurveyDocument, d: CarriedDetails | undefined): SurveyDocument {
  if (!d) return doc;
  const sheet: SheetFields = { ...doc.sheet };
  const provenance = { ...doc.provenance };
  let filled = 0;
  if (d.planNumber && !sheet.planNumber.trim()) {
    sheet.planNumber = d.planNumber.value;
    provenance["sheet.planNumber"] = { source: "auto", reviewed: false };
    filled++;
  }
  for (const k of REGION_FIELDS) {
    const v = d.region?.values[k];
    if (!v || sheet[k].trim()) continue;
    sheet[k] = v;
    provenance[`sheet.${k}`] = { source: "auto", reviewed: false };
    filled++;
  }
  return filled > 0 ? { ...doc, sheet, provenance } : doc;
}

// A day and month with a slash ("14/10", "14/10/"), or any of slash, dot or dash with its year ("14.10.2026", "3-1-26"). A dot or a dash
// without a year is a measurement ("4.10", "12.05") or a range, never a date (stage 304 review).
const DATE = /^\s*(\d{1,2})\s*(?:\/\s*(\d{1,2})(?:\s*\/\s*(\d{4}|\d{2}))?\s*\/?|\.\s*(\d{1,2})\s*\.\s*(\d{4}|\d{2})|-\s*(\d{1,2})\s*-\s*(\d{4}|\d{2}))\s*$/;
const iso = (y: number, m: number, d: number) => `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const real = (y: number, m: number, d: number) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
};

/**
 * The dates written on a field sketch, as the surveyor writes them (day first, "14/10", "14/10/26", "14.10.2026"), each as a date: a year
 * left out is the latest that puts it on or before the day the sketch was read. Earliest first, each once. A note that isn't one date
 * alone (a distance, coordinates, a number) is none.
 */
export function sketchDates(notes: readonly string[], readAt: string): { iso: string; written: string }[] {
  const read = new Date(readAt);
  if (Number.isNaN(read.getTime())) return [];
  // The day the sketch was read wherever the surveyor is: the read's time in UTC, up to 14 hours on (Sri Lanka is 5½ hours ahead).
  const ahead = new Date(read.getTime() + 14 * 3600_000);
  const today = iso(ahead.getUTCFullYear(), ahead.getUTCMonth() + 1, ahead.getUTCDate());
  const found = new Map<string, string>();
  for (const note of notes) {
    const hit = DATE.exec(note);
    if (!hit) continue;
    // The day, then the month and year of whichever form matched: [day, month, year].
    const m = [hit[0], hit[1], hit[2] ?? hit[4] ?? hit[6], hit[3] ?? hit[5] ?? hit[7]];
    const [day, month] = [Number(m[1]), Number(m[2])];
    let year: number;
    if (m[3]) {
      year = m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3]);
      if (m[3].length === 2 && iso(year, month, day) > today) year -= 100;
    } else {
      year = ahead.getUTCFullYear();
      if (real(year, month, day) && iso(year, month, day) > today) year -= 1;
    }
    if (month < 1 || month > 12 || !real(year, month, day)) continue;
    const at = iso(year, month, day);
    // Never a day after the sketch was read, nor one before the instruments of the day (a misread).
    if (at > today || year < 1990) continue;
    if (!found.has(at)) found.set(at, note.trim());
  }
  return [...found.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([d, written]) => ({ iso: d, written }));
}

/** The dates the plan's sketch gives, from its notes as read. */
export function sketchDatesOf(doc: SurveyDocument): { iso: string; written: string }[] {
  const s = doc.sketch;
  return s ? sketchDates(s.readings.filter((r) => r.kind === "note").map((r) => r.text), s.readAt) : [];
}

/** The plan with the sketch's survey date in an empty "Surveyed on", marked as drawn for the surveyor. */
export function withSketchSurveyDate(doc: SurveyDocument): SurveyDocument {
  const first = sketchDatesOf(doc)[0];
  if (!first || doc.sheet.surveyDate.trim()) return doc;
  return { ...doc, sheet: { ...doc.sheet, surveyDate: first.iso }, provenance: { ...doc.provenance, "sheet.surveyDate": { source: "auto", reviewed: false } } };
}

/**
 * Why a detail Farbaek filled in by itself waits for the surveyor's own confirmation, or null when approving the plan confirms it: a
 * carried plan number or place, and a survey date read from the sketch. A date the survey files state needs no more than the approval.
 */
export function detailDoubt(doc: SurveyDocument, key: string): string | null {
  // Only this file fills these by itself: a plan number or a place marked as drawn was carried from the surveyor's latest plan.
  if (key === "sheet.planNumber") return `The plan number ${doc.sheet.planNumber} is the next after your latest plan's: check it's this plan's number.`;
  const region = REGION_FIELDS.find((k) => `sheet.${k}` === key);
  if (region) return `The ${REGION_WORDS[region]}, ${doc.sheet[region]}, is from your latest plan: check it's where this land is.`;
  if (key === "sheet.surveyDate") {
    // A date read from the sketch's handwriting is the surveyor's to check, always (stage 304 review): a note can look like a date.
    const dates = sketchDatesOf(doc);
    const read = dates.find((d) => d.iso === doc.sheet.surveyDate);
    if (read && dates.length > 1) return `The sketch gives ${dates.length} dates (${dates.map((d) => d.written).join(", ")}): the survey date is taken as the first, ${read.iso}. Check it.`;
    if (read) return `The survey date, ${read.iso}, is read from "${read.written}" written on the sketch: check it.`;
  }
  return null;
}
