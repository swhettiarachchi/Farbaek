/**
 * What changed between two versions of a plan, in words (stage 191): the
 * lots and their corners, roads, adjoining lands, lines, the title, the
 * sheet settings, codes, notes and checks of AI-filled items. Like a CAD
 * drawing compare, but as a list a surveyor can read before approving.
 * Points are named by their numbers; nothing is computed here.
 */
import { lotName, type DrawingSettings, type SheetFields, type SurveyDocument } from "./document";
import type { SurveyPoint } from "./parcel";
import { minimumText } from "./rules";

export type ChangeArea = "Lots" | "Roads" | "Adjoining lands" | "Lines and outlines" | "Words and symbols" | "Title" | "Sheet" | "Codes" | "Notes" | "Checks";
export interface Change {
  area: ChangeArea;
  text: string;
}

/** What the review screens call an item a provenance key names: "sheet.previousPlan.number" is "Earlier plan number". */
export function itemLabel(key: string): string | null {
  if (key.startsWith("sheet.previousPlan.")) return PREVIOUS_LABELS[key.slice(19) as keyof SheetFields["previousPlan"]] ?? null;
  if (key === "sheet.previousPlan") return "The earlier plan";
  if (key.startsWith("sheet.boundaries.")) return SIDES[key.slice(17) as keyof SheetFields["boundaries"]] ?? null;
  if (key.startsWith("sheet.")) return FIELD_LABELS[key.slice(6) as keyof SheetFields] ?? null;
  return null;
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
  crowdedLegsToSchedule: "Crowded legs left to the schedule",
  noCornerCircles: "Corners drawn without circles",
  noLotLetters: "Lot letters left off the drawing",
  wallTicks: "Walls lettered small with a tick",
  thinBoundary: "Lot boundaries drawn thin",
  deedExtentOnFace: "The deed's extent on the face",
};

const short = (s: string) => (s.length > 80 ? `${s.slice(0, 79)}…` : s);
const shown = (v: unknown): string => {
  if (v === null || v === undefined || v === "") return "nothing";
  if (typeof v === "boolean") return v ? "on" : "off";
  return short(String(v));
};
const changed = (label: string, a: unknown, b: unknown) => (b === "" || b === null ? `${label} cleared (was ${shown(a)}).` : a === "" || a === null ? `${label} set to ${shown(b)}.` : `${label} changed from ${shown(a)} to ${shown(b)}.`);

/** Pairs items of two versions: by id first, then by name among the rest. */
function pair<T extends { id: string }>(before: readonly T[], after: readonly T[], name: (x: T) => string): { matched: [T, T][]; added: T[]; removed: T[] } {
  const left = [...before];
  const matched: [T, T][] = [];
  const added: T[] = [];
  const pending: T[] = [];
  for (const x of after) {
    const i = left.findIndex((y) => y.id === x.id);
    if (i >= 0) matched.push([left.splice(i, 1)[0]!, x]);
    else pending.push(x);
  }
  for (const x of pending) {
    const i = left.findIndex((y) => name(y) === name(x));
    if (i >= 0) matched.push([left.splice(i, 1)[0]!, x]);
    else added.push(x);
  }
  return { matched, added, removed: left };
}

