/**
 * What changed between two versions of a plan, in words (stage 191): the
 * lots and their corners, roads, adjoining lands, lines, the title, the
 * sheet settings, codes, notes and checks of AI-filled items. Like a CAD
 * drawing compare, but as a list a surveyor can read before approving.
 * Points are named by their numbers; nothing is computed here.
 */
import { lotName, type DrawingSettings, type SheetFields, type SurveyDocument } from "./document";
import type { SurveyPoint } from "./parcel";

export type ChangeArea = "Lots" | "Roads" | "Adjoining lands" | "Lines and outlines" | "Title" | "Sheet" | "Codes" | "Notes" | "Checks";
export interface Change {
  area: ChangeArea;
  text: string;
}

const FIELD_LABELS: Partial<Record<keyof SheetFields, string>> = {
  planNumber: "Plan number",
  planDate: "Signed on",
  landName: "Land called",
  alias: "Alias",
  nowKnownAs: "Now called and known as",
  operation: "The survey",
  parentLots: "Of lot",
  customClause: "Own wording",
  village: "Village",
  pattu: "Pattu",
  korale: "Korale",
  gnDivision: "GN division",
  dsDivision: "DS division",
  district: "District",
  province: "Province",
  previousPlans: "Earlier plans",
  statedExtent: "Stated extent",
  surveyDate: "Surveyed on",
  partitionDate: "Partitioned on",
  statement: "Statement",
  remarks: "Remarks",
};

const PREVIOUS_LABELS: Record<keyof SheetFields["previousPlan"], string> = { number: "Earlier plan number", date: "Earlier plan date", by: "Earlier plan made by", byDesignation: "Their designation", mine: "My own earlier plan", filing: "Filed of record in" };
const SIDES: Record<keyof SheetFields["boundaries"], string> = { north: "North by", east: "East by", south: "South by", west: "West by" };

const SETTING_LABELS: Record<keyof DrawingSettings, string> = {
  template: "Layout",
  paper: "Paper",
  orientation: "Orientation",
  scale: "Scale",
  perchDecimals: "Perch decimals",
  secondDecimals: "Second decimals",
  distanceDecimals: "Distance decimals",
  overleaf: "Boundaries schedule overleaf",
  permitBox: "Development permit box",
  slant: "Slanted lettering",
  faceDimensions: "Bearings and distances on the face",
};

const short = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);
const shown = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "nothing";
  if (typeof v === "boolean") return v ? "on" : "off";
  return short(String(v));
};
const changed = (label: string, a: unknown, b: unknown) => (b === "" || b === null ? `${label} cleared (was ${shown(a)}).` : a === "" || a === null ? `${label} set to ${shown(b)}.` : `${label} changed from ${shown(a)} to ${shown(b)}.`);

