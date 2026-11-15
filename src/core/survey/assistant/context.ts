/**
 * What the drafting assistant's model is told about the plan (stage 195):
 * short refs (L1 for the first lot, R1 for a road, P:12 for point 12), names
 * and point numbers, never a coordinate, a distance or an area. Measured
 * values are code's business. Text the plan holds (adjoining names, notes) is
 * marked as data the model mustn't follow.
 */
import type { SurveyDocument } from "../document";
import { lotName, LAYER_IDS } from "../document";
import type { SurveyPoint } from "../parcel";
import { ASSIST_FIELD_KEY, ASSIST_FIELDS } from "./ops";
import { getPath } from "../ai-draft";

/** Ref to entity id: "L1" is "lot:<id>", "P:12" is "pt:<uuid>", "N1" is "note:0". */
export type RefMap = Record<string, string>;

/** Parts of the sheet whose labels can be moved, by the names the model uses. */
export const SHEET_PARTS = ["title", "heading", "region", "boundaries", "extent", "legend", "notes", "dates", "surveyor", "plan-number", "signature", "scale"] as const;

export interface AssistContextInput {
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  /** Entity ids selected on the sheet, in the order picked. */
  selection: readonly string[];
  /** One-line summaries of the last turns, newest last. */
  recent: readonly string[];
  step: string;
}

export interface AssistContext {
  /** Sent to the model as JSON. */
  plan: Record<string, unknown>;
  refs: RefMap;
}

const MAX_POINTS = 400;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

export function assistContext(input: AssistContextInput): AssistContext {
  const { doc, points } = input;
  const refs: RefMap = {};
  const number = new Map(points.map((p) => [p.id, p.pointId]));
  const nums = (ids: readonly string[]) => ids.map((id) => number.get(id) ?? "?");
  for (const p of points) refs[`P:${p.pointId}`] = `pt:${p.id}`;
  const lots = doc.lots.map((l, i) => {
    refs[`L${i + 1}`] = `lot:${l.id}`;
    return { ref: `L${i + 1}`, name: lotName(l) || "(no label)", corners: nums(l.points), note: l.note ? "(has a note)" : "" };
  });
  const lotRef = new Map(doc.lots.map((l, i) => [l.id, `L${i + 1}`]));
  const roads = doc.roads.map((r, i) => {
    refs[`R${i + 1}`] = `road:${r.id}`;
    return { ref: `R${i + 1}`, name: r.name ? { data: clip(r.name, 80) } : "", edgeA: nums(r.edgeA), edgeB: nums(r.edgeB) };
  });
  const adjoining = doc.adjoining.map((a, i) => {
    refs[`A${i + 1}`] = `adjoining:${a.id}`;
    return { ref: `A${i + 1}`, text: { data: clip(a.text, 120) }, lot: lotRef.get(a.lot) ?? "?", leg: nums([a.from, a.to]) };
  });
  const lines = doc.features.slice(0, 120).map((f, i) => {
    refs[`F${i + 1}`] = `feature:${f.id}`;
    return { ref: `F${i + 1}`, layer: f.layer, code: f.code, points: f.points.length > 12 ? `${nums(f.points.slice(0, 6)).join(" ")} … (${f.points.length} points)` : nums(f.points) };
  });
  const notes = doc.notes.map((n, i) => {
    refs[`N${i + 1}`] = `note:${i}`;
    return { ref: `N${i + 1}`, text: { data: clip(n, 120) } };
  });
  for (const part of SHEET_PARTS) refs[part] = part;
  const filled = ASSIST_FIELDS.filter((f) => {
    const v = getPath(doc, ASSIST_FIELD_KEY[f]);
    return typeof v === "boolean" ? v : typeof v === "string" ? v.trim() !== "" : false;
  });
  // The selection as refs the model can use, in the order picked.
  const reverse = new Map(Object.entries(refs).map(([k, v]) => [v, k]));
  const selection = input.selection.map((e) => {
    const [kind, ...rest] = e.split(":");
    if (kind === "leg") return { ref: `${reverse.get(`lot:${rest[0]}`) ?? "?"} leg ${Number(rest[1]) + 1}`, kind: "leg" };
    if (kind === "mark") return { ref: reverse.get(`pt:${rest.join(":")}`) ?? "?", kind: "point" };
    return { ref: reverse.get(e) ?? e, kind: kind === "pt" ? "point" : kind ?? "item" };
  });
  const coded = points.slice(0, MAX_POINTS).map((p) => (p.code ? `${p.pointId} ${clip(p.code, 24)}` : p.pointId));
  const layers = LAYER_IDS.filter((l) => l !== "TITLE");
  return {
    refs,
    plan: {
      step: input.step,
      operation: doc.sheet.operation,
      template: doc.settings.template,
      paper: doc.settings.paper,
      orientation: doc.settings.orientation,
      scale: doc.settings.scale === null ? "automatic" : "set by the surveyor",
      faceDimensions: doc.settings.faceDimensions,
      layersHidden: layers.filter((l) => doc.layers[l]?.visible === false),
      layersLocked: layers.filter((l) => doc.layers[l]?.locked === true),
      lots,
      roads,
      adjoining,
      lines,
      linesNotListed: Math.max(0, doc.features.length - lines.length),
      notes,
      titleFieldsFilled: filled,
      titleFieldsEmpty: ASSIST_FIELDS.filter((f) => !filled.includes(f)),
      points: coded,
      pointsNotListed: Math.max(0, points.length - MAX_POINTS),
      selection,
      recent: input.recent.slice(-6).map((r) => clip(r, 160)),
    },
  };
}
