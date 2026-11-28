/** The sketch's quiet lines confirmed together (stage 294), on the SYNTHETIC sketch job (fixture.ts). */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import { exceptionsFor, quietSketchItems, QUIET_GROUP_MIN } from "../exceptions";
import { buildPlan } from "../view";
import { applySketch } from "./apply";
import { SYNTH_DRAWING, SYNTH_POINTS } from "./fixture";
import { interpretDocument, settledSketchLine, sketchEvidence } from "./findings";
import type { SketchDrawing } from "./drawing";

const withDrawing = (drawing: SketchDrawing): SurveyDocument => {
  const doc: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [], unreadable: [], drawing } };
  return applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
};
/** The sketch as the fixture has it: l9 read without certainty, l5's "060" matched only by dropping its zero, 42 off l1. */
const asRead = () => withDrawing(SYNTH_DRAWING);
/** The same sketch read with certainty and exact numbers, and its lot confirmed: the lines round the lot then have nothing open. */
const settled = (): SurveyDocument => {
  const sure = { ...SYNTH_DRAWING, lines: SYNTH_DRAWING.lines.map((l) => ({ ...l, certain: true, points: l.points.map((p) => p.replace(/^0+(?=\d)/, "")) })) };
  const doc = withDrawing(sure);
  const lot = Object.keys(doc.provenance).find((k) => k.startsWith("lot:"))!;
  return { ...doc, provenance: { ...doc.provenance, [lot]: { source: "ai_photo", reviewed: true } } };
};
const findingsOf = (doc: SurveyDocument) => buildPlan({ points: SYNTH_POINTS, document: doc, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings;
const lineKey = (doc: SurveyDocument, from: string) => `feature:${interpretDocument(doc, SYNTH_POINTS)!.proposals.find((p) => p.kind === "line" && p.from.includes(from))!.id}`;

describe("the sketch's lines nothing stands against", () => {
  it("are lines whose course is settled with no question open, never a symbol, the lot, a road or a title fact", () => {
    const doc = settled();
    const quiet = quietSketchItems(doc, SYNTH_POINTS);
    const sketch = interpretDocument(doc, SYNTH_POINTS)!;
    expect(quiet.length).toBeGreaterThanOrEqual(QUIET_GROUP_MIN);
    for (const key of quiet) {
      expect(key).toMatch(/^feature:sk-/);
      const p = sketch.proposals.find((x) => `feature:${x.id}` === key)!;
      expect(p.kind === "line" && p.settled).toBe(true);
      expect(sketchEvidence(sketch, key)!.questions).toEqual([]);
    }
    expect(quiet.some((k) => !k.startsWith("feature:"))).toBe(false);
  });

  it("leave out a line read without certainty, one matched only by dropping a zero, and one with a point off it", () => {
    const doc = asRead();
    const quiet = quietSketchItems(doc, SYNTH_POINTS);
    for (const from of ["l9", "l5", "l1"]) expect(quiet).not.toContain(lineKey(doc, from));
  });

  it("hold back a line for a question about it, or one naming no item about its sketch lines; not for another item's question (stage 295)", () => {
    const doc = settled();
    const sketch = interpretDocument(doc, SYNTH_POINTS)!;
    const key = quietSketchItems(doc, SYNTH_POINTS)[0]!;
    const p = sketch.proposals.find((x) => `feature:${x.id}` === key)!;
    const ask = (q: Partial<(typeof sketch.questions)[number]>) => ({ ...sketch, questions: [...sketch.questions, { from: p.from, file: "sketch.jpg", text: "A question.", evidence: [], ...q }] });
    expect(settledSketchLine(sketch, doc, key)).toBe(true);
    expect(settledSketchLine(ask({ item: p.id, answeredBy: "confirm" }), doc, key)).toBe(false);
    expect(settledSketchLine(ask({}), doc, key)).toBe(false);
    // Two lines crossing where no number is: the question is answered on one line's card, but names both, and holds both back.
    const other = sketch.proposals.find((x) => `feature:${x.id}` === quietSketchItems(doc, SYNTH_POINTS)[1])!;
    expect(settledSketchLine(ask({ item: other.id, answeredBy: "confirm", lines: [other.id, p.id] }), doc, key)).toBe(false);
    // The lot's own question, on the lot's card: the wall isn't held back by it.
    const lotId = sketch.proposals.find((x) => x.kind === "lot")!.id;
    expect(settledSketchLine(ask({ item: lotId, answeredBy: "label" }), { ...doc, lots: doc.lots.map((l) => ({ ...l, label: "" })) }, key)).toBe(true);
  });

  it("count two agreeing reads as settling a line the reader wasn't sure of, but never a single unsure read (stage 295)", () => {
    const unsure = (reads?: number) => withDrawing({ ...SYNTH_DRAWING, lines: SYNTH_DRAWING.lines.map((l) => ({ ...l, certain: false, points: l.points.map((x) => x.replace(/^0+(?=\d)/, "")), ...(reads ? { reads } : {}) })) });
    const settledLines = (doc: SurveyDocument) => interpretDocument(doc, SYNTH_POINTS)!.proposals.filter((x) => x.kind === "line" && x.settled).length;
    expect(settledLines(unsure())).toBe(0);
    expect(settledLines(unsure(1))).toBe(0);
    expect(settledLines(unsure(2))).toBeGreaterThan(0);
  });

  it("are left out once confirmed, and never include an item the surveyor drew or a plan with no sketch", () => {
    const doc = settled();
    const [first, ...rest] = quietSketchItems(doc, SYNTH_POINTS);
    const confirmed = { ...doc, provenance: { ...doc.provenance, [first!]: { source: "ai_photo" as const, reviewed: true } } };
    expect(quietSketchItems(confirmed, SYNTH_POINTS)).toEqual(rest);
    const theirs = { ...doc, provenance: { ...doc.provenance, [rest[0]!]: { source: "auto" as const, reviewed: false } } };
    expect(quietSketchItems(theirs, SYNTH_POINTS)).not.toContain(rest[0]);
    expect(quietSketchItems(emptyDocument(), SYNTH_POINTS)).toEqual([]);
  });

  it("go on one card with one press, and every other item read from the photo keeps a card of its own", () => {
    const doc = settled();
    const quiet = quietSketchItems(doc, SYNTH_POINTS);
    const list = exceptionsFor(doc, SYNTH_POINTS, findingsOf(doc));
    const together = list.confirm.filter((e) => e.together);
    expect(together).toHaveLength(1);
    expect(together[0]!.together!.keys).toEqual(quiet);
    expect(together[0]!.together!.lines).toHaveLength(quiet.length);
    expect(together[0]!.title).toBe(`${quiet.length} lines read from your sketch, with nothing against them, not confirmed yet.`);
    expect(together[0]!.confirm).toBeNull();
    const own = list.confirm.filter((e) => e.confirm).map((e) => e.confirm);
    for (const key of quiet) expect(own).not.toContain(key);
    const others = Object.entries(doc.provenance).filter(([k, p]) => p.source === "ai_photo" && !p.reviewed && !quiet.includes(k)).map(([k]) => k);
    expect(others.length).toBeGreaterThan(0);
    for (const key of others) expect(own).toContain(key);
  });

  it("keep their own cards when there are too few to be worth grouping", () => {
    const doc = settled();
    const quiet = quietSketchItems(doc, SYNTH_POINTS);
    const most = { ...doc, provenance: { ...doc.provenance, ...Object.fromEntries(quiet.slice(2).map((k) => [k, { source: "ai_photo" as const, reviewed: true }])) } };
    const list = exceptionsFor(most, SYNTH_POINTS, findingsOf(most));
    expect(list.confirm.some((e) => e.together)).toBe(false);
    expect(list.confirm.map((e) => e.confirm)).toEqual(expect.arrayContaining(quiet.slice(0, 2)));
  });
});

describe("the one lot without a label (stage 294)", () => {
  it("is labelled on its own card; two or more are labelled on the Lots step", () => {
    const doc = asRead();
    const one = { ...doc, lots: doc.lots.map((l) => ({ ...l, label: "" })) };
    const fix = exceptionsFor(one, SYNTH_POINTS, findingsOf(one)).fix.find((e) => e.code === "LOT_LABEL_MISSING")!;
    expect(fix.lotLabel).toEqual({ lotId: one.lots[0]!.id });
    const two = { ...one, lots: [...one.lots, { ...one.lots[0]!, id: "second" }] };
    const both = exceptionsFor(two, SYNTH_POINTS, findingsOf(two)).fix.find((e) => e.code === "LOT_LABEL_MISSING")!;
    expect(both.lotLabel).toBeUndefined();
  });
});
