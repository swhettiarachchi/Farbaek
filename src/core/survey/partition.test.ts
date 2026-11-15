/** Partitioning a lot (stage 193): hand-worked answers on SYNTHETIC lots, at grid-sized coordinates. */
import { describe, expect, it } from "vitest";
import { partitionLot, type PartitionRequest } from "./partition";
import type { SurveyPoint } from "./parcel";

const E0 = 500_000;
const N0 = 600_000;
const ring = (pts: [number, number][]): SurveyPoint[] => pts.map(([e, n], i) => ({ id: `00000000-0000-4000-c000-${String(i + 1).padStart(12, "0")}`, pointId: String(i + 1), e: E0 + e, n: N0 + n, z: null, code: null }));
const rect = ring([[0, 0], [40, 0], [40, 20], [0, 20]]);
const run = (r: Partial<PartitionRequest>) => partitionLot({ ring: rect, leg: 0, lines: "square", from: "start", shares: [null, null], uda: false, ...r });
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
    const r = ok(partitionLot({ ring: tri, leg: 0, lines: "square", from: "start", shares: [225, null], uda: false }));
    expect(r.corners.find((c) => c.from.pointId === "1")!.distanceM).toBeCloseTo(30 - Math.sqrt(450), 6);
    // The other end of the line is exactly 30 m from corner 2 along the long side.
    expect(r.corners.find((c) => c.from.pointId === "2")!.distanceM).toBeCloseTo(30, 6);
    expect(r.shares[0]!.areaM2).toBeCloseTo(225, 6);
  });

  it("stacks shares away from the leg with parallel lines, and checks the UDA minimums when asked", () => {
    const r = ok(run({ lines: "parallel", shares: [400, null], uda: true }));
    // Named along the line, west to east: P1 on the west side 4-1, P2 on the east side 2-3, each 10 m from its corner.
    expect(r.corners.map((c) => [c.name, c.from.pointId, c.distanceM])).toEqual([
      ["P1", "4", expect.closeTo(10, 6)],
      ["P2", "2", expect.closeTo(10, 6)],
    ]);
    expect(r.bearing).toBeCloseTo(90, 9);
    expect(r.feasible).toBe(false);
    expect(r.shares[0]!.problems).toEqual(["Its depth is 10.00 m, under the UDA minimum of 12.0 m."]);
    expect(r.shares[1]!.problems).toEqual(["It doesn't touch the chosen leg, so it has no frontage on it.", "Its depth is 10.00 m, under the UDA minimum of 12.0 m."]);
    const small = ok(run({ shares: [100, null], uda: true }));
    expect(small.shares[0]!.problems).toEqual(["It's 100.00 m², under the UDA minimum of 150 m².", "Its frontage is 5.00 m, under the UDA minimum of 6.0 m."]);
  });

  it("says when a line would cut a share in two, and never calls it feasible", () => {
    // A U: two arms joined along the south. Lines parallel to the south road, above the join, cross the U's arms twice each.
    const u = ring([[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]]);
    const r = ok(partitionLot({ ring: u, leg: 0, lines: "parallel", from: "start", shares: [500, null], uda: false }));
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
    expect(partitionLot({ ring: l, leg: 0, lines: "parallel", from: "start", shares: [50, null], uda: false })).toEqual({ ok: false, error: "The lot reaches behind that leg's line, so the shares can't be stacked from it. Choose another leg, or lines square to it." });
  });

  it("refuses a lot whose boundary crosses itself", () => {
    const bow = ring([[0, 0], [10, 10], [10, 0], [0, 10]]);
    expect(partitionLot({ ring: bow, leg: 0, lines: "square", from: "start", shares: [null, 20], uda: false }).ok).toBe(false);
  });

  it("checks the UDA depth at the shallow end of a tapering share", () => {
    // A trapezoid 40 m along the road, 20 m deep at the west end and 4 m at the east.
    const t = ring([[0, 0], [40, 0], [40, 4], [0, 20]]);
    const r = ok(partitionLot({ ring: t, leg: 0, lines: "square", from: "start", shares: [null, 240], uda: true }));
    const east = r.shares[1]!;
    expect(east.depthM).toBeCloseTo(4, 3);
    expect(east.problems).toContain("Its depth is 4.00 m, under the UDA minimum of 12.0 m.");
    expect(r.feasible).toBe(false);
  });

  it("ends a line at a surveyed corner it passes through, instead of a new corner on top of it", () => {
    // Five corners; the dividing line for two equal shares runs through corner 4 at (20, 20).
    const five = ring([[0, 0], [40, 0], [40, 20], [20, 20], [0, 20]]);
    const r = ok(partitionLot({ ring: five, leg: 0, lines: "square", from: "start", shares: [400, null], uda: false }));
    expect(r.corners.map((c) => [c.name, Boolean(c.existing)])).toEqual([
      ["P1", false],
      ["4", true],
    ]);
    expect(r.shares[0]!.corners.map((c) => c.name)).toEqual(["1", "P1", "4", "5"]);
  });

  it("names the road end P1 whichever way the lot's corners run", () => {
    const cw = ring([[0, 0], [0, 20], [40, 20], [40, 0]]);
    // Leg 3 runs from (40, 0) to (0, 0): the road, on a clockwise ring.
    const r = ok(partitionLot({ ring: cw, leg: 3, lines: "square", from: "start", shares: [400, null], uda: false }));
    const p1 = r.corners.find((c) => c.name === "P1")!;
    expect(p1.n).toBeCloseTo(N0, 6);
  });
});
