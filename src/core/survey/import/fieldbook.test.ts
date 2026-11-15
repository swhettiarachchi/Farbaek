/** The field book (stage 194): bearings and distances worked into points, with hand-worked answers on SYNTHETIC legs. */
import { describe, expect, it } from "vitest";
import { fieldBookText, looksLikeFieldBook, parseFieldBook } from "./fieldbook";

const N0 = 700_000;
const E0 = 450_000;
const book = (lines: string[]) => ["# Farbaek field book: bearings and distances, unadjusted", ...lines].join("\n");

describe("the field book", () => {
  it("works a closed traverse round a 25 m square, and finds it closes exactly", () => {
    const r = parseFieldBook(book([`start,9001,${N0},${E0}`, "leg,9001,1,0 00 00,25,CP", "leg,1,2,90 00 00,25,CP", "leg,2,3,180 00 00,25,St", "leg,3,9001,270 00 00,25,"]));
    expect(r.points.map((p) => [p.pointId, p.n - N0, p.e - E0, p.code])).toEqual([
      ["9001", 0, 0, null],
      ["1", 25, 0, "CP"],
      ["2", expect.closeTo(25, 9), expect.closeTo(25, 9), "CP"],
      ["3", expect.closeTo(0, 9), expect.closeTo(25, 9), "St"],
    ]);
    expect(r.checks).toEqual([{ line: 6, on: "9001", dE: expect.closeTo(0, 9), dN: expect.closeTo(0, 9), linear: expect.closeTo(0, 9), length: 100, ratio: null }]);
    expect(r.issues.map((i) => i.message)).toEqual(["Line 6: the legs close on point 9001 exactly."]);
  });

  it("reports a misclosure and its ratio, and never adjusts it", () => {
    // The last leg is 24.99 m: the traverse ends 10 mm short of the start, 1 in 9,999 over 99.99 m.
    const r = parseFieldBook(book([`start,9001,${N0},${E0}`, "leg,9001,1,0 00 00,25", "leg,1,2,90 00 00,25", "leg,2,3,180 00 00,25", "leg,3,9001,270 00 00,24.99"]));
    expect(r.checks[0]!.linear).toBeCloseTo(0.01, 9);
    expect(r.checks[0]!.ratio).toBeCloseTo(9999, 3);
    expect(r.issues[0]!.message).toBe("Line 6: the legs close on point 9001 10 mm out (1 in 9,999 over 99.99 m). The coordinates are unadjusted.");
    expect(r.points.find((p) => p.pointId === "3")!.e - E0).toBeCloseTo(25, 9);
  });

  it("radiates side shots from a point already in the project, with quadrant and decimal bearings", () => {
    const known = [{ pointId: "9001", e: E0, n: N0 }];
    const r = parseFieldBook(book(["leg,9001,10,45.5,10,CP", "leg,9001,11,S 45 00 00 E,10,St", "leg,11,12,135°00'00\",10,St"]), known);
    expect(r.issues).toEqual([]);
    const at = (id: string) => r.points.find((p) => p.pointId === id)!;
    expect(at("10").e - E0).toBeCloseTo(10 * Math.sin((45.5 * Math.PI) / 180), 9);
    expect(at("10").n - N0).toBeCloseTo(10 * Math.cos((45.5 * Math.PI) / 180), 9);
    expect(at("11").e - E0).toBeCloseTo(10 * Math.SQRT1_2, 9);
    expect(at("11").n - N0).toBeCloseTo(-10 * Math.SQRT1_2, 9);
    expect(at("12").e - E0).toBeCloseTo(20 * Math.SQRT1_2, 9);
    // The project's own point isn't imported again.
    expect(r.points.map((p) => p.pointId)).toEqual(["10", "11", "12"]);
  });

  it("refuses what it can't read for certain, each with its line", () => {
    const r = parseFieldBook(book([`start,9001,${N0},${E0}`, "leg,7,8,45 00 00,10", "leg,9001,8,45 61 00,10", "leg,9001,8,45 00 00,0", "leg,9001,8,45 00 00,ten", "trav,9001,8"]));
    expect(r.points.map((p) => p.pointId)).toEqual(["9001"]);
    expect(r.issues.map((i) => [i.line, i.message.slice(0, 48)])).toEqual([
      [3, "Line 3: the leg starts at point 7, which isn't k"],
      [4, 'Line 4: the bearing "45 61 00" isn\'t one Farbaek'],
      [5, 'Line 5: the distance "0" isn\'t a horizontal dist'],
      [6, 'Line 6: the distance "ten" isn\'t a horizontal di'],
      [7, 'Line 7 isn\'t a "start" or a "leg" line.'],
    ]);
    const clash = parseFieldBook(book(["start,9001,1,2"]), [{ pointId: "9001", e: E0, n: N0 }]);
    expect(clash.issues[0]!.message).toMatch(/^Line 2: point 9001 is already known at other coordinates/);
  });

  it("writes the entry table's rows as a field book and knows it again", () => {
    const text = fieldBookText({ pointId: "9001", n: "700000", e: "450000" }, [
      { from: "9001", to: "1", bearing: "0 00 00", distance: "25", code: "CP, found" },
      { from: "", to: "", bearing: "", distance: "", code: "" },
    ]);
    expect(text).toBe("# Farbaek field book: bearings and distances, unadjusted\nstart,9001,700000,450000\nleg,9001,1,0 00 00,25,CP  found");
    expect(looksLikeFieldBook(text)).toBe(true);
    expect(looksLikeFieldBook("leg,1,2,45,10")).toBe(true);
    expect(looksLikeFieldBook("1,700004.21,450012.345,21.43,CP")).toBe(false);
  });
});
