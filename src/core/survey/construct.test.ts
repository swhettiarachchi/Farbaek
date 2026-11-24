/**
 * Constructed square corners (stage 262, ADR 0270), on SYNTHETIC points: a wall up the y axis, a box standing against it whose corner
 * 0.15 m off the wall was surveyed, another corner surveyed out in the open, and the corner between them drawn square but never surveyed.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { cornerId, cornerName, insertCorner, squareCorner, squareReference, withConstructed, type ConstructedPoint } from "./construct";
import type { SurveyPoint } from "./parcel";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const W0 = at("1", 0, 0);
const W1 = at("2", 0, 15);
const A = at("17", 0.15, 8);
const B = at("14", 3, 10.5);
const Q = at("15", 3.3, 10.4);

describe("a square corner", () => {
  it("lies square off the reference line from one point, and level with the other along it", () => {
    const c = squareCorner(A, B, W0, W1)!;
    expect(c.e).toBeCloseTo(3, 9);
    expect(c.n).toBeCloseTo(8, 9);
    // Both legs at right angles to each other.
    expect((c.e - A.e) * (B.e - c.e) + (c.n - A.n) * (B.n - c.n)).toBeCloseTo(0, 9);
  });

  it("is turned with a reference line at any bearing", () => {
    const t = (p: SurveyPoint, deg: number) => {
      const r = (deg * Math.PI) / 180;
      return { ...p, e: p.e * Math.cos(r) - p.n * Math.sin(r) + 500_000, n: p.e * Math.sin(r) + p.n * Math.cos(r) + 600_000 };
    };
    for (const deg of [0, 37, 90, 145, 180, 233, 300]) {
      const c = squareCorner(t(A, deg), t(B, deg), t(W0, deg), t(W1, deg))!;
      const want = t(at("c", 3, 8), deg);
      expect(c.e).toBeCloseTo(want.e, 6);
      expect(c.n).toBeCloseTo(want.n, 6);
    }
  });

  it("isn't made when a leg would be shorter than 2 cm, or the line has no length", () => {
    expect(squareCorner(A, at("x", 0.16, 12), W0, W1)).toBeNull();
    expect(squareCorner(A, at("x", 3, 8.01), W0, W1)).toBeNull();
    expect(squareCorner(A, B, W0, W0)).toBeNull();
  });
});

describe("the line a corner is squared to", () => {
  it("is the longest surveyed line at either point, or passing within a wall's thickness of it, and the corner leaves it square", () => {
    // The box's outline 15-14 is short; the wall 1-2 runs 0.15 m from 17.
    const r = squareReference(A, B, [
      [Q, B],
      [W0, W1],
    ])!;
    expect(r).toEqual({ from: A.id, to: B.id, ref: [W0.id, W1.id] });
    // The same corner, asked the other way round.
    expect(squareReference(B, A, [[Q, B], [W0, W1]])).toEqual(r);
  });

  it("never uses the leg between the two points, nor a line farther than a wall's thickness", () => {
    expect(squareReference(A, B, [[A, B]])).toBeNull();
    expect(squareReference(A, B, [[at("9", 1, 0), at("10", 1, 15)]])).toBeNull();
    // Only the box's own short leg is left: it's used.
    expect(squareReference(A, B, [[Q, B]])).toEqual({ from: B.id, to: A.id, ref: [Q.id, B.id] });
  });
});

describe("constructed corners in a plan", () => {
  const c: ConstructedPoint = { id: cornerId(A.id, B.id), kind: "square", from: A.id, to: B.id, ref: [W0.id, W1.id] };

  it("are worked out from the surveyed points and named by them", () => {
    const pts = withConstructed([W0, W1, A, B], { constructed: [c] });
    expect(pts).toHaveLength(5);
    expect(pts[4]).toMatchObject({ id: c.id, pointId: cornerName(A, B), z: null, code: null });
    expect(pts[4]!.e).toBeCloseTo(3, 9);
    expect(cornerName(A, B)).toBe("corner 17-14");
  });

  it("move with the surveyed points, and are left out when one is missing", () => {
    const moved = withConstructed([W0, W1, { ...A, n: 9 }, B], { constructed: [c] });
    expect(moved[4]!.n).toBeCloseTo(9, 9);
    expect(withConstructed([W0, W1, B], { constructed: [c] })).toHaveLength(3);
  });

  it("never replace a surveyed point with the same id", () => {
    const clash = { ...c, id: B.id };
    const pts = withConstructed([W0, W1, A, B], { constructed: [clash] });
    expect(pts).toHaveLength(4);
    expect(pts.find((p) => p.id === B.id)).toBe(B);
  });

  it("have the same valid UUID each time the same corner is read, either way round", () => {
    expect(cornerId(A.id, B.id)).toBe(cornerId(B.id, A.id));
    expect(cornerId(A.id, B.id)).not.toBe(cornerId(A.id, Q.id));
    expect(z.string().uuid().safeParse(cornerId(A.id, B.id)).success).toBe(true);
  });

  it("go between the two points wherever a line runs from one to the other, a closed line's last leg too", () => {
    expect(insertCorner(["9", "14", "17", "33"], false, "17", "14", "C")).toEqual(["9", "14", "C", "17", "33"]);
    expect(insertCorner(["14", "9", "33", "17"], true, "17", "14", "C")).toEqual(["14", "9", "33", "17", "C"]);
    expect(insertCorner(["14", "9", "17"], false, "17", "14", "C")).toEqual(["14", "9", "17"]);
  });
});
