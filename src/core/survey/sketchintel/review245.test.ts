/**
 * Faults a fresh review found in stage 245's doubt and report (ADR 0253), each reproduced and kept fixed. SYNTHETIC points.
 */
import { describe, expect, it } from "vitest";
import { acceptSketch, checkReading, type SketchReading, type SketchRecord } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { crsById } from "../crs";
import { emptyDocument, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import type { SketchDrawing, SketchLine } from "./drawing";
import { interpretDocument } from "./findings";
import { interpretSketch } from "./interpret";
import { sketchReport, sketchReportMarkdown } from "./report";

const LOCAL = crsById("LOCAL")!;
const codes = commonCodes();
const at = (pointId: string, e: number, n: number, k = pointId): SurveyPoint => ({ id: `00000000-0000-4000-8000-${k.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
let k = 0;
const line = (points: string[], o: Partial<SketchLine> = {}): SketchLine => ({ id: `l${++k}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true, ...o });
const area = (label: string, around: string[] = []) => ({ id: `a${++k}`, file: "s.jpg", label, around });
const SQUARE = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("90", -6, 13.5), at("91", 2, 13.52), at("92", 8, 13.48), at("93", 16, 13.5)];
const LANE = line(["90", "91", "92", "93"]);
const SQ_LOT = [line(["1", "2", "3", "4"], { closes: true })];
const reading = (o: Partial<SketchReading> & Pick<SketchReading, "kind" | "text">): SketchReading => ({ id: `r${++k}`, file: "s.jpg", from: "", to: "", near: "", ...o });
const record = (readings: SketchReading[], drawing: SketchDrawing): SketchRecord => ({ model: "claude", readAt: "2026-11-24T08:00:00.000Z", files: ["s.jpg"], readings, unreadable: [], drawing });
const doc = (sketch: SketchRecord): SurveyDocument => ({ ...emptyDocument(), codes, sketch });

describe("a road written with doubt is never taken, and still counted", () => {
  it("doesn't draw a road from a doubtful name, even when the reader also gave it as an area", () => {
    const drawing: SketchDrawing = { lines: [...SQ_LOT, LANE], symbols: [], areas: [area("Temple Road")] };
    expect(interpretSketch(drawing, SQUARE, codes).proposals.some((p) => p.kind === "road")).toBe(true);
    const r = interpretDocument(doc(record([reading({ kind: "road", text: "Temple Road", certain: false, doubt: "the first word is faint" })], drawing)), SQUARE)!;
    expect(r.proposals.some((p) => p.kind === "road")).toBe(false);
    expect(r.questions.some((q) => q.text.includes('"Temple Road" (read with doubt), so no road is drawn from it'))).toBe(true);
  });

  it("asks when a clear name and a doubtful one differ, rather than taking the clear one", () => {
    const drawing: SketchDrawing = { lines: [...SQ_LOT, LANE], symbols: [], areas: [area("Temple Road")] };
    const r = interpretDocument(doc(record([reading({ kind: "road", text: "2nd Lane", certain: false })], drawing)), SQUARE)!;
    expect(r.proposals.some((p) => p.kind === "road")).toBe(false);
    expect(r.questions.some((q) => q.text.startsWith('The sketch names more than one road ("Temple Road" and "2nd Lane" (read with doubt))'))).toBe(true);
  });

  it("counts a doubtful width: never says it's missing, and a conflict takes none", () => {
    const edge: SketchDrawing = { lines: [...SQ_LOT, line(["90", "91", "92", "93"], { label: "Temple Road" })], symbols: [], areas: [] };
    const asked = (readings: SketchReading[]) => interpretDocument(doc(record(readings, edge)), SQUARE)!.questions.map((q) => q.text);
    expect(asked([]).some((t) => t.startsWith("The width of the road"))).toBe(true);
    const unsure = asked([reading({ kind: "road", text: "15'", certain: false })]);
    expect(unsure.some((t) => t.startsWith("The width of the road"))).toBe(false);
    expect(unsure.some((t) => t.includes("The road's width is written on the sketch as 15' (read with doubt), so it wasn't taken."))).toBe(true);
    const both = asked([reading({ kind: "road", text: "15'" }), reading({ kind: "road", text: "20'", certain: false })]);
    expect(both.some((t) => t.includes("More than one road width is written on the sketch (15' and 20' (read with doubt)): none was taken."))).toBe(true);
    expect(both.some((t) => t.includes("its far edge would lie"))).toBe(false);
  });
});

