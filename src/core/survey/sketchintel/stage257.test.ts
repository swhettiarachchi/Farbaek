/**
 * Three reads of one sketch, each line marked with how many reads drew it, and the lot drawn from what they agree on (stage 257, ADR
 * 0265). SYNTHETIC data: a 20 m by 10 m lot 1, 2, 3, 4, and a point 5 beyond its east side that one read joins to it.
 */
import { describe, expect, it } from "vitest";
import { mergeSketchReads } from "../autosurvey/sketch-merge";
import type { SketchReadOutput } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import type { SurveyPoint } from "../parcel";
import { acceptDrawing, type DrawingAnswer } from "./drawing";
import { interpretSketch, type LotProposal } from "./interpret";

type Line = DrawingAnswer["lines"][number];
const L = (points: string[], label = "MW"): Line => ({ image: 0, points, label, style: "double", closes: false, certain: true });
const read = (lines: Line[]): SketchReadOutput => ({ readings: [], unreadable: [], lines, symbols: [], areas: [] });
const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const POINTS = [at("1", 0, 0), at("2", 20, 0), at("3", 20, 10), at("4", 0, 10), at("5", 26, 10)];
const LOT = [L(["1", "2", "3", "4", "1"])];
/** One read also draws the east side out to 5, a stray line. */
const STRAY = [L(["1", "2", "5", "3", "4", "1"])];

const drawingOf = (out: SketchReadOutput) =>
  acceptDrawing({ lines: out.lines ?? [], symbols: out.symbols ?? [], areas: out.areas ?? [] }, ["s.jpg"], (s, max) => s.trim().slice(0, max), () => false);
const lotOf = (out: SketchReadOutput) => interpretSketch(drawingOf(out), POINTS, commonCodes());

describe("three reads of a sketch", () => {
  it("mark each line with how many reads drew it, split where they stop agreeing", () => {
    const m = mergeSketchReads(read(STRAY), read(LOT), read(LOT));
    const reads = (m.lines ?? []).map((l) => [l.points.join("-"), l.reads]);
    // 1-2, 3-4 and 4-1 all three drew; 2-5-3 only the first; 2-3 the other two.
    expect(reads).toEqual([
      ["1-2", 3],
      ["2-5-3", 1],
      ["3-4-1", 3],
      ["2-3", 2],
    ]);
  });

  it("keep how many reads drew a line through the checks the plan stores it with", () => {
    const d = drawingOf(mergeSketchReads(read(STRAY), read(LOT), read(LOT)));
    expect(d.lines.map((l) => l.reads)).toEqual([3, 1, 3, 2]);
    // A reader can't set it: an out-of-range count is dropped.
    expect(acceptDrawing({ lines: [{ ...L(["1", "2"]), reads: 12 }], symbols: [], areas: [] }, ["s.jpg"], (s) => s, () => false).lines[0]).not.toHaveProperty("reads");
  });

  it("draw the lot from the lines at least two reads drew, and ask about the wider outline a stray line would make", () => {
    const r = lotOf(mergeSketchReads(read(STRAY), read(LOT), read(LOT)));
    const lot = r.proposals.find((p): p is LotProposal => p.kind === "lot")!;
    expect(lot.corners.map((p) => p.pointId).sort()).toEqual(["1", "2", "3", "4"]);
    expect(lot.areaM2).toBeCloseTo(200, 6);
    expect(lot.evidence[0]).toContain("at least two reads");
    expect(r.questions.some((q) => q.text.startsWith("Only one read of the sketch drew the line through 2, 5 and 3"))).toBe(true);
  });

  it("draw the lot from every line when the reads agree on no outline, and from every line of a single read", () => {
    // Each read drew a different half: no outline is drawn by two.
    const halves = lotOf(mergeSketchReads(read([L(["1", "2", "3"])]), read([L(["3", "4", "1"])]), read([])));
    expect(halves.proposals.find((p): p is LotProposal => p.kind === "lot")!.areaM2).toBeCloseTo(200, 6);
    const single = lotOf(read(STRAY));
    expect(single.proposals.find((p): p is LotProposal => p.kind === "lot")!.areaM2).toBeCloseTo(230, 6);
  });
});
