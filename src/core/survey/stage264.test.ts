/**
 * Points that weren't surveyed, worked out where two lines meet or by tape off a line (stage 264, ADR 0272), on SYNTHETIC points: a
 * 10 m by 20 m lot, a house side 4-3 that stops 0.14 m short of the lot's south side 1-2, and a wall line 5-6.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "./codes";
import { compareDocuments } from "./compare";
import { constructAt, meetPoint, offsetPoint, pointFromSpec, recipeInputs, refreshCorners, withConstructed, type MeetPoint, type OffsetPoint } from "./construct";
import { emptyDocument, surveyDocumentSchema, usedPointIds, type SurveyDocument } from "./document";
import type { SurveyPoint } from "./parcel";
import { approvalHash, buildPlan } from "./view";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const E0 = 500_000;
const N0 = 600_000;
const POINTS = [at("1", E0, N0), at("2", E0 + 10, N0), at("3", E0 + 6, N0 + 0.14), at("4", E0 + 6, N0 + 8), at("5", E0, N0 + 12), at("6", E0 + 10, N0 + 12)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
const pt = (n: string) => POINTS.find((p) => p.pointId === n)!;
const MEET = "00000000-0000-4000-8000-0000000000a1";
const OFF = "00000000-0000-4000-8000-0000000000a2";
const meet: MeetPoint = { id: MEET, kind: "meet", name: "3a", a: [id("4"), id("3")], b: [id("1"), id("2")] };
const offset: OffsetPoint = { id: OFF, kind: "offset", name: "4b", from: id("4"), toward: id("3"), along: 1.43, out: 0.2 };

describe("where two lines meet", () => {
  it("is where each line, carried on, crosses the other", () => {
    const p = meetPoint(pt("4"), pt("3"), pt("1"), pt("2"))!;
    expect(p.e).toBeCloseTo(E0 + 6, 9);
    expect(p.n).toBeCloseTo(N0, 9);
  });

  it("isn't made for lines too nearly parallel, or meeting too far off", () => {
    expect(meetPoint(pt("1"), pt("2"), pt("5"), pt("6"))).toBeNull();
    expect(meetPoint(pt("1"), pt("2"), at("x", E0 + 100, N0 + 1), at("y", E0 + 200, N0 + 6))).toBeNull();
  });
});

describe("a tape offset", () => {
  it("runs along the line, then square off it to the left looking along it, or to the right for a negative distance", () => {
    // From 4 towards 3 is south; its left is east.
    const left = offsetPoint(pt("4"), pt("3"), 1.43, 0.2)!;
    expect(left.e).toBeCloseTo(E0 + 6.2, 9);
    expect(left.n).toBeCloseTo(N0 + 8 - 1.43, 9);
    const right = offsetPoint(pt("4"), pt("3"), 1.43, -0.2)!;
    expect(right.e).toBeCloseTo(E0 + 5.8, 9);
    expect(offsetPoint(pt("4"), pt("4"), 1, 0)).toBeNull();
  });
});

describe("points worked out by hand on a plan", () => {
  const doc = (more: Partial<SurveyDocument> = {}) =>
    surveyDocumentSchema.parse({
      ...emptyDocument(),
      codes: commonCodes(),
      lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "6", "5"].map(id), note: "" }],
      features: [{ id: "house", layer: "BUILDINGS", code: "P", closed: false, points: [id("4"), MEET, OFF] }],
      constructed: [meet, offset],
      ...more,
    });

  it("are worked out from their surveyed points, named as the surveyor named them, and counted for the approval", async () => {
    const all = withConstructed(POINTS, doc());
    expect(all.find((p) => p.id === MEET)).toMatchObject({ pointId: "3a" });
    expect(all.find((p) => p.id === OFF)).toMatchObject({ pointId: "4b" });
    expect(recipeInputs(meet)).toEqual([id("4"), id("3"), id("1"), id("2")]);
    const used = usedPointIds(doc());
    for (const n of ["1", "2", "3", "4"]) expect(used.has(id(n))).toBe(true);
    expect(used.has(MEET)).toBe(false);
    // A changed measurement changes what's approved, and the comparison says so.
    const longer = doc({ constructed: [meet, { ...offset, along: 1.5 }] });
    const hash = (d: SurveyDocument) => approvalHash({ document: d, crsId: "LOCAL", points: POINTS });
    expect(await hash(longer)).not.toBe(await hash(doc()));
    expect(compareDocuments(doc(), longer, POINTS).map((c) => c.text)).toContain("A point that wasn't surveyed is worked out differently now.");
  });

  it("are said in the checks, an offset as measured by tape and typed by hand", () => {
    const f = buildPlan({ points: POINTS, document: doc(), crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).findings.find((x) => x.code === "CONSTRUCTED_CORNERS")!;
    expect(f.message).toBe("2 points on the plan weren't surveyed: they're worked out from surveyed points.");
    expect(f.detail).toBe("3a, where the line 4 to 3 meets the line 1 to 2. 4b, 1.43 m along 4 to 3, then 0.20 m square off it to its left: measured by tape and typed by hand.");
  });

  it("stay where the surveyor put them when a line changes, unlike a square corner, which must stand between its points", () => {
    const d = doc();
    d.features[0]!.points = [id("5"), MEET, OFF];
    expect(refreshCorners(d, POINTS).plan.features[0]!.points).toEqual([id("5"), MEET, OFF]);
  });

  it("each have their own name", () => {
    expect(surveyDocumentSchema.safeParse({ ...doc(), constructed: [meet, { ...offset, name: "3A" }] }).success).toBe(false);
  });
});

describe("what the surveyor types", () => {
  const ok = (r: ReturnType<typeof pointFromSpec>) => ("point" in r ? r.point : null);
  it("makes a meeting or an offset from surveyed numbers and typed metres", () => {
    const m = ok(pointFromSpec({ kind: "meet", name: "3a", a: ["4", "3"], b: ["1", "2"] }, POINTS, {}, MEET));
    expect(m).toEqual(meet);
    const o = ok(pointFromSpec({ kind: "offset", name: "4b", from: "4", toward: "3", along: 1.43, out: 0.2 }, POINTS, {}, OFF));
    expect(o).toEqual(offset);
    expect(constructAt(o!, new Map(POINTS.map((p) => [p.id, p])))!.e).toBeCloseTo(E0 + 6.2, 9);
  });

  it("is refused with why: a name that's a surveyed number, the word corner, taken, or badly written; a number not surveyed; parallel lines", () => {
    const why = (r: ReturnType<typeof pointFromSpec>) => ("problem" in r ? r.problem : null);
    expect(why(pointFromSpec({ kind: "meet", name: "4", a: ["4", "3"], b: ["1", "2"] }, POINTS, {}, MEET))).toBe("4 is a surveyed point's number: give the point another name.");
    expect(why(pointFromSpec({ kind: "meet", name: "Corner", a: ["4", "3"], b: ["1", "2"] }, POINTS, {}, MEET))).toBe("The word corner is kept for square corners: give the point another name.");
    expect(why(pointFromSpec({ kind: "meet", name: "3A", a: ["4", "3"], b: ["1", "2"] }, POINTS, { constructed: [meet] }, MEET))).toBe("Another point is already called 3A.");
    expect(why(pointFromSpec({ kind: "meet", name: "a b", a: ["4", "3"], b: ["1", "2"] }, POINTS, {}, MEET))).toMatch(/short name/);
    expect(why(pointFromSpec({ kind: "meet", name: "3a", a: ["4", "9"], b: ["1", "2"] }, POINTS, {}, MEET))).toBe("There's no point 9 in the survey.");
    expect(why(pointFromSpec({ kind: "meet", name: "3a", a: ["1", "2"], b: ["5", "6"] }, POINTS, {}, MEET))).toMatch(/too nearly parallel/);
    expect(why(pointFromSpec({ kind: "offset", name: "4b", from: "4", toward: "4", along: 1, out: 0 }, POINTS, {}, OFF))).toBe("The line needs two different points.");
    expect(why(pointFromSpec({ kind: "offset", name: "4b", from: "4", toward: "3", along: Number.NaN, out: 0 }, POINTS, {}, OFF))).toBe("Give the distances in metres, each within 500 m.");
  });
});

describe("after review", () => {
  it("refuses a point worked from a line too short, reaching too far, or landing on its own surveyed point", () => {
    const byId = (pts: SurveyPoint[]) => new Map(pts.map((p) => [p.id, p]));
    const close = [...POINTS, at("20", E0 + 2, N0 + 5), at("21", E0 + 2.01, N0 + 5)];
    expect(constructAt({ ...offset, from: close.at(-2)!.id, toward: close.at(-1)!.id, along: 500, out: 0 }, byId(close))).toBeNull();
    expect(constructAt({ ...offset, along: 200, out: 0 }, byId(POINTS))).toBeNull();
    expect(constructAt({ ...offset, along: 0, out: 0 }, byId(POINTS))).toBeNull();
    // Two lines that share a point meet at it: that's the surveyed point itself.
    expect(constructAt({ ...meet, a: [id("1"), id("5")], b: [id("1"), id("2")] }, byId(POINTS))).toBeNull();
    expect(constructAt(meet, byId(POINTS))).not.toBeNull();
  });

  it("stops the plan when a surveyed point has since been given a hand-worked point's name", () => {
    const d = surveyDocumentSchema.parse({ ...emptyDocument(), codes: commonCodes(), features: [{ id: "house", layer: "BUILDINGS", code: "P", closed: false, points: [id("4"), MEET] }], constructed: [{ ...meet, name: "25" }] });
    const pts = [...POINTS, at("25", E0 + 3, N0 + 3)];
    const f = buildPlan({ points: pts, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).findings.find((x) => x.code === "CONSTRUCTED_NAME_TAKEN");
    expect(f).toMatchObject({ severity: "error", blocks: ["export", "approval"] });
  });
});
