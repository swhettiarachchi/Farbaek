/**
 * The sketch's drawing on the plan, as the plan is shown (stage 241, ADR 0249): interpreted again from what was read and the points as
 * they are now, so a question goes away once it's answered and the evidence beside each proposal is always current. Nothing is stored
 * beyond what was read.
 */
import type { SurveyDocument } from "../document";
import { readStatedExtent } from "../extent";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";
import { sketchItemId } from "./apply";
import { interpretSketch, type SketchInterpretation } from "./interpret";

/** The interpretation of a document's sketch drawing, with the stated extent and the road widths read from the sketch. */
export function interpretDocument(doc: SurveyDocument, points: readonly SurveyPoint[]): SketchInterpretation | null {
  const drawing = doc.sketch?.drawing;
  if (!drawing || (drawing.lines.length === 0 && drawing.symbols.length === 0 && drawing.areas.length === 0)) return null;
  const stated = readStatedExtent(doc.sheet.statedExtent);
  const widths = (doc.sketch?.readings ?? []).filter((r) => r.kind === "road" && /\d/.test(r.text)).map((r) => r.text);
  return interpretSketch(drawing, points, doc.codes, { statedM2: stated?.m2 ?? null, widths });
}

/**
 * The evidence for an item the sketch put on the plan, by its provenance key, or null when it didn't come from the sketch; with the open
 * questions that confirming it answers.
 */
export function sketchEvidence(interpretation: SketchInterpretation | null, key: string): { evidence: string[]; level: "strong" | "check"; file: string; questions: string[] } | null {
  if (!interpretation) return null;
  const id = key.slice(key.indexOf(":") + 1);
  if (!id.startsWith("sk-")) return null;
  const p = interpretation.proposals.find((x) => sketchItemId(x) === id);
  const questions = interpretation.questions.filter((q) => q.item === id && q.answeredBy === "confirm").map((q) => [q.text, ...q.evidence].join(" "));
  return p ? { evidence: p.evidence, level: p.level, file: p.file, questions } : null;
}

/** Where an item the sketch put on the plan is, by its id: its provenance key, and whether it's still there. */
const keyOf = (doc: SurveyDocument, item: string) =>
  doc.lots.some((l) => l.id === item) ? `lot:${item}` : doc.features.some((f) => f.id === item) ? `feature:${item}` : (doc.symbols ?? []).some((s) => s.id === item) ? `symbol:${item}` : null;

/** Whether the surveyor has answered a question: confirmed or removed what it's about, given the lot its label, or drawn the road. */
function answered(doc: SurveyDocument, item: string | undefined, by: "confirm" | "label" | "road" | undefined): boolean {
  // A road drawn with both its edges answers what one surveyed edge couldn't: its side and its width.
  if (by === "road") return doc.roads.length > 0;
  if (!item || !by) return false;
  const key = keyOf(doc, item);
  if (!key) return true;
  if (by === "label") return Boolean(doc.lots.find((l) => l.id === item)?.label.trim());
  return doc.provenance[key]?.reviewed === true;
}

/** The sketch's open questions as the plan's findings: for information, holding nothing back; those the surveyor has answered left out. */
export function sketchQuestionFindings(interpretation: SketchInterpretation | null, doc: SurveyDocument): Finding[] {
  if (!interpretation) return [];
  return interpretation.questions.filter((q) => !answered(doc, q.item, q.answeredBy)).slice(0, 30).map((q) => ({
    code: "SKETCH_QUESTION",
    severity: "warning" as const,
    message: q.text,
    target: { kind: "project" as const },
    detail: [`Read from ${q.file}.`, ...q.evidence].join(" "),
    action: q.evidence.find((e) => /^(Check|Give|Survey|Add|Its)/.test(e)) ?? "Check the sketch, and draw or correct it on the Lots step if it's needed.",
    blocks: [],
  }));
}
