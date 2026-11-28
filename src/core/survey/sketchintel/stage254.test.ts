/**
 * A house a sketch draws as walls meeting the boundary, the same number written twice, and a road found from a gate (stage 254, ADR 0262),
 * on SYNTHETIC points: a 10 m by 20 m lot turned 30°, a house in its south-west part against two of its sides, "photographed" upside
 * down at 25 photo units a metre.
 */
import { describe, expect, it } from "vitest";
import { commonCodes, type CodeEntry } from "../codes";
import { computeLots } from "../lots";
import { emptyDocument, surveyDocumentSchema } from "../document";
import { writeDxf } from "../export/dxf";
import type { SurveyPoint } from "../parcel";
import { applySketch } from "./apply";
import { buildingEntry, classifyArea, isGateWord } from "./classify";
import { sketchQuestionFindings } from "./findings";
import type { SketchArea, SketchDrawing, SketchLine } from "./drawing";
import { facesOf } from "./faces";
import { interpretSketch, type BuildingProposal, type RoadProposal } from "./interpret";
import { misplacedNumbers, type PlacedNumber } from "./placement";

const T = (30 * Math.PI) / 180;
/** A surveyed point at (u, v) metres in the lot's own frame: u across, v along. */
const at = (pointId: string, u: number, v: number): SurveyPoint => ({
  id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`,
  pointId,
  e: 500_000 + u * Math.cos(T) - v * Math.sin(T),
  n: 600_000 + u * Math.sin(T) + v * Math.cos(T),
  z: null,
  code: null,
});
// The lot 1-2-3-4; the house's walls 5-6 and 6-7, whose ends 5 and 7 stand a few centimetres inside the boundary, between its corners.
const POINTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 20), at("4", 0, 20), at("5", 6, 0.05), at("6", 6, 12), at("7", 0.1, 12), at("12", -2, 25), at("13", 12, 25)];
const pt = (id: string) => POINTS.find((p) => p.pointId === id)!;
/** Where a place in the lot's frame is on the photo: upside down, 25 units a metre. */
const photo = (u: number, v: number) => ({ x: 850 - 25 * u, y: 250 + 25 * v });
const FRAME: Record<string, [number, number]> = { 1: [0, 0], 2: [10, 0], 3: [10, 20], 4: [0, 20], 5: [6, 0], 6: [6, 12], 7: [0, 12] };
const placed = (file = "s.jpg"): PlacedNumber[] => Object.entries(FRAME).map(([label, [u, v]]) => ({ label, file, ...photo(u, v) }));
const line = (id: string, points: string[], style: SketchLine["style"] = "single", label = "", closes = false): SketchLine => ({ id, file: "s.jpg", points, label, style, closes, certain: true });
const area = (label: string, around: string[] = []): SketchArea => ({ id: "a1", file: "s.jpg", label, around });
const BOUNDARY = line("l1", ["1", "2", "3", "4"], "double", "MW", true);
const HOUSE_WALLS = [line("l2", ["5", "6"]), line("l3", ["6", "7"], "crossed")];
const drawing = (lines: SketchLine[], areas: SketchArea[] = []): SketchDrawing => ({ lines, symbols: [], areas });
const ring = (ps: readonly SurveyPoint[]) => ps.map((p) => p.pointId).sort((a, b) => Number(a) - Number(b));

describe("the areas a sketch's lines close round", () => {
  const runs = [BOUNDARY, ...HOUSE_WALLS].map((l) => ({ points: l.points.map(pt), closed: l.closes }));

  it("joins a wall's end drawn onto the boundary between its corners, and finds the house and the rest of the lot", () => {
    const faces = facesOf(runs, 0.25);
    expect(faces.map((f) => ring(f.points))).toEqual([
      ["1", "5", "6", "7"],
      ["2", "3", "4", "5", "6", "7"],
    ]);
    expect(faces[0]!.areaM2).toBeCloseTo(6 * 12 - 0.05 * 3 - 0.1 * 6, 1);
    // The walls' ends stay where they were surveyed, a few centimetres inside: the slivers they cut off the corners (0.25 and 1.00 m²)
    // belong to neither area. Nothing is moved to close them.
    expect(faces[0]!.areaM2 + faces[1]!.areaM2).toBeCloseTo(200 - 0.25 - 1.0, 6);
  });

  it("finds the same areas from lines drawn twice, as on two photos, or a side drawn on its own as well", () => {
    const twice = [...runs, ...HOUSE_WALLS.map((l) => ({ points: l.points.map(pt), closed: false })), { points: [pt("1"), pt("2")], closed: false }];
    expect(facesOf(twice, 0.25).map((f) => ring(f.points))).toEqual(facesOf(runs, 0.25).map((f) => ring(f.points)));
  });

  it("doesn't join an end that stands further off the boundary than the tolerance", () => {
    expect(facesOf(runs, 0.04).map((f) => ring(f.points))).toEqual([["1", "2", "3", "4"]]);
  });

  it("makes no areas at all from lines that cross where no number is", () => {
    const across = { points: [at("10", 2, 2), at("11", 8, 10)], closed: false };
    expect(facesOf([...runs, across], 0.25)).toEqual(facesOf(runs, 0.25));
    const through = { points: [at("10", 2, 6), at("11", 8, 6), at("14", 8, 8)], closed: false };
    // A spur that crosses the house's wall is pruned before the crossing check only when it ends free: this one does, so it's dropped.
    expect(facesOf([...runs, through], 0.25).length).toBe(2);
    const closedAcross = { points: [at("10", 4, 2), at("11", 8, 2), at("14", 8, 6), at("15", 4, 6)], closed: true };
    expect(facesOf([...runs, closedAcross], 0.25)).toEqual([]);
  });

  it("when asked, leaves out both legs of each crossing and finds the rest's areas, never one a left-out leg cuts (stage 304)", () => {
    // Two closed lines crossing each other in the lot's top half, away from the house: the house is still found. The rest of the lot,
    // which the left-out lines run through, isn't.
    const x1 = { points: [at("20", 2, 15), at("21", 6, 15), at("22", 4, 19)], closed: true };
    const x2 = { points: [at("23", 2, 18), at("24", 6, 18), at("25", 4, 14)], closed: true };
    expect(facesOf([...runs, x1, x2], 0.25)).toEqual([]);
    expect(facesOf([...runs, x1, x2], 0.25, undefined, "drop").map((f) => ring(f.points))).toEqual([["1", "5", "6", "7"]]);
    // A closed line across the house's wall: the wall's legs it crosses are left out, so the house isn't found cut or uncut.
    const closedAcross = { points: [at("10", 4, 2), at("11", 8, 2), at("14", 8, 6), at("15", 4, 6)], closed: true };
    expect(facesOf([...runs, closedAcross], 0.25, undefined, "drop").map((f) => ring(f.points))).not.toContainEqual(["1", "5", "6", "7"]);
  });

  it("never gives an area a left-out leg runs through, though it crosses none of its sides (stage 304 review)", () => {
    // A 20 m square lot; a wall across it at 8 m, a fence at 14 m, and a line from the bottom side to the fence crossing the wall where no
    // number is. Without it the wall and fence make three areas; with it left out, the area below the fence would run through the wall.
    const sq = [at("21", 0, 0), at("22", 20, 0), at("23", 20, 20), at("24", 0, 20)];
    const lot = { points: sq, closed: true };
    const wall = { points: [at("27", 0, 8), at("28", 20, 8)], closed: false };
    const fence = { points: [at("30", 0, 14), at("33", 12, 14), at("31", 20, 14)], closed: false };
    const across = { points: [at("32", 12, 0), at("33", 12, 14)], closed: false };
    expect(facesOf([lot, wall, fence, across], 0.25)).toEqual([]);
    const areas = facesOf([lot, wall, fence, across], 0.25, undefined, "drop");
    // The house below the wall (160 m²) isn't given as one with the garden (280 m²), whose middle the left-out leg runs through.
    expect(areas.some((f) => Math.abs(f.areaM2 - 280) < 1)).toBe(false);
    // Two lines crossing inside a square room, both from corner to corner: the room isn't given either.
    const diagonals = [{ points: [sq[0]!, sq[2]!], closed: false }, { points: [sq[1]!, sq[3]!], closed: false }];
    expect(facesOf([lot, ...diagonals], 0.25, undefined, "drop")).toEqual([]);
  });
});

describe("a house drawn as walls meeting the boundary, its label written inside", () => {
  const labels = (u: number, v: number, text = "ගෙදර") => [{ text, file: "s.jpg", ...photo(u, v) }];

  it("is the area its walls and the boundary close round where the label is written, drawn as the code list's building", () => {
    const r = interpretSketch(drawing([BOUNDARY, ...HOUSE_WALLS], [area("ගෙදර", ["6"])]), POINTS, commonCodes(), { placed: placed(), labels: labels(3, 6) });
    const b = r.proposals.find((p): p is BuildingProposal => p.kind === "building")!;
    expect(ring(b.points)).toEqual(["1", "5", "6", "7"]);
    expect(b.code).toBe("P");
    expect(b.evidence.join(" ")).toContain("the area the sketch's lines close round");
    expect(b.evidence.join(" ")).toContain("Permanent Building (P)");
    // Its walls are drawn once, as its outline, and aren't asked about; the boundary wall written MW stays as written.
    expect(r.proposals.filter((p) => p.kind === "line").map((p) => p.from)).toEqual([["l1"]]);
    expect(r.questions.some((q) => /line 5 and 6|line 6 and 7/.test(q.text))).toBe(false);
  });

  it("carries the doubts about its walls: a corner number written where another point would be is asked about on the building", () => {
    // The 6 is written where point 12 would be.
    const moved = placed().map((p) => (p.label === "6" ? { ...p, ...photo(-2, 25) } : p));
    const r = interpretSketch(drawing([BOUNDARY, ...HOUSE_WALLS], [area("ගෙදර")]), POINTS, commonCodes(), { placed: moved, labels: labels(3, 6) });
    const b = r.proposals.find((p): p is BuildingProposal => p.kind === "building")!;
    expect(b.evidence.join(" ")).toContain("Its corner 6 may be misread");
    const asked = r.questions.filter((q) => q.text.includes("The number read as 6"));
    expect(asked.map((q) => q.item)).toEqual([b.id]);
    // Shown, not hidden as being about something no longer on the plan.
    const doc = applySketch({ ...emptyDocument(), codes: commonCodes() }, r).document;
    expect(sketchQuestionFindings(r, doc).some((x) => x.message.includes("The number read as 6"))).toBe(true);
  });

  it("is the other area when the label is written there", () => {
    const r = interpretSketch(drawing([BOUNDARY, ...HOUSE_WALLS], [area("house")]), POINTS, commonCodes(), { placed: placed(), labels: labels(8, 16, "house") });
    expect(ring(r.proposals.find((p): p is BuildingProposal => p.kind === "building")!.points)).toEqual(["2", "3", "4", "5", "6", "7"]);
  });

  it("is asked about, and not drawn, when the label's place wasn't read, too few numbers place the photo, or the area named holds no label", () => {
    const ask = (opts: Parameters<typeof interpretSketch>[3], a = area("house")) => {
      const r = interpretSketch(drawing([BOUNDARY, ...HOUSE_WALLS], [a]), POINTS, commonCodes(), opts);
      return { built: r.proposals.some((p) => p.kind === "building"), asked: r.questions.some((q) => q.text.includes("its outline can't be drawn")) };
    };
    expect(ask({ placed: placed() })).toEqual({ built: false, asked: true });
    expect(ask({ placed: placed().slice(0, 5), labels: labels(3, 6, "house") })).toEqual({ built: false, asked: true });
    // The label is written in the south-west part, but the area names 3, a corner only the other part has.
    expect(ask({ placed: placed(), labels: labels(3, 6, "house") }, area("house", ["3"]))).toEqual({ built: false, asked: true });
  });

  it("isn't drawn when nothing says the area is a building: no wall inside the lot, a side written as a fence, a line through its corners not drawn, or a corner not surveyed", () => {
    const more = [...POINTS, at("8", 0, 15), at("9", 10, 15), at("10", 0, 6), at("11", 6, 6)];
    const asked = (lines: SketchLine[], a = area("house"), u = 3, v = 3) => {
      const r = interpretSketch(drawing(lines, [a]), more, commonCodes(), { placed: placed(), labels: labels(u, v, "house") });
      return { built: r.proposals.some((p) => p.kind === "building"), why: r.questions.find((q) => q.text.startsWith('"house"'))?.text ?? "" };
    };
    // A fence across the lot, the house written south of it: no wall of a house is drawn.
    expect(asked([BOUNDARY, line("l9", ["8", "9"], "single", "fence")])).toEqual({ built: false, why: expect.stringContaining("no wall of it is drawn inside the lot") });
    // The house's walls, and a fence from the boundary to one of them, the house written in the part the fence closes.
    expect(asked([BOUNDARY, ...HOUSE_WALLS, line("l9", ["10", "11"], "single", "fence")])).toEqual({ built: false, why: expect.stringContaining("written as a fence") });
    // A line through one of its corners that couldn't be drawn (66 isn't surveyed).
    expect(asked([BOUNDARY, ...HOUSE_WALLS, line("l9", ["5", "66"])], area("house"), 3, 6)).toEqual({ built: false, why: expect.stringContaining("wasn't drawn") });
    // A corner the area names that isn't surveyed.
    expect(asked([BOUNDARY, ...HOUSE_WALLS], area("house", ["5", "6", "99"]), 3, 6)).toEqual({ built: false, why: expect.stringContaining("99, written at its corners, isn't a surveyed point") });
  });

  it("is never the whole lot", () => {
    const r = interpretSketch(drawing([BOUNDARY], [area("house")]), POINTS, commonCodes(), { placed: placed(), labels: labels(3, 6, "house") });
    expect(r.proposals.some((p) => p.kind === "building")).toBe(false);
  });
});

describe("words for buildings and gates", () => {
  it("reads ගෙදර (home) as a building, as ගෙය and නිවස already were", () => {
    for (const w of ["ගෙදර", "ගෙය", "නිවස", "house"]) expect(classifyArea(w, commonCodes()).kind).toBe("building");
  });

  it("never reads writing about someone's land as a building", () => {
    for (const w of ["Home garden", "Home Garden of K. Silva", "Land of NHDA නිවාස", "Land claimed by the house owner"]) expect(classifyArea(w, commonCodes()).kind).toBe("land");
  });

  it("takes the code list's only building, and none when it has two", () => {
    expect(buildingEntry(commonCodes())?.code).toBe("P");
    const two: CodeEntry[] = [...commonCodes(), { code: "TB", meaning: "Temporary Building", kind: "outline", line: "solid", legend: true }];
    expect(buildingEntry(two)).toBeNull();
  });

  it("knows a gate in English and Sinhala", () => {
    expect(["Gate", "ගේට්ටුව", "gateway"].every(isGateWord)).toBe(true);
    expect(isGateWord("Gatehouse Road")).toBe(false);
  });
});

describe("the same number written twice", () => {
  it("is said, not asked about, when one of them is written at its own point's place", () => {
    const far = { label: "3", file: "s.jpg", ...photo(0, 0.5) };
    expect(misplacedNumbers([...placed(), far], POINTS)).toEqual([expect.objectContaining({ label: "3", likely: "1", alsoAtOwn: true })]);
    const r = interpretSketch(drawing([BOUNDARY]), POINTS, commonCodes(), { placed: [...placed(), far] });
    expect(r.questions.some((q) => q.text.includes("The number read as 3"))).toBe(false);
    const lot = r.proposals.find((p) => p.kind === "lot")!;
    expect(lot.evidence.join(" ")).toContain("Its corner 3 is also written on the sketch beside where 1 would be");
    expect(lot.evidence.join(" ")).not.toContain("may be misread");
    // Written once, and only far from its place, it's asked about.
    expect(misplacedNumbers([...placed().filter((p) => p.label !== "3"), far], POINTS)).toEqual([expect.objectContaining({ label: "3", alsoAtOwn: false })]);
  });
});

describe("a road found from a gate in the lot's side", () => {
  const far = line("l4", ["12", "13"], "double", "MW");

  it("is drawn between that side and the one line across from it, without a name, which is asked for", () => {
    const r = interpretSketch(drawing([BOUNDARY, far]), POINTS, commonCodes(), { gates: [["3"]] });
    const road = r.proposals.find((p): p is RoadProposal => p.kind === "road")!;
    expect(road.name).toBe("");
    expect(ring(road.edgeA)).toEqual(["3", "4"]);
    expect(ring(road.edgeB)).toEqual(["12", "13"]);
    expect(road.widthM.min).toBeCloseTo(5, 6);
    expect(road.evidence[0]).toContain("A gate is written in the lot's side");
    expect(r.questions.map((q) => q.text)).toContain("The road's name isn't read from the sketch.");
  });

  it("isn't drawn without a gate, or from a gate in a side no line is across from", () => {
    expect(interpretSketch(drawing([BOUNDARY, far]), POINTS, commonCodes()).proposals.some((p) => p.kind === "road")).toBe(false);
    expect(interpretSketch(drawing([BOUNDARY, far]), POINTS, commonCodes(), { gates: [["1"]] }).proposals.some((p) => p.kind === "road")).toBe(false);
  });

  // A gate halfway along the north side (14), and a wall across the east side (20 to 21) as well as the one across the north side.
  const GATED = [...POINTS, at("14", 5, 20), at("20", 15, -2), at("21", 15, 22)];
  const east = line("l6", ["20", "21"], "double", "MW");
  const roadFrom = (lines: SketchLine[], gates: string[][]) => interpretSketch(drawing(lines), GATED, commonCodes(), { gates });

  it("takes the side a gate is in, not a side it only touches", () => {
    // A gate in the middle of the north side.
    expect(ring(roadFrom([BOUNDARY, far, east], [["14"]]).proposals.find((p): p is RoadProposal => p.kind === "road")!.edgeB)).toEqual(["12", "13"]);
    // A gate drawn as a line along the north side, with only the east side across from a wall: no road on the side without the gate.
    expect(roadFrom([BOUNDARY, east], [["3", "14"]]).proposals.some((p) => p.kind === "road")).toBe(false);
  });

  it("asks when a gate at a corner could be in either side, each with a wall across from it", () => {
    const r = roadFrom([BOUNDARY, far, east], [["3"]]);
    expect(r.proposals.some((p) => p.kind === "road")).toBe(false);
    expect(r.questions.some((q) => q.text.startsWith("A gate is written in the lot's side, but which side"))).toBe(true);
  });
});

describe("a line the sketch draws dashed", () => {
  it("is drawn dashed on the plan and in the DXF, whatever its code says", () => {
    const r = interpretSketch(drawing([BOUNDARY, line("l5", ["5", "6"], "dashed")]), POINTS, commonCodes());
    const doc = applySketch({ ...emptyDocument(), codes: commonCodes() }, r).document;
    expect(surveyDocumentSchema.safeParse(doc).success).toBe(true);
    const dashed = doc.features.filter((f) => f.dashed);
    expect(dashed.map((f) => f.points.map((id) => POINTS.find((p) => p.id === id)!.pointId))).toEqual([["5", "6"]]);
    // A line with nothing said about it has no mark, so an earlier version's lines are unchanged.
    expect(doc.features.filter((f) => !f.dashed).every((f) => !("dashed" in f))).toBe(true);
    const dxf = writeDxf({ document: doc, points: POINTS, lots: computeLots(POINTS, doc.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" });
    expect(dxf.split("\r\n").filter((x, i, all) => x === "6" && all[i + 1] === "DASHED" && all[i - 2] === "8").length).toBe(1);
  });
});
