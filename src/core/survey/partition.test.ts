/** Partitioning a lot (stage 193): hand-worked answers on SYNTHETIC lots, at grid-sized coordinates. */
import { describe, expect, it } from "vitest";
import { partitionLot, widthRoom, type PartitionRequest } from "./partition";
import type { SurveyPoint } from "./parcel";
import { UDA_2020, ownRules, readDecimal, remindersFor, reviewNote, shortOf } from "./rules";

const E0 = 500_000;
const N0 = 600_000;
const ring = (pts: [number, number][]): SurveyPoint[] => pts.map(([e, n], i) => ({ id: `00000000-0000-4000-c000-${String(i + 1).padStart(12, "0")}`, pointId: String(i + 1), e: E0 + e, n: N0 + n, z: null, code: null }));
const rect = ring([[0, 0], [40, 0], [40, 20], [0, 20]]);
const run = (r: Partial<PartitionRequest>) => partitionLot({ ring: rect, leg: 0, lines: "square", from: "start", shares: [null, null], rules: null, ...r });
const ok = (r: ReturnType<typeof partitionLot>) => {
  if (!r.ok) throw new Error(r.error);
  return r;
};

describe("partitioning a lot into shares", () => {
  it("divides a 40 m by 20 m lot into four equal shares square to the road", () => {
    const r = ok(run({ shares: [200, 200, 200, null] }));
    expect(r.feasible).toBe(true);
    expect(r.shares.map((s) => s.areaM2)).toEqual([200, 200, 200, 200].map((x) => expect.closeTo(x, 6)));
    expect(r.shares.map((s) => s.alongLegM)).toEqual([10, 10, 10, 10].map((x) => expect.closeTo(x, 6)));
    expect(r.shares.map((s) => s.depthM)).toEqual([20, 20, 20, 20].map((x) => expect.closeTo(x, 6)));
    // Setting out: along the road from corner 1 at 10, 20 and 30 m; along the back from corner 3 at 30, 20 and 10 m.
    const road = r.corners.filter((c) => c.from.pointId === "1").map((c) => c.distanceM);
    const back = r.corners.filter((c) => c.from.pointId === "3").map((c) => c.distanceM);
    expect(road).toEqual([10, 20, 30].map((x) => expect.closeTo(x, 6)));
    expect(back).toEqual([30, 20, 10].map((x) => expect.closeTo(x, 6)));
    expect(r.corners[0]!.e).toBeCloseTo(E0 + 10, 6);
    expect(r.bearing).toBeCloseTo(0, 9);
    expect(Math.abs(r.residualM2)).toBeLessThan(0.0001);
    expect(r.shares[0]!.corners.map((c) => c.name)).toEqual(["1", "P1", "P2", "4"]);
  });

  it("gives a stated share its area and the last what's left, from either end", () => {
    const r = ok(run({ shares: [150, null], from: "end" }));
    expect(r.shares[0]!.areaM2).toBeCloseTo(150, 6);
    expect(r.shares[1]!.areaM2).toBeCloseTo(650, 6);
    // From corner 2's end: the first share is 7.5 m along the road, so its line is 32.5 m from corner 1.
    expect(r.corners.find((c) => c.from.pointId === "1")!.distanceM).toBeCloseTo(32.5, 6);
  });

  it("puts a triangle's dividing line where the algebra says: 30 - √450 m from the corner", () => {
    const tri = ring([[0, 0], [30, 0], [0, 30]]);
    const r = ok(partitionLot({ ring: tri, leg: 0, lines: "square", from: "start", shares: [225, null], rules: null }));
    expect(r.corners.find((c) => c.from.pointId === "1")!.distanceM).toBeCloseTo(30 - Math.sqrt(450), 6);
    // The other end of the line is exactly 30 m from corner 2 along the long side.
    expect(r.corners.find((c) => c.from.pointId === "2")!.distanceM).toBeCloseTo(30, 6);
    expect(r.shares[0]!.areaM2).toBeCloseTo(225, 6);
  });

  it("stacks shares away from the leg with parallel lines, and checks the UDA minimums when asked", () => {
    const r = ok(run({ lines: "parallel", shares: [400, null], rules: UDA_2020 }));
    // Named along the line, west to east: P1 on the west side 4-1, P2 on the east side 2-3, each 10 m from its corner.
    expect(r.corners.map((c) => [c.name, c.from.pointId, c.distanceM])).toEqual([
      ["P1", "4", expect.closeTo(10, 6)],
      ["P2", "2", expect.closeTo(10, 6)],
    ]);
    expect(r.bearing).toBeCloseTo(90, 9);
    expect(r.feasible).toBe(false);
    expect(r.shares[0]!.problems).toEqual(["Its depth is 10.00 m, under the UDA minimum of 12.0 m."]);
    expect(r.shares[1]!.problems).toEqual(["It doesn't touch the chosen leg, so it has no frontage on it.", "Its depth is 10.00 m, under the UDA minimum of 12.0 m."]);
    const small = ok(run({ shares: [100, null], rules: UDA_2020 }));
    expect(small.shares[0]!.problems).toEqual(["It's 100.00 m², under the UDA minimum of 150 m².", "Its frontage is 5.00 m, under the UDA minimum of 6.0 m."]);
  });

  it("says when a line would cut a share in two, and never calls it feasible", () => {
    // A U: two arms joined along the south. Lines parallel to the south road, above the join, cross the U's arms twice each.
    const u = ring([[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]]);
    const r = ok(partitionLot({ ring: u, leg: 0, lines: "parallel", from: "start", shares: [500, null], rules: null }));
    expect(r.feasible).toBe(false);
    expect(r.shares[1]!.problems[0]).toMatch(/crosses the lot's boundary 4 times/);
  });

  it("refuses shares that don't add up", () => {
    expect(run({ shares: [900, null] })).toEqual({ ok: false, error: "The stated shares come to 900.00 m², more than the lot's 800.00 m²." });
    expect(run({ shares: [400, 300] })).toEqual({ ok: false, error: "The shares come to 700.00 m², not the lot's 800.00 m². Let one share take what's left." });
    expect(run({ shares: [800, null] }).ok).toBe(false);
    expect(run({ shares: [null] }).ok).toBe(false);
    expect(run({ shares: [-5, null] }).ok).toBe(false);
  });
});

describe("the re-check's cases", () => {
  it("refuses to stack shares from a leg the lot reaches behind", () => {
    const l = ring([[0, 0], [10, 0], [10, -20], [20, -20], [20, 10], [0, 10]]);
    expect(partitionLot({ ring: l, leg: 0, lines: "parallel", from: "start", shares: [50, null], rules: null })).toEqual({ ok: false, error: "The lot reaches behind that leg's line, so the shares can't be stacked from it. Choose another leg, or lines square to it." });
  });

  it("refuses a lot whose boundary crosses itself", () => {
    const bow = ring([[0, 0], [10, 10], [10, 0], [0, 10]]);
    expect(partitionLot({ ring: bow, leg: 0, lines: "square", from: "start", shares: [null, 20], rules: null }).ok).toBe(false);
  });

  it("doesn't let a tapering share pass on its deepest side", () => {
    // A trapezoid 40 m along the road, 20 m deep at the west end and 4 m at the east (480 m²). The east share of 240 m²
    // starts at x = 50 - √1300 = 13.9445 m: its dividing line is 14.42 m long, but its mean depth is 240 / 26.0555 = 9.21 m.
    const t = ring([[0, 0], [40, 0], [40, 4], [0, 20]]);
    const r = ok(partitionLot({ ring: t, leg: 0, lines: "square", from: "start", shares: [null, 240], rules: UDA_2020 }));
    const east = r.shares[1]!;
    expect(east.alongLegM).toBeCloseTo(40 - (50 - Math.sqrt(1300)), 6);
    expect(east.depthM).toBeCloseTo(240 / (40 - (50 - Math.sqrt(1300))), 6);
    expect(east.problems).toContain("Its depth is 9.21 m, under the UDA minimum of 12.0 m.");
    expect(r.feasible).toBe(false);
  });

  it("gives an end share with a slanted end its mean depth, not a sliver", () => {
    const s = ring([[0, 0], [40, 0], [40, 20], [-1, 20]]);
    const r = ok(partitionLot({ ring: s, leg: 0, lines: "square", from: "start", shares: [405, null], rules: null }));
    expect(r.shares[0]!.depthM).toBeGreaterThan(19);
  });

  it("ends a line at a surveyed corner it passes through, instead of a new corner on top of it", () => {
    // Five corners; the dividing line for two equal shares runs through corner 4 at (20, 20).
    const five = ring([[0, 0], [40, 0], [40, 20], [20, 20], [0, 20]]);
    const r = ok(partitionLot({ ring: five, leg: 0, lines: "square", from: "start", shares: [400, null], rules: null }));
    expect(r.corners.map((c) => [c.name, Boolean(c.existing)])).toEqual([
      ["P1", false],
      ["4", true],
    ]);
    expect(r.shares[0]!.corners.map((c) => c.name)).toEqual(["1", "P1", "4", "5"]);
  });

  it("names the road end P1 whichever way the lot's corners run", () => {
    const cw = ring([[0, 0], [0, 20], [40, 20], [40, 0]]);
    // Leg 3 runs from (40, 0) to (0, 0): the road, on a clockwise ring.
    const r = ok(partitionLot({ ring: cw, leg: 3, lines: "square", from: "start", shares: [400, null], rules: null }));
    const p1 = r.corners.find((c) => c.name === "P1")!;
    expect(p1.n).toBeCloseTo(N0, 6);
  });
});

describe("shares by width", () => {
  const FT = 0.3048;

  it("sets frontages along the road from the starting corner, the last taking what's left", () => {
    const r = ok(run({ by: "width", shares: [10, 10, null] }));
    expect(r.shares.map((x) => x.areaM2)).toEqual([200, 200, 400].map((x) => expect.closeTo(x, 6)));
    expect(r.shares.map((x) => x.alongLegM)).toEqual([10, 10, 20].map((x) => expect.closeTo(x, 6)));
    expect(r.corners.filter((c) => c.from.pointId === "1").map((c) => c.distanceM)).toEqual([10, 20].map((x) => expect.closeTo(x, 9)));
    expect(Math.abs(r.residualM2)).toBeLessThan(1e-6);
    expect(r.engine).toBe("partition/1.1.0");
  });

  it("measures from the other end when asked", () => {
    const r = ok(run({ by: "width", from: "end", shares: [7.5, null] }));
    expect(r.shares[0]!.areaM2).toBeCloseTo(150, 9);
    expect(r.corners.find((c) => c.from.pointId === "1")!.distanceM).toBeCloseTo(32.5, 9);
  });

  it("reserves a 10 ft access strip along a side, or behind the road", () => {
    // Square to the road: a strip 10 ft wide running back 20 m along corner 1's side.
    const side = ok(run({ by: "width", shares: [10 * FT, null] }));
    expect(side.shares[0]!.areaM2).toBeCloseTo(3.048 * 20, 9);
    expect(side.shares[0]!.alongLegM).toBeCloseTo(3.048, 9);
    // Parallel to the road: a strip 10 ft deep along its whole 40 m.
    const front = ok(run({ by: "width", lines: "parallel", shares: [10 * FT, null] }));
    expect(front.shares.map((x) => x.areaM2)).toEqual([121.92, 800 - 121.92].map((x) => expect.closeTo(x, 9)));
    expect(front.shares.map((x) => x.depthM)).toEqual([3.048, 20 - 3.048].map((x) => expect.closeTo(x, 9)));
  });

  it("shares the leg, with a lot reaching past its end adding to the last share", () => {
    // 30 m along the road, 40 m along the back: the east side slants out from (30, 0) to (40, 20). The lot is 700 m².
    const t = ring([[0, 0], [30, 0], [40, 20], [0, 20]]);
    const r = ok(partitionLot({ ring: t, leg: 0, lines: "square", from: "start", by: "width", shares: [10, 10, 10], rules: null }));
    expect(r.shares.map((x) => x.areaM2)).toEqual([200, 200, 300].map((x) => expect.closeTo(x, 9)));
    expect(r.shares.map((x) => x.alongLegM)).toEqual([10, 10, 10].map((x) => expect.closeTo(x, 9)));
    expect(widthRoom({ ring: t, leg: 0, lines: "square", from: "start" })).toBeCloseTo(30, 9);
  });

  it("refuses widths that don't fit, with the room in the message", () => {
    expect(run({ by: "width", shares: [25, 20] })).toEqual({ ok: false, error: "The stated widths come to 45.000 m, more than the leg's 40.000 m." });
    expect(run({ by: "width", shares: [10, 10] })).toEqual({ ok: false, error: "The widths come to 20.000 m, not the leg's 40.000 m. Let one share take what's left." });
    expect(run({ by: "width", shares: [40, null] })).toEqual({ ok: false, error: "The stated widths take all of the leg's 40.000 m, so nothing is left for the share left empty." });
    expect(run({ by: "width", lines: "parallel", shares: [25, null] })).toEqual({ ok: false, error: "The stated widths come to 25.000 m, more than the lot's depth of 20.000 m from that leg." });
    expect(run({ by: "width", shares: [0, null] })).toEqual({ ok: false, error: "Every stated share needs a width above zero." });
  });

  it("says how much room the widths share", () => {
    expect(widthRoom({ ring: rect, leg: 0, lines: "square", from: "start" })).toBeCloseTo(40, 9);
    expect(widthRoom({ ring: rect, leg: 1, lines: "square", from: "end" })).toBeCloseTo(20, 9);
    expect(widthRoom({ ring: rect, leg: 0, lines: "parallel", from: "start" })).toBeCloseTo(20, 9);
    const l = ring([[0, 0], [10, 0], [10, -20], [20, -20], [20, 10], [0, 10]]);
    expect(widthRoom({ ring: l, leg: 0, lines: "parallel", from: "start" })).toBeNull();
  });

  it("still checks the UDA minimums on width shares", () => {
    const r = ok(run({ by: "width", shares: [5, null], rules: UDA_2020 }));
    expect(r.shares[0]!.problems).toContain("Its frontage is 5.00 m, under the UDA minimum of 6.0 m.");
    expect(r.shares[0]!.problems).toContain("It's 100.00 m², under the UDA minimum of 150 m².");
    expect(r.feasible).toBe(false);
  });
});

describe("lines through a corner", () => {
  // A 20 m square, corners 1 (0, 0), 2 (20, 0), 3 (20, 20), 4 (0, 20): 400 m².
  const sq = ring([[0, 0], [20, 0], [20, 20], [0, 20]]);
  const fanRun = (r: Partial<PartitionRequest>) => partitionLot({ ring: sq, leg: 0, lines: "through", corner: 0, from: "start", shares: [null, null], rules: null, ...r });

  it("cuts off a triangle with a line from the corner to the far leg", () => {
    // Triangle 1-2-Q with Q = (20, y): 20y / 2 = 100, so y = 10: Q is 10 m from corner 2 towards 3.
    const r = ok(fanRun({ shares: [100, null] }));
    expect(r.shares.map((x) => x.areaM2)).toEqual([100, 300].map((x) => expect.closeTo(x, 9)));
    expect(r.corners).toHaveLength(1);
    const q = r.corners[0]!;
    expect([q.name, q.from.pointId, q.to.pointId]).toEqual(["P1", "2", "3"]);
    expect(q.distanceM).toBeCloseTo(10, 9);
    // From corner 1 to (20, 10): bearing atan(20 / 10) = 63.4349°, length √500.
    expect(r.rays).toEqual([{ from: "1", to: "P1", bearing: expect.closeTo((Math.atan2(20, 10) * 180) / Math.PI, 9), lengthM: expect.closeTo(Math.sqrt(500), 9) }]);
    expect(r.bearing).toBeNull();
    expect(r.segments).toEqual([{ cut: 0, a: { e: E0, n: N0 }, b: { e: expect.closeTo(E0 + 20, 6), n: expect.closeTo(N0 + 10, 6) } }]);
    expect(r.shares[0]!.corners.map((c) => c.name)).toEqual(["1", "2", "P1"]);
    expect(r.shares[0]!.alongLegM).toBeCloseTo(20, 9);
    expect(r.shares[1]!.alongLegM).toBe(0);
  });

  it("goes past a corner onto the next leg, and ends on a corner it reaches", () => {
    // 300 m²: the triangle to corner 3 is 200, then 10 (20 - x) more along the top: x = 10, 10 m from corner 3 towards 4.
    const far = ok(fanRun({ shares: [300, null] }));
    expect([far.corners[0]!.from.pointId, far.corners[0]!.to.pointId]).toEqual(["3", "4"]);
    expect(far.corners[0]!.distanceM).toBeCloseTo(10, 9);
    // 200 m²: the diagonal, ending on corner 3.
    const diag = ok(fanRun({ shares: [200, null] }));
    expect(diag.corners.map((c) => [c.name, Boolean(c.existing)])).toEqual([["3", true]]);
    expect(diag.shares[0]!.corners.map((c) => c.name)).toEqual(["1", "2", "3"]);
  });

  it("fans several shares out from the corner, either way round", () => {
    const r = ok(fanRun({ shares: [100, 200, null] }));
    expect(r.shares.map((x) => x.areaM2)).toEqual([100, 200, 100].map((x) => expect.closeTo(x, 9)));
    expect(r.corners.map((c) => [c.name, c.from.pointId, c.to.pointId])).toEqual([["P1", "2", "3"], ["P2", "3", "4"]]);
    expect(r.corners.map((c) => c.distanceM)).toEqual([10, 10].map((x) => expect.closeTo(x, 9)));
    // Going the other way from corner 1: up the west side to 4, then along the top. 100 m² is 10x, so x = 10: 10 m from corner 3 towards 4.
    const back = ok(fanRun({ from: "end", shares: [100, null] }));
    expect([back.corners[0]!.from.pointId, back.corners[0]!.to.pointId]).toEqual(["3", "4"]);
    expect(back.corners[0]!.distanceM).toBeCloseTo(10, 9);
    expect(back.shares[0]!.areaM2).toBeCloseTo(100, 9);
  });

  it("finds a line that stays inside an L-shaped lot, and says when none does", () => {
    // Corners 1 (0, 0), 2 (20, 0), 3 (20, 10), 4 (10, 10), 5 (10, 20), 6 (0, 20): 300 m². Lines through corner 2.
    const l = ring([[0, 0], [20, 0], [20, 10], [10, 10], [10, 20], [0, 20]]);
    const run2 = (shares: (number | null)[]) => partitionLot({ ring: l, leg: 0, lines: "through", corner: 1, from: "start", shares, rules: null });
    // 40 m²: the triangle 2-3-Q along 3 to 4 is 5 (20 - x), so x = 12, 8 m from corner 3. (The line to (6, 20) also cuts off 40 m² as signed area, but leaves the lot.)
    const r = ok(run2([40, null]));
    expect(r.feasible).toBe(true);
    expect([r.corners[0]!.from.pointId, r.corners[0]!.distanceM]).toEqual(["3", expect.closeTo(8, 9)]);
    expect(r.shares[0]!.areaM2).toBeCloseTo(40, 9);
    // 250 m²: the line to (0, 5) on the west side, inside the lot.
    const w = ok(run2([250, null]));
    expect(w.feasible).toBe(true);
    expect([w.corners[0]!.from.pointId, w.corners[0]!.distanceM]).toEqual(["6", expect.closeTo(15, 9)]);
    // 60 m²: only the line to (4, 20), which crosses the leg 3 to 4 and leaves the lot.
    const bad = ok(run2([60, null]));
    expect(bad.feasible).toBe(false);
    expect(bad.shares[0]!.problems[0]).toBe("The line from corner 2 to P1 leaves the lot or crosses its boundary, so a share would fall in pieces. Try going round the other way, another corner, or lines square to a leg.");
  });

  it("divides by area only, and needs its corner", () => {
    expect(fanRun({ by: "width", shares: [5, null] })).toEqual({ ok: false, error: "Lines through a corner divide by area. Give the shares as areas." });
    expect(fanRun({ corner: 7, shares: [100, null] })).toEqual({ ok: false, error: "Choose the corner the lines pass through." });
  });

  it("checks the UDA minimums on the fan's shares", () => {
    const r = ok(fanRun({ shares: [100, null], rules: UDA_2020 }));
    expect(r.shares[0]!.problems).toContain("It's 100.00 m², under the UDA minimum of 150 m².");
    expect(r.shares[1]!.problems).toContain("It doesn't touch the chosen leg, so it has no frontage on it.");
  });
});

describe("planning rules as versioned data", () => {
  it("names the UDA set, its sections and its review date", () => {
    expect(UDA_2020.minimums).toEqual({ areaM2: 150, frontageM: 6, depthM: 12 });
    expect(UDA_2020.status).toBe("verified_official");
    expect(reviewNote(UDA_2020, "2026-11-15")).toBe("New regulations are due by 31 December 2026; these figures may change then.");
    expect(reviewNote(UDA_2020, "2027-01-01")).toBe("These regulations were due to be replaced on 31 December 2026. Check for newer ones before relying on these figures.");
  });

  it("reminds of consent always, and of the declaration and open space for large land or many lots", () => {
    expect(remindersFor(UDA_2020, 800, 4)).toEqual(["Dividing land in a UDA-declared area needs prior written consent from the UDA and the local authority. (reg. 4(1))"]);
    expect(remindersFor(UDA_2020, 800, 8)).toHaveLength(3);
    expect(remindersFor(UDA_2020, 10_000, 2)).toHaveLength(3);
    const r = ok(run({ shares: [400, null], rules: UDA_2020 }));
    expect(r.reminders).toEqual(remindersFor(UDA_2020, 800, 2));
    expect(ok(run({ shares: [400, null] })).reminders).toEqual([]);
  });

  it("checks the surveyor's own minimums, saying they're the surveyor's", () => {
    const mine = ownRules({ areaM2: 250, frontageM: 0, depthM: 15 }, "  Development Plan, zone R2  ");
    expect(mine.source).toBe("Development Plan, zone R2");
    expect(mine.status).toBe("professional_configuration_required");
    expect(remindersFor(mine, 50_000, 40)).toEqual([]);
    // Two shares of 200 and 600 m², square to the 40 m road: share 1 is 10 m wide and 20 m deep.
    const r = ok(run({ shares: [200, null], rules: mine }));
    expect(r.shares[0]!.problems).toEqual(["It's 200.00 m², under the minimum you entered of 250 m²."]);
    expect(r.shares[1]!.problems).toEqual([]);
    // A frontage minimum of 0 doesn't ask a share to touch the leg.
    const back = ok(run({ lines: "parallel", shares: [200, null], rules: mine }));
    expect(back.shares[1]!.problems).not.toContain("It doesn't touch the chosen leg, so it has no frontage on it.");
    expect(run({ shares: [200, null], rules: ownRules({ areaM2: Number.NaN, frontageM: 0, depthM: 0 }, "x") })).toEqual({ ok: false, error: "Give each minimum as a number of zero or more." });
  });
});

describe("the stage 193 review's cases", () => {
  it("snaps a line onto a corner in both shares, leaving no sliver", () => {
    // Corner 4 at (20.00002, 100): a line 100 m long moved 0.02 mm moves 0.001 m², under the 0.005 m² a snap may move.
    const lot = ring([[0, 0], [40, 0], [40, 100], [20.00002, 100], [0, 100]]);
    const r = ok(partitionLot({ ring: lot, leg: 0, lines: "square", from: "start", shares: [2000, null], rules: null }));
    expect(r.corners.map((c) => [c.name, Boolean(c.existing)])).toEqual([["P1", false], ["4", true]]);
    expect(r.shares.map((x) => x.corners.filter((c) => c.name === "4").map((c) => c.e - E0))).toEqual([[20.00002], [20.00002]].map((v) => v.map((x) => expect.closeTo(x, 9))));
    expect(Math.abs(r.residualM2)).toBeLessThan(1e-9);
    expect(r.feasible).toBe(true);
  });

  it("doesn't snap when it would move more than the area check allows", () => {
    // Corner 4 at (20.0009, 100): snapping would move 0.045 m², so P2 is set out 0.9 mm from it instead.
    const lot = ring([[0, 0], [40, 0], [40, 100], [20.0009, 100], [0, 100]]);
    const r = ok(partitionLot({ ring: lot, leg: 0, lines: "square", from: "start", shares: [2000, null], rules: null }));
    expect(r.corners.map((c) => c.name)).toEqual(["P1", "P2"]);
    expect(r.shares.map((x) => x.areaM2)).toEqual([2000, 2000].map((x) => expect.closeTo(x, 6)));
    expect(r.feasible).toBe(true);
    const w = ok(partitionLot({ ring: lot, leg: 0, lines: "square", from: "start", by: "width", shares: [20, null], rules: null }));
    expect(w.feasible).toBe(true);
  });

  it("keeps a fan's line off a corner when snapping would move too much", () => {
    // 2000.08 m² through corner 1 of a 20 by 200 lot: the line ends 0.8 mm from corner 3, on the top leg; a snap would move 0.08 m².
    const lot = ring([[0, 0], [20, 0], [20, 200], [0, 200]]);
    const r = ok(partitionLot({ ring: lot, leg: 0, lines: "through", corner: 0, from: "start", shares: [2000.08, null], rules: null }));
    expect(r.corners[0]!.existing).toBeUndefined();
    expect([r.corners[0]!.from.pointId, r.corners[0]!.distanceM]).toEqual(["3", expect.closeTo(0.0008, 9)]);
    expect(r.feasible).toBe(true);
  });

  it("doesn't call a fan line bad because it ends 1 to 2 mm from a sharp corner", () => {
    // Corner 3 at (100, 10) is about 17 degrees; lines through corner 1, ending on the leg 3 to 4 at 1.1 and 1.5 mm from corner 3.
    const lot = ring([[0, 0], [50, 0], [100, 10], [0, 20]]);
    const leg = Math.hypot(100, 10);
    for (const dmm of [1.1, 1.5, 3]) {
      const r = ok(partitionLot({ ring: lot, leg: 0, lines: "through", corner: 0, from: "start", shares: [250 + ((dmm / 1000) / leg) * 1000, null], rules: null }));
      expect(r.feasible, String(dmm)).toBe(true);
    }
  });

  it("finds a line through a corner pointing into the lot in pieces, from either end", () => {
    // A notch from the east with its tip, corner 4, at (20, 10). The line x = 20 touches it: the east share falls in two pieces.
    const notch = ring([[0, 0], [40, 0], [40, 8], [20, 10], [40, 12], [40, 20], [0, 20]]);
    for (const from of ["start", "end"] as const) {
      const r = ok(partitionLot({ ring: notch, leg: 0, lines: "square", from, by: "width", shares: [20, null], rules: null }));
      expect(r.feasible, from).toBe(false);
      expect(r.shares.flatMap((x) => x.problems)[0]).toBe("A dividing line runs through corner 4, which points into the lot, so a share would fall in two pieces joined there. Try lines the other way, other shares, or another leg.");
      // Both stretches of the line are drawn.
      expect(r.segments.map((g) => [g.a.n - N0, g.b.n - N0].sort((x, y) => x - y))).toEqual([[0, 10], [10, 20]].map((v) => v.map((x) => expect.closeTo(x, 9))));
    }
  });

  it("shows a minimum as entered and never rounds a shortfall up to it", () => {
    const mine = ownRules({ areaM2: 0, frontageM: 6.25, depthM: 12.04 }, "a brief");
    const deep = ok(run({ lines: "parallel", by: "width", shares: [12.03, null], rules: mine }));
    expect(deep.shares[0]!.problems).toContain("Its depth is 12.03 m, under the minimum you entered of 12.04 m.");
    const front = ok(run({ by: "width", shares: [6.21, null], rules: mine }));
    expect(front.shares[0]!.problems).toContain("Its frontage is 6.21 m, under the minimum you entered of 6.25 m.");
    expect(shortOf(149.996, 150)).toBe("149.996");
    expect(shortOf(149.5, 150)).toBe("149.50");
    expect([readDecimal("12.5"), readDecimal(" .5 "), readDecimal("7")]).toEqual([12.5, 0.5, 7]);
    for (const bad of ["0x10", "0b101", "1e3", "-2", "", "1.2.3", "Infinity"]) expect(readDecimal(bad), bad).toBeNaN();
    expect(run({ shares: [null, 800] })).toEqual({ ok: false, error: "The stated shares take the whole lot, so nothing is left for the share left empty." });
  });
});
