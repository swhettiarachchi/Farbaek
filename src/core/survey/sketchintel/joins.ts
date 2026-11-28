/**
 * The strokes the surveyor joins in a press (stage 303, ADR 0309). A hand sketch's house is the room its walls close round, and a read now
 * and then misses one short stroke between two numbers written close together (15 to 14, 0.26 m apart on the owner's real job). Without
 * it the area round the house's label runs on round the rest of the lot. The interpretation then offers the join that closes the room
 * cleanly, or the joins that do together when one isn't enough (stage 304); the surveyor makes it, and what the sketch draws is redrawn with it. Only an offered join is made, and each is taken off in a
 * press.
 */
import type { SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { redrawFromCorrection, type Redrawn } from "./correct";
import { interpretDocument } from "./findings";
import { joinKey } from "./interpret";

/**
 * The plan with the joins the interpretation offers now, in one press (one or more: stage 304), made as the surveyor's, and what they
 * close drawn; null when they aren't offered together.
 */
export function withJoin(doc: SurveyDocument, points: readonly SurveyPoint[], pairs: readonly { from: string; to: string }[], by: string | null, at: Date): (Redrawn & { outline: string[] }) | null {
  const sketch = doc.sketch;
  const before = interpretDocument(doc, points);
  const key = joinKey(pairs);
  const offered = before?.questions.find((q) => q.join && joinKey(q.join.pairs) === key)?.join;
  if (!sketch || !offered || (sketch.joins ?? []).length + offered.pairs.length > 20) return null;
  const made = offered.pairs.map((p) => ({ file: offered.file, from: p.from, to: p.to, by, at: at.toISOString() }));
  const joined: SurveyDocument = { ...doc, sketch: { ...sketch, joins: [...(sketch.joins ?? []), ...made] }, kept: doc.kept.filter((k) => k !== key) };
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
