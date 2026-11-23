/**
 * Traverse adjustment (stage 231, ADR 0241), checked two ways: against hand-worked answers on a SYNTHETIC square traverse, and
 * against a second implementation that corrects each leg first and then runs the corrected legs from the start, which must land
 * exactly on the closing point.
 */
import { describe, expect, it } from "vitest";
import { adjustRun, precisionText, type AdjustMethod, type RunLeg } from "./adjust";

// A SYNTHETIC square loop from A (1000, 1000): 100 m east, north, west, then back south, missing A by +0.04 E, -0.02 N.
const legs: RunLeg[] = [
  { to: "B", dE: 100, dN: 0 },
  { to: "C", dE: 0, dN: 100 },
  { to: "D", dE: -100, dN: 0 },
  { to: "A", dE: 0.04, dN: -100.02 },
];
const mis = { dE: 0.04, dN: -0.02 };

/** The second implementation: each leg corrected by its own share, then the corrected legs run from the start. */
function byLegs(ls: readonly RunLeg[], m: { dE: number; dN: number }, method: AdjustMethod) {
  const L = ls.reduce((s, l) => s + Math.hypot(l.dE, l.dN), 0);
  const SE = ls.reduce((s, l) => s + Math.abs(l.dE), 0);
  const SN = ls.reduce((s, l) => s + Math.abs(l.dN), 0);
  let e = 0;
  let n = 0;
  let ue = 0;
  let un = 0;
  const out: { station: string; e: number; n: number; ue: number; un: number }[] = [];
  for (const l of ls) {
    const ce = method === "compass" ? (-m.dE * Math.hypot(l.dE, l.dN)) / L : (-m.dE * Math.abs(l.dE)) / SE;
    const cn = method === "compass" ? (-m.dN * Math.hypot(l.dE, l.dN)) / L : (-m.dN * Math.abs(l.dN)) / SN;
    e += l.dE + ce;
    n += l.dN + cn;
    ue += l.dE;
    un += l.dN;
    out.push({ station: l.to, e, n, ue, un });
  }
  return out;
}

describe("traverse adjustment", () => {
  it("spreads the misclosure by the compass rule, in proportion to the distance along the traverse", () => {
    const r = adjustRun(legs, mis, "compass");
    if (!r.ok) throw new Error(r.problem);
    const L = 300 + Math.hypot(0.04, 100.02);
    expect(r.corrections.map((c) => c.station)).toEqual(["B", "C", "D"]);
    expect(r.corrections[0]!.dE).toBeCloseTo((-0.04 * 100) / L, 12);
    expect(r.corrections[0]!.dN).toBeCloseTo((0.02 * 100) / L, 12);
    expect(r.corrections[2]!.dE).toBeCloseTo((-0.04 * 300) / L, 12);
    // About 1 cm at B, 2 at C, 3 at D: the largest is D's.
    expect(r.largest).toBeCloseTo(Math.hypot(0.04, 0.02) * (300 / L), 12);
  });

  it("spreads the misclosure by the transit rule, eastings by eastings and northings by northings", () => {
    const r = adjustRun(legs, mis, "transit");
    if (!r.ok) throw new Error(r.problem);
    const SE = 200.04;
    const SN = 200.02;
    expect(r.corrections[0]).toEqual({ station: "B", dE: expect.closeTo((-0.04 * 100) / SE, 12), dN: 0 });
    // B to C runs due north: C's easting moves no further than B's, and its northing takes the first share.
    expect(r.corrections[1]!.dE).toBeCloseTo((-0.04 * 100) / SE, 12);
    expect(r.corrections[1]!.dN).toBeCloseTo((0.02 * 100) / SN, 12);
    expect(r.corrections[2]!.dE).toBeCloseTo((-0.04 * 200) / SE, 12);
    expect(r.corrections[2]!.dN).toBeCloseTo((0.02 * 100) / SN, 12);
  });

  it("agrees with a second implementation that corrects each leg, and that closes exactly", () => {
    // An irregular SYNTHETIC open traverse from control to control, legs in every quadrant.
    const open: RunLeg[] = [
      { to: "T1", dE: 123.456, dN: 78.9 },
      { to: "T2", dE: -45.678, dN: 156.789 },
      { to: "T3", dE: -98.765, dN: -32.1 },
      { to: "T4", dE: 210.5, dN: -88.25 },
      { to: "K", dE: 12.34, dN: -101.01 },
    ];
    const m = { dE: -0.031, dN: 0.017 };
    for (const method of ["compass", "transit"] as const) {
      const r = adjustRun(open, m, method);
      if (!r.ok) throw new Error(r.problem);
      const second = byLegs(open, m, method);
      for (const [i, c] of r.corrections.entries()) {
        expect(c.station).toBe(second[i]!.station);
        expect(second[i]!.ue + c.dE).toBeCloseTo(second[i]!.e, 9);
        expect(second[i]!.un + c.dN).toBeCloseTo(second[i]!.n, 9);
      }
      // The corrected legs end on the closing point: the computed end minus the whole misclosure.
      const end = second.at(-1)!;
      expect(end.e).toBeCloseTo(end.ue - m.dE, 9);
      expect(end.n).toBeCloseTo(end.un - m.dN, 9);
    }
  });

  it("moves nothing when the traverse closes exactly", () => {
    const r = adjustRun(legs, { dE: 0, dN: 0 }, "compass");
    expect(r.ok && r.corrections.every((c) => c.dE === 0 && c.dN === 0) && r.largest === 0).toBe(true);
    const t = adjustRun(legs, { dE: 0, dN: 0 }, "transit");
    expect(t.ok && t.largest === 0).toBe(true);
  });

  it("refuses what it can't adjust: one leg, numbers that aren't finite, and the transit rule with no legs in the misclosure's direction", () => {
    expect(adjustRun([{ to: "K", dE: 10, dN: 10 }], mis, "compass")).toMatchObject({ ok: false });
    expect(adjustRun([{ to: "B", dE: Number.NaN, dN: 0 }, { to: "K", dE: 1, dN: 1 }], mis, "compass")).toMatchObject({ ok: false });
    const northSouth: RunLeg[] = [
      { to: "B", dE: 0, dN: 100 },
      { to: "K", dE: 0, dN: 100 },
    ];
    expect(adjustRun(northSouth, { dE: 0.01, dN: 0.01 }, "transit")).toMatchObject({ ok: false, problem: expect.stringMatching(/transit rule/) });
    // The compass rule still applies there, and the transit rule does when the misclosure has no easting.
    expect(adjustRun(northSouth, { dE: 0.01, dN: 0.01 }, "compass").ok).toBe(true);
    expect(adjustRun(northSouth, { dE: 0, dN: 0.01 }, "transit").ok).toBe(true);
  });

  it("says a precision as a reader would", () => {
    expect(precisionText(34360.4)).toBe("1 in 34,360");
    expect(precisionText(null)).toBe("exactly");
  });
});
