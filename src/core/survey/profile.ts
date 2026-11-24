/**
 * Office profiles (stage 248, ADR 0256): a surveyor's set-up, saved once in the workspace and reused by every new plan. It holds:
 * - the grid they work in;
 * - their instruments and the files those export;
 * - the office code library and how the crew writes line words;
 * - the sheet's presentation and the statement printed on the plan.
 * It never holds anything about a piece of land: titles, lots, owners, extents and plan numbers belong to each job.
 *
 * Generate Plan picks a profile by what it knows (`resolveProfile`): the one whose instruments export the files uploaded, else the one
 * this surveyor used last, else the only one, else it asks. Saving a code library into a profile is the surveyor's own deliberate,
 * versioned act, so a plan started from it takes the list as checked; an office library uploaded with the files still waits for its
 * check, as before.
 */
import { z } from "zod";
import type { InstrumentPrecision } from "./adjust";
import { CARRIED_SETTINGS, type CarriedSettings } from "./autosurvey/defaults";
import { codeEntrySchema, codesAreCommonList, codesAreDsrList, type CodeEntry } from "./codes";
import { libraryFor } from "./codelib";
import { crsById } from "./crs";
import { DEFAULT_STATEMENT, settingsSchema, type SurveyDocument } from "./document";
import { GRAMMARS, type GrammarId } from "./grammar";
import { DRAFTING_SETTINGS, type DraftingSetting } from "./learning";
import type { ImportFormat } from "./import/detect";

export const IMPORT_FORMAT_IDS = ["delimited", "geojson", "gsi", "sdr", "landxml", "jobxml", "fieldbook", "sokkialist", "dxf"] as const satisfies readonly ImportFormat[];
export const EQUIPMENT_KINDS = ["total_station", "gnss", "level", "controller"] as const;
export type EquipmentKind = (typeof EQUIPMENT_KINDS)[number];
export const EQUIPMENT_LABEL: Record<EquipmentKind, string> = { total_station: "Total station", gnss: "GNSS receiver", level: "Level", controller: "Controller or data collector" };

const name = (max: number) => z.string().max(max).refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "No control characters.");

/**
 * A total station's precision as its specification states it (ADR 0274): an angle's standard deviation in seconds, and a distance's in
 * millimetres plus parts per million. Least squares weighs by it. The bounds hold every instrument made for survey work.
 */
export const precisionSchema = z.object({
  angleSeconds: z.number().min(0.5).max(60),
  distanceMm: z.number().min(0.1).max(50),
  distancePpm: z.number().min(0).max(50),
});

export const equipmentSchema = z.object({
  kind: z.enum(EQUIPMENT_KINDS),
  make: name(40),
  model: name(60),
  /** The files this instrument's office software exports, by Farbaek's readers: how a profile is matched to an upload. */
  exports: z.array(z.enum(IMPORT_FORMAT_IDS)).max(IMPORT_FORMAT_IDS.length),
  /** A total station's stated precision, when the surveyor gives it (stage 267). Older profiles have none. */
  precision: precisionSchema.optional(),
});
export type Equipment = z.infer<typeof equipmentSchema>;

/**
 * The precision least squares weighs a file's traverse by. The instruments that could have made the file are the profile's total
 * stations that export its format, or, when none is said to, all its total stations. Only when every one of those states a precision,
 * and they agree: never one instrument's figures for a file another may have made. Otherwise none, and the note says a typical
 * instrument's was used.
 */
export function profilePrecision(profile: OfficeProfile | null, format: ImportFormat = "sdr"): InstrumentPrecision | null {
  if (!profile) return null;
  const stations = profile.body.equipment.filter((e) => e.kind === "total_station");
  const exporting = stations.filter((e) => e.exports.includes(format as (typeof IMPORT_FORMAT_IDS)[number]));
  const pool = exporting.length > 0 ? exporting : stations;
  const key = (e: Equipment) => (e.precision ? `${e.precision.angleSeconds}/${e.precision.distanceMm}/${e.precision.distancePpm}` : "none");
  if (pool.length === 0 || pool.some((e) => !e.precision) || new Set(pool.map(key)).size > 1) return null;
  const e = pool[0]!;
  const instrument = [e.make, e.model].map((s) => s.trim()).filter(Boolean).join(" ") || "total station";
  return { ...e.precision!, instrument: pool.length === 1 ? instrument : "total stations" };
}