/** The changes from `before` to `after`, in reading order. */
export function compareDocuments(before: SurveyDocument, after: SurveyDocument, points: readonly SurveyPoint[]): Change[] {
  const out: Change[] = [];
  const add = (area: ChangeArea, text: string) => out.push({ area, text });
  const numbers = new Map(points.map((p) => [p.id, p.pointId]));
  const ring = (ids: readonly string[]) => ids.map((id) => numbers.get(id) ?? "?").join(" ");

  // Lots, matched by their label as written on the plan.
  const lotsBefore = new Map(before.lots.map((l) => [lotName(l), l]));
  const lotsAfter = new Map(after.lots.map((l) => [lotName(l), l]));
  for (const [name, l] of lotsAfter) {
    const was = lotsBefore.get(name);
    if (!was) add("Lots", `Lot ${name} added, corners ${ring(l.points)}.`);
    else {
      if (ring(was.points) !== ring(l.points)) add("Lots", `Lot ${name}'s corners changed from ${ring(was.points)} to ${ring(l.points)}.`);
      if (was.note !== l.note) add("Lots", changed(`Lot ${name}'s note`, was.note, l.note));
    }
  }
  for (const name of lotsBefore.keys()) if (!lotsAfter.has(name)) add("Lots", `Lot ${name} removed.`);

  // Roads, by name (or id when unnamed).
  const roadKey = (r: SurveyDocument["roads"][number]) => r.name.trim() || r.id;
  const roadsBefore = new Map(before.roads.map((r) => [roadKey(r), r]));
  const roadsAfter = new Map(after.roads.map((r) => [roadKey(r), r]));
  for (const [name, r] of roadsAfter) {
    const was = roadsBefore.get(name);
    if (!was) add("Roads", `${name} added, along ${ring(r.edgeA)}${r.edgeB.length ? ` and ${ring(r.edgeB)}` : ""}.`);
    else {
      if (ring(was.edgeA) !== ring(r.edgeA) || ring(was.edgeB) !== ring(r.edgeB)) add("Roads", `${name}'s edges changed to ${ring(r.edgeA)}${r.edgeB.length ? ` and ${ring(r.edgeB)}` : ""}.`);
      if (was.width !== r.width) add("Roads", `${name}'s width is now written ${r.width === "none" ? "nowhere" : `in ${r.width}`}.`);
      if (was.start !== r.start || was.end !== r.end) add("Roads", `${name}'s direction texts changed.`);
    }
  }
  for (const name of roadsBefore.keys()) if (!roadsAfter.has(name)) add("Roads", `${name} removed.`);

  // Adjoining lands, by their text; where they sit, by lot label and leg.
  const lotLabel = (doc: SurveyDocument, id: string) => {
    const l = doc.lots.find((x) => x.id === id);
    return l ? lotName(l) : "?";
  };
  const where = (doc: SurveyDocument, a: SurveyDocument["adjoining"][number]) => {
    const l = doc.lots.find((x) => x.id === a.lot);
    if (!l) return "a lot that's no longer on the plan";
    const from = numbers.get(l.points[a.leg] ?? "") ?? "?";
    const to = numbers.get(l.points[(a.leg + 1) % l.points.length] ?? "") ?? "?";
    return `lot ${lotName(l)} between ${from} and ${to}`;
  };
  const adjBefore = new Map(before.adjoining.map((a) => [a.text, a]));
  const adjAfter = new Map(after.adjoining.map((a) => [a.text, a]));
  for (const [text, a] of adjAfter) {
    const was = adjBefore.get(text);
    if (!was) add("Adjoining lands", `${short(text)} added, beside ${where(after, a)}.`);
    else if (!after.lots.some((l) => l.id === a.lot)) add("Adjoining lands", `${short(text)} is left beside a lot that's no longer on the plan.`);
    else if (where(before, was) !== where(after, a)) add("Adjoining lands", `${short(text)} moved to ${where(after, a)}.`);
  }
  for (const text of adjBefore.keys()) if (!adjAfter.has(text)) add("Adjoining lands", `${short(text)} removed.`);

  // Lines and outlines, counted by code.
  const featureCount = (doc: SurveyDocument) => {
    const m = new Map<string, number>();
    for (const f of doc.features) m.set(f.code || f.layer, (m.get(f.code || f.layer) ?? 0) + 1);
    return m;
  };
  const fb = featureCount(before);
  const fa = featureCount(after);
  for (const code of new Set([...fb.keys(), ...fa.keys()])) {
    const x = fb.get(code) ?? 0;
    const y = fa.get(code) ?? 0;
    if (x !== y) add("Lines and outlines", `${code}: ${x} before, ${y} now.`);
  }
  const ids = (doc: SurveyDocument) => new Map(doc.features.map((f) => [f.id, ring(f.points)]));
  const ib = ids(before);
  const reshaped = [...ids(after)].filter(([id, r]) => ib.has(id) && ib.get(id) !== r).length;
  if (reshaped > 0) add("Lines and outlines", `${reshaped} ${reshaped === 1 ? "line runs" : "lines run"} through different points.`);

  // The title.
  for (const key of Object.keys(FIELD_LABELS) as (keyof typeof FIELD_LABELS)[]) {
    const a = before.sheet[key];
    const b = after.sheet[key];
    if (a !== b) add("Title", changed(FIELD_LABELS[key]!, a, b));
  }
  for (const key of Object.keys(PREVIOUS_LABELS) as (keyof SheetFields["previousPlan"])[]) {
    if (before.sheet.previousPlan[key] !== after.sheet.previousPlan[key]) add("Title", changed(PREVIOUS_LABELS[key], before.sheet.previousPlan[key], after.sheet.previousPlan[key]));
  }
  for (const key of Object.keys(SIDES) as (keyof SheetFields["boundaries"])[]) {
    if (before.sheet.boundaries[key] !== after.sheet.boundaries[key]) add("Title", changed(SIDES[key], before.sheet.boundaries[key], after.sheet.boundaries[key]));
  }
  if (before.sheet.extractOf !== after.sheet.extractOf) add("Sheet", after.sheet.extractOf ? `Now an extract of lot ${lotLabel(after, after.sheet.extractOf)}.` : "No longer an extract: the whole plan.");
  if (before.surveyorUserId !== after.surveyorUserId) add("Title", after.surveyorUserId ? "The responsible surveyor changed." : "No surveyor is chosen now.");

  // Sheet settings and presentation.
  for (const key of Object.keys(SETTING_LABELS) as (keyof DrawingSettings)[]) {
    const a = before.settings[key];
    const b = after.settings[key];
    if (a !== b) add("Sheet", key === "scale" ? `Scale changed from ${a ? `1:${a}` : "automatic"} to ${b ? `1:${b}` : "automatic"}.` : changed(SETTING_LABELS[key], a, b));
  }
  const moved = new Set([...Object.keys(before.labelOffsets), ...Object.keys(after.labelOffsets)].filter((k) => JSON.stringify(before.labelOffsets[k]) !== JSON.stringify(after.labelOffsets[k]))).size;
  if (moved > 0) add("Sheet", `${moved} ${moved === 1 ? "label was" : "labels were"} moved on paper.`);
  const layerChanges = (Object.keys(after.layers) as (keyof SurveyDocument["layers"])[]).filter((k) => before.layers[k]?.visible !== after.layers[k]?.visible);
  if (layerChanges.length > 0) add("Sheet", `${layerChanges.length} ${layerChanges.length === 1 ? "layer was" : "layers were"} shown or hidden.`);

  // Codes and notes.
  const codesBefore = new Map(before.codes.map((c) => [c.code, c]));
  const codesAfter = new Map(after.codes.map((c) => [c.code, c]));
  for (const [code, c] of codesAfter) {
    const was = codesBefore.get(code);
    if (!was) add("Codes", `${code} added: ${c.meaning}.`);
    else if (was.meaning !== c.meaning || was.kind !== c.kind || was.line !== c.line || was.legend !== c.legend) add("Codes", `${code} changed.`);
  }
  for (const code of codesBefore.keys()) if (!codesAfter.has(code)) add("Codes", `${code} removed.`);
  for (const n of after.notes) if (!before.notes.includes(n)) add("Notes", `Added: ${short(n)}`);
  for (const n of before.notes) if (!after.notes.includes(n)) add("Notes", `Removed: ${short(n)}`);

  // AI-filled items the surveyor checked, or that arrived.
  const checkedNow = Object.entries(after.provenance).filter(([k, p]) => p.reviewed && before.provenance[k] && !before.provenance[k]!.reviewed).length;
  const arrived = Object.entries(after.provenance).filter(([k, p]) => !p.reviewed && p.source !== "engine" && !before.provenance[k]).length;
  if (arrived > 0) add("Checks", `${arrived} ${arrived === 1 ? "item was" : "items were"} filled in by the AI, waiting to be checked.`);
  if (checkedNow > 0) add("Checks", `${checkedNow} ${checkedNow === 1 ? "item filled in by the AI was" : "items filled in by the AI were"} checked.`);
  return out;
}
