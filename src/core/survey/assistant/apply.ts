/**
 * Applying the drafting assistant's checked changes to a plan (stage 195).
 * One function makes the preview and the real edit, so what the surveyor saw
 * is what's applied. It runs on the editor's current document each time, so
 * changes made by hand meanwhile are kept.
 *
 * Views, history, answers and hand-overs aren't changes to the document; the
 * editor does those. What the assistant adds is marked as from the assistant,
 * checked (the surveyor applied it after seeing it). Every application leaves
 * a patch: the parts of the document before and after, so the turn can be
 * taken back later, after a save, if nothing has changed those parts since.
 */
import { canonicalize } from "../../trust/canonical-json";
import { pruneProvenance, surveyDocumentSchema, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { ASSIST_FIELD_KEY, type PlanOp } from "./ops";
import { remapRuns } from "../lotcurves";

/** The top-level parts of a plan an application can touch. */
type Part = "lots" | "roads" | "adjoining" | "features" | "notes" | "sheet" | "settings" | "layers" | "labelOffsets" | "provenance";

export interface Patch {
  parts: Part[];
  before: Partial<Pick<SurveyDocument, Part>>;
  after: Partial<Pick<SurveyDocument, Part>>;
}

export type Applied = { ok: true; doc: SurveyDocument; touched: string[]; patch: Patch; skipped: { what: string; why: string }[] } | { ok: false; error: string };

const assisted = { source: "ai_assist" as const, reviewed: true };
const clamp = (v: number) => Math.max(-200, Math.min(200, v));

function setPath(doc: SurveyDocument, key: string, value: unknown) {
  const parts = key.split(".");
  const last = parts.pop()!;
  const target = parts.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, doc as unknown as Record<string, unknown>);
  target[last] = value;
}

