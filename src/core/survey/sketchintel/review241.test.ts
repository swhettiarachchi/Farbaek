/**
 * Faults a fresh review found in the Sketch Intelligence Engine (stage 241, ADR 0249), each reproduced and kept fixed. SYNTHETIC
 * points: a 10 m square 1, 2, 3, 4 on a local grid, with a few around it.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema } from "../document";
import type { SurveyPoint } from "../parcel";
import { applySketch } from "./apply";
import { classifyArea, classifyLine } from "./classify";
import { acceptDrawing, type SketchDrawing, type SketchLine } from "./drawing";
import { evaluatePlan, sameRing } from "./evaluate";
import { interpretSketch, itemId, ringKey, writtenWidth, type LotProposal, type SymbolProposal } from "./interpret";

const codes = commonCodes();
const at = (pointId: string, e: number, n: number, code: string | null = null): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code });
const SQUARE = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("90", -5, 9.99), at("93", 15, 9.99), at("12", 5, 5, "EP"), at("13", 4, 4), at("101", 20, 20)];
let n = 0;
const line = (points: string[], o: Partial<SketchLine> = {}): SketchLine => ({ id: `l${++n}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true, ...o });
const drawing = (lines: SketchLine[], extra: Partial<SketchDrawing> = {}): SketchDrawing => ({ lines, symbols: [], areas: [], ...extra });
const read = (d: SketchDrawing, opts = {}) => interpretSketch(d, SQUARE, codes, opts);
const lotOf = (r: ReturnType<typeof read>) => r.proposals.find((p): p is LotProposal => p.kind === "lot");

describe("a lot drawn as one closed outline", () => {
  it("becomes the lot when the line closes, when its first number is written again at its end, and as an area's corners", () => {
    expect(lotOf(read(drawing([line(["1", "2", "3", "4"], { closes: true })])))?.areaM2).toBeCloseTo(100, 6);
    const round = read(drawing([line(["1", "2", "3", "4", "1"])]));
    expect(lotOf(round)?.areaM2).toBeCloseTo(100, 6);
    expect(round.questions.some((q) => q.text.includes("crosses itself"))).toBe(false);
    const area = read(drawing([], { areas: [{ id: "a1", file: "s.jpg", label: "A", around: ["1", "2", "3", "4", "1"] }] }));
    expect(lotOf(area)).toMatchObject({ label: "A", areaM2: 100 });
  });

  it("still refuses an outline that really crosses itself", () => {
    expect(read(drawing([line(["1", "3", "2", "4"], { closes: true })])).questions.some((q) => q.text.includes("crosses itself"))).toBe(true);
  });
});

describe("the lot among crossing lines", () => {
  it("takes the square, not a triangle, when unlabelled check lines cross it, and asks about the smaller outlines inside", () => {
    const r = read(drawing([line(["1", "2", "3"]), line(["3", "4", "1"]), line(["1", "3"], { label: "", style: "single" }), line(["2", "4"], { label: "", style: "single" })]));
    expect(lotOf(r)?.areaM2).toBeCloseTo(100, 6);
    expect(r.questions.some((q) => q.text.startsWith("The sketch's lines also close round a smaller outline inside the lot taken"))).toBe(true);
  });

  it("writes a ring one way, however it's read", () => {
    expect(ringKey(["3", "4", "1", "2"])).toBe(ringKey(["1", "2", "3", "4"]));
    expect(ringKey(["1", "4", "3", "2"])).toBe(ringKey(["1", "2", "3", "4"]));
    expect(ringKey(["1", "3", "4", "2"])).not.toBe(ringKey(["1", "2", "3", "4"]));
  });
});

describe("ids from what an item is", () => {
  it("gives the same thing read twice one id, and different things different ids, whatever the reader numbered them", () => {
    const first = applySketch({ ...emptyDocument(), codes }, read(drawing([line(["1", "2"], { id: "l1" })]))).document;
    const second = read(drawing([line(["3", "4"], { id: "l1" }), line(["2", "1"], { id: "l2" })]));
    const r = applySketch(first, second);
    // The new line 3 to 4 is added, though the reader called it l1 again; 2 to 1 is the line already there.
    expect(r.added).toHaveLength(1);
    expect(r.skipped).toEqual(["The line through 2, 1 is already on the plan."]);
    expect(new Set(r.document.features.map((f) => f.id)).size).toBe(2);
    expect(itemId("line", ["a", "b"])).toBe(itemId("line", ["b", "a"]));
    expect(itemId("symbol", ["a"], "Well")).not.toBe(itemId("symbol", ["b"], "Well"));
  });

  it("never takes a confirmed symbol's id, or resets its confirmation, for a symbol at another point", () => {
    const well = (pt: string) => drawing([], { symbols: [{ id: "s1", file: "s.jpg", kind: "well", label: "", at: pt }] });
    const once = applySketch({ ...emptyDocument(), codes }, read(well("13"))).document;
    const key = Object.keys(once.provenance)[0]!;
    const confirmed = { ...once, provenance: { [key]: { source: "ai_photo" as const, reviewed: true } } };
    const twice = applySketch(confirmed, read(well("101"))).document;
    expect(twice.symbols).toHaveLength(2);
    expect(new Set(twice.symbols!.map((s) => s.id)).size).toBe(2);
    expect(twice.provenance[key]).toEqual({ source: "ai_photo", reviewed: true });
    expect(surveyDocumentSchema.safeParse(twice).success).toBe(true);
  });
});

describe("reading what's written", () => {
  it("takes a single letter for a lot even where it's also a mark's code, and Lot 12 by its number", () => {
    expect(classifyArea("B", codes)).toMatchObject({ kind: "lot", name: "B" });
    expect(classifyArea("M", codes)).toMatchObject({ kind: "lot", name: "M" });
    expect(classifyArea("Lot 12", codes)).toMatchObject({ kind: "lot", name: "12" });
    expect(classifyArea("lot 3a", codes)).toMatchObject({ kind: "lot", name: "3A" });
    // An outline's code is the outline; a longer code isn't a lot's name.
    expect(classifyArea("P", codes)).toMatchObject({ kind: "building" });
    expect(classifyArea("CoP", codes).kind).not.toBe("lot");
  });

  it("knows a road abbreviated Mw.", () => {
    expect(classifyLine("Janatha Mw.", "double", codes)).toMatchObject({ kind: "road", fromWriting: true });
    expect(classifyLine("Janatha Mw 5", "double", codes)).toMatchObject({ kind: "road" });
  });

  it("never takes a number in a road's name for its width", () => {
    for (const name of ["Lane 5 Mawatha", "No 2 Main Street", "3 Mile Post Road", "5th Lane"]) expect(writtenWidth(name)).toBeNull();
    expect(writtenWidth("15'")).toBeCloseTo(4.572, 6);
    expect(writtenWidth("Road 15 ft")).toBeCloseTo(4.572, 6);
    expect(writtenWidth("4.5 m wide")).toBe(4.5);
    expect(writtenWidth("15 FT")).toBeCloseTo(4.572, 6);
  });
});

describe("the road's side", () => {
  it("counts the lot's corners on the road's edge, within the tolerance, as on it", () => {
    const r = read(drawing([line(["1", "2", "3", "4"], { closes: true }), line(["90", "4", "3", "93"], { label: "Station Road" })]));
    const road = r.proposals.find((p) => p.kind === "line" && p.feature === "road")!;
    expect(road.evidence.join(" ")).toMatch(/so the road lies on the other side, to its north/);
    expect(r.questions.some((q) => q.text.includes("lies on both sides"))).toBe(false);
  });
});

describe("symbols", () => {
  const symbol = (kind: "well" | "post", pt: string, label = "") => drawing([], { symbols: [{ id: "s1", file: "s.jpg", kind, label, at: pt }] });

  it("never draws a sketch's symbol over the point's own surveyed code: it asks", () => {
    const r = read(symbol("well", "12"));
    expect(r.proposals).toEqual([]);
    expect(r.questions[0]!.text).toBe("Point 12 is coded EP (electric post) in the survey, and the sketch draws a well there.");
  });

  it("never picks one of several posts: it asks which", () => {
    const r = read(symbol("post", "13"));
    expect(r.proposals).toEqual([]);
    expect(r.questions[0]!.text).toMatch(/^A post is drawn at point 13, and the code list has more than one: CP \(concrete post\), EP/);
    // Written beside it, the code settles it.
    expect(read(symbol("post", "13", "CP")).proposals[0]).toMatchObject({ code: "CP", level: "strong" });
  });

  it("is only checked, not strong, when nothing written names it", () => {
    const well = read(symbol("well", "13")).proposals.find((p): p is SymbolProposal => p.kind === "symbol")!;
    expect(well).toMatchObject({ code: "Well", level: "check" });
    expect(well.evidence.join(" ")).toContain("drawn as the code list's only well, Well");
  });
});

describe("keeping what the reader returned", () => {
  it("drops a line with a number left empty, rather than join its neighbours", () => {
    const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);
    const kept = acceptDrawing({ lines: [{ image: 0, points: ["1", " ", "3"], label: "", style: "single", closes: false, certain: true }], symbols: [], areas: [{ image: 0, label: "A", around: ["1", "", "3"] }] }, ["s.jpg"], clean, () => false);
    expect(kept.lines).toEqual([]);
    expect(kept.areas[0]!.around).toEqual([]);
  });

  it("asks about a line that joins a point to itself, instead of dropping it unsaid", () => {
    expect(read(drawing([line(["1", "1"])])).questions[0]!.text).toMatch(/joins a surveyed point to itself/);
  });
});

describe("the comparison with the surveyor's plan", () => {
  const ref = { lot: ["1", "2", "3", "4"], lines: [{ what: "wall", points: ["1", "2", "3"] }], symbols: [], statedM2: null };
  const drawn = (pts: string[]) => evaluatePlan({ ...emptyDocument(), features: [{ id: "f", layer: "WALLS", code: "MW", closed: false, points: pts.map((p) => SQUARE.find((x) => x.pointId === p)!.id) }] }, SQUARE, ref).lines[0]!;

  it("follows the reference's order: a line back over a leg doesn't draw it", () => {
    expect(drawn(["1", "3", "2"]).found).not.toBe("yes");
    expect(drawn(["1", "2", "3"]).found).toBe("yes");
    expect(drawn(["3", "2", "1"]).found).toBe("yes");
  });

  it("matches rings by whole point numbers", () => {
    expect(sameRing(["101", "5", "6"], ["1", "5", "6"])).toBe(false);
    expect(sameRing(["1", "5", "6"], ["5", "6", "1"])).toBe(true);
  });
});
