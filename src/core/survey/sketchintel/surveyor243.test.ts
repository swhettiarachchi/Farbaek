/**
 * What a surveyor reads in a field sketch that stage 241 didn't (stage 243): a gate in a boundary, a road named on the page, a road
 * measured between its two surveyed sides, and a stated extent of whole perches. SYNTHETIC points: a 10 m square lot whose north side
 * fronts a lane, with the neighbours' walls carrying that side on, and the walls across the lane surveyed.
 */
import { describe, expect, it } from "vitest";
import { SKETCH_READ_PROMPT } from "@/server/ai/sketch-reader";
import { commonCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema } from "../document";
import type { SurveyPoint } from "../parcel";
import { applySketch } from "./apply";
import { classifyArea, classifyLine } from "./classify";
import type { SketchDrawing, SketchLine } from "./drawing";
import { interpretSketch, roundPerches, type LotProposal, type RoadProposal } from "./interpret";

const codes = commonCodes();
const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const POINTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("41", -5, 10.02), at("31", 15, 9.98), at("90", -6, 13.5), at("91", 2, 13.52), at("92", 8, 13.48), at("93", 16, 13.5), at("95", 30, 30), at("96", 40, 30)];
let n = 0;
const line = (points: string[], o: Partial<SketchLine> = {}): SketchLine => ({ id: `l${++n}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true, ...o });
const LOT = [line(["1", "2", "3"]), line(["3", "4"], { label: "Gate", style: "single" }), line(["4", "1"])];
const NEIGHBOURS = [line(["4", "41"]), line(["3", "31"])];
const ACROSS = line(["90", "91", "92", "93"]);
const named = (lines: SketchLine[], areas = [{ id: "a1", file: "s.jpg", label: "Temple Road", around: [] as string[] }]): SketchDrawing => ({ lines, symbols: [], areas });
const road = (d: SketchDrawing, opts = {}) => interpretSketch(d, POINTS, codes, opts).proposals.find((p): p is RoadProposal => p.kind === "road");

describe("what's written", () => {
  it("knows a gate as an opening in the boundary, never a road", () => {
    expect(classifyLine("Gate", "single", codes)).toMatchObject({ kind: "gate", fromWriting: true });
    expect(classifyLine("ගේට්ටුව", "single", codes)).toMatchObject({ kind: "gate" });
    // As a side of the lot, it closes the outline like any wall.
    const lot = interpretSketch(named(LOT, []), POINTS, codes).proposals.find((p): p is LotProposal => p.kind === "lot");
    expect(lot?.areaM2).toBeCloseTo(100, 6);
  });

  it("knows a road's name written in an area, in English or Sinhala, and still knows lots and buildings", () => {
    for (const name of ["Temple Road", "2nd Lane", "පන්සල පාර", "ජනපද මාවත", "Station Rd"]) expect(classifyArea(name, codes).kind).toBe("road");
    expect(classifyArea("Lot B", codes).kind).toBe("lot");
    expect(classifyArea("P", codes).kind).toBe("building");
  });
});

describe("a road between two surveyed sides", () => {
  it("is drawn from the lot's side facing the line across from it, carried on by the neighbours' walls, and measured", () => {
    const r = road(named([...LOT, ...NEIGHBOURS, ACROSS]))!;
    expect(r).toBeDefined();
    expect(r.edgeA.map((p) => p.pointId)).toEqual(["41", "4", "3", "31"]);
    expect(r.edgeB.map((p) => p.pointId)).toEqual(["90", "91", "92", "93"]);
    expect(r.widthM.min).toBeCloseTo(3.48, 6);
    expect(r.widthM.max).toBeCloseTo(3.52, 6);
    expect(r.evidence.join(" ")).toContain("Between them it measures 3.48 m to 3.52 m (11.4 to 11.5 ft), from the surveyed points.");
    expect(r).toMatchObject({ name: "Temple Road", level: "check" });
  });

  it("asks when a written width isn't what's on the ground, and says so when it is", () => {
    const wide = interpretSketch(named([...LOT, ...NEIGHBOURS, ACROSS]), POINTS, codes, { widths: ["15'"] });
    expect(wide.questions.map((q) => q.text)).toContain("The road is written as 15' wide (4.57 m), and it measures 3.48 m to 3.52 m between its surveyed sides.");
    expect(road(named([...LOT, ...NEIGHBOURS, ACROSS]), { widths: ["3.5 m"] })!.evidence.join(" ")).toContain("It agrees with the 3.5 m written on the sketch.");
  });

  it("goes on the plan as a road waiting for the surveyor, its width written in feet", () => {
    const d = named([...LOT, ...NEIGHBOURS, ACROSS]);
    const doc = applySketch({ ...emptyDocument(), codes }, interpretSketch(d, POINTS, codes)).document;
    expect(doc.roads).toHaveLength(1);
    expect(doc.roads[0]).toMatchObject({ name: "Temple Road", width: "feet" });
    expect(doc.provenance[`road:${doc.roads[0]!.id}`]).toEqual({ source: "ai_photo", reviewed: false });
    expect(surveyDocumentSchema.safeParse(doc).success).toBe(true);
  });

  it("goes on the plan without a name the sheet can't print, and asks for it", () => {
    const d = named([...LOT, ...NEIGHBOURS, ACROSS], [{ id: "a1", file: "s.jpg", label: "පන්සල පාර", around: [] }]);
    const r = interpretSketch(d, POINTS, codes);
    expect(r.questions.map((q) => q.text)).toContain(`The road's name is written as "පන්සල පාර", which the sheet can't print yet.`);
    const doc = applySketch({ ...emptyDocument(), codes }, r).document;
    expect(doc.roads[0]!.name).toBe("");
  });

  it("is never drawn without a name, from a line too close or too far, or from one that only runs past the side's end", () => {
    expect(road({ ...named([...LOT, ...NEIGHBOURS, ACROSS]), areas: [] })).toBeUndefined();
    const close = [at("80", -6, 11), at("81", 16, 11)];
    expect(interpretSketch(named([...LOT, line(["80", "81"])]), [...POINTS, ...close], codes).proposals.some((p) => p.kind === "road")).toBe(false);
    expect(road(named([...LOT, line(["95", "96"])]))).toBeUndefined();
  });
});

describe("a symbol named in Sinhala", () => {
  it("takes ළිඳ beside a well as naming it, and says so", () => {
    const d: SketchDrawing = { lines: [], symbols: [{ id: "s1", file: "s.jpg", kind: "well", label: "ළිඳ", at: "95" }], areas: [] };
    const well = interpretSketch(d, POINTS, codes).proposals.find((p) => p.kind === "symbol")!;
    expect(well.level).toBe("strong");
    expect(well.evidence.join(" ")).toContain(`"ළිඳ" names a well, not a code: drawn as the code list's only well, Well.`);
  });
});

describe("the stated extent", () => {
  it("is said to be whole perches, which a deed's extent usually is, when the outline isn't", () => {
    expect(roundPerches(25.29285264 * 7)).toBe(7);
    expect(roundPerches(180.4)).toBeNull();
    const lot = interpretSketch(named(LOT, []), POINTS, codes, { statedM2: 25.29285264 * 4 }).proposals.find((p): p is LotProposal => p.kind === "lot")!;
    expect(lot.evidence.join(" ")).toContain("The stated extent comes to 4.00 perches, a round figure as a deed's extent usually is");
  });
});

describe("the reader's instructions", () => {
  it("tell it how surveyors write sketches", () => {
    expect(SKETCH_READ_PROMPT).toContain("numbers can be upside down");
    expect(SKETCH_READ_PROMPT).toContain("ගේට්ටුව");
  });
});