/** The three figures as typed on the profile form: all three, or none. */
export function precisionFromText(angle: string, distance: string, ppm: string): { ok: true; value: z.infer<typeof precisionSchema> | null } | { ok: false; problem: string } {
  const typed = [angle, distance, ppm].map((s) => s.trim());
  if (typed.every((s) => s === "")) return { ok: true, value: null };
  if (typed.some((s) => s === "")) return { ok: false, problem: "Give all three precision figures, or leave all three empty." };
  // Plain decimals only: "0x10" or "1e1" are numbers to JavaScript, not figures from a specification sheet.
  if (typed.some((s) => !/^(\d+(\.\d*)?|\.\d+)$/.test(s))) return { ok: false, problem: "Precision: write each figure as a plain number, such as 5 or 1.5." };
  const [a, d, p] = typed.map(Number);
  const parsed = precisionSchema.safeParse({ angleSeconds: a, distanceMm: d, distancePpm: p });
  if (!parsed.success) return { ok: false, problem: "Precision: angles from 0.5 to 60 seconds, distances from 0.1 to 50 mm plus 0 to 50 ppm, as the instrument's specification states." };
  return { ok: true, value: parsed.data };
}

// The sheet's presentation, and the drafting choices a profile can carry (learned from the surveyor's plans, stage 270, ADR 0277).
const sheetSchema = settingsSchema.pick(Object.fromEntries([...CARRIED_SETTINGS, ...DRAFTING_SETTINGS].map((k) => [k, true])) as { [K in (typeof CARRIED_SETTINGS)[number] | DraftingSetting]: true });

export const officeProfileBodySchema = z.object({
  /** The grid this office works in, offered first; never assumed for a file without the surveyor's confirmation. */
  crsId: z.string().max(40).nullable().refine((id) => id === null || crsById(id) !== null, "An unknown coordinate system."),
  equipment: z.array(equipmentSchema).max(10),
  /** The office code library (up to 500 codes; a plan takes those its files use first) and how the crew writes line words. */
  codes: z.object({ entries: z.array(codeEntrySchema).min(1).max(500), grammar: z.enum(GRAMMARS) }).nullable(),
  /** The sheet's presentation, as on the Sheet tab; the scale isn't kept, it belongs to each land. */
  sheet: sheetSchema.nullable(),
  /** The statement printed bottom left, in the office's words; empty for Farbaek's default. */
  statement: name(200),
  /** Suggestions learned from the surveyor's plans that they turned down (stage 270, ADR 0277), by key: not offered again. */
  declined: z.array(z.string().max(1000)).max(100).optional(),
});
export type OfficeProfileBody = z.infer<typeof officeProfileBodySchema>;

export interface OfficeProfile {
  id: string;
  name: string;
  version: number;
  body: OfficeProfileBody;
  updatedAt: string;
}

/** A profile as stored, read defensively: a body that doesn't fit the schema is left out rather than guessed at. */
export function readOfficeProfile(row: { id: unknown; name: unknown; version: unknown; body: unknown; updated_at: unknown }): OfficeProfile | null {
  const body = officeProfileBodySchema.safeParse(row.body);
  if (!body.success || typeof row.id !== "string" || typeof row.name !== "string" || typeof row.version !== "number") return null;
  return { id: row.id, name: row.name, version: row.version, body: body.data, updatedAt: typeof row.updated_at === "string" ? row.updated_at : "" };
}

export type Resolution =
  | { chosen: OfficeProfile; why: string; others: OfficeProfile[] }
  | { chosen: null; why: string; others: OfficeProfile[] };

/** The formats a profile's instruments export. */
const formatsOf = (p: OfficeProfile) => new Set(p.body.equipment.flatMap((e) => e.exports));

/**
 * Which profile a new plan starts from, and why, from what's known before anything is saved: the formats of the files uploaded and
 * the profile this surveyor chose last. Never a guess between two: when the evidence leaves more than one, it asks.
 */
