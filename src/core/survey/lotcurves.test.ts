/**
 * Curved lot boundaries (stage 269, ADR 0276), on SYNTHETIC lots whose areas are worked by hand: a half disc, a lot whose curve bows
 * inward, either way round, a curve through the ring's first corner, two lots sharing a curve, and runs that aren't curves.
 */
import { describe, expect, it } from "vitest";
import { area, type Point } from "./geometry";
import { computeLots } from "./lots";
import { densifyRing, lotCurves, remapRuns, ringBulges, runOf } from "./lotcurves";
import { computeParcel, type SurveyPoint } from "./parcel";

const pt = (n: number, e: number, nn: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, pointId: String(n), e: 1000 + e, n: 2000 + nn, z: null, code: "CP" });
const s = Math.SQRT1_2 * 10;
// A half disc of radius 10: west end, three points on the arc over the top, east end, and back along the diameter.
const HALF = [pt(1, -10, 0), pt(2, -s, s), pt(3, 0, 10), pt(4, s, s), pt(5, 10, 0)];
const ids = (ps: SurveyPoint[]) => ps.map((p) => p.id);

describe("a lot with a curve", () => {
  it("takes the area inside the arc, not inside its straight legs, and its length along the arc", () => {
    const r = computeParcel(HALF, ids(HALF), [{ from: 0, to: 4 }]);
    if (!r.ok) throw new Error("missing");
    const p = r.parcel;
    expect(p.areaM2).toBeCloseTo((Math.PI * 100) / 2, 9);
    expect(p.perimeterM).toBeCloseTo(Math.PI * 10 + 20, 9);
    expect(p.curves).toHaveLength(1);
    const c = p.curves[0]!;
    expect(c.radius).toBeCloseTo(10, 9);
    expect(c.arcLength).toBeCloseTo(Math.PI * 10, 9);
    expect(c.chordBearing).toBeCloseTo(90, 9);
    expect(c.chordDistance).toBeCloseTo(20, 9);
    expect(p.method).toContain("circular segments");
    // Independently: the arc drawn as fine chords (256 to each leg at most), by the shoelace.
    expect(area(densifyRing(p.vertices, p.curves, 1e-6))).toBeCloseTo(p.areaM2, 3);
    // Without the curve, the same corners give the straight legs' area, and the method says so.
    const straight = computeParcel(HALF, ids(HALF));
    if (!straight.ok) throw new Error("missing");
    expect(straight.parcel.areaM2).toBeCloseTo(area(HALF), 9);
    expect(straight.parcel.areaM2).toBeLessThan(p.areaM2);
    expect(straight.parcel.method).not.toContain("curves");
  });

  it("takes away the segment where the curve bows into the lot, whichever way round the corners run", () => {
    // A 20 by 10 m lot whose north side is an arc dipping 2 m into it: the circle through (20,10), (10,8), (0,10) has its centre at
    // (10,34) and a radius of 26.
    const ring = [pt(1, 0, 0), pt(2, 20, 0), pt(3, 20, 10), pt(4, 10, 8), pt(5, 0, 10)];
    const half = Math.asin(10 / 26);
    const segment = (26 * 26 * (2 * half - Math.sin(2 * half))) / 2;
    const ccw = computeParcel(ring, ids(ring), [{ from: 2, to: 4 }]);
    const cw = computeParcel(ring, [...ids(ring)].reverse(), [{ from: 0, to: 2 }]);
    if (!ccw.ok || !cw.ok) throw new Error("missing");
    expect(ccw.parcel.areaM2).toBeCloseTo(200 - segment, 9);
    expect(cw.parcel.areaM2).toBeCloseTo(200 - segment, 9);
    expect(ccw.parcel.curves[0]!.extraM2).toBeLessThan(0);
    expect(ccw.parcel.curves[0]!.radius).toBeCloseTo(26, 9);
  });

  it("follows a curve through the ring's first corner", () => {
    // The half disc started from its top point: the curve runs from index 2 round to index 5, the first corner again.
    const turned = [HALF[2]!, HALF[3]!, HALF[4]!, HALF[0]!, HALF[1]!];
    const r = computeParcel(turned, ids(turned), [{ from: 3, to: 7 }]);
    // Index 7 is past the ring's end (length 5): refused, not wrapped twice.
    if (!r.ok) throw new Error("missing");
    expect(r.parcel.curveProblems).toHaveLength(1);
    const ok = computeParcel(turned, ids(turned), [{ from: 3, to: 5 }]);
    if (!ok.ok) throw new Error("missing");
    expect(ok.parcel.curveProblems).toEqual([]);
    // From the west end (index 3) through the second arc point (4) to the top (5, which is index 0): a quarter of the disc's curve.
    const q = Math.PI / 4;
    // Two legs each turning π/4 on a radius of 10: each adds r²/2 (θ − sin θ).
    expect(ok.parcel.areaM2).toBeCloseTo(area(turned) + 2 * 50 * (q - Math.sin(q)), 9);
  });

  it("says why a run isn't a curve, and leaves it straight", () => {
    const off = [...HALF];
    off[2] = pt(3, 0, 10.5);
    const r = computeParcel(off, ids(off), [{ from: 0, to: 4 }]);
    if (!r.ok) throw new Error("missing");
    expect(r.parcel.curves).toEqual([]);
    expect(r.parcel.curveProblems[0]!.problem).toContain("don't lie on one circle");
    expect(r.parcel.areaM2).toBeCloseTo(area(off), 9);
    const bad = lotCurves(HALF, [{ from: 0, to: 1 }, { from: 0, to: 3 }, { from: 2, to: 4 }]);
    expect(bad.curves).toHaveLength(1);
    expect(bad.problems.map((p) => p.problem)).toEqual(["a curve runs from one corner through at least one more to a later one, within the lot's corners", "it shares a leg with another curve"]);
  });

  it("gives the DXF a bulge on each curved leg, and none on the straight ones", () => {
    const r = computeParcel(HALF, ids(HALF), [{ from: 0, to: 4 }]);
    if (!r.ok) throw new Error("missing");
    const b = ringBulges(r.parcel.vertices, r.parcel.curves);
    expect(b).toHaveLength(5);
    // Each of the four arc legs turns a quarter of the half circle (π/4), clockwise over the top: tan(−π/16).
    for (const x of b.slice(0, 4)) expect(x).toBeCloseTo(Math.tan(-Math.PI / 16), 9);
    expect(b[4]).toBe(0);
  });
});

