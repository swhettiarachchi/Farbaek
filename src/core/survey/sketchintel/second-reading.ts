/**
 * What the independent second reading of a sketch corrects by itself (stage 302, ADR 0308). The first read of a hand sketch draws a line
 * now and then that isn't there: the right-hand wall run to 23 when it runs to 22, both drawn, and the lot taken round the wrong one. The
 * second reading (the check, ADR 0271) looks at each drawn item again and says whether the sketch draws it so.
 *
 * A line is left out of the drawing only when both say so: the first read drew it once and wasn't sure of it, and the second reading
 * doesn't find it drawn. A line read more than once, or read with certainty, is never left out; it's asked about, as before. What the
 * plan drew from the line and nobody has confirmed is redrawn without it; anything the surveyor confirmed is never changed. Each line
 * left out is said on the plan, with what the check said, and put back in one press. Kept only when the plan keeps at least as many lots.
 */
import type { SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { redrawFromCorrection } from "./correct";
import { interpretDocument } from "./findings";
import type { SketchInterpretation } from "./interpret";

type LeftOut = NonNullable<NonNullable<SurveyDocument["sketch"]>["leftOut"]>[number];

/** The sketch's lines to leave out: each drawn once with doubt, as a line on the plan the check doesn't find drawn so. */
export function linesToLeaveOut(doc: SurveyDocument, interpretation: SketchInterpretation | null, at: Date): LeftOut[] {
  const sketch = doc.sketch;
  const check = sketch?.check;
  if (!sketch?.drawing || !check || !interpretation) return [];
  const already = new Set((sketch.leftOut ?? []).map((l) => l.line));
  const verdicts = new Map(check.items.filter((v) => v.key.startsWith("feature:")).map((v) => [v.key.slice("feature:".length), v]));
  const out: LeftOut[] = [];
  for (const p of interpretation.proposals) {
    if (p.kind !== "line") continue;
    const v = verdicts.get(p.id);
    // The check's verdict is about the line as it was drawn when checked: the same numbers, in the same order either way.
    const now = p.points.map((x) => x.pointId);
    const same = v && (v.points.join("|") === now.join("|") || v.points.join("|") === [...now].reverse().join("|") || (p.closed && v.points.join("|") === now.slice(0, -1).join("|")));
    if (!v || v.verdict !== "not_drawn" || !same) continue;
    // Only a line still waiting for the surveyor: one they confirmed (kept through a new read) or drew themselves is theirs.
    const mark = doc.provenance[`feature:${p.id}`];
    if (!mark || mark.source !== "ai_photo" || mark.reviewed) continue;
    for (const id of p.from) {
      const line = sketch.drawing.lines.find((l) => l.id === id);
      if (!line || line.certain || (line.reads ?? 1) > 1 || already.has(id) || out.some((o) => o.line === id)) continue;
      out.push({ line: id, points: line.points.slice(0, 60), note: v.note.slice(0, 200), at: at.toISOString() });
    }
  }
  return out.slice(0, Math.max(0, 30 - already.size));
}

export interface SecondReading {
  document: SurveyDocument;
  /** The lines left out now. */
  leftOut: LeftOut[];
  /** Items taken off the plan and put on, by their provenance keys. */
  removed: string[];
  added: string[];
}

/**
 * The plan with the lines the second reading doesn't find left out, and what they drew redrawn. Unchanged when there's nothing to leave
 * out, or when leaving it out would lose a lot the plan has.
 */
export function withSecondReading(doc: SurveyDocument, points: readonly SurveyPoint[], at: Date): SecondReading {
  const unchanged: SecondReading = { document: doc, leftOut: [], removed: [], added: [] };
  const before = interpretDocument(doc, points);
  const leave = linesToLeaveOut(doc, before, at);
  if (leave.length === 0 || !doc.sketch) return unchanged;
  const candidate: SurveyDocument = { ...doc, sketch: { ...doc.sketch, leftOut: [...(doc.sketch.leftOut ?? []), ...leave] } };
  const after = interpretDocument(candidate, points);
  const lots = (i: SketchInterpretation | null) => i?.proposals.filter((p) => p.kind === "lot").length ?? 0;
  if (lots(after) < lots(before)) return unchanged;
  const redrawn = redrawFromCorrection(candidate, before, after);
  return { document: redrawn.document, leftOut: leave, removed: redrawn.removed, added: redrawn.added };
}

/** The plan with one line put back as the first read drew it, and what it draws redrawn: the surveyor's press (stage 302). */
export function withLinePutBack(doc: SurveyDocument, points: readonly SurveyPoint[], line: string): SecondReading | null {
  const sketch = doc.sketch;
  if (!sketch?.leftOut?.some((l) => l.line === line)) return null;
  const before = interpretDocument(doc, points);
  const leftOut = sketch.leftOut.filter((l) => l.line !== line);
  const back: SurveyDocument = { ...doc, sketch: { ...sketch, ...(leftOut.length > 0 ? { leftOut } : { leftOut: [] }) }, kept: doc.kept.filter((k) => k !== `left:${line}`) };
  const after = interpretDocument(back, points);
  const redrawn = redrawFromCorrection(back, before, after);
  return { document: redrawn.document, leftOut: [], removed: redrawn.removed, added: redrawn.added };
}
