/** Curves through surveyed points (stage 239): known circles at grid-sized coordinates. All points are SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { ARC_FIT_M, bulgeOf, bulges, chordsAlong, circleThrough, densify, fitArc } from "./arcs";

const C = { e: 500_000, n: 600_000 };
const R = 25;
const on = (deg: number, r = R) => ({ e: C.e + r * Math.cos((deg * Math.PI) / 180), n: C.n + r * Math.sin((deg * Math.PI) / 180) });
const rad = (deg: number) => (deg * Math.PI) / 180;

describe("the circle through three points", () => {
  it("finds a known centre and radius at grid-sized coordinates", () => {
    const c = circleThrough(on(0), on(45), on(90))!;
    expect(c.e).toBeCloseTo(C.e, 6);
    expect(c.n).toBeCloseTo(C.n, 6);
    expect(c.r).toBeCloseTo(R, 6);
  });

  it("is none for points in a straight line, a repeated point, or a radius past 100 km", () => {
    expect(circleThrough({ e: 0, n: 0 }, { e: 10, n: 10 }, { e: 20, n: 20 })).toBeNull();
    expect(circleThrough(on(0), on(0), on(90))).toBeNull();
    expect(circleThrough({ e: 0, n: 0 }, { e: 50, n: 0.000001 }, { e: 100, n: 0 })).toBeNull();
  });
});

describe("whether surveyed points make one curve", () => {
  it("fits points along a circle, turning anticlockwise, each segment's angle known", () => {
    const fit = fitArc([0, 20, 40, 60, 80].map((d) => on(d)));
    expect(fit.ok).toBe(true);
    if (!fit.ok) return;
    expect(fit.circle.r).toBeCloseTo(R, 6);
    for (const s of fit.sweeps) expect(s).toBeCloseTo(rad(20), 9);
  });

  it("turns clockwise when the points go that way: a half circle west to east over the north", () => {
    const fit = fitArc([on(180), on(90), on(0)]);
    expect(fit.ok && fit.sweeps).toEqual([expect.closeTo(-rad(90), 9), expect.closeTo(-rad(90), 9)]);
    expect(bulgeOf(-rad(90))).toBeCloseTo(-Math.tan(Math.PI / 8), 12);
  });

  it("refuses points off the circle, too few, in a line, out of order, or round more than once", () => {
    expect(fitArc([on(0), on(20, R + 0.03), on(40), on(60), on(80)])).toEqual({ ok: false, problem: "its points don't lie on one circle (one is 0.030 m off the circle through the first, middle and last)" });
    expect(fitArc([on(0), on(20, R + ARC_FIT_M / 2), on(40), on(60), on(80)]).ok).toBe(true);
    expect(fitArc([on(0), on(90)])).toMatchObject({ ok: false });
    expect(fitArc([{ e: 0, n: 0 }, { e: 5, n: 5 }, { e: 10, n: 10 }])).toEqual({ ok: false, problem: "its points lie in a straight line" });
    expect(fitArc([on(0), on(60), on(30), on(90)])).toMatchObject({ ok: false, problem: expect.stringContaining("quarter circle") });
    // After the stage 239 review: three points always lie on some circle. Shot out of order (the PT back between the others), they
    // would make a 250 m circle turning almost all the way round; refused.
    expect(fitArc([{ e: 500_000, n: 600_000 }, { e: 500_010, n: 600_000 }, { e: 500_005, n: 600_000.05 }])).toMatchObject({ ok: false, problem: expect.stringContaining("quarter circle") });
    // A semicircle on three points (a quarter circle each way) is a curve; a run that ends where it began is said as such.
    expect(fitArc([on(180), on(90), on(0)]).ok).toBe(true);
    expect(fitArc([on(0), on(90), on(180), on(270), on(0)])).toEqual({ ok: false, problem: "it ends where it began: code a full circle as two curves" });
  });
});

describe("drawing a curve", () => {
  it("puts chords no further than the sagitta from the curve, starting at the point itself", () => {
    const circle = { ...C, r: R };
    const pts = chordsAlong(on(0), circle, rad(90), 0.001);
    expect(pts[0]).toEqual(on(0));
    for (const p of pts) expect(Math.hypot(p.e - C.e, p.n - C.n)).toBeCloseTo(R, 9);
    for (let i = 0; i + 1 < pts.length; i++) {
      const mid = { e: (pts[i]!.e + pts[i + 1]!.e) / 2, n: (pts[i]!.n + pts[i + 1]!.n) / 2 };
      expect(R - Math.hypot(mid.e - C.e, mid.n - C.n)).toBeLessThanOrEqual(0.001 + 1e-9);
    }
  });

  it("leaves a line without curves as it is, and keeps every surveyed point on a curved one", () => {
    const line = [{ e: 0, n: 0 }, { e: 10, n: 0 }, { e: 20, n: 5 }];
    expect(densify(line, undefined, 0.01)).toEqual(line);
    // A straight lead-in, then a curve through three surveyed points, then a straight lead-out.
    const pts = [{ e: C.e + R, n: C.n - 10 }, on(0), on(45), on(90), { e: C.e - 10, n: C.n + R }];
    const drawn = densify(pts, [{ from: 1, to: 3 }], 0.005);
    expect(drawn.length).toBeGreaterThan(pts.length);
    for (const p of pts) expect(drawn.some((q) => Math.hypot(q.e - p.e, q.n - p.n) < 1e-9)).toBe(true);
    expect(drawn.at(-1)).toEqual(pts.at(-1));
  });

  it("gives each vertex its DXF bulge, zero where the next segment is straight, and none for a run that doesn't fit", () => {
    const pts = [{ e: C.e + R, n: C.n - 10 }, on(0), on(45), on(90), { e: C.e - 10, n: C.n + R }];
    const b = bulges(pts, [{ from: 1, to: 3 }]);
    expect(b[0]).toBe(0);
    expect(b[1]).toBeCloseTo(Math.tan(rad(45) / 4), 9);
    expect(b[2]).toBeCloseTo(Math.tan(rad(45) / 4), 9);
    expect(b[3]).toBe(0);
    expect(b[4]).toBe(0);
    // Three points always lie on some circle; four with one 5 cm off the others' circle don't make a curve.
    expect(bulges([on(0), on(10, R + 0.05), on(20), on(30)], [{ from: 0, to: 3 }])).toEqual([0, 0, 0, 0]);
  });
});
