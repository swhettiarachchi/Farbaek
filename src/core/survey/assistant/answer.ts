/**
 * Answers to the surveyor's questions about the plan (stage 195), worked out
 * by the tested engine and written by code. The model only picks the
 * question; every figure here comes from computeLots and the checks, never
 * from the model. Areas are grid areas from the corner coordinates, and a
 * stated extent from the title is shown beside the computed one, never in its
 * place (survey skill, rule 5).
 */
import { lotName, unreviewed, type SurveyDocument } from "../document";
import { arpClassic, hectares } from "../formats";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";
import { toArp } from "../units";
import type { PlanOp } from "./ops";
import { speakDigits } from "./spoken";

export interface AnswerInput {
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  /** The plan's checks as they stand (buildPlan's findings). */
  findings: readonly Finding[];
  /** The scale the sheet uses now, and the one Farbaek suggests for the paper. */
  scale: number | null;
  suggestedScale: number | null;
}

export interface Answer {
  title: string;
  /** Label and value; values in figures, as computed. */
  rows: [string, string][];
  /** A sentence under the rows, when there's something to add. */
  note: string;
  /** What to say aloud, figures digit by digit. */
  speak: string;
}

const m2Text = (m2: number) => `${m2.toFixed(2)} m²`;
const areaRow = (m2: number, perchDecimals: number): string => `${hectares(m2)} ha (${arpClassic(toArp(m2, perchDecimals))}), ${m2Text(m2)}`;

/** Key title fields a finished plan needs, and their names. */
const KEY_FIELDS: [keyof SurveyDocument["sheet"], string][] = [
  ["planNumber", "Plan number"],
  ["landName", "Land name"],
  ["village", "Village"],
  ["district", "District"],
  ["province", "Province"],
  ["surveyDate", "Survey date"],
];

export function answer(op: Extract<PlanOp, { kind: "answer" }>, input: AnswerInput): Answer {
  const { doc, points } = input;
  const plan = computeLots(points, doc.lots);
  const decimals = doc.settings.perchDecimals;
  switch (op.topic) {
    case "total_area": {
      const m2 = plan.outlineAreaM2 ?? (plan.sumAreaM2 > 0 ? plan.sumAreaM2 : null);
      if (m2 === null) return { title: "The land's area", rows: [], note: "There are no lots with corners yet, so there's no area to give. Give the lots' corners first.", speak: "There are no lots yet, so there's no area." };
      const rows: [string, string][] = [["Computed", areaRow(m2, decimals)]];
      if (doc.sheet.statedExtent.trim()) rows.push(["Stated in the title", doc.sheet.statedExtent.trim()]);
      return {
        title: "The land's area",
        rows,
        note: `The grid area by the coordinate method, from the corner points${plan.outlineAreaM2 === null && doc.lots.length > 1 ? " (the sum of the lots: they don't join into one outline)" : ""}.${rows.length > 1 ? " A stated extent never replaces the computed one." : ""}`,
        speak: `The land is ${speakDigits(hectares(m2))} hectares.`,
      };
    }
    case "lot_area":
    case "perimeter": {
      const results = op.lotId ? plan.lots.filter((r) => r.lot.id === op.lotId) : plan.lots;
      const usable = results.filter((r) => r.parcel);
      const area = op.topic === "lot_area";
      if (usable.length === 0) return { title: area ? "Lot areas" : "Perimeters", rows: [], note: "No lot has its corners yet.", speak: "No lot has its corners yet." };
      const rows = usable.slice(0, 20).map((r): [string, string] => [`Lot ${lotName(r.lot) || "without a label"}`, area ? areaRow(r.parcel!.areaM2, decimals) : `${r.parcel!.perimeterM.toFixed(2)} m`]);
      const first = usable[0]!;
      return {
        title: area ? (usable.length === 1 ? `Lot ${lotName(first.lot)}'s area` : "Lot areas") : usable.length === 1 ? `Lot ${lotName(first.lot)}'s perimeter` : "Perimeters",
        rows,
        note: area ? "Grid areas by the coordinate method." : "The sum of each lot's legs, in grid metres.",
        speak: usable.length === 1 ? (area ? `Lot ${lotName(first.lot)} is ${speakDigits(hectares(first.parcel!.areaM2))} hectares.` : `Lot ${lotName(first.lot)}'s perimeter is ${speakDigits(first.parcel!.perimeterM.toFixed(2))} metres.`) : `${usable.length} lots; the figures are on the screen.`,
      };
    }
    case "checks": {
      const blocking = input.findings.filter((f) => f.blocks.includes("approval") || f.blocks.includes("export"));
      if (blocking.length === 0) return { title: "What the checks say", rows: [], note: "No check stops approval or export.", speak: "No check stops approval or export." };
      return {
        title: "What the checks say",
        rows: blocking.slice(0, 8).map((f): [string, string] => [f.blocks.includes("export") ? "Stops export" : "Stops approval", f.message]),
        note: blocking.length > 8 ? `And ${blocking.length - 8} more on the Check step.` : "Each is on the Check step with what to do.",
        speak: `${blocking.length} ${blocking.length === 1 ? "check stops" : "checks stop"} approval or export; they're on the screen.`,
      };
    }
    case "missing": {
      const rows: [string, string][] = [];
      const empty = KEY_FIELDS.filter(([k]) => !String(doc.sheet[k] ?? "").trim()).map(([, name]) => name);
      if (empty.length) rows.push(["Title fields still empty", empty.join(", ")]);
      const waiting = unreviewed(doc).length;
      if (waiting) rows.push(["Waiting for your check", `${waiting} ${waiting === 1 ? "item" : "items"}`]);
      const blocking = input.findings.filter((f) => f.blocks.includes("approval") || f.blocks.includes("export")).length;
      if (blocking) rows.push(["Checks that stop approval or export", String(blocking)]);
      if (doc.lots.length === 0) rows.push(["Lots", "None yet"]);
      return { title: "What's still needed", rows, note: rows.length ? "" : "Nothing obvious is missing. Look over the sheet, then approve it on the Export step.", speak: rows.length ? `${rows.length} things are still needed; they're on the screen.` : "Nothing obvious is missing." };
    }
    case "always_printed":
      return { title: "On every sheet", rows: [], note: "The north point, the scale bar and the title block always print: they're already on the sheet.", speak: "The north point, scale bar and title block are always on the sheet." };
    case "scale": {
      const rows: [string, string][] = [];
      if (input.scale) rows.push(["This sheet", `1:${input.scale}${doc.settings.scale === null ? " (chosen by Farbaek for the paper)" : ""}`]);
      if (input.suggestedScale && input.suggestedScale !== input.scale) rows.push(["Fits the paper", `1:${input.suggestedScale}`]);
      return { title: "The scale", rows, note: rows.length ? "Print at 100% (actual size): fitting to the page changes the scale." : "The scale shows once the lots have their corners.", speak: input.scale ? `The scale is one to ${speakDigits(String(input.scale))}.` : "There's no scale yet." };
    }
  }
}
