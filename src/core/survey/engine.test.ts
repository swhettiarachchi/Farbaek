/**
 * Known-answer tests for the Survey Studio engine. Every coordinate here is
 * SYNTHETIC test data, worked by hand; none of it is a real parcel.
 */
import { describe, expect, it } from "vitest";
import { bearingFromDeltas, deltasFromBearing, formatDms, formatQuadrant, normaliseDegrees, parseBearing, toDms } from "./angles";
import { area, centroid, distance, interiorAngles, isClockwise, openRing, perimeter, selfIntersections, signedArea, zeroLengthLegs, type Point } from "./geometry";
import { ACRE_M2, HECTARE_M2, PERCH_M2, ROOD_M2, SQUARE_YARD_M2, YARD_M, formatArp, fromSquareMetres, roundTo, toArp, toSquareMetres } from "./units";

describe("area units (international yard, exactly 0.9144 m)", () => {
  it("derives every constant from the yard", () => {
    expect(SQUARE_YARD_M2).toBeCloseTo(YARD_M * YARD_M, 14);
    expect(PERCH_M2).toBeCloseTo(30.25 * YARD_M * YARD_M, 12);
    expect(ROOD_M2).toBeCloseTo(40 * PERCH_M2, 10);
    expect(ACRE_M2).toBeCloseTo(4840 * YARD_M * YARD_M, 10);
    expect(ACRE_M2).toBeCloseTo(4 * ROOD_M2, 10);
    expect(HECTARE_M2).toBe(10_000);
  });

  it("converts and round-trips without drift", () => {
    expect(fromSquareMetres(ACRE_M2, "acre")).toBe(1);
    expect(fromSquareMetres(PERCH_M2 * 160, "acre")).toBeCloseTo(1, 12);
    expect(fromSquareMetres(10_000, "ha")).toBe(1);
    for (const v of [0.5, 1, 12.75, 3333.333]) {
      for (const u of ["ha", "acre", "rood", "perch", "m2"] as const) expect(fromSquareMetres(toSquareMetres(v, u), u)).toBeCloseTo(v, 10);
    }
  });

  it("splits into acres, roods and perches after one rounding", () => {
    expect(toArp(ACRE_M2)).toEqual({ acres: 1, roods: 0, perches: 0, perchDecimals: 2 });
    expect(toArp(ACRE_M2 + ROOD_M2 + 12.5 * PERCH_M2)).toEqual({ acres: 1, roods: 1, perches: 12.5, perchDecimals: 2 });
    // 39.999 perches at two decimals is a whole rood, not "40.00 perches".
    expect(toArp(39.999 * PERCH_M2)).toEqual({ acres: 0, roods: 1, perches: 0, perchDecimals: 2 });
    expect(toArp(0)).toEqual({ acres: 0, roods: 0, perches: 0, perchDecimals: 2 });
    expect(formatArp(toArp(ACRE_M2 + 2 * ROOD_M2 + 7.255 * PERCH_M2))).toBe("1A 2R 7.26P");
    expect(formatArp(toArp(10 * PERCH_M2, 1))).toBe("0A 0R 10.0P");
  });

  it("refuses impossible areas", () => {
    expect(() => toArp(-1)).toThrow(RangeError);
    expect(() => toArp(Number.NaN)).toThrow(RangeError);
  });

  it("rounds half away from zero, without float residue", () => {
    expect(roundTo(2.675, 2)).toBe(2.68);
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(-2.5, 0)).toBe(-3);
  });
});

