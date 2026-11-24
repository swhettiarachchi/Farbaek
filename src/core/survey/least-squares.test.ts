/**
 * Least squares for a traverse (stage 267, ADR 0274), on SYNTHETIC runs whose answers can be worked by hand, checked against an
 * independent route: the adjusted stations' observations recomputed and their weighted sum of squares compared with what's reported.
 */
import { describe, expect, it } from "vitest";
import { adjustRun, DEFAULT_PRECISION, LEAST_SQUARES_MAX_LEGS, type RunLeg } from "./adjust";

const legs = (...xs: [string, number, number][]): RunLeg[] => xs.map(([to, dE, dN]) => ({ to, dE, dN }));

describe("least squares on a traverse", () => {
  it("splits a straight run's misclosure between equal legs, and says the fit is worse than a 2 mm instrument explains", () => {
    // Two 100 m legs due east, ending 20 mm past the known point: B moves back by half.
    const r = adjustRun(legs(["B", 100, 0], ["C", 100, 0]), { dE: 0.02, dN: 0 }, "least_squares");
    if (!r.ok) throw new Error(r.problem);
    expect(r.corrections[0]!.station).toBe("B");
    expect(r.corrections[0]!.dE).toBeCloseTo(-0.01, 9);
    expect(r.corrections[0]!.dN).toBeCloseTo(0, 9);
    // Each distance off by 10 mm against σ = 2 mm + 0.2 mm: σ0² = 2 (10/2.2)² / 2.
    expect(r.stats!.sigma0).toBeCloseTo(Math.sqrt((0.01 / 0.0022) ** 2), 6);
    expect(r.stats!.passes).toBe(false);
    expect(r.stats!.redundancy).toBe(2);
    expect(r.stats!.worstDistanceMm).toBeCloseTo(10, 6);
    expect(r.stats!.precision).toBe(DEFAULT_PRECISION);
  });

  it("passes the χ² test when the misclosure is what the precision leads one to expect", () => {
    const r = adjustRun(legs(["B", 100, 0], ["C", 100, 0]), { dE: 0.003, dN: 0 }, "least_squares");
    if (!r.ok) throw new Error(r.problem);
    expect(r.stats!.passes).toBe(true);
    expect(r.stats!.sigma0).toBeLessThan(2);
  });

  it("puts a misclosure across the run on the angles, and turns with the traverse", () => {
    // An L: east 100 m, then north 100 m, ending 15 mm east of the known point.
    const L = legs(["B", 100, 0], ["C", 0, 100]);
    const r = adjustRun(L, { dE: 0.015, dN: 0 }, "least_squares");
    if (!r.ok) throw new Error(r.problem);
    // The 15 mm is shared between leg 1's length, the turn at B and leg 1's direction from A (which moves B north too): every
    // correction stays within the misclosure's size.
    expect(Math.hypot(r.corrections[0]!.dE, r.corrections[0]!.dN)).toBeLessThan(0.015);
    // The same traverse turned 30°: the same correction, turned.
    const t = (30 * Math.PI) / 180;
    const rot = (e: number, n: number): [number, number] => [e * Math.cos(t) - n * Math.sin(t), e * Math.sin(t) + n * Math.cos(t)];
    const turned = L.map((l) => {
      const [e, n] = rot(l.dE, l.dN);
      return { to: l.to, dE: e, dN: n };
    });
    const [me, mn] = rot(0.015, 0);
    const r2 = adjustRun(turned, { dE: me, dN: mn }, "least_squares");
    if (!r2.ok) throw new Error(r2.problem);
    const [ce, cn] = rot(r.corrections[0]!.dE, r.corrections[0]!.dN);
    expect(r2.corrections[0]!.dE).toBeCloseTo(ce, 9);
    expect(r2.corrections[0]!.dN).toBeCloseTo(cn, 9);
    expect(r2.stats!.sigma0).toBeCloseTo(r.stats!.sigma0, 9);
  });

  it("reports the weighted sum of squares the adjusted stations actually give (an independent check)", () => {
    const run = legs(["B", 120.4, 35.2], ["C", -15.7, 98.3], ["D", -110.2, -5.6], ["E", 4.9, -127.4]);
    const mis = { dE: 0.012, dN: -0.009 };
    const r = adjustRun(run, mis, "least_squares");
    if (!r.ok) throw new Error(r.problem);
    // Rebuild the adjusted points and recompute every residual by hand.
    const shot = [{ e: 0, n: 0 }];
    for (const l of run) shot.push({ e: shot.at(-1)!.e + l.dE, n: shot.at(-1)!.n + l.dN });
    const adj = shot.map((p, i) => (i === 0 ? p : i === run.length ? { e: p.e - mis.dE, n: p.n - mis.dN } : { e: p.e + r.corrections[i - 1]!.dE, n: p.n + r.corrections[i - 1]!.dN }));
    const rho = Math.PI / 648000;
    const az = (a: { e: number; n: number }, b: { e: number; n: number }) => Math.atan2(b.e - a.e, b.n - a.n);
    const wrap = (x: number) => Math.atan2(Math.sin(x), Math.cos(x));
    let vpv = 0;
    run.forEach((l, i) => {
      const d0 = Math.hypot(l.dE, l.dN);
      const d1 = Math.hypot(adj[i + 1]!.e - adj[i]!.e, adj[i + 1]!.n - adj[i]!.n);
      vpv += ((d1 - d0) / (0.002 + 2e-6 * d0)) ** 2;
    });
    vpv += (wrap(az(adj[0]!, adj[1]!) - Math.atan2(run[0]!.dE, run[0]!.dN)) / (5 * Math.SQRT2 * rho)) ** 2;
    for (let k = 1; k < run.length; k++) {
      const obs = wrap(Math.atan2(run[k]!.dE, run[k]!.dN) - Math.atan2(run[k - 1]!.dE, run[k - 1]!.dN));
      const adjAngle = wrap(az(adj[k]!, adj[k + 1]!) - az(adj[k - 1]!, adj[k]!));
      vpv += (wrap(adjAngle - obs) / (5 * Math.SQRT2 * rho)) ** 2;
    }
    expect(r.stats!.sigma0).toBeCloseTo(Math.sqrt(vpv / 2), 6);
    // And it does better than the compass rule by that measure, as least squares must.
    const c = adjustRun(run, mis, "compass");
    if (!c.ok) throw new Error(c.problem);
    const sum = (corr: { dE: number; dN: number }[]) => {
      const pts = shot.map((p, i) => (i === 0 ? p : i === run.length ? { e: p.e - mis.dE, n: p.n - mis.dN } : { e: p.e + corr[i - 1]!.dE, n: p.n + corr[i - 1]!.dN }));
      let t = 0;
      run.forEach((l, i) => {
        const d0 = Math.hypot(l.dE, l.dN);
        t += ((Math.hypot(pts[i + 1]!.e - pts[i]!.e, pts[i + 1]!.n - pts[i]!.n) - d0) / (0.002 + 2e-6 * d0)) ** 2;
      });
      t += (wrap(az(pts[0]!, pts[1]!) - Math.atan2(run[0]!.dE, run[0]!.dN)) / (5 * Math.SQRT2 * rho)) ** 2;
      for (let k = 1; k < run.length; k++) t += (wrap(wrap(az(pts[k]!, pts[k + 1]!) - az(pts[k - 1]!, pts[k]!)) - wrap(Math.atan2(run[k]!.dE, run[k]!.dN) - Math.atan2(run[k - 1]!.dE, run[k - 1]!.dN))) / (5 * Math.SQRT2 * rho)) ** 2;
      return t;
    };
    expect(sum(r.corrections)).toBeLessThanOrEqual(sum(c.corrections) + 1e-9);
    expect(r.stats!.stations.every((s) => s.sE > 0 && s.sN > 0)).toBe(true);
  });

  it("says an exact closure fits better than the precision explains, and never makes a station surer than the instrument can", () => {
    const run = legs(["B", 120.4, 35.2], ["C", -15.7, 98.3], ["D", -110.2, -5.6], ["E", 4.9, -127.4]);
    const exact = adjustRun(run, { dE: 0, dN: 0 }, "least_squares");
    if (!exact.ok) throw new Error(exact.problem);
    expect(exact.stats!.sigma0).toBeCloseTo(0, 9);
    expect(exact.stats!.passes).toBe(false);
    expect(exact.stats!.side).toBe("low");
    // The stations' standard deviations come from the stated precision, not from a σ0 of nothing.
    expect(exact.stats!.stations.every((s) => s.sE > 1e-4 && s.sN > 1e-4)).toBe(true);
    // A misclosure far beyond the precision fails high, and scales the stations up by σ0.
    const bad = adjustRun(run, { dE: 0.4, dN: -0.3 }, "least_squares");
    if (!bad.ok) throw new Error(bad.problem);
    expect(bad.stats!.side).toBe("high");
    // (The geometry moves a little with half a metre of misclosure, so the two agree to within a percent, not exactly.)
    expect(bad.stats!.stations[0]!.sE / (exact.stats!.stations[0]!.sE * bad.stats!.sigma0)).toBeCloseTo(1, 2);
  });

  it("adjusts up to its limit of legs, and refuses a longer traverse rather than hold the plan up", () => {
    const zig = (n: number) => legs(...Array.from({ length: n }, (_, i): [string, number, number] => [`S${i + 1}`, 30, i % 2 === 0 ? 10 : -10]));
    expect(adjustRun(zig(LEAST_SQUARES_MAX_LEGS), { dE: 0.01, dN: 0.01 }, "least_squares").ok).toBe(true);
    const long = adjustRun(zig(LEAST_SQUARES_MAX_LEGS + 1), { dE: 0.01, dN: 0.01 }, "least_squares");
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.problem).toContain("compass or transit rule");
    // The other rules take it.
    expect(adjustRun(zig(LEAST_SQUARES_MAX_LEGS + 1), { dE: 0.01, dN: 0.01 }, "compass").ok).toBe(true);
  });

  it("refuses a precision of nothing, and a leg of no length", () => {
    expect(adjustRun(legs(["B", 100, 0], ["C", 100, 0]), { dE: 0.01, dN: 0 }, "least_squares", { angleSeconds: 0, distanceMm: 2, distancePpm: 2 }).ok).toBe(false);
    expect(adjustRun(legs(["B", 0, 0], ["C", 100, 0]), { dE: 0.01, dN: 0 }, "least_squares").ok).toBe(false);
  });
});
