/** Comparing a generated plan with a reference plan, on the SYNTHETIC job (fixture.ts). */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument } from "../document";
import { applySketch } from "./apply";
import { evaluatePlan, sameRing, type PlanReference } from "./evaluate";
import { interpretSketch } from "./interpret";
import { SYNTH_DRAWING, SYNTH_POINTS } from "./fixture";

const reference: PlanReference = {
  lot: ["5", "40", "30", "31", "32", "60", "6"],
  lines: [
    { what: "wall", points: ["5", "40"] },
    { what: "wall", points: ["40", "30", "31"] },
    { what: "wall", points: ["32", "60"] },
    { what: "road edge", points: ["90", "93"] },
    { what: "wall", points: ["70", "80"] },
  ],
  symbols: [{ what: "well", at: "70" }, { what: "tree", at: "82" }],
  statedM2: 150,
};

describe("comparing with the surveyor's own plan", () => {
  const interpretation = interpretSketch(SYNTH_DRAWING, SYNTH_POINTS, commonCodes());
  const doc = applySketch({ ...emptyDocument(), codes: commonCodes() }, interpretation).document;
  /** The id the plan gives what the sketch's element (l1, l6…) drew. */
  const idOf = (from: string) => interpretation.proposals.find((p) => p.from[0] === from && p.kind === "line")!.id;
  const e = evaluatePlan(doc, SYNTH_POINTS, reference);

  it("compares the lot's corners and areas, keeping the stated extent apart", () => {
    expect(e.lot.same).toBe(false);
    expect(e.lot.missing).toEqual(["6"]);
    expect(e.lot.extra).toEqual([]);
    expect(e.lot.generatedM2).toBeCloseTo(155.7, 6);
    // The reference also turns at 6, which lies 0.03 m in from the south wall: its outline is a little smaller.
    expect(e.lot.referenceM2).toBeCloseTo(155.5875, 6);
    expect(e.lot.statedM2).toBe(150);
    expect(e.score.lot).toBe("different: missing 6, extra none");
  });

  it("finds each reference line in what was drawn, points in between allowed, and lists the extra lines", () => {
    expect(e.lines.map((l) => l.found)).toEqual(["yes", "yes", "yes", "yes", "no"]);
    expect(e.lines[0]!.by).toEqual([idOf("l1")]);
    expect(e.lot.missingOff).toEqual([{ point: "6", offM: expect.closeTo(0.03, 6) }]);
    // The inner line and the neighbours' walls aren't on this reference; the strip's top (31 to 32) is one of its lot's sides.
    expect(e.extra.map((x) => x.id)).toEqual([idOf("l6"), idOf("l8"), idOf("l9")]);
    expect(e.score.lines).toBe("4 of 5 reference lines drawn in full, 0 in part, 3 extra");
  });

  it("joins a reference line from several drawn lines, says which of its points they pass without a stop, and what's left undrawn", () => {
    const one = (points: string[][]) =>
      evaluatePlan({ ...emptyDocument(), features: points.map((p, i) => ({ id: `f${i}`, layer: "WALLS", code: "MW", points: p.map((n) => SYNTH_POINTS.find((x) => x.pointId === n)!.id), closed: false })) }, SYNTH_POINTS, {
        ...reference,
        lines: [{ what: "inner", points: ["80", "81", "82", "70"] }],
      }).lines[0]!;
    expect(one([["80", "82"], ["82", "70"]])).toMatchObject({ found: "yes", by: ["f0", "f1"], passed: ["81"], notDrawn: [] });
    expect(one([["80", "81"]])).toMatchObject({ found: "partly", by: ["f0"], notDrawn: [["81", "82"], ["82", "70"]] });
    expect(one([])).toMatchObject({ found: "no", by: [] });
  });

  it("finds the symbols, and says which are missing", () => {
    expect(e.symbols).toEqual([
      { what: "well", at: "70", found: true },
      { what: "tree", at: "82", found: false },
    ]);
    expect(e.score.symbols).toBe("1 of 2 symbols found");
  });

  it("reads a ring from any start, either way round", () => {
    expect(sameRing(["1", "2", "3"], ["2", "3", "1"])).toBe(true);
    expect(sameRing(["1", "2", "3"], ["3", "2", "1"])).toBe(true);
    expect(sameRing(["1", "2", "3"], ["1", "3", "4"])).toBe(false);
  });
});
