/**
 * Square corners a sketch draws without a number (stage 262, ADR 0270), on SYNTHETIC points: a 10 m by 20 m lot, a box standing against
 * its west side whose corner 17 is 0.15 m inside it, its far corner 14 surveyed out in the lot, and the corner between them drawn
 * square but never surveyed. Also the merging fixes from the stage 261 review.
 */
import { describe, expect, it } from "vitest";
import { mergeSketchReads } from "../autosurvey/sketch-merge";
import type { SketchReadOutput } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { cornerId, squareCorner } from "../construct";
import { emptyDocument, pruneConstructed, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { approvalHash, buildPlan } from "../view";
import { applySketch } from "./apply";
import type { SketchDrawing, SketchLine } from "./drawing";
import { interpretSketch } from "./interpret";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const E0 = 500_000;
const N0 = 600_000;
const POINTS = [at("1", E0, N0), at("2", E0 + 10, N0), at("3", E0 + 10, N0 + 20), at("4", E0, N0 + 20), at("17", E0 + 0.15, N0 + 12), at("14", E0 + 3, N0 + 14.5), at("15", E0 + 3.3, N0 + 14.4)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
const pt = (n: string) => POINTS.find((p) => p.pointId === n)!;
const line = (lid: string, points: string[], extra: Partial<SketchLine> = {}): SketchLine => ({ id: lid, file: "s.jpg", points, label: "", style: "single", closes: false, certain: true, ...extra });
const drawing = (lines: SketchLine[]): SketchDrawing => ({ lines, symbols: [], areas: [] });
const BOUNDARY = line("l1", ["1", "2", "3", "4"], { style: "double", label: "MW", closes: true });

describe("a square corner the sketch draws without a number", () => {
  it("is squared to the lot's side the box stands against, and put between its points in the line", () => {
    const r = interpretSketch(drawing([BOUNDARY, line("l2", ["15", "14", "corner", "17"])]), POINTS, commonCodes());
    expect(r.corners).toHaveLength(1);
    const c = r.corners![0]!;
    expect(c).toMatchObject({ id: cornerId(id("14"), id("17")), kind: "square", from: id("17"), to: id("14"), between: [id("14"), id("17")] });
    // The lot's west side, 4 to 1.
    expect(new Set(c.ref)).toEqual(new Set([id("4"), id("1")]));
    // The corner word is never taken for a point number.
    expect(r.matches.some((m) => m.label === "corner")).toBe(false);
    const doc = applySketch({ ...emptyDocument(), codes: commonCodes() }, r).document;
    const f = doc.features.find((x) => x.points.includes(c.id))!;
    expect(f.points).toEqual([id("15"), id("14"), c.id, id("17")]);
    expect(doc.constructed).toEqual([{ id: c.id, kind: "square", from: c.from, to: c.to, ref: c.ref }]);
    expect(surveyDocumentSchema.safeParse(doc).success).toBe(true);
    // Drawn through the corner: square off the side at 17, level with 14 along it.
    const want = squareCorner(pt("17"), pt("14"), pt("4"), pt("1"))!;
    expect(want.e).toBeCloseTo(E0 + 3, 6);
    expect(want.n).toBeCloseTo(N0 + 12, 6);
  });

  it("is asked about, and the line drawn straight, when no surveyed line at either point says which way it's square", () => {
    const r = interpretSketch(drawing([line("l2", ["14", "corner", "17"])]), POINTS, commonCodes());
    expect(r.corners).toBeUndefined();
    expect(r.questions.some((q) => /corner drawn square between 14 and 17 wasn't surveyed/.test(q.text))).toBe(true);
  });

  it("is let go at an open line's end, and the word written twice is one corner", () => {
    const r = interpretSketch(drawing([BOUNDARY, line("l2", ["corner", "14", "17", "corner"]), line("l3", ["15", "corner", "corner", "14"])]), POINTS, commonCodes());
    expect((r.corners ?? []).map((c) => c.between)).toEqual([[id("15"), id("14")]]);
  });
});

describe("constructed corners on the plan", () => {
  const c = { id: cornerId(id("14"), id("17")), kind: "square" as const, from: id("17"), to: id("14"), ref: [id("4"), id("1")] as [string, string] };
  const doc = (more: Partial<SurveyDocument> = {}): SurveyDocument =>
    surveyDocumentSchema.parse({
      ...emptyDocument(),
      codes: commonCodes(),
      lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }],
      features: [{ id: "box", layer: "BUILDINGS", code: "", closed: false, points: [id("15"), id("14"), c.id, id("17")] }],
      constructed: [c],
      ...more,
    });
  const plan = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null });

  it("are drawn through, and said in the checks as not surveyed", () => {
    const v = plan(doc());
    const f = v.findings.find((x) => x.code === "CONSTRUCTED_CORNERS");
    expect(f).toMatchObject({ severity: "warning", blocks: [] });
    expect(f!.detail).toBe("Between 17 and 14, square to the line 4 to 1.");
    expect(v.findings.some((x) => x.code === "FEATURE_MISSING_POINTS")).toBe(false);
    const path = v.sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "feature:box");
    expect(path?.kind === "path" && path.points.length).toBe(4);
  });

  it("stop the plan when one can't be worked out, and are never a lot's corner", () => {
    const flat = doc({ constructed: [{ ...c, ref: [id("1"), id("1")] }] });
    expect(plan(flat).findings.some((x) => x.code === "FEATURE_MISSING_POINTS")).toBe(true);
    const asCorner = doc({ lots: [{ id: "lotX", label: "X", sup: "", points: [id("1"), id("2"), id("3"), c.id], note: "" }] });
    expect(plan(asCorner).findings.some((x) => x.code === "BOUNDARY_MISSING_POINTS")).toBe(true);
    expect(usedPointIds(asCorner).has(c.id)).toBe(true);
  });

  it("count as the surveyed points they're worked out from, for the approval", async () => {
    const used = usedPointIds(doc());
    expect(used.has(c.id)).toBe(false);
    for (const n of ["17", "14", "4", "1", "15"]) expect(used.has(id(n))).toBe(true);
    const hash = (d: SurveyDocument, points = POINTS) => approvalHash({ document: d, crsId: "LOCAL", points });
    const moved = POINTS.map((p) => (p.pointId === "4" ? { ...p, e: p.e + 0.01 } : p));
    expect(await hash(doc(), moved)).not.toBe(await hash(doc()));
    // A plan that never had one hashes as before: the field is absent.
    const none = pruneConstructed(doc({ features: [] }));
    expect("constructed" in none).toBe(false);
  });

  it("no line uses any more are dropped, and the field with the last of them", () => {
    const orphan = doc({ constructed: [c, { ...c, id: cornerId(id("15"), id("17")) }] });
    expect(pruneConstructed(orphan).constructed).toEqual([c]);
  });
});

