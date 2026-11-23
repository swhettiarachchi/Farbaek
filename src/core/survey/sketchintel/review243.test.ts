/**
 * Faults a fresh review found in stage 243's road and name rules (ADR 0251), each reproduced and kept fixed. SYNTHETIC points.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { applySketch } from "./apply";
import { classifyArea, isRoadName } from "./classify";
import type { SketchDrawing, SketchLine } from "./drawing";
import { interpretDocument, sketchQuestionFindings } from "./findings";
import { interpretSketch, writtenWidth, type LotProposal, type RoadProposal } from "./interpret";

const codes = commonCodes();
const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
let k = 0;
const line = (points: string[], o: Partial<SketchLine> = {}): SketchLine => ({ id: `l${++k}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true, ...o });
const area = (label: string, around: string[] = []) => ({ id: `a${++k}`, file: "s.jpg", label, around });
const SQUARE = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("90", -6, 13.5), at("91", 2, 13.52), at("92", 8, 13.48), at("93", 16, 13.5)];
const LANE = line(["90", "91", "92", "93"]);
const SQ_LOT = [line(["1", "2", "3", "4"], { closes: true })];
const roads = (d: SketchDrawing, pts: SurveyPoint[], opts = {}) => interpretSketch(d, pts, codes, opts).proposals.filter((p): p is RoadProposal => p.kind === "road");

describe("a road is never drawn through a concave lot", () => {
  it("judges outside by the outline's winding, not its centre: an L-shaped lot's notch isn't outside the lower arm", () => {
    const pts = [at("1", 0, 0), at("2", 20, 0), at("3", 20, 5), at("4", 5, 5), at("5", 5, 20), at("6", 0, 20), at("70", 4, -1.5), at("71", 21, -1.5)];
    const d: SketchDrawing = { lines: [line(["70", "71"])], symbols: [], areas: [area("Lot 1", ["1", "2", "3", "4", "5", "6"]), area("Temple Road")] };
    expect(roads(d, pts)).toEqual([]);
  });

  it("never carries the near side on into the lot", () => {
    const pts = [at("1", 0, 0), at("2", 30, 0), at("3", 30, 6.4735), at("4", 10, 10), at("5", 0, 10), at("90", -6, 13.5), at("93", 26, 13.5), at("60", 16.76, 8.19)];
    const d: SketchDrawing = { lines: [line(["90", "93"]), line(["4", "60"], { label: "drain", style: "single" })], symbols: [], areas: [area("Lot 1", ["1", "2", "3", "4", "5"]), area("Temple Road")] };
    for (const r of roads(d, pts)) expect(r.edgeA.map((p) => p.pointId)).not.toContain("60");
  });
});

describe("a road is never chosen between", () => {
  it("asks when lines on more than one side could be the road's far side", () => {
    const pts = [...SQUARE, at("50", 12.5, -2), at("51", 12.5, 8)];
    const r = interpretSketch({ lines: [...SQ_LOT, LANE, line(["50", "51"])], symbols: [], areas: [area("Temple Road")] }, pts, codes);
    expect(r.proposals.some((p) => p.kind === "road")).toBe(false);
    expect(r.questions.some((q) => q.text.startsWith("The sketch names a road, and lines on more than one side of the lot could be its far side"))).toBe(true);
  });

  it("asks when two roads are named and one is drawn", () => {
    const r = interpretSketch({ lines: [...SQ_LOT, LANE], symbols: [], areas: [area("Temple Road"), area("2nd Lane")] }, SQUARE, codes);
    expect(r.proposals.some((p) => p.kind === "road")).toBe(false);
    expect(r.questions.some((q) => q.text.startsWith(`The sketch names more than one road ("Temple Road" and "2nd Lane")`))).toBe(true);
  });
});

describe("the road's questions on the plan", () => {
  const sketchDoc = (d: SketchDrawing, readings: { kind: "road"; text: string }[] = []): SurveyDocument => ({
    ...emptyDocument(),
    codes,
    sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-24T10:00:00Z", files: ["s.jpg"], readings: readings.map((r, i) => ({ id: `r${i}`, file: "s.jpg", from: "", to: "", near: "", ...r })), unreadable: [], drawing: d },
  });

  it("reach the plan's checks until the road is confirmed", () => {
    const doc = sketchDoc({ lines: [...SQ_LOT, LANE], symbols: [], areas: [area("පන්සල පාර")] });
    const applied = applySketch(doc, interpretDocument(doc, SQUARE)!).document;
    const asked = (d: SurveyDocument) => sketchQuestionFindings(interpretDocument(d, SQUARE), d).map((f) => f.message);
    expect(asked(applied)).toContain(`The road's name is written as "පන්සල පාර", which the sheet can't print yet.`);
    const id = applied.roads[0]!.id;
    expect(asked({ ...applied, provenance: { ...applied.provenance, [`road:${id}`]: { source: "ai_photo", reviewed: true } } })).not.toContain(`The road's name is written as "පන්සල පාර", which the sheet can't print yet.`);
  });

  it("about one road's edge are answered only by a road along it that the surveyor has accepted", () => {
    const d: SketchDrawing = { lines: [line(["1", "2", "3"]), line(["3", "4"], { label: "Gate", style: "single" }), line(["4", "1"], { label: "Station Road" }), LANE], symbols: [], areas: [area("Temple Road")] };
    const doc = sketchDoc(d);
    const applied = applySketch(doc, interpretDocument(doc, SQUARE)!).document;
    const edge = "The width of the road along 4 and 1 isn't written on the sketch.";
    expect(sketchQuestionFindings(interpretDocument(applied, SQUARE), applied).map((f) => f.message)).toContain(edge);
  });

  it("never add a road the plan already has along the same sides", () => {
    const doc = sketchDoc({ lines: [...SQ_LOT, LANE], symbols: [], areas: [area("Temple Road")] });
    const once = applySketch(doc, interpretDocument(doc, SQUARE)!).document;
    const own = { ...once, roads: once.roads.map((r) => ({ ...r, id: "road-1" })), provenance: {} };
    const twice = applySketch(own, interpretDocument(own, SQUARE)!);
    expect(twice.document.roads).toHaveLength(1);
    expect(twice.skipped).toContain("The sketch's road is already on the plan, along the same sides.");
  });
});

describe("names and widths", () => {
  it("never takes someone's land, a lot's description or a longer Sinhala word for a road's name", () => {
    for (const t of ["Land of Perera, Station Road", "Lot B, Temple Road side", "Land of A. Silva (Temple Rd)", "පාරමිතා ගේ ඉඩම"]) {
      expect(isRoadName(t)).toBe(false);
      expect(classifyArea(t, codes).kind).not.toBe("road");
    }
    for (const t of ["Temple Road", "2nd Lane", "Station Rd.", "Temple Mw.", "Lane 5", "පන්සල පාර", "ජනපද මාවත 3"]) expect(isRoadName(t)).toBe(true);
  });

  it("never takes a bare number for a road's name, and reads a width written in Sinhala", () => {
    const doc: SurveyDocument = { ...emptyDocument(), codes, sketch: { model: "m", readAt: "2026-11-24T10:00:00Z", files: ["s.jpg"], readings: [{ id: "r1", file: "s.jpg", kind: "road", text: "15", from: "", to: "", near: "" }], unreadable: [], drawing: { lines: [...SQ_LOT, LANE], symbols: [], areas: [] } } };
    expect(interpretDocument(doc, SQUARE)!.proposals.some((p) => p.kind === "road")).toBe(false);
    expect(writtenWidth("අඩි 15")).toBeCloseTo(4.572, 6);
    expect(writtenWidth("15 අඩි")).toBeCloseTo(4.572, 6);
    expect(writtenWidth("මීටර් 4")).toBe(4);
  });
});

describe("the stated extent", () => {
  it("doubts a stated extent of whole perches only when it differs by more than 1%", () => {
    const pts = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10.1), at("4", 0, 10.1)];
    const lot = interpretSketch({ lines: SQ_LOT, symbols: [], areas: [] }, pts, codes, { statedM2: 25.29285264 * 4 }).proposals.find((p): p is LotProposal => p.kind === "lot")!;
    expect(lot.evidence.join(" ")).not.toContain("round figure");
  });
});
