/**
 * Reducing observations (stage 225, ADR 0236), against answers worked out by hand. At SLD99's central meridian (E 500 000) and at
 * height 0, the grid scale factor is exactly k0 = 0.9999238418, so every expected coordinate below is plain arithmetic. SYNTHETIC values.
 */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { gridScaleFactor } from "../scale";
import { reduceSetup, reduceShot, type Setup, type Shot } from "./reduce";

const SLD99 = crsById("EPSG:5235")!;
const LOCAL = crsById("LOCAL")!;
const K0 = 0.9999238418;
const rad = (d: number) => (d * Math.PI) / 180;

const setup = (s: Partial<Setup> = {}): Setup => ({ line: 1, station: "1", e: 500_000, n: 700_000, z: 0, instrumentHeight: 1.5, orientation: 0, backsight: "2", ...s });
const polar = (s: Partial<Extract<Shot, { kind: "polar" }>>): Shot => ({ kind: "polar", line: 5, to: "10", code: "CP", targetHeight: 1.6, horizontal: 90, oriented: false, orientation: 0, zenith: 90, slope: 50, ...s });

describe("the grid scale factor", () => {
  it("is k0 on the central meridian at sea level, grows away from it, and falls with height; 1 on a local grid", () => {
    expect(gridScaleFactor(SLD99, 500_000, 0)).toBe(K0);
    expect(gridScaleFactor(SLD99, 600_000, 0)).toBeCloseTo(K0 * (1 + 100_000 ** 2 / K0 ** 2 / (2 * 6_377_000 ** 2)), 12);
    expect(gridScaleFactor(SLD99, 500_000, 1_000)).toBeCloseTo((K0 * 6_377_000) / 6_378_000, 12);
    expect(gridScaleFactor(LOCAL, 600_000, 1_800)).toBe(1);
  });
});

describe("one shot", () => {
  it("turns a level shot east into grid coordinates and a height", () => {
    const r = reduceShot(setup(), polar({}), SLD99);
    expect(r).toMatchObject({ pointId: "10", code: "CP", from: "1", scale: K0 });
    if ("problem" in r) throw new Error(r.problem);
    expect(r.e).toBeCloseTo(500_000 + 50 * K0, 9);
    expect(r.n).toBeCloseTo(700_000, 9);
    // Station height 0, instrument 1.5, level sight, target 1.6.
    expect(r.z).toBeCloseTo(-0.1, 9);
  });

  it("orients the circle by the backsight and takes the zenith angle's horizontal and vertical parts", () => {
    // Backsight azimuth 45° read on the circle at 10°: add 35°. A circle reading of 155° is an azimuth of 190°.
    const r = reduceShot(setup({ orientation: 35 }), polar({ orientation: 35, horizontal: 155, zenith: 60, slope: 40 }), SLD99);
    if ("problem" in r) throw new Error(r.problem);
    const hd = 40 * Math.sin(rad(60));
    expect(r.e).toBeCloseTo(500_000 + hd * K0 * Math.sin(rad(190)), 9);
    expect(r.n).toBeCloseTo(700_000 + hd * K0 * Math.cos(rad(190)), 9);
    expect(r.z).toBeCloseTo(1.5 + 40 * Math.cos(rad(60)) - 1.6, 9);
  });

  it("takes a corrected reading as an azimuth, and a reduced shot's azimuth and distances as they are", () => {
    const corrected = reduceShot(setup({ orientation: null }), polar({ orientation: null, horizontal: 0, oriented: true }), LOCAL);
    if ("problem" in corrected) throw new Error(corrected.problem);
    expect([corrected.e, corrected.n]).toEqual([500_000, 700_050]);
    const reduced = reduceShot(setup(), { kind: "reduced", line: 9, to: "11", code: null, targetHeight: null, azimuth: 270, horizontal: 25, vertical: 2 }, LOCAL);
    if ("problem" in reduced) throw new Error(reduced.problem);
    expect(reduced.e).toBeCloseTo(499_975, 9);
    expect(reduced.n).toBeCloseTo(700_000, 9);
    expect(reduced.z).toBeNull();
  });

  it("works out no height without the instrument or target height, and nothing without a backsight or a sensible reading", () => {
    const r = reduceShot(setup({ instrumentHeight: null }), polar({}), SLD99);
    expect("problem" in r ? null : r.z).toBeNull();
    expect(reduceShot(setup({ orientation: null }), polar({ orientation: null }), SLD99)).toEqual({ problem: "station 1 has no backsight, so its circle readings can't be turned into bearings" });
    expect(reduceShot(setup(), polar({ zenith: 190 }), SLD99)).toHaveProperty("problem");
    expect(reduceShot(setup(), polar({ slope: 0 }), SLD99)).toHaveProperty("problem");
  });
});

describe("a setup's shots", () => {
  it("averages two shots to one point, and says when they're over 2 cm apart", () => {
    const close = reduceSetup(setup(), [polar({ slope: 50 }), polar({ line: 6, slope: 50.002 })], SLD99);
    expect(close.points).toHaveLength(1);
    expect(close.points[0]!.e).toBeCloseTo(500_000 + 50.001 * K0, 9);
    expect(close.points[0]).toMatchObject({ shots: 2, line: 6 });
    expect(close.spreads).toEqual([]);
    const apart = reduceSetup(setup(), [polar({ slope: 50 }), polar({ line: 6, slope: 50.05 })], SLD99);
    expect(apart.spreads).toHaveLength(1);
    expect(apart.spreads[0]!.spread).toBeCloseTo(0.05 * K0, 6);
    // Three shots 18 mm apart each way: the spread is the largest gap between two of them, not twice the distance from their mean.
    const tri = reduceSetup(setup(), [polar({ slope: 50 }), polar({ slope: 50.018 }), polar({ slope: 50.009, horizontal: 90 + (0.0156 / 50) * (180 / Math.PI) })], LOCAL);
    expect(tri.spreads).toEqual([]);
  });

  it("refuses an impossible station height rather than working through it to infinite coordinates", () => {
    expect(reduceShot(setup({ z: -6_377_000 }), polar({}), SLD99)).toEqual({ problem: "station 1's height, -6377000 m, isn't a height on land" });
  });

  it("keeps a shot it can't work out apart, with its line", () => {
    const r = reduceSetup(setup({ orientation: null }), [polar({ line: 7, orientation: null })], SLD99);
    expect(r.points).toEqual([]);
    expect(r.problems).toEqual([{ line: 7, message: "station 1 has no backsight, so its circle readings can't be turned into bearings" }]);
  });
});