describe("the report reads the drawing and the numbers as the engine does", () => {
  it("gives a closed line its closing side", () => {
    const r = sketchReport({ sketch: record([reading({ kind: "distance", text: "10.00", from: "4", to: "1" })], { lines: SQ_LOT, symbols: [], areas: [] }), points: SQUARE, codes, crs: LOCAL, interpretation: null });
    expect(r.sides.map((s) => `${s.from}-${s.to}`)).toEqual(["1-2", "2-3", "3-4", "4-1"]);
    expect(r.sides.at(-1)!.entries[0]).toMatchObject({ meaning: "The side's measured length", status: "agrees" });
    expect(r.between).toEqual([]);
  });

  it("matches a measurement's ends as it matches point numbers: leading zeros said, a shared number never compared", () => {
    const pts = [...SQUARE, at("3", 10.2, 10, "333")];
    const r = sketchReport({ sketch: record([reading({ kind: "distance", text: "10.00", from: "2", to: "3" }), reading({ kind: "distance", text: "10.00", from: "01", to: "2" })], { lines: [line(["1", "2", "3"])], symbols: [], areas: [] }), points: pts, codes, crs: LOCAL, interpretation: null });
    const shared = r.sides.find((s) => s.from === "2" && s.to === "3")!;
    expect(shared.gridM).toBeNull();
    expect(shared.entries[0]).toMatchObject({ status: "unmatched", detail: "More than one surveyed point is numbered 3, so it can't be compared.", confidence: "low" });
    expect(r.points.find((p) => p.label === "3")?.how).toBe("ambiguous");
    expect(r.between[0]).toMatchObject({ text: "10.00", status: "agrees" });
  });

  it("compares a dimension written between two numbered points as a measurement between them", () => {
    const c = checkReading(reading({ kind: "dimension", text: "10.00", from: "1", to: "2" }), new Map(SQUARE.map((p) => [p.pointId, p])), LOCAL);
    expect(c).toMatchObject({ status: "agrees", reading: { kind: "dimension" } });
    const r = sketchReport({ sketch: record([reading({ kind: "dimension", text: "10.00", from: "1", to: "2" })], { lines: SQ_LOT, symbols: [], areas: [] }), points: SQUARE, codes, crs: LOCAL, interpretation: null });
    expect(r.sides[0]!.entries[0]).toMatchObject({ meaning: "The side's measured length", status: "agrees" });
  });

  it("lists only the questions the plan's checks still ask, when it has the plan", () => {
    const drawing: SketchDrawing = { lines: [...SQ_LOT, LANE], symbols: [], areas: [area("Temple Road")] };
    const d = doc(record([], drawing));
    const interp = interpretDocument(d, SQUARE)!;
    expect(interp.questions.length).toBeGreaterThan(0);
    const answered = interp.questions.filter((q) => q.answeredBy === "label").map((q) => q.item!);
    const labelled: SurveyDocument = { ...d, lots: answered.map((id) => ({ id, label: "A", sup: "", points: [], note: "" })) };
    const all = sketchReport({ sketch: d.sketch!, points: SQUARE, codes, crs: LOCAL, interpretation: interp }).questions;
    const open = sketchReport({ sketch: d.sketch!, points: SQUARE, codes, crs: LOCAL, interpretation: interp, document: labelled }).questions;
    expect(open.length).toBe(all.length - answered.length);
  });

  it("points a number found only at a symbol to that symbol's photo", () => {
    const sk: SketchRecord = { ...record([], { lines: [], symbols: [{ id: "s1", file: "b.jpg", kind: "well", label: "well", at: "77" }], areas: [] }), files: ["a.jpg", "b.jpg"] };
    expect(sketchReport({ sketch: sk, points: SQUARE, codes, crs: LOCAL, interpretation: null }).unclear[0]).toMatchObject({ what: "Point number 77", file: "b.jpg" });
  });

  it("escapes backslashes and brackets, so no link or image is made from a sketch's writing", () => {
    const BS = String.fromCharCode(92);
    const md = sketchReportMarkdown(sketchReport({ sketch: record([reading({ kind: "note", text: `a${BS}|b ![x](http://e.test/p.png)` })], { lines: [], symbols: [], areas: [] }), points: SQUARE, codes, crs: LOCAL, interpretation: null }));
    expect(md).toContain(`a${BS}${BS}${BS}|b !${BS}[x${BS}](http://e.test/p.png)`);
    expect(md).not.toContain("![x](");
  });
});

describe("a model's empty answer isn't a doubt", () => {
  it("keeps a clear reading clear when the doubt says none or N/A", () => {
    for (const none of ["none", "N/A", "n/a.", "-", "None."]) {
      const s = acceptSketch({ readings: [{ image: 0, kind: "point", text: "3", from: "", to: "", near: "", certain: true, doubt: none }], unreadable: [] }, ["a.jpg"], "claude", new Date());
      expect(s.readings[0]).not.toHaveProperty("certain");
      expect(s.readings[0]).not.toHaveProperty("doubt");
    }
  });
});
