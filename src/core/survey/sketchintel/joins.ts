/**
 * The strokes the surveyor joins in a press (stage 303, ADR 0309). A hand sketch's house is the room its walls close round, and a read now
 * and then misses one short stroke between two numbers written close together (15 to 14, 0.26 m apart on the owner's real job). Without
 * it the area round the house's label runs on round the rest of the lot. The interpretation then offers the one join that closes the room
 * cleanly; the surveyor makes it, and what the sketch draws is redrawn with it. Only an offered join is made, and each is taken off in a
 * press.
 */
import type { SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { redrawFromCorrection, type Redrawn } from "./correct";
import { interpretDocument } from "./findings";

/** The plan with a join the interpretation offers now made as the surveyor's, and what it closes drawn; null when it isn't offered. */
export function withJoin(doc: SurveyDocument, points: readonly SurveyPoint[], from: string, to: string, by: string | null, at: Date): (Redrawn & { outline: string[] }) | null {
  const sketch = doc.sketch;
  const before = interpretDocument(doc, points);
  const offered = before?.questions.find((q) => q.join && q.join.from === from && q.join.to === to)?.join;
  if (!sketch || !offered || (sketch.joins ?? []).length >= 20) return null;
  const joined: SurveyDocument = { ...doc, sketch: { ...sketch, joins: [...(sketch.joins ?? []), { file: offered.file, from, to, by, at: at.toISOString() }] }, kept: doc.kept.filter((k) => k !== `join:${from}|${to}`) };
  const after = interpretDocument(joined, points);
  return { ...redrawFromCorrection(joined, before, after), outline: offered.outline };
}

/** The plan with a join taken off, and what it drew redrawn: the surveyor's press. Null when there's no such join. */
export function withoutJoin(doc: SurveyDocument, points: readonly SurveyPoint[], from: string, to: string): Redrawn | null {
  const sketch = doc.sketch;
  if (!sketch?.joins?.some((j) => j.from === from && j.to === to)) return null;
  const before = interpretDocument(doc, points);
  const joins = sketch.joins.filter((j) => !(j.from === from && j.to === to));
  const apart: SurveyDocument = { ...doc, sketch: { ...sketch, joins } };
  const after = interpretDocument(apart, points);
  return redrawFromCorrection(apart, before, after);
}
