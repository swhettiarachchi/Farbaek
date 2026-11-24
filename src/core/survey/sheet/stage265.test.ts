/**
 * Dimension lines between two points, and words with their own size and angle (stage 265, ADR 0273), on SYNTHETIC points: a 20 m
 * square lot with a 10 m wall along its south side.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { compareDocuments } from "../compare";
import { emptyDocument, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "../document";
import { writeDxf } from "../export/dxf";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { approvalHash, buildPlan } from "../view";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const E0 = 500_000;
const N0 = 600_000;
const POINTS = [at("1", E0, N0), at("2", E0 + 20, N0), at("3", E0 + 20, N0 + 20), at("4", E0, N0 + 20), at("5", E0 + 4, N0 + 5), at("6", E0 + 16.25, N0 + 5)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
const doc = (more: Partial<SurveyDocument> = {}): SurveyDocument =>
  surveyDocumentSchema.parse({ ...emptyDocument(), codes: commonCodes(), lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }], ...more });
const plan = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null });
const items = (d: SurveyDocument) => plan(d).sheet.pages[0]!.items;
type Item = ReturnType<typeof items>[number];

describe("a dimension line", () => {
  const dim = { id: "d1", from: id("5"), to: id("6"), offset: 6 };

  it("draws the line, its extension lines and arrowheads, and the distance from the coordinates, to the left of from-to", () => {
    const its = items(doc({ dimensions: [dim] })).filter((i) => i.entity === "dim:d1");
    const paths = its.filter((i): i is Extract<Item, { kind: "path" }> => i.kind === "path");
    // The line, two extension lines, two arrowheads.
    expect(paths).toHaveLength(5);
    expect(paths.filter((p) => p.closed && p.fill === "ink")).toHaveLength(2);
    expect(its.every((i) => i.layer === "DIMENSIONS")).toBe(true);
    const words = its.find((i): i is Extract<Item, { kind: "text" }> => i.kind === "text")!;
    expect(words.text).toBe("12.25");
    // From 5 to 6 runs east: its left is north, up the page, so the line is above the points.
    const p5 = plan(doc()).sheet.viewport!;
    expect(p5).toBeDefined();
    const line = paths.find((p) => p.points.length === 2 && Math.abs(p.points[0]![1] - p.points[1]![1]) < 1e-6 && Math.abs(p.points[0]![0] - p.points[1]![0]) > 10)!;
    const right = items(doc({ dimensions: [{ ...dim, offset: -6 }] })).filter((i): i is Extract<Item, { kind: "path" }> => i.kind === "path" && i.entity === "dim:d1").find((p) => p.points.length === 2 && Math.abs(p.points[0]![1] - p.points[1]![1]) < 1e-6 && Math.abs(p.points[0]![0] - p.points[1]![0]) > 10)!;
    expect(line.points[0]![1]).toBeLessThan(right.points[0]![1]);
    expect(right.points[0]![1] - line.points[0]![1]).toBeCloseTo(12, 6);
  });

  it("isn't drawn on a hidden Dimensions layer, and one whose point is gone stops the plan", () => {
    const hidden = doc({ dimensions: [dim], layers: { ...emptyDocument().layers, DIMENSIONS: { visible: false, locked: false } } });
    expect(items(hidden).some((i) => i.entity === "dim:d1")).toBe(false);
    const gone = doc({ dimensions: [{ ...dim, to: "00000000-0000-4000-8000-0000000000ff" }] });
    expect(plan(gone).findings.find((f) => f.code === "DIMENSION_MISSING_POINTS")).toMatchObject({ severity: "error", blocks: ["export", "approval"] });
  });

  it("goes into the DXF on the Dimensions layer, with its distance", () => {
    const d = doc({ dimensions: [dim] });
    const dxf = writeDxf({ document: d, points: POINTS, lots: computeLots(POINTS, d.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" });
    const lines = dxf.split(/\r?\n/).map((l) => l.trim());
    expect(lines).toContain("12.25");
    expect(lines.filter((l, i) => l === "DIMENSIONS" && lines[i - 1] === "8").length).toBeGreaterThanOrEqual(4);
  });

  it("is absent until the first, counts its points for the approval, and shows in the comparison", async () => {
    expect("dimensions" in doc()).toBe(false);
    expect(usedPointIds(doc({ dimensions: [dim] })).has(id("6"))).toBe(true);
    const hash = (d: SurveyDocument) => approvalHash({ document: d, crsId: "LOCAL", points: POINTS });
    expect(await hash(doc({ dimensions: [dim] }))).not.toBe(await hash(doc()));
    expect(compareDocuments(doc(), doc({ dimensions: [dim] }), POINTS).map((c) => c.text)).toContain("A dimension line was added.");
    expect(compareDocuments(doc({ dimensions: [dim] }), doc({ dimensions: [{ ...dim, offset: 9 }] }), POINTS).map((c) => c.text)).toContain("A dimension line is drawn differently now.");
  });
});

describe("words with their own size and angle", () => {
  it("draw at the size and angle the surveyor gave them, and keep the plan's own until then", () => {
    const plain = doc({ texts: [{ id: "t1", text: "Gate", at: id("1"), along: id("2") }] });
    const set = doc({ texts: [{ id: "t1", text: "Gate", at: id("1"), along: id("2"), size: 1.6, turn: 30 }] });
    const word = (d: SurveyDocument) => items(d).find((i): i is Extract<Item, { kind: "text" }> => i.kind === "text" && i.entity === "text:t1")!;
    expect(word(set).size).toBeCloseTo(word(plain).size * 1.6, 9);
    expect(word(set).rotate).toBe(30);
    expect(word(plain).rotate).toBe(0);
    expect(Object.keys(plain.texts![0]!)).not.toContain("size");
  });
});

describe("after review", () => {
  it("puts the DXF's distance beside its line, never across it, when the line runs west", () => {
    // From 6 to 5 runs west: its left is south. The text reads east, its tops north, towards the line: a text's height further out.
    const d = doc({ dimensions: [{ id: "d1", from: id("6"), to: id("5"), offset: 6 }] });
    const lines = writeDxf({ document: d, points: POINTS, lots: computeLots(POINTS, d.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" })
      .split(/\r?\n/)
      .map((l) => l.trim());
    const i = lines.findIndex((l, k) => l === "12.25" && lines[k - 1] === "1");
    const block = lines.slice(Math.max(0, i - 20), i);
    const y = Number(block[block.lastIndexOf("20") + 1]);
    // The line is 3 m south of the points (6 mm at 1:500); the baseline 1.2 + 1.9 mm further (1.55 m), so the 0.95 m text stays clear.
    expect(y).toBeCloseTo(N0 + 5 - 3 - 1.55, 6);
  });

  it("says a word drawn at another size or angle in the comparison", () => {
    const plain = doc({ texts: [{ id: "t1", text: "Gate", at: id("1"), along: id("2") }] });
    const set = doc({ texts: [{ id: "t1", text: "Gate", at: id("1"), along: id("2"), size: 1.6, turn: 45 }] });
    expect(compareDocuments(plain, set, POINTS).map((c) => c.text)).toEqual(['"Gate" is drawn at another size or angle.']);
  });

  it("puts a short dimension's figure past its end, where it's judged, with its arrowheads outside", () => {
    const short = [...POINTS, at("7", E0 + 4.5, N0 + 5)];
    const d = surveyDocumentSchema.parse({ ...doc(), dimensions: [{ id: "d2", from: short[4]!.id, to: short.at(-1)!.id, offset: 6 }] });
    const its = buildPlan({ points: short, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).sheet.pages[0]!.items.filter((i) => i.entity === "dim:d2");
    const line = its.find((i): i is Extract<Item, { kind: "path" }> => i.kind === "path" && !i.closed && i.points.length === 2 && Math.abs(i.points[0]![1] - i.points[1]![1]) < 1e-6)!;
    const words = its.find((i): i is Extract<Item, { kind: "text" }> => i.kind === "text")!;
    expect(words.x).toBeGreaterThan(Math.max(line.points[0]![0], line.points[1]![0]));
    const heads = its.filter((i): i is Extract<Item, { kind: "path" }> => i.kind === "path" && i.closed);
    // Each arrowhead's base stands outside the line's ends.
    const [lo, hi] = [Math.min(line.points[0]![0], line.points[1]![0]), Math.max(line.points[0]![0], line.points[1]![0])];
    for (const h of heads) expect(h.points[0]![0] < lo - 1e-6 || h.points[0]![0] > hi + 1e-6).toBe(true);
  });
});