export function resolveProfile(profiles: readonly OfficeProfile[], evidence: { formats: readonly ImportFormat[]; lastChosen: string | null }): Resolution {
  if (profiles.length === 0) return { chosen: null, why: "No office profile yet.", others: [] };
  const formats = [...new Set(evidence.formats)];
  // The files say which instruments made them: a profile whose instruments export every one of them.
  const exporting = formats.length > 0 ? profiles.filter((p) => formats.every((f) => formatsOf(p).has(f))) : [];
  const last = profiles.find((p) => p.id === evidence.lastChosen) ?? null;
  const others = (chosen: OfficeProfile) => profiles.filter((p) => p.id !== chosen.id);
  if (exporting.length === 1) return { chosen: exporting[0]!, why: "Its instruments export the files you uploaded.", others: others(exporting[0]!) };
  if (exporting.length > 1 && last && exporting.includes(last)) return { chosen: last, why: "You used it last, and its instruments export these files.", others: others(last) };
  if (exporting.length > 1) return { chosen: null, why: "More than one profile's instruments export these files.", others: [...profiles] };
  if (last) return { chosen: last, why: "You used it last.", others: others(last) };
  if (profiles.length === 1) return { chosen: profiles[0]!, why: "It's this workspace's only office profile.", others: [] };
  return { chosen: null, why: "This workspace has more than one office profile.", others: [...profiles] };
}

/**
 * A new plan's document with the profile applied: its code library (the codes the files use first) and line words, taken as checked
 * since the surveyor saved them into the profile; its sheet presentation; its statement. The provenance says which profile and version.
 */
export function withProfile(doc: SurveyDocument, profile: OfficeProfile, usedCodes: readonly string[]): SurveyDocument {
  const b = profile.body;
  const codes: CodeEntry[] | null = b.codes ? libraryFor(b.codes.entries, usedCodes).codes : null;
  return {
    ...doc,
    ...(codes ? { codes, grammar: b.codes!.grammar, provenance: { ...doc.provenance, codes: { source: "engine" as const, reviewed: true } } } : {}),
    ...(b.sheet ? { settings: { ...doc.settings, ...b.sheet } } : {}),
    ...(b.statement.trim() ? { sheet: { ...doc.sheet, statement: b.statement.trim() } } : {}),
    // Which profile and version it started from (ADR 0277), so what the surveyor then corrects is learned against this profile only.
    fromProfile: { id: profile.id, version: profile.version },
  };
}

/** A profile body from a plan the surveyor has already set up: its checked office list and line words, its sheet and its statement. */
export function profileFromPlan(doc: SurveyDocument, crsId: string | null): OfficeProfileBody {
  const checked = doc.provenance["codes"]?.reviewed === true && doc.codes.length > 0 && !codesAreCommonList(doc.codes) && !codesAreDsrList(doc.codes);
  // Its drafting choices too (ADR 0277), those it has on.
  const sheet = { ...(Object.fromEntries(CARRIED_SETTINGS.map((k) => [k, doc.settings[k]])) as CarriedSettings), ...Object.fromEntries(DRAFTING_SETTINGS.filter((k) => doc.settings[k] === true).map((k) => [k, true])) };
  return {
    crsId: crsById(crsId) ? crsId : null,
    equipment: [],
    codes: checked ? { entries: doc.codes.map((c) => ({ ...c })), grammar: (doc.grammar ?? "farbaek") as GrammarId } : null,
    sheet,
    statement: doc.sheet.statement.trim() && doc.sheet.statement.trim() !== DEFAULT_STATEMENT ? doc.sheet.statement.trim() : "",
  };
}

/** The drafting choices a profile's sheet carries (ADR 0277), as the summary says them: ", 2 drafting choices". */
const drafting = (sheet: NonNullable<OfficeProfileBody["sheet"]>) => {
  const n = DRAFTING_SETTINGS.filter((k) => sheet[k] === true).length;
  return n === 0 ? "" : `, ${n} drafting ${n === 1 ? "choice" : "choices"}`;
};

/** What a profile holds, in a sentence, for the start screen and the profile list. */
export function profileSummary(p: OfficeProfile): string {
  const b = p.body;
  const parts = [
    b.crsId ? crsById(b.crsId)!.name : "no grid set",
    b.equipment.length
      ? b.equipment.map((e) => (([e.make, e.model].filter(Boolean).join(" ") || EQUIPMENT_LABEL[e.kind]) + (e.precision ? ` (${e.precision.angleSeconds}″, ${e.precision.distanceMm} mm + ${e.precision.distancePpm} ppm)` : ""))).join(", ")
      : "no instruments",
    b.codes ? `${b.codes.entries.length} ${b.codes.entries.length === 1 ? "code" : "codes"}` : "Farbaek's code list",
    b.sheet ? `${b.sheet.template === "classic" ? "classic" : "panel"} sheet, ${b.sheet.paper === "auto" ? "paper to fit" : b.sheet.paper}${drafting(b.sheet)}` : "Farbaek's sheet",
  ];
  return `${parts.join("; ")}.`;
}