describe("lots that share a curve, and the land's outline", () => {
  // A 20 by 20 m square cut in two by an arc from (0,10) through (10,12) to (20,10): the south lot gains what the north loses.
  const sq = [pt(1, 0, 0), pt(2, 20, 0), pt(3, 20, 10), pt(4, 10, 12), pt(5, 0, 10), pt(6, 0, 20), pt(7, 20, 20)];
  const south = { id: "s", label: "1", sup: "", note: "", points: [sq[0]!.id, sq[1]!.id, sq[2]!.id, sq[3]!.id, sq[4]!.id], arcs: [{ from: 2, to: 4 }] };
  const north = { id: "n", label: "2", sup: "", note: "", points: [sq[4]!.id, sq[3]!.id, sq[2]!.id, sq[6]!.id, sq[5]!.id], arcs: [{ from: 0, to: 2 }] };

  it("adds the shared curve's segment to one lot and takes it from the other, so the land's area is unchanged", () => {
    const plan = computeLots(sq, [south, north]);
    const [a, b] = plan.lots.map((l) => l.parcel!.areaM2);
    expect(a! + b!).toBeCloseTo(400, 9);
    expect(a!).toBeGreaterThan(area([sq[0]!, sq[1]!, sq[2]!, sq[3]!, sq[4]!]));
    expect(plan.outlineAreaM2).toBeCloseTo(400, 9);
    expect(plan.sumAreaM2).toBeCloseTo(400, 9);
  });

  it("counts a curve on the land's outer edge in the land's area too", () => {
    const plan = computeLots(HALF, [{ id: "h", label: "1", sup: "", note: "", points: ids(HALF), arcs: [{ from: 0, to: 4 }] }]);
    expect(plan.outlineAreaM2).toBeCloseTo((Math.PI * 100) / 2, 9);
    expect(plan.sumAreaM2).toBeCloseTo((Math.PI * 100) / 2, 9);
  });

  it("leaves the area of a lot without curves exactly as before", () => {
    const ring: Point[] = [sq[0]!, sq[1]!, sq[6]!, sq[5]!];
    const plan = computeLots(sq, [{ id: "q", label: "1", sup: "", note: "", points: [sq[0]!.id, sq[1]!.id, sq[6]!.id, sq[5]!.id] }]);
    expect(plan.lots[0]!.parcel!.areaM2).toBe(area(ring));
    expect(plan.lots[0]!.parcel!.curves).toEqual([]);
  });
});

describe("curves given by their points", () => {
  const ring = ["a", "b", "c", "d", "e"];
  it("finds a curve's run from its points either way round, through the first corner too", () => {
    expect(runOf(ring, ["b", "c", "d"])).toEqual({ from: 1, to: 3 });
    expect(runOf(ring, ["d", "c", "b"])).toEqual({ from: 1, to: 3 });
    expect(runOf(ring, ["d", "e", "a"])).toEqual({ from: 3, to: 5 });
    expect(runOf(ring, ["b", "d", "e"])).toBeNull();
    expect(runOf(ring, ["b", "c"])).toBeNull();
  });

  it("keeps a lot's curves through a change of its corners where their points are still in a row, and counts the rest", () => {
    expect(remapRuns(ring, ["z", "a", "b", "c", "d", "e"], [{ from: 1, to: 3 }])).toEqual({ runs: [{ from: 2, to: 4 }], dropped: 0 });
    expect(remapRuns(ring, ["a", "b", "x", "c", "d", "e"], [{ from: 1, to: 3 }, { from: 3, to: 5 }])).toEqual({ runs: [{ from: 4, to: 6 }], dropped: 1 });
  });
});