/** Applies the changes in order. Changes that no longer fit (a lot removed meanwhile) are skipped with the reason. */
export function applyOps(base: SurveyDocument, ops: readonly PlanOp[], points: readonly SurveyPoint[]): Applied {
  const doc: SurveyDocument = structuredClone(base);
  const touched: string[] = [];
  const parts = new Set<Part>();
  const skipped: { what: string; why: string }[] = [];
  const pointIds = new Set(points.map((p) => p.id));
  const realPoints = (ids: readonly string[]) => ids.every((id) => pointIds.has(id));
  for (const op of ops) {
    switch (op.kind) {
      case "layer": {
        const cur = doc.layers[op.layer] ?? { visible: true, locked: false };
        doc.layers[op.layer] = { visible: op.visible ?? cur.visible, locked: op.locked ?? cur.locked };
        parts.add("layers");
        break;
      }
      case "label": {
        const cur = doc.labelOffsets[op.entity] ?? { dx: 0, dy: 0 };
        const slot = cur.slot ?? op.slot;
        doc.labelOffsets[op.entity] = { dx: clamp(cur.dx + op.dx), dy: clamp(cur.dy + op.dy), ...(slot !== undefined ? { slot } : {}) };
        touched.push(op.entity);
        parts.add("labelOffsets");
        break;
      }
      case "label_back":
        delete doc.labelOffsets[op.entity];
        touched.push(op.entity);
        parts.add("labelOffsets");
        break;
      case "sheet":
        (doc.settings as Record<string, unknown>)[op.setting] = op.value;
        // Dimensions on the face need their layer showing.
        if (op.setting === "faceDimensions" && op.value) {
          doc.layers.DIMENSIONS = { visible: true, locked: doc.layers.DIMENSIONS?.locked ?? false };
          parts.add("layers");
        }
        parts.add("settings");
        break;
      case "number":
        (doc.settings as Record<string, unknown>)[op.setting] = op.value;
        parts.add("settings");
        break;
      case "lot_add":
        if (!realPoints(op.lot.points)) {
          skipped.push({ what: `Lot ${op.lot.label}${op.lot.sup}`, why: "One of its corners isn't in the project any more." });
          break;
        }
        doc.lots.push(structuredClone(op.lot));
        doc.provenance[`lot:${op.lot.id}`] = assisted;
        touched.push(`lot:${op.lot.id}`);
        parts.add("lots").add("provenance");
        break;
      case "lot_edit": {
        const lot = doc.lots.find((l) => l.id === op.id);
        if (!lot) {
          skipped.push({ what: "A lot", why: "It was removed since this was suggested." });
          break;
        }
        if (op.points && !realPoints(op.points)) {
          skipped.push({ what: "A lot's corners", why: "One of them isn't in the project any more." });
          break;
        }
        if (op.label !== undefined) lot.label = op.label;
        if (op.sup !== undefined) lot.sup = op.sup;
        if (op.note !== undefined) lot.note = op.note;
        // Only new corners come from the assistant. A new name or note keeps where the corners came from, and whether they were
        // checked: renaming an unchecked AI-drafted lot doesn't check its corners.
        if (op.points) {
          // Its curves (ADR 0276) follow their points to the new corners; one whose points are no longer corners in a row drops.
          const curves = remapRuns(lot.points, op.points, lot.arcs);
          if (curves.runs.length > 0) lot.arcs = curves.runs;
          else delete lot.arcs;
          lot.points = [...op.points];
          doc.provenance[`lot:${lot.id}`] = assisted;
        }
        touched.push(`lot:${lot.id}`);
        parts.add("lots").add("provenance");
        break;
      }
      case "road_add":
        if (!realPoints([...op.road.edgeA, ...op.road.edgeB])) {
          skipped.push({ what: "A road", why: "One of its edge points isn't in the project any more." });
          break;
        }
        doc.roads.push(structuredClone(op.road));
        doc.provenance[`road:${op.road.id}`] = assisted;
        touched.push(`road:${op.road.id}`);
        parts.add("roads").add("provenance");
        break;
      case "adjoining_add":
        if (!doc.lots.some((l) => l.id === op.adjoining.lot)) {
          skipped.push({ what: `"${op.adjoining.text}"`, why: "Its lot was removed since this was suggested." });
          break;
        }
        doc.adjoining.push(structuredClone(op.adjoining));
        doc.provenance[`adjoining:${op.adjoining.id}`] = assisted;
        touched.push(`adjoining:${op.adjoining.id}`);
        parts.add("adjoining").add("provenance");
        break;
      case "feature_add":
        if (!realPoints(op.feature.points)) {
          skipped.push({ what: "A line", why: "One of its points isn't in the project any more." });
          break;
        }
        doc.features.push(structuredClone(op.feature));
        doc.provenance[`feature:${op.feature.id}`] = assisted;
        touched.push(`feature:${op.feature.id}`);
        parts.add("features").add("provenance");
        break;
      case "field": {
        const key = ASSIST_FIELD_KEY[op.field];
        setPath(doc, key, op.value);
        doc.provenance[key] = assisted;
        parts.add("sheet").add("provenance");
        break;
      }
      case "note_add":
        doc.notes.push(op.text);
        parts.add("notes");
        break;
      case "remove":
        if (op.target === "note") {
          if (op.index < doc.notes.length) doc.notes.splice(op.index, 1);
          parts.add("notes");
        } else if (op.target === "lot") {
          doc.lots = doc.lots.filter((l) => l.id !== op.id);
          // Adjoining lands drawn against the lot go with it.
          doc.adjoining = doc.adjoining.filter((a) => a.lot !== op.id);
          parts.add("lots").add("adjoining").add("provenance");
        } else if (op.target === "road") {
          doc.roads = doc.roads.filter((r) => r.id !== op.id);
          parts.add("roads").add("provenance");
        } else if (op.target === "adjoining") {
          doc.adjoining = doc.adjoining.filter((a) => a.id !== op.id);
          parts.add("adjoining").add("provenance");
        } else {
          doc.features = doc.features.filter((f) => f.id !== op.id);
          parts.add("features").add("provenance");
        }
        break;
      default:
        // Views, history, answers and hand-overs: the editor's, not the document's.
        break;
    }
  }
  const result = pruneProvenance(doc);
  const parsed = surveyDocumentSchema.safeParse(result);
  if (!parsed.success) return { ok: false, error: "The change wouldn't make a plan that saves, so nothing was applied." };
  const list = [...parts];
  const pick = (d: SurveyDocument) => Object.fromEntries(list.map((p) => [p, structuredClone(d[p])])) as Patch["before"];
  return { ok: true, doc: parsed.data, touched, patch: { parts: list, before: pick(base), after: pick(parsed.data) }, skipped };
}

/** Takes a turn back: restores each part it changed, if that part is still as the turn left it. Otherwise names the parts changed since. */
export function revertPatch(current: SurveyDocument, patch: Patch): { ok: true; doc: SurveyDocument } | { ok: false; changedSince: string[] } {
  const changedSince = patch.parts.filter((p) => canonicalize(current[p]) !== canonicalize(patch.after[p]));
  if (changedSince.length > 0) return { ok: false, changedSince };
  const doc = structuredClone(current);
  for (const p of patch.parts) (doc as Record<string, unknown>)[p] = structuredClone(patch.before[p]);
  return { ok: true, doc };
}
