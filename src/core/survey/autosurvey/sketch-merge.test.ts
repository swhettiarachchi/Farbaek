/**
 * Two reads of one sketch, merged (stage 252, ADR 0260), on SYNTHETIC drawings: a square lot 1, 2, 3, 4 whose sides each read drew in
 * different pieces.
 */
import { describe, expect, it } from "vitest";
import type { DrawingAnswer } from "../sketchintel/drawing";
import type { SketchOutputReading } from "./sketch";
import { mergeLines, mergeReadings, mergeSketchReads } from "./sketch-merge";

type Line = DrawingAnswer["lines"][number];
const L = (points: string[], label = "MW", style = "double", certain = true): Line => ({ image: 0, points, label, style, closes: false, certain });
const R = (text: string, kind: SketchOutputReading["kind"] = "point", x = 100, y = 100, certain = true): SketchOutputReading => ({ image: 0, kind, text, from: "", to: "", near: "", certain, doubt: certain ? "" : "4 or 9", photoX: x, photoY: y });

describe("two reads of a sketch, merged", () => {
  it("keeps the first read's lines and adds the segments only the second drew, so the lot closes", () => {
    const first = [L(["1", "2", "3"]), L(["4", "1"])];
    const second = [L(["2", "3", "4"]), L(["1", "2"])];
    const merged = mergeLines(first, second);
    expect(merged.map((l) => l.points)).toEqual([["1", "2", "3"], ["4", "1"], ["3", "4"]]);
    // The added run carries the second read's label and style, read with doubt; first-read lines the second didn't draw in full too.
    expect(merged[2]).toMatchObject({ label: "MW", style: "double", certain: false });
    expect(merged[0]!.certain).toBe(true);
    expect(merged[1]!.certain).toBe(false);
  });

  it("reads a segment the same either way round, and keeps a long line the second read drew in pieces as it is", () => {
    const merged = mergeLines([L(["1", "2", "3", "4"])], [L(["3", "2"]), L(["4", "3"])]);
    expect(merged.map((l) => l.points)).toEqual([["1", "2", "3", "4"]]);
  });

  it("keeps an alternative path the second read drew between the same corners, for the engine and the surveyor to decide", () => {
    const merged = mergeLines([L(["1", "2", "3"])], [L(["1", "5", "2", "3"])]);
    expect(merged.map((l) => l.points)).toEqual([["1", "2", "3"], ["1", "5", "2"]]);
  });

  it("brings a closed outline only the second read drew over whole, closing segment included", () => {
    const merged = mergeLines([], [{ ...L(["1", "2", "3", "4"]), closes: true }]);
    expect(merged.map((l) => l.points)).toEqual([["1", "2", "3", "4"], ["4", "1"]]);
  });

  it("keeps a reading once, near the same place, and certain only if both reads were sure of it", () => {
    const merged = mergeReadings([R("10"), R("1.58", "distance", 300, 300)], [R("10", "point", 120, 90, false), R("10", "point", 700, 700), R("1.58", "distance", 310, 290)]);
    expect(merged.map((r) => [r.text, r.photoX, r.certain])).toEqual([
      ["10", 100, false],
      ["1.58", 300, true],
      ["10", 700, true],
    ]);
    expect(merged[0]!.doubt).toBe("4 or 9");
  });

  it("merges symbols, areas and unreadable notes once each, and with one read only, returns it as it is", () => {
    const a = { readings: [], unreadable: ["a figure by 4"], lines: [], symbols: [{ image: 0, kind: "well", label: "", at: "19" }], areas: [{ image: 0, label: "Lot A", around: ["1", "2", "3"] }] };
    const b = { readings: [], unreadable: ["A figure by 4 "], lines: [], symbols: [{ image: 0, kind: "well", label: "", at: "19" }, { image: 0, kind: "tree", label: "", at: "7" }], areas: [{ image: 0, label: "Lot A", around: ["3", "2", "1"] }] };
    const m = mergeSketchReads(a, b);
    expect(m.symbols!.map((s) => s.kind)).toEqual(["well", "tree"]);
    expect(m.areas).toHaveLength(1);
    expect(m.unreadable).toEqual(["a figure by 4"]);
    expect(mergeSketchReads(a, null)).toBe(a);
  });
});

describe("faults a fresh review found in the merge (stage 252)", () => {
  it("matches segments as the engine matches numbers, and never makes a segment from one number to itself", () => {
    expect(mergeLines([L(["1", "07"])], [L(["1", "7"])]).map((l) => l.points)).toEqual([["1", "07"]]);
    const closed = { ...L(["1", "2", "3", "1"]), closes: true };
    const merged = mergeLines([closed], [closed]);
    expect(merged.map((l) => l.points)).toEqual([["1", "2", "3", "1"]]);
    expect(merged[0]!.certain).toBe(true);
  });

  it("makes both readings doubtful where the two reads give one place different numbers: a 6 and a 9", () => {
    const merged = mergeReadings([R("6", "point", 400, 400)], [R("9", "point", 405, 402)]);
    expect(merged.map((r) => [r.text, r.certain])).toEqual([
      ["6", false],
      ["9", false],
    ]);
    expect(merged[0]!.doubt).toBe("read once as 6 and once as 9");
  });

  it("keeps two areas without numbered corners apart by their names", () => {
    const a = { readings: [], unreadable: [], lines: [], symbols: [], areas: [{ image: 0, label: "house", around: [] }] };
    const b = { readings: [], unreadable: [], lines: [], symbols: [], areas: [{ image: 0, label: "Lot A", around: [] }] };
    expect(mergeSketchReads(a, b).areas!.map((x) => x.label)).toEqual(["house", "Lot A"]);
  });
});