/** The changes from `before` to `after`, in reading order. */
export function compareDocuments(before: SurveyDocument, after: SurveyDocument, points: readonly SurveyPoint[]): Change[] {
  const out: Change[] = [];
  const add = (area: ChangeArea, text: string) => out.push({ area, text });
  const numbers = new Map(points.map((p) => [p.id, p.pointId]));
  // A constructed square corner (ADR 0270) reads as the word the editor and the sketch reader write for it.
  const corners = new Set([...(before.constructed ?? []), ...(after.constructed ?? [])].map((c) => c.id));
  const ring = (ids: readonly string[]) => ids.map((id) => numbers.get(id) ?? (corners.has(id) ? "corner" : "?")).join(" ");

  // Lots, roads and adjoining lands are matched by id, then by name: a redraft that renumbers ids still reads as the same lot.
  const lotTitle = (l: SurveyDocument["lots"][number]) => lotName(l) || "without a label";
  const lots = pair(before.lots, after.lots, lotTitle);
  for (const [was, l] of lots.matched) {
    const name = lotTitle(l);
    if (lotTitle(was) !== name) add("Lots", `Lot ${lotTitle(was)} is now lot ${name}.`);
    if (ring(was.points) !== ring(l.points)) add("Lots", `Lot ${name}'s corners changed from ${ring(was.points)} to ${ring(l.points)}.`);
    if (was.note !== l.note) add("Lots", changed(`Lot ${name}'s note`, was.note, l.note));
  }
  for (const l of lots.added) add("Lots", `Lot ${lotTitle(l)} added, corners ${ring(l.points)}.`);
  for (const l of lots.removed) add("Lots", `Lot ${lotTitle(l)} removed.`);

  const roadTitle = (r: SurveyDocument["roads"][number]) => r.name.trim() || "A road without a name";
  const roads = pair(before.roads, after.roads, roadTitle);
  for (const [was, r] of roads.matched) {
    const name = roadTitle(r);
    if (roadTitle(was) !== name) add("Roads", `${roadTitle(was)} is now called ${name}.`);
    if (ring(was.edgeA) !== ring(r.edgeA) || ring(was.edgeB) !== ring(r.edgeB)) add("Roads", `${name}'s edges changed to ${ring(r.edgeA)}${r.edgeB.length ? ` and ${ring(r.edgeB)}` : ""}.`);
    if (was.width !== r.width) add("Roads", `${name}'s width is now written ${r.width === "none" ? "nowhere" : `in ${r.width}`}.`);
    if (was.start !== r.start || was.end !== r.end) add("Roads", `${name}'s direction texts changed.`);
  }
  for (const r of roads.added) add("Roads", `${roadTitle(r)} added, along ${ring(r.edgeA)}${r.edgeB.length ? ` and ${ring(r.edgeB)}` : ""}.`);
  for (const r of roads.removed) add("Roads", `${roadTitle(r)} removed.`);

  const where = (doc: SurveyDocument, a: SurveyDocument["adjoining"][number]) => {
    const l = doc.lots.find((x) => x.id === a.lot);
    if (!l) return "a lot that's no longer on the plan";
    return `lot ${lotTitle(l)} between ${numbers.get(a.from) ?? "?"} and ${numbers.get(a.to) ?? "?"}`;
  };
  const adj = pair(before.adjoining, after.adjoining, (x) => x.text);
  for (const [was, a] of adj.matched) {
    if (was.text !== a.text) add("Adjoining lands", changed(`The label beside ${where(after, a)}`, was.text, a.text));
    if (!after.lots.some((l) => l.id === a.lot)) add("Adjoining lands", `${short(a.text)} is left beside a lot that's no longer on the plan.`);
    else if (where(before, was) !== where(after, a)) add("Adjoining lands", `${short(a.text)} moved to ${where(after, a)}.`);
  }
  for (const a of adj.added) add("Adjoining lands", `${short(a.text)} added, beside ${where(after, a)}.`);
  for (const a of adj.removed) add("Adjoining lands", `${short(a.text)} removed.`);

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
  // A line drawn as a curve now, or straight again (ADR 0247), through the same points.
  const curvesOf = (doc: SurveyDocument) => new Map(doc.features.map((f) => [f.id, JSON.stringify(f.arcs ?? [])]));
  const cb = curvesOf(before);
  const recurved = [...curvesOf(after)].filter(([id, c]) => cb.has(id) && cb.get(id) !== c && ib.get(id) === ids(after).get(id)).length;
  if (recurved > 0) add("Lines and outlines", `${recurved} ${recurved === 1 ? "line is" : "lines are"} drawn with different curves through the same points.`);

  // Lines drawn dashed now, or no longer (stage 254).
  const dashedOf = (doc: SurveyDocument) => new Map(doc.features.map((f) => [f.id, f.dashed === true]));
  const db = dashedOf(before);
  const redashed = [...dashedOf(after)].filter(([id, d]) => db.has(id) && db.get(id) !== d).length;
  if (redashed > 0) add("Lines and outlines", `${redashed} ${redashed === 1 ? "line is" : "lines are"} drawn dashed now, or no longer.`);
  const onOf = (doc: SurveyDocument) => new Map(doc.features.map((f) => [f.id, f.runsOn ?? ""]));
  const ob = onOf(before);
  const rerun = [...onOf(after)].filter(([id, r]) => ob.has(id) && ob.get(id) !== r).length;
  // A constructed point's whole recipe (its kind, its points and any measurements), so a change to any of it is said.
  const recipe = (d: SurveyDocument) => new Map((d.constructed ?? []).map((c) => [c.id, JSON.stringify({ ...c, id: undefined })]));
  const [rb, ra] = [recipe(before), recipe(after)];
  const cornersAdded = [...ra.keys()].filter((k) => !rb.has(k)).length;
  const cornersGone = [...rb.keys()].filter((k) => !ra.has(k)).length;
  const cornersSquared = [...ra].filter(([k, r]) => rb.has(k) && rb.get(k) !== r).length;
  if (cornersAdded > 0) add("Lines and outlines", cornersAdded === 1 ? "A point that wasn't surveyed was added." : `${cornersAdded} points that weren't surveyed were added.`);
  if (cornersGone > 0) add("Lines and outlines", cornersGone === 1 ? "A point that wasn't surveyed was taken out." : `${cornersGone} points that weren't surveyed were taken out.`);
  if (cornersSquared > 0) add("Lines and outlines", cornersSquared === 1 ? "A point that wasn't surveyed is worked out differently now." : `${cornersSquared} points that weren't surveyed are worked out differently now.`);
  if (rerun > 0) add("Lines and outlines", `${rerun} ${rerun === 1 ? "line is" : "lines are"} drawn on past ${rerun === 1 ? "its" : "their"} ends differently.`);

  // Words on the plan and symbols given to points (stage 255).
  const placeOf = (x: NonNullable<SurveyDocument["texts"]>[number]) => (x.along ? `along ${ring([x.at])} to ${ring([x.along])}` : `beside ${ring([x.at])}`);
  const words = pair(before.texts ?? [], after.texts ?? [], (x) => x.text);
  for (const [was, x] of words.matched) {
    if (was.text !== x.text) add("Words and symbols", `"${short(was.text)}" now reads "${short(x.text)}".`);
    if (placeOf(was) !== placeOf(x)) add("Words and symbols", `"${short(x.text)}" is now ${placeOf(x)}.`);
  }
  for (const x of words.added) add("Words and symbols", `"${short(x.text)}" added, ${placeOf(x)}.`);
  for (const x of words.removed) add("Words and symbols", `"${short(x.text)}" removed.`);
  const symbolsOf = (doc: SurveyDocument) => new Map((doc.symbols ?? []).map((s) => [s.point, s.code]));
  const sb = symbolsOf(before);
  const sa = symbolsOf(after);
  for (const [point, code] of sa) if (sb.get(point) !== code) add("Words and symbols", `Point ${ring([point])} is drawn as ${code}${sb.has(point) ? ` (was ${sb.get(point)})` : ""}.`);
  for (const [point, code] of sb) if (!sa.has(point)) add("Words and symbols", `Point ${ring([point])} is no longer drawn as ${code}.`);

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
  if (before.sheet.extractOf !== after.sheet.extractOf) add("Sheet", after.sheet.extractOf ? `Now an extract of lot ${(() => { const l = after.lots.find((x) => x.id === after.sheet.extractOf); return l ? lotTitle(l) : "?"; })()}.` : "No longer an extract: the whole plan.");
  if (before.surveyorUserId !== after.surveyorUserId) add("Title", after.surveyorUserId ? "The responsible surveyor changed." : "No surveyor is chosen now.");

  // Sheet settings and presentation.
  for (const key of Object.keys(SETTING_LABELS) as (keyof DrawingSettings)[]) {
    // A setting left out of a document is off: "crowded legs to the schedule" and "the deed's extent on the face" are absent until chosen.
    const optional = key === "crowdedLegsToSchedule" || key === "deedExtentOnFace" || key === "noCornerCircles" || key === "noLotLetters" || key === "wallTicks" || key === "thinBoundary";
    const a = optional ? (before.settings[key] ?? false) : before.settings[key];
    const b = optional ? (after.settings[key] ?? false) : after.settings[key];
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

  // The surveyor's answers to near misses.
  const keptNow = after.kept.filter((k) => !before.kept.includes(k)).length;
  const unkept = before.kept.filter((k) => !after.kept.includes(k)).length;
  if (keptNow > 0) add("Checks", `${keptNow} ${keptNow === 1 ? "near miss was" : "near misses were"} kept as surveyed.`);
  if (unkept > 0) add("Checks", `${unkept} ${unkept === 1 ? "near miss is" : "near misses are"} to be checked again.`);
  if (JSON.stringify(before.rules) !== JSON.stringify(after.rules)) {
    const rules = after.rules;
    const figures = rules?.id === "own" ? `${minimumText(rules.areaM2, false)} m², ${minimumText(rules.frontageM, true)} m frontage, ${minimumText(rules.depthM, true)} m depth` : "";
    add(
      "Checks",
      !rules
        ? "Lots are no longer checked against planning minimums."
        : rules.id === "uda-2020"
          ? "Lots are now checked against the UDA minimums."
          : rules.source.trim()
            ? `Lots are now checked against your own minimums (${figures}), from ${short(rules.source)}.`
            : `Your own minimums (${figures}) are set, and checked once you say where they come from.`,
    );
  }
  // Items filled in by the AI: new ones, ones checked since, and ones that need checking again.
  const ai = (p: { source: string }) => p.source === "ai_brief" || p.source === "ai_photo";
  const autoNew = Object.entries(after.provenance).filter(([k, p]) => p.source === "auto" && !before.provenance[k]);
  const autoNewChecked = autoNew.filter(([, p]) => p.reviewed).length;
  if (autoNew.length > 0) add("Checks", `${autoNew.length} ${autoNew.length === 1 ? "item was" : "items were"} drawn from the field data${autoNewChecked === autoNew.length ? ", all checked" : autoNewChecked > 0 ? `, ${autoNewChecked} of them checked` : ", waiting to be checked"}.`);
  const arrived = Object.entries(after.provenance).filter(([k, p]) => ai(p) && !before.provenance[k]);
  const arrivedChecked = arrived.filter(([, p]) => p.reviewed).length;
  const checkedNow = Object.entries(after.provenance).filter(([k, p]) => ai(p) && p.reviewed && before.provenance[k] && !before.provenance[k]!.reviewed).length;
  const autoChecked = Object.entries(after.provenance).filter(([k, p]) => p.source === "auto" && p.reviewed && before.provenance[k] && !before.provenance[k]!.reviewed).length;
  const again = Object.entries(after.provenance).filter(([k, p]) => (ai(p) || p.source === "auto") && !p.reviewed && before.provenance[k]?.reviewed).length;
  if (arrived.length > 0) add("Checks", `${arrived.length} ${arrived.length === 1 ? "item was" : "items were"} filled in by the AI${arrivedChecked === arrived.length ? ", all checked" : arrivedChecked > 0 ? `, ${arrivedChecked} of them checked` : ", waiting to be checked"}.`);
  if (checkedNow > 0) add("Checks", `${checkedNow} ${checkedNow === 1 ? "item filled in by the AI was" : "items filled in by the AI were"} checked.`);
  if (autoChecked > 0) add("Checks", `${autoChecked} ${autoChecked === 1 ? "item drawn from the field data was" : "items drawn from the field data were"} checked.`);
  if (again > 0) add("Checks", `${again} ${again === 1 ? "item needs" : "items need"} checking again.`);
  // What the drafting assistant added or changed (stage 195): each was applied by the surveyor after seeing it on the sheet.
  const assisted = Object.entries(after.provenance).filter(([k, p]) => p.source === "ai_assist" && before.provenance[k]?.source !== "ai_assist").length;
  if (assisted > 0) add("Checks", `${assisted} ${assisted === 1 ? "item was" : "items were"} added or changed with the drafting assistant, each applied by the surveyor after seeing it.`);
  return out;
}
