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
import { interpretSketch, joinKey, writtenWidth, type Question, type SketchInterpretation } from "./interpret";

/** The interpretation of a document's sketch drawing, with the stated extent and the road widths and names read from the sketch. */
export function interpretDocument(doc: SurveyDocument, points: readonly SurveyPoint[]): SketchInterpretation | null {
  const raw = doc.sketch?.drawing;
  if (!raw || (raw.lines.length === 0 && raw.symbols.length === 0 && raw.areas.length === 0)) return null;
  // Read with the surveyor's corrections of point numbers applied (stage 249, ADR 0257); the reading itself stays as read.
  const corrections = doc.sketch?.corrections ?? [];
  const readings = correctedReadings(doc.sketch?.readings ?? [], corrections);
  // Without the lines Farbaek left out because the independent check doesn't find them drawn (stage 302, ADR 0308).
  const out = new Set((doc.sketch?.leftOut ?? []).map((l) => l.line));
  const kept = out.size === 0 ? raw : { ...raw, lines: raw.lines.filter((l) => !out.has(l.id)) };
  // With the strokes the surveyor joined in a press (stage 303, ADR 0309): their word, so read as sure. Never counted as a read of its own.
  const corrected = correctedDrawing(kept, corrections);
  const joins = (doc.sketch?.joins ?? []).map((j, i) => ({ id: `j${i + 1}`, file: j.file, points: [j.from, j.to], label: "", style: "single" as const, closes: false, certain: true }));
  const drawing = withBuildingWords(joins.length > 0 ? { ...corrected, lines: [...corrected.lines, ...joins] } : corrected, readings, doc.codes);
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
    ...drawing.lines.filter((l) => classifyLine(l.label, l.style, doc.codes, doc.sketchHabits ?? []).kind === "gate").map((l) => l.points),
  ];
  // Point numbers read with doubt (stage 295 review): reads agreeing never settle a line through one.
  const doubtfulNumbers = readings.filter((r) => r.kind === "point" && r.certain === false).map((r) => ({ file: r.file, label: r.text }));
  return interpretSketch(drawing, points, doc.codes, { statedM2: stated?.m2 ?? null, widths, roadNames, doubtfulWidths, doubtfulRoadNames, placed: placedNumbers(readings), labels, gates, doubtfulNumbers, habits: doc.sketchHabits ?? [] });
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

/**
 * The numbers the sketch's drawing runs through that no surveyed point has (stage 303): when many are, the sketch may be another job's, or
 * too unclear to read, and what was drawn from it can't be trusted. Corner words and ambiguous numbers aren't counted either way.
 */
export function strangeNumbers(i: SketchInterpretation | null): { strange: string[]; total: number } {
  const seen = (i?.matches ?? []).filter((x) => x.how !== "ambiguous" && !/^corner$/i.test(x.label.trim()));
  return { strange: [...new Set(seen.filter((x) => x.pointId === null).map((x) => x.label))], total: new Set(seen.map((x) => x.label)).size };
}

/** Whether a sketch looks like another job's: at least five of its numbers, and at least two in five, aren't surveyed points. */
export const looksLikeAnotherJob = (x: { strange: string[]; total: number }) => x.strange.length >= 5 && x.strange.length >= 0.4 * x.total;

/** The sketch's open questions as the plan's findings: for information, holding nothing back; those the surveyor has answered left out. */
export function sketchQuestionFindings(interpretation: SketchInterpretation | null, doc: SurveyDocument): Finding[] {
  if (!interpretation) return [];
  // A join that would close a house round its label (stage 303): asked on a card of its own, answered by joining or by saying it isn't
  // drawn, holding approval until then as a doubt does. Each join the surveyor made is a note, to take off in a press.
  const kept = new Set(doc.kept);
  const joins: Finding[] = interpretation.questions.flatMap((q): Finding[] => {
    if (!q.join) return [];
    const key = joinKey(q.join.pairs);
    if (kept.has(key)) return [{ code: "SKETCH_JOIN_KEPT", severity: "information", message: `Not joined, as you said: ${q.text}`, target: { kind: "project" }, action: "Give the building's corners on the Lots step, or join them after all.", blocks: [], keep: { key, kept: true } }];
    return [{ code: "SKETCH_JOIN", severity: "professional_review", message: q.text, target: { kind: "project" }, detail: `Read from ${q.file}.`, action: q.evidence[0] ?? "Join them if the sketch draws that wall.", blocks: ["approval"], keep: { key, kept: false }, join: { file: q.join.file, pairs: q.join.pairs.map((p) => ({ from: p.from, to: p.to })) } }];
  });
  const made: Finding[] = (doc.sketch?.joins ?? []).map((j) => ({
    code: "SKETCH_JOINED",
    severity: "information",
    message: `You joined ${j.from} to ${j.to} on ${j.file}: the sketch is read with that wall.`,
    target: { kind: "project" },
    action: "Take the join off if the sketch doesn't draw that wall.",
    blocks: [],
    join: { file: j.file, pairs: [{ from: j.from, to: j.to }] },
  }));
  // A sketch that may be another job's (stage 303): said first, holding approval until the surveyor says it's this job's or reads another.
  const odd = strangeNumbers(interpretation);
  const shown = odd.strange.slice(0, 5).join(", ") + (odd.strange.length > 5 ? ` and ${odd.strange.length - 5} more` : "");
  const other: Finding[] = !looksLikeAnotherJob(odd)
    ? []
    : kept.has("sketch:job")
      ? [{ code: "SKETCH_OTHER_JOB_KEPT", severity: "information", message: `You said the sketch is this job's, though ${odd.strange.length} of its ${odd.total} numbers aren't in the survey files.`, target: { kind: "project" }, action: "Nothing to do, unless it isn't after all.", blocks: [], keep: { key: "sketch:job", kept: true } }]
      : [{ code: "SKETCH_OTHER_JOB", severity: "professional_review", message: `${odd.strange.length} of the ${odd.total} numbers on the sketch aren't in your survey files (${shown}). It may be another job's sketch, or too unclear to read, so what was drawn from it may be wrong.`, target: { kind: "project" }, action: "If it isn't this job's sketch, read the right one from the Draft step. If it is, keep it, and correct what's wrong on the plan.", blocks: ["approval"], keep: { key: "sketch:job", kept: false } }];
  return [...other, ...joins, ...made, ...interpretation.questions.filter((q) => !q.join && !answered(doc, q.item, q.answeredBy, interpretation)).slice(0, 30).map((q) => ({
    code: "SKETCH_QUESTION",
    severity: "warning" as const,
    message: q.text,
    target: { kind: "project" as const },
    detail: [`Read from ${q.file}.`, ...q.evidence].join(" "),
    action: q.evidence.find((e) => /^(Check|Give|Survey|Add|Its)/.test(e)) ?? "Check the sketch, and draw or correct it on the Lots step if it's needed.",
    blocks: [],
  }))];
}
