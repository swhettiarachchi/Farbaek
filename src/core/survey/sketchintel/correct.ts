/**
 * The surveyor's corrections of a sketch's reading (stage 249, ADR 0257): a number the reader got wrong ("10" that is really 20),
 * corrected once, and everything the sketch drew from it redrawn, so a plan comes right in a press instead of by hand.
 *
 * - **A correction is kept beside the reading,** with who made it and when; the reading itself stays as read, so the evidence is never
 *   rewritten. The engine reads the drawing with the corrections applied.
 * - **Redrawing touches only what the sketch drew and nobody has confirmed:** those items the corrected reading no longer proposes are
 *   taken off, and what it now proposes is put on, waiting for the surveyor as before. An item the surveyor confirmed or edited is
 *   never changed; when the correction would change it, it's named, for them to correct on the Lots step.
 */
import type { SurveyDocument } from "../document";
import { applySketch, sketchItemId } from "./apply";
import type { SketchInterpretation } from "./interpret";

export { correctedDrawing, correctedReadings, numberKey, type SketchCorrection } from "./corrected";

/** Whether an item on the plan was put there by the sketch and is still waiting for the surveyor (never confirmed, never edited). */
const waiting = (doc: SurveyDocument, key: string) => doc.provenance[key]?.source === "ai_photo" && doc.provenance[key]?.reviewed === false;

export interface Redrawn {
  document: SurveyDocument;
  /** Items taken off: the sketch drew them from the reading before the correction, and nobody had confirmed them. */
  removed: string[];
  /** Items put on from the corrected reading, waiting for the surveyor. */
  added: string[];
  /** Items the surveyor had confirmed or edited that the corrected reading no longer proposes: left as they are, and named. */
  kept: string[];
}

/** Where a sketch item is on the plan, by its id, as its provenance key. */
const keyOf = (doc: SurveyDocument, id: string): string | null =>
  doc.lots.some((l) => l.id === id)
    ? `lot:${id}`
    : doc.features.some((f) => f.id === id)
      ? `feature:${id}`
      : (doc.symbols ?? []).some((s) => s.id === id)
        ? `symbol:${id}`
        : doc.roads.some((r) => r.id === id)
          ? `road:${id}`
          : null;

/**
 * Redraws what a corrected reading changes. `before` is the interpretation the plan was drawn from, `after` the one with the corrections:
 * an item `before` proposed that `after` doesn't is taken off if it's still waiting, or named if the surveyor confirmed it; then the
 * corrected reading's proposals that `before` didn't make are applied as a fresh read's are. What `before` proposed too is never put back:
 * an item the surveyor took off stays off. A sketch lot taken off is replaced by the corrected one even beside a lot drawn by hand.
 */
export function redrawFromCorrection(doc: SurveyDocument, before: SketchInterpretation | null, after: SketchInterpretation | null): Redrawn {
  const now = new Set((after?.proposals ?? []).map(sketchItemId));
  const gone = (before?.proposals ?? []).map(sketchItemId).filter((id) => !now.has(id));
  const next: SurveyDocument = structuredClone(doc);
  const removed: string[] = [];
  const kept: string[] = [];
  for (const id of gone) {
    const key = keyOf(next, id);
    if (!key) continue;
    if (!waiting(next, key)) {
      kept.push(key);
      continue;
    }
    if (key.startsWith("lot:")) next.lots = next.lots.filter((l) => l.id !== id);
    else if (key.startsWith("feature:")) next.features = next.features.filter((f) => f.id !== id);
    else if (key.startsWith("symbol:")) next.symbols = (next.symbols ?? []).filter((s) => s.id !== id);
    else next.roads = next.roads.filter((r) => r.id !== id);
    delete next.provenance[key];
    removed.push(key);
  }
  if (!after) return { document: next, removed, added: [], kept };
  const made = new Set((before?.proposals ?? []).map(sketchItemId));
  const fresh = { ...after, proposals: after.proposals.filter((p) => !made.has(sketchItemId(p))) };
  const applied = applySketch(next, fresh, { lotReplaces: removed.some((k) => k.startsWith("lot:")) });
  return { document: applied.document, removed, added: applied.added.map((a) => a.key), kept };
}
