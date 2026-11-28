/**
 * The sketch's drawing on the plan, as the plan is shown (stage 241, ADR 0249): interpreted again from what was read and the points as
 * they are now, so a question goes away once it's answered and the evidence beside each proposal is always current. Nothing is stored
 * beyond what was read.
 */
import type { SurveyDocument } from "../document";
import type { SketchReading } from "../autosurvey/sketch";
import { DRAWING_LIMITS, type SketchDrawing } from "./drawing";
import type { PlacedNumber } from "./placement";
import { readStatedExtent } from "../extent";
import type { SurveyPoint } from "../parcel";
import type { Finding } from "../qc";
import { same, sketchItemId } from "./apply";
import { classifyArea, classifyLine, isGateWord, isRoadName } from "./classify";
import { correctedDrawing, correctedReadings } from "./corrected";
import { interpretSketch, writtenWidth, type Question, type SketchInterpretation } from "./interpret";

/** The interpretation of a document's sketch drawing, with the stated extent and the road widths and names read from the sketch. */
export function interpretDocument(doc: SurveyDocument, points: readonly SurveyPoint[]): SketchInterpretation | null {
  const raw = doc.sketch?.drawing;
  if (!raw || (raw.lines.length === 0 && raw.symbols.length === 0 && raw.areas.length === 0)) return null;
  // Read with the surveyor's corrections of point numbers applied (stage 249, ADR 0257); the reading itself stays as read.
  const corrections = doc.sketch?.corrections ?? [];
  const readings = correctedReadings(doc.sketch?.readings ?? [], corrections);
  const drawing = withBuildingWords(correctedDrawing(raw, corrections), readings, doc.codes);
  const stated = readStatedExtent(doc.sheet.statedExtent);
  // A road's reading is its width when it reads as one ("15'"), else its name (stage 243). One read with doubt is never taken, but it's
  // counted, so a conflict is still asked about (ADR 0253).
  const roads = readings.filter((r) => r.kind === "road");
  const clear = roads.filter((r) => r.certain !== false);
  const unsure = roads.filter((r) => r.certain === false);
  const widths = clear.filter((r) => writtenWidth(r.text) !== null).map((r) => r.text);
  // A name only when it reads as a road's name: a bare number or an owner's name is neither.
  const roadNames = clear.filter((r) => writtenWidth(r.text) === null && isRoadName(r.text)).map((r) => r.text);
  // Every doubtful road writing that isn't a width: a name read with doubt keeps an area of the same name from naming the road too.
  const doubtfulWidths = unsure.filter((r) => writtenWidth(r.text) !== null).map((r) => r.text);
  const doubtfulRoadNames = unsure.filter((r) => writtenWidth(r.text) === null).map((r) => r.text);
  // Where other writing is on each photo (to say which drawn area a label is in), and where a gate is written or drawn (stage 254).
  const labels = readings.filter((r) => r.kind !== "point" && r.photo).map((r) => ({ text: r.text, file: r.file, x: r.photo!.x, y: r.photo!.y }));
  const gates = [
    ...readings.filter((r) => r.kind !== "point" && r.near && isGateWord(r.text)).map((r) => [r.near]),
    ...drawing.symbols.filter((s) => s.kind === "gate" && s.at).map((s) => [s.at]),
    ...drawing.lines.filter((l) => classifyLine(l.label, l.style, doc.codes).kind === "gate").map((l) => l.points),
  ];
  return interpretSketch(drawing, points, doc.codes, { statedM2: stated?.m2 ?? null, widths, roadNames, doubtfulWidths, doubtfulRoadNames, placed: placedNumbers(readings), labels, gates });
}

/**
 * A building's word the reader gave only as writing, not as an area (stage 256): taken as that area's label with no corners, so its
 * outline is found from where it's written (ADR 0262), as for an area the reader gave. Once per word and photo, and never beside an area
 * the reader already gave with the same word.
 */
export function withBuildingWords(drawing: SketchDrawing, readings: readonly SketchReading[], codes: SurveyDocument["codes"]): SketchDrawing {
  const have = new Set(drawing.areas.map((a) => `${a.file}|${a.label.trim()}`));
  const added: SketchDrawing["areas"] = [];
  let n = drawing.areas.reduce((most, a) => Math.max(most, Number(a.id.slice(1)) || 0), 0);
  for (const r of readings) {
    const key = `${r.file}|${r.text.trim()}`;
    if (r.kind === "point" || !r.photo || have.has(key) || classifyArea(r.text, codes).kind !== "building") continue;
    if (n >= 999 || drawing.areas.length + added.length >= DRAWING_LIMITS.areas) break;
    have.add(key);
    added.push({ id: `a${++n}`, file: r.file, label: r.text.trim(), around: [] });
  }
  return added.length ? { ...drawing, areas: [...drawing.areas, ...added] } : drawing;
}

/** The point numbers the reader placed on a photo (stage 247): evidence for a question, never a position. */
export function placedNumbers(readings: readonly SketchReading[]): PlacedNumber[] {
  return readings.filter((r) => r.kind === "point" && r.photo).map((r) => ({ label: r.text, file: r.file, x: r.photo!.x, y: r.photo!.y, id: r.id }));
}

