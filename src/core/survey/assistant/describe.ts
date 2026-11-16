/**
 * The drafting assistant's changes in words (stage 195): one line for the
 * change card, with every value shown large beside its role, and a read-back
 * to say aloud. Code writes these from the checked changes; the model's words
 * never carry the figures.
 */
import { lotName, type LayerId, type Lot, type SurveyDocument } from "../document";
import { arpClassic, dotDate, hectares } from "../formats";
import { computeLots } from "../lots";
import { toArp } from "../units";
import type { SurveyPoint } from "../parcel";
import type { AssistField, PlanOp } from "./ops";
import { speakBearing, speakDigits, speakPointNumbers } from "./spoken";
import { parseBearing } from "../angles";

/**
 * A bearing as the table takes it ("45 30 15", "N 45 30 E"), written with its marks for the card: 45° 30′ 15″, N 45° 30′ E. The
 * figures are the surveyor's, unchanged; only the marks are added.
 */
export function bearingMarks(text: string): string {
  const t = text.trim().split(/\s+/);
  const quadrant = /^[NS]$/.test(t[0] ?? "") && /^[EW]$/.test(t[t.length - 1] ?? "");
  const parts = quadrant ? t.slice(1, -1) : t;
  const marked = parts.map((p, i) => `${p}${["°", "′", "″"][i] ?? ""}`).join(" ");
  return quadrant ? `${t[0]} ${marked} ${t[t.length - 1]}` : marked;
}

export const LAYER_NAMES: Record<LayerId, string> = {
  BOUNDARY: "Boundary",
  POINTS: "Corner points",
  POINT_NUMBERS: "Point numbers",
  DIMENSIONS: "Bearings and distances",
  LOT_TEXT: "Lot labels",
  BOUNDARY_MARKS: "Boundary marks",
  BUILDINGS: "Buildings",
  WALLS: "Walls",
  FENCES: "Fences",
  DRAINS: "Drains",
  ROADS: "Roads",
  UTILITIES: "Utilities",
  ADJOINING: "Adjoining lands",
  TEXT: "Text",
  TITLE: "North point and scale",
};

export const FIELD_NAMES: Record<AssistField, string> = {
  planNumber: "Plan number",
  landName: "Land name",
  alias: "Also called",
  nowKnownAs: "Now known as",
  operation: "Kind of survey",
  parentLots: "Parent lots",
  previousPlanNumber: "Earlier plan number",
  previousPlanDate: "Earlier plan date",
  previousPlanBy: "Earlier plan by",
  previousPlanMine: "Earlier plan is mine",
  previousPlanFiling: "Earlier plan filed as",
  village: "Village",
  pattu: "Pattu",
  korale: "Korale",
  district: "District",
  province: "Province",
  gnDivision: "GN division",
  boundaryNorth: "Bounded on the north by",
  boundaryEast: "Bounded on the east by",
  boundarySouth: "Bounded on the south by",
  boundaryWest: "Bounded on the west by",
  statedExtent: "Stated extent",
  surveyDate: "Survey date",
  partitionDate: "Partition date",
  planDate: "Plan date",
  dsDivision: "DS division",
  statement: "Statement",
  remarks: "Remarks",
};

export interface Value {
  role: string;
  value: string;
  /** Figures people compare digit by digit (point numbers, coordinates, bearings) show in mono. */
  mono: boolean;
}
export interface Described {
  text: string;
  values: Value[];
  /** What the engine found that the surveyor should see before applying: an overlap, legs that cross. */
  warnings?: string[];
}

/**
 * What the survey engine says about a lot as it would be after the change: its computed extent, and whether it overlaps another lot
 * or its legs cross (computeLots, the same checks as the Check step). Never repaired, only reported.
 */
export function lotFacts(candidate: Lot, ctx: { doc: SurveyDocument; points: readonly SurveyPoint[] }): { areaM2: number | null; overlaps: string[]; crossing: boolean } {
  const plan = computeLots(ctx.points, [...ctx.doc.lots.filter((l) => l.id !== candidate.id), candidate]);
  const last = plan.lots.length - 1;
  const mine = plan.lots[last]!;
  const crossing = Boolean(mine.parcel && mine.parcel.crossings.length > 0);
  const overlaps = plan.overlaps.filter(([a, b]) => a === last || b === last).map(([a, b]) => lotName(plan.lots[a === last ? b : a]!.lot));
  return { areaM2: mine.parcel && !crossing ? mine.parcel.areaM2 : null, overlaps, crossing };
}