describe("bearings (whole-circle, clockwise from grid north)", () => {
  it("gives the cardinal directions and every quadrant", () => {
    expect(bearingFromDeltas(0, 10)).toBe(0);
    expect(bearingFromDeltas(10, 0)).toBe(90);
    expect(bearingFromDeltas(0, -10)).toBe(180);
    expect(bearingFromDeltas(-10, 0)).toBe(270);
    expect(bearingFromDeltas(10, 10)).toBeCloseTo(45, 12);
    expect(bearingFromDeltas(10, -10)).toBeCloseTo(135, 12);
    expect(bearingFromDeltas(-10, -10)).toBeCloseTo(225, 12);
    expect(bearingFromDeltas(-10, 10)).toBeCloseTo(315, 12);
    expect(bearingFromDeltas(0, 0)).toBeNull();
  });

  it("wraps at 0 and 360 and stays near zero", () => {
    expect(normaliseDegrees(360)).toBe(0);
    expect(normaliseDegrees(-0)).toBe(0);
    expect(normaliseDegrees(-90)).toBe(270);
    expect(normaliseDegrees(725)).toBe(5);
    expect(bearingFromDeltas(-1e-9, 100)).toBeGreaterThan(359.999);
    expect(bearingFromDeltas(1e-9, 100)).toBeLessThan(0.001);
  });

  it("formats DMS with carry, never 60″ or 360°", () => {
    expect(formatDms(toDms(45.5))).toBe("045°30′00″");
    expect(formatDms(toDms(123 + 45 / 60 + 12 / 3600))).toBe("123°45′12″");
    expect(formatDms(toDms(10 + 59 / 60 + 59.6 / 3600))).toBe("011°00′00″");
    expect(formatDms(toDms(359 + 59 / 60 + 59.6 / 3600))).toBe("000°00′00″");
    expect(formatDms(toDms(0.0001234, 1))).toBe("000°00′00.4″");
    expect(formatQuadrant(135)).toBe("S 45°00′00″ E");
    expect(formatQuadrant(300.5)).toBe("N 59°30′00″ W");
  });

  it("reads typed bearings and keeps what was typed", () => {
    expect(parseBearing("123°45′12″")?.degrees).toBeCloseTo(123 + 45 / 60 + 12 / 3600, 12);
    expect(parseBearing("123 45 12")?.notation).toBe("dms");
    expect(parseBearing("123-45-12.5")?.degrees).toBeCloseTo(123 + 45 / 60 + 12.5 / 3600, 12);
    expect(parseBearing("45.5")).toMatchObject({ degrees: 45.5, notation: "decimal", original: "45.5" });
    expect(parseBearing("N 45 30 00 E")?.degrees).toBeCloseTo(45.5, 12);
    expect(parseBearing("S 45 30 00 E")?.degrees).toBeCloseTo(134.5, 12);
    expect(parseBearing("S 45 30 00 W")?.degrees).toBeCloseTo(225.5, 12);
    expect(parseBearing("N 45 30 00 W")?.degrees).toBeCloseTo(314.5, 12);
    for (const bad of ["", "abc", "123 61 00", "400", "N 95 00 00 E", "12 30 75"]) expect(parseBearing(bad)).toBeNull();
  });

  it("turns a bearing and distance back into deltas", () => {
    const d = deltasFromBearing(135, Math.SQRT2 * 10);
    expect(d.dE).toBeCloseTo(10, 10);
    expect(d.dN).toBeCloseTo(-10, 10);
    for (const b of [0, 37.25, 90, 181, 270, 359.5]) {
      const { dE, dN } = deltasFromBearing(b, 25);
      expect(bearingFromDeltas(dE, dN)).toBeCloseTo(b, 9);
    }
  });
});

// A synthetic 30 m × 20 m rectangle on SLD99-sized coordinates, and a concave L of six vertices.
const RECT: Point[] = [
  { e: 500_000, n: 600_000 },
  { e: 500_030, n: 600_000 },
  { e: 500_030, n: 600_020 },
  { e: 500_000, n: 600_020 },
];
const L_SHAPE: Point[] = [
  { e: 0, n: 0 },
  { e: 40, n: 0 },
  { e: 40, n: 10 },
  { e: 10, n: 10 },
  { e: 10, n: 30 },
  { e: 0, n: 30 },
];

/** An independent area method for the second check: the trapezoid rule over each leg. */
function trapezoidArea(ring: Point[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += (b.e - a.e) * (b.n + a.n);
  }
  return Math.abs(sum) / 2;
}

describe("planar geometry", () => {
  it("measures known shapes, at large coordinates too", () => {
    expect(area(RECT)).toBeCloseTo(600, 9);
    expect(perimeter(RECT)).toBeCloseTo(100, 9);
    expect(area(L_SHAPE)).toBe(40 * 10 + 10 * 20);
    expect(area([{ e: 0, n: 0 }, { e: 4, n: 0 }, { e: 0, n: 3 }])).toBe(6);
    expect(distance({ e: 0, n: 0 }, { e: 3, n: 4 })).toBe(5);
  });

  it("agrees with an independent second method", () => {
    for (const ring of [RECT, L_SHAPE]) expect(area(ring)).toBeCloseTo(trapezoidArea(ring.map((p) => ({ e: p.e - ring[0]!.e, n: p.n - ring[0]!.n }))), 9);
  });

  it("knows which way a ring runs, and accepts a repeated closing vertex", () => {
    expect(isClockwise(RECT)).toBe(false);
    expect(isClockwise([...RECT].reverse())).toBe(true);
    expect(signedArea([...RECT, RECT[0]!])).toBeCloseTo(600, 9);
    expect(openRing([...RECT, RECT[0]!])).toHaveLength(4);
  });

  it("finds self-intersections, and none in simple rings", () => {
    expect(selfIntersections(RECT)).toEqual([]);
    expect(selfIntersections(L_SHAPE)).toEqual([]);
    const bowtie = [{ e: 0, n: 0 }, { e: 10, n: 10 }, { e: 10, n: 0 }, { e: 0, n: 10 }];
    expect(selfIntersections(bowtie).length).toBeGreaterThan(0);
  });

  it("finds zero-length legs within a millimetre", () => {
    expect(zeroLengthLegs([{ e: 0, n: 0 }, { e: 0.0002, n: 0 }, { e: 10, n: 0 }, { e: 0, n: 10 }])).toEqual([0]);
    expect(zeroLengthLegs(RECT)).toEqual([]);
  });

  it("places a centroid inside a rectangle and measures interior angles", () => {
    const c = centroid(RECT);
    expect(c.e).toBeCloseTo(500_015, 6);
    expect(c.n).toBeCloseTo(600_010, 6);
    expect(interiorAngles(RECT).map((a) => Math.round(a))).toEqual([90, 90, 90, 90]);
    const angles = interiorAngles(L_SHAPE);
    expect(angles.reduce((s, a) => s + a, 0)).toBeCloseTo((L_SHAPE.length - 2) * 180, 9);
    expect(Math.round(angles[3]!)).toBe(270);
  });
});