/**
 * The evidence for an item the sketch put on the plan, by its provenance key, or null when it didn't come from the sketch; with the open
 * questions that confirming it answers.
 */
export function sketchEvidence(
  interpretation: SketchInterpretation | null,
  key: string,
): { evidence: string[]; level: "strong" | "check"; file: string; questions: string[]; fixes: NonNullable<Question["suggest"]>[] } | null {
  if (!interpretation) return null;
  const id = key.slice(key.indexOf(":") + 1);
  if (!id.startsWith("sk-")) return null;
  const p = interpretation.proposals.find((x) => sketchItemId(x) === id);
  const asked = interpretation.questions.filter((q) => q.item === id && q.answeredBy === "confirm");
  // A correction the engine can offer for a number it doubts (stage 249): one press, recorded as the surveyor's.
  const fixes = asked.flatMap((q) => (q.suggest ? [q.suggest] : []));
  return p ? { evidence: p.evidence, level: p.level, file: p.file, questions: asked.map((q) => [q.text, ...q.evidence].join(" ")), fixes } : null;
}

/** Where an item the sketch put on the plan is, by its id: its provenance key, and whether it's still there. */
const keyOf = (doc: SurveyDocument, item: string) =>
  doc.lots.some((l) => l.id === item)
    ? `lot:${item}`
    : doc.features.some((f) => f.id === item)
      ? `feature:${item}`
      : (doc.symbols ?? []).some((s) => s.id === item)
        ? `symbol:${item}`
        : doc.roads.some((r) => r.id === item)
          ? `road:${item}`
          : null;

/** Whether the surveyor has answered a question: confirmed or removed what it's about, given the lot its label, or drawn the road. */
function answered(doc: SurveyDocument, item: string | undefined, by: "confirm" | "label" | "road" | undefined, interpretation: SketchInterpretation): boolean {
  if (!item || !by) return false;
  // A road drawn along this line answers what one surveyed edge couldn't (its side and its width), once it's the surveyor's: a road the
  // sketch put there and nobody has confirmed yet answers nothing.
  if (by === "road") {
    const line = doc.features.find((f) => f.id === item);
    if (!line) return true;
    return doc.roads.some((r) => {
      const mark = doc.provenance[`road:${r.id}`];
      const sides = new Set([...r.edgeA, ...r.edgeB]);
      return line.points.filter((p) => sides.has(p)).length >= 2 && !(mark?.source === "ai_photo" && !mark.reviewed);
    });
  }
  // A line the plan already had (the same code and points, so the sketch's copy was never added) is answered by confirming that one.
  const p = interpretation.proposals.find((x) => x.id === item);
  const twin = !keyOf(doc, item) && p && (p.kind === "line" || p.kind === "building") ? doc.features.find((f) => f.code === p.code && same(f.points, p.points.map((x) => x.id))) : undefined;
  const key = twin ? `feature:${twin.id}` : keyOf(doc, item);
  if (!key) return true;
  // That line is the surveyor's own when nothing marks it as drawn for them, and then it's already their answer.
  if (twin) return doc.provenance[key] === undefined || doc.provenance[key]!.reviewed === true;
  if (by === "label") return Boolean(doc.lots.find((l) => l.id === item)?.label.trim());
  return doc.provenance[key]?.reviewed === true;
}

/**
 * A line the sketch put on the plan whose course nothing stands against (stage 294): settled where it runs (exact numbers, its points on
 * it, a sure read or two reads agreeing), and no question still open about it, of any kind, nor one about the sketch lines it comes from
 * that names no item of its own. A question about another item (the lot has no letter, a corner of the lot) is that item's: it's asked on
 * that item's card and doesn't hold the line back (stage 295).
 */
export function settledSketchLine(interpretation: SketchInterpretation | null, doc: SurveyDocument, key: string): boolean {
  if (!interpretation || !key.startsWith("feature:")) return false;
  const id = key.slice("feature:".length);
  const p = interpretation.proposals.find((x) => sketchItemId(x) === id);
  if (!p || p.kind !== "line" || p.settled !== true) return false;
  const from = new Set(p.from);
  return !interpretation.questions.some(
    (q) => !answered(doc, q.item, q.answeredBy, interpretation) && (q.item === id || q.item === p.id || Boolean(q.lines?.includes(p.id)) || (!q.item && q.from.some((f) => from.has(f)))),
  );
}

/** The sketch's open questions as the plan's findings: for information, holding nothing back; those the surveyor has answered left out. */
export function sketchQuestionFindings(interpretation: SketchInterpretation | null, doc: SurveyDocument): Finding[] {
  if (!interpretation) return [];
  return interpretation.questions.filter((q) => !answered(doc, q.item, q.answeredBy, interpretation)).slice(0, 30).map((q) => ({
    code: "SKETCH_QUESTION",
    severity: "warning" as const,
    message: q.text,
    target: { kind: "project" as const },
    detail: [`Read from ${q.file}.`, ...q.evidence].join(" "),
    action: q.evidence.find((e) => /^(Check|Give|Survey|Add|Its)/.test(e)) ?? "Check the sketch, and draw or correct it on the Lots step if it's needed.",
    blocks: [],
  }));
}