/** "lot B1", "lots B2 and B3", "lots B1, B2 and B3". */
const lotList = (names: readonly string[]) => (names.length === 1 ? `lot ${names[0]}` : `lots ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

function lotNotes(candidate: Lot, ctx: { doc: SurveyDocument; points: readonly SurveyPoint[] }): { values: Value[]; warnings: string[] } {
  const f = lotFacts(candidate, ctx);
  const values: Value[] = f.areaM2 === null ? [] : [{ role: "Extent, computed", value: `${hectares(f.areaM2)} ha (${arpClassic(toArp(f.areaM2, ctx.doc.settings.perchDecimals))})`, mono: false }];
  const warnings: string[] = [];
  if (f.crossing) warnings.push("Its legs cross each other. Check the order of the corners.");
  if (f.overlaps.length) warnings.push(`It overlaps ${lotList(f.overlaps)}. Check the corners before applying.`);
  return { values, warnings };
}

const FEATURE_WORDS: Record<string, string> = { BUILDINGS: "building outline", WALLS: "wall", FENCES: "fence", DRAINS: "drain", ROADS: "road line", UTILITIES: "utility line" };

export function describeOp(op: PlanOp, ctx: { doc: SurveyDocument; points: readonly SurveyPoint[] }): Described {
  const number = new Map(ctx.points.map((p) => [p.id, p.pointId]));
  const nums = (ids: readonly string[]) => ids.map((id) => number.get(id) ?? "?").join(", ");
  const lotById = (id: string) => ctx.doc.lots.find((l) => l.id === id);
  const named = (entity: string) => {
    const [kind, ...rest] = entity.split(":");
    const id = rest.join(":");
    if (kind === "lot") return `lot ${lotName(lotById(id) ?? { label: "?", sup: "" })}`;
    if (kind === "road") return `the road${ctx.doc.roads.find((r) => r.id === id)?.name ? ` ${ctx.doc.roads.find((r) => r.id === id)!.name}` : ""}`;
    if (kind === "adjoining") return `"${ctx.doc.adjoining.find((a) => a.id === id)?.text ?? "adjoining land"}"`;
    if (kind === "pt" || kind === "mark") return `point ${number.get(id) ?? "?"}`;
    if (kind === "leg") return `a leg of lot ${lotName(lotById(rest[0]!) ?? { label: "?", sup: "" })}`;
    return kind === "plan-number" ? "the plan number" : `the ${kind}`;
  };
  switch (op.kind) {
    case "view":
      return {
        text: op.action === "zoom_in" ? "Zoom in" : op.action === "zoom_out" ? "Zoom out" : op.action === "whole_sheet" ? "Show the whole sheet" : op.action === "clear_selection" ? "Clear the selection" : `${op.action === "select" ? "Pick" : "Show"} ${op.entities.length > 1 ? `${op.entities.length} points` : named(op.entities[0] ?? "")}`,
        values: op.entities.length > 1 ? [{ role: "Points", value: op.entities.map((e) => number.get(e.slice(e.indexOf(":") + 1)) ?? "?").join(", "), mono: true }] : [],
      };
    case "history":
      return { text: op.action === "undo" ? "Undo the last change" : "Redo the change", values: [] };
    case "layer": {
      const words = [op.visible === true ? "Show" : op.visible === false ? "Hide" : "", op.locked === true ? "lock" : op.locked === false ? "unlock" : ""].filter(Boolean).join(" and ");
      return { text: `${words.charAt(0).toUpperCase()}${words.slice(1)} the ${LAYER_NAMES[op.layer].toLowerCase()} layer`, values: [] };
    }
    case "label":
      return { text: `Move ${named(op.entity)}'s label ${op.dx < 0 ? "left" : op.dx > 0 ? "right" : op.dy < 0 ? "up" : "down"}, on paper only`, values: [{ role: "By", value: `${Math.abs(op.dx || op.dy)} mm`, mono: false }] };
    case "label_back":
      return { text: `Put ${named(op.entity)}'s label back where Farbaek places it`, values: [] };
    case "sheet":
      if (op.setting === "paper") return { text: op.value === "auto" ? "Let Farbaek choose the paper" : `Print on ${op.value}`, values: [] };
      if (op.setting === "orientation") return { text: `Turn the sheet to ${op.value}`, values: [] };
      if (op.setting === "template") return { text: `Use the ${op.value} layout`, values: [] };
      return { text: `${op.value ? "Show" : "Hide"} ${op.setting === "faceDimensions" ? "bearings and distances on the face of the plan" : op.setting === "overleaf" ? "the schedule overleaf" : op.setting === "permitBox" ? "the permit box" : "slanted lettering"}`, values: [] };
    case "number":
      if (op.setting === "scale") return { text: op.value === null ? "Let Farbaek choose the scale for the paper" : "Set the scale", values: op.value === null ? [] : [{ role: "Scale", value: `1:${op.value}`, mono: false }] };
      return { text: `Show ${op.setting === "perchDecimals" ? "perches" : op.setting === "secondDecimals" ? "seconds of bearings" : "distances"} to a set number of decimals`, values: [{ role: "Decimals", value: String(op.value), mono: false }] };
    case "lot_add": {
      const n = lotNotes(op.lot, ctx);
      return { text: `Add lot ${lotName(op.lot)}${op.lot.note ? `, noted "${op.lot.note}"` : ""}`, values: [{ role: "Corners, in order", value: nums(op.lot.points), mono: true }, ...n.values], warnings: n.warnings };
    }
    case "lot_edit": {
      const lot = lotById(op.id);
      const name = lot ? lotName(lot) : "?";
      if (op.points) {
        const n = lot ? lotNotes({ ...lot, points: op.points }, ctx) : { values: [], warnings: [] };
        return { text: `Give lot ${name} new corners`, values: [{ role: "Corners, in order", value: nums(op.points), mono: true }, ...n.values], warnings: n.warnings };
      }
      if (op.label !== undefined) return { text: `Rename lot ${name}`, values: [{ role: "New name", value: `${op.label}${op.sup ?? ""}`, mono: false }] };
      return { text: `Change lot ${name}'s note`, values: [{ role: "Note", value: op.note ?? "", mono: false }] };
    }
    case "road_add":
      return {
        text: `Add ${op.road.name ? `the road ${op.road.name}` : "a road"}, its width worked out from its two edges${op.road.width === "none" ? "" : ` and written in ${op.road.width}`}`,
        values: [
          { role: "One edge", value: nums(op.road.edgeA), mono: true },
          { role: "Other edge", value: nums(op.road.edgeB), mono: true },
        ],
      };
    case "adjoining_add":
      return { text: `Write "${op.adjoining.text}" beside lot ${lotName(lotById(op.adjoining.lot) ?? { label: "?", sup: "" })}`, values: [{ role: "Along the leg", value: `${number.get(op.adjoining.from) ?? "?"} to ${number.get(op.adjoining.to) ?? "?"}`, mono: true }] };
    case "feature_add":
      return { text: `Draw a ${op.feature.closed ? "closed " : ""}${FEATURE_WORDS[op.feature.layer] ?? "line"}${op.feature.code ? ` (${op.feature.code})` : ""}`, values: [{ role: "Through points", value: nums(op.feature.points), mono: true }] };
    case "field":
      // The line already names the field, so the value stands alone under it.
      return { text: `Fill in the title: ${FIELD_NAMES[op.field].toLowerCase()}`, values: [{ role: "", value: typeof op.value === "boolean" ? (op.value ? "Yes" : "No") : /^\d{4}-\d{2}-\d{2}$/.test(op.value) ? dotDate(op.value) : op.value, mono: false }] };
    case "note_add":
      return { text: "Add a note to the plan", values: [{ role: "Note", value: op.text, mono: false }] };
    case "remove":
      if (op.target === "note") return { text: "Remove a note", values: [{ role: "Note", value: ctx.doc.notes[op.index] ?? "", mono: false }] };
      return { text: `Remove ${named(`${op.target}:${op.id}`)}${op.target === "lot" && ctx.doc.adjoining.some((a) => a.lot === op.id) ? ", with the adjoining lands written beside it" : ""}`, values: [] };
    case "answer":
      return { text: "Answer from the plan", values: [] };
    case "divide": {
      const lot = lotById(op.lotId);
      const how = op.count ? `into ${op.count} equal ${op.by === "width" ? "strips" : "lots"}` : op.by === "width" ? "with a strip" : "into the areas said";
      return { text: `Open the divide panel for lot ${lot ? lotName(lot) : "?"}, ${how}, to see the lines before anything is kept`, values: op.values.length ? [{ role: op.by === "width" ? "Width" : "Areas", value: op.values.map((v) => `${v} ${op.unit === "m2" ? "m²" : op.unit === "perch" ? "P." : op.unit}`).join(", "), mono: false }] : [] };
    }
    case "measure":
      return op.mode === "bearings"
        ? { text: `Put ${op.rows.length} ${op.rows.length === 1 ? "leg" : "legs"} in the bearings and distances table, to check and import`, values: op.rows.map((r) => ({ role: `${r.from} to ${r.to}`, value: `${bearingMarks(r.bearing)}  ${r.distance} m`, mono: true })) }
        : { text: `Put ${op.rows.length} ${op.rows.length === 1 ? "point" : "points"} in the coordinates table, to check and import`, values: op.rows.map((r) => ({ role: `Point ${r.point}`, value: `N ${r.n}  E ${r.e}${r.z ? `  H ${r.z}` : ""}`, mono: true })) };
  }
}