describe("merging three reads", () => {
  const read = (lines: SketchReadOutput["lines"]): SketchReadOutput => ({ readings: [], unreadable: [], lines, symbols: [], areas: [] });
  const l = (points: string[], extra: Partial<NonNullable<SketchReadOutput["lines"]>[number]> = {}) => ({ image: 0, points, label: "", style: "single", closes: false, certain: true, ...extra });

  it("keeps a corner at least two of three reads drew, and lets go of one only one drew", () => {
    const two = mergeSketchReads(read([l(["14", "corner", "17"])]), read([l(["14", "corner", "17"])]), read([l(["14", "17"])]));
    expect(two.lines!.map((x) => x.points)).toEqual([["14", "corner", "17"]]);
    const one = mergeSketchReads(read([l(["14", "17"])]), read([l(["14", "corner", "17"])]), read([l(["14", "17"])]));
    expect(one.lines!.map((x) => x.points)).toEqual([["14", "17"]]);
    // One read alone stands as read.
    expect(mergeSketchReads(read([l(["14", "corner", "17"])])).lines![0]!.points).toEqual(["14", "corner", "17"]);
  });

  it("keeps a wall carrying on that only a later read drew, and never carries a closed line's pieces on", () => {
    const later = mergeSketchReads(read([]), read([l(["1", "2"], { runsOn: "start" })]));
    expect(later.lines!.find((x) => x.points.join() === "1,2")?.runsOn).toBe("start");
    const closed = mergeSketchReads(read([l(["1", "2", "3", "4"], { closes: true, runsOn: "both" })]), read([l(["1", "2"])]), read([l(["1", "2"])]));
    expect(closed.lines!.every((x) => x.runsOn === undefined)).toBe(true);
  });
});

describe("after review", () => {
  const c = { id: cornerId(id("14"), id("17")), kind: "square" as const, from: id("17"), to: id("14"), ref: [id("4"), id("1")] as [string, string] };
  const plain = { ...emptyDocument(), codes: commonCodes(), lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }] };

  it("refuses two recipes under one id, so the drawing and the approval can never take different ones", () => {
    const twice = { ...plain, features: [{ id: "box", layer: "BUILDINGS", code: "", closed: false, points: [id("14"), c.id, id("17")] }], constructed: [c, { ...c, ref: [id("17"), id("14")] }] };
    expect(surveyDocumentSchema.safeParse(twice).success).toBe(false);
    expect(surveyDocumentSchema.safeParse({ ...twice, constructed: [c] }).success).toBe(true);
  });

  it("asks, and holds approval, where a lot runs straight between two corners the sketch joins round a square corner", () => {
    const pts = [at("1", E0, N0), at("2", E0 + 10, N0), at("3", E0 + 6, N0 + 20), at("4", E0, N0 + 20)];
    const r = interpretSketch(drawing([line("l1", ["1", "2", "corner", "3", "4"], { closes: true, style: "double", label: "MW" })]), pts, commonCodes());
    expect(r.questions.some((q) => /square corner that wasn't surveyed between 2 and 3, where the lot runs straight/.test(q.text) && q.answeredBy === "confirm")).toBe(true);
    const doc = surveyDocumentSchema.parse(applySketch({ ...emptyDocument(), codes: commonCodes() }, r).document);
    const v = buildPlan({ points: pts, document: doc, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null });
    expect(v.findings.find((f) => f.code === "CONSTRUCTED_CORNER_BY_LOT")).toMatchObject({ severity: "professional_review", blocks: ["approval"] });
  });

  it("never puts a corner into a line once the plan holds its most, and leaves a corner word out of an area's corners", () => {
    const full = Array.from({ length: 200 }, (_, k) => ({ ...c, id: `00000000-0000-4000-8000-${String(900_000 + k).padStart(12, "0")}` }));
    const r = interpretSketch(drawing([BOUNDARY, line("l2", ["15", "14", "corner", "17"])]), POINTS, commonCodes());
    const a = applySketch({ ...emptyDocument(), codes: commonCodes(), constructed: full }, r);
    expect(a.document.features.some((f) => f.points.includes(c.id))).toBe(false);
    expect(a.skipped.some((s) => /200 corners/.test(s))).toBe(true);
    const areas = interpretSketch({ lines: [BOUNDARY], symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "X", around: ["1", "2", "corner", "3", "4"] }] }, POINTS, commonCodes());
    expect(areas.matches.some((m) => m.label === "corner")).toBe(false);
    expect(areas.questions.some((q) => /corner/.test(q.text) && /isn't a surveyed point/.test(q.text))).toBe(false);
  });
});