/** What to say back for the changes, figures digit by digit, so they can be checked by ear. The screen stays the record. */
export function readBack(ops: readonly PlanOp[], ctx: { doc: SurveyDocument; points: readonly SurveyPoint[] }): string[] {
  const number = new Map(ctx.points.map((p) => [p.id, p.pointId]));
  const ids = (list: readonly string[]) => speakPointNumbers(list.map((id) => number.get(id) ?? "?"));
  const out: string[] = [];
  for (const op of ops) {
    if (op.kind === "lot_add") {
      out.push(`Lot ${spellLot(op.lot.label, op.lot.sup)}, corners ${ids(op.lot.points)}.`);
      const f = lotFacts(op.lot, ctx);
      if (f.crossing || f.overlaps.length) out.push(`Careful: ${f.crossing ? "its legs cross" : `it overlaps ${lotList(f.overlaps)}`}.`);
    }
    else if (op.kind === "lot_edit" && op.points) out.push(`New corners ${ids(op.points)}.`);
    else if (op.kind === "number" && op.setting === "scale" && op.value !== null) out.push(`Scale one to ${speakDigits(String(op.value))}.`);
    else if (op.kind === "road_add") out.push(`Road edges ${ids(op.road.edgeA)}, and ${ids(op.road.edgeB)}.`);
    else if (op.kind === "feature_add") out.push(`Line through ${ids(op.feature.points)}.`);
    else if (op.kind === "field" && typeof op.value === "string" && /\d/.test(op.value)) out.push(`${FIELD_NAMES[op.field]}, ${/^\d{4}-\d{2}-\d{2}$/.test(op.value) ? speakDigits(dotDate(op.value)).replace(/ decimal /g, " ") : speakDigits(op.value)}.`);
    else if (op.kind === "measure" && op.mode === "bearings")
      for (const r of op.rows) {
        const b = parseBearing(r.bearing);
        const dms = b ? toDms(b.degrees) : null;
        out.push(`${speakPointNumbers([r.from])} to ${speakPointNumbers([r.to])}: bearing ${dms ? speakBearing(dms[0], dms[1], dms[2]) : r.bearing}, distance ${speakDigits(r.distance)} metres.`);
      }
    else if (op.kind === "measure" && op.mode === "coordinates") for (const r of op.rows) out.push(`Point ${speakPointNumbers([r.point])}: northing ${speakDigits(r.n)}, easting ${speakDigits(r.e)}.`);
  }
  return out;
}

const spellLot = (label: string, sup: string) => `${[...label].join(" ")}${sup ? ` ${/^\d+$/.test(sup) ? speakDigits(sup) : [...sup].join(" ")}` : ""}`;

function toDms(deg: number): [number, number, number] {
  const total = Math.round(deg * 3600);
  return [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
}
