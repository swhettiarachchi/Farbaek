/**
 * Square corners in the editor (stage 262, ADR 0270), on SYNTHETIC points: a 10 m by 20 m lot, a box against its west side whose
 * corner 17 stands 0.15 m inside it, its far corner 14 out in the lot, and 13 beside 14.
 */
import { describe, expect, it } from "vitest";
import { cornerId, refreshCorners } from "@/core/survey/construct";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "@/core/survey/document";
import type { SurveyPoint } from "@/core/survey/parcel";
import { buildPlan } from "@/core/survey/view";
import { lineFromText } from "./selection-editor";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const E0 = 500_000;
const N0 = 600_000;
const POINTS = [at("1", E0, N0), at("2", E0 + 10, N0), at("3", E0 + 10, N0 + 20), at("4", E0, N0 + 20), at("17", E0 + 0.15, N0 + 12), at("14", E0 + 3, N0 + 14.5), at("13", E0 + 4, N0 + 15.5), at("20", E0 + 8, N0 + 13)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
const base = (): SurveyDocument => ({ ...emptyDocument(), lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }], features: [{ id: "box", layer: "BUILDINGS", code: "", closed: false, points: [id("14"), id("17")] }] });

describe("typing a square corner", () => {
  it("works it out between the two numbers it's typed between, squared to the lot's side", () => {
    const r = lineFromText("14, corner, 17", POINTS, [], base(), false);
    if ("problem" in r) throw new Error(r.problem);
    expect(r.ids).toEqual([id("14"), cornerId(id("14"), id("17")), id("17")]);
    expect(r.constructed).toEqual([{ id: cornerId(id("14"), id("17")), kind: "square", from: id("17"), to: id("14"), ref: [id("4"), id("1")] }]);
  });

  it("reuses the plan's own corner between the same points, and says why when none can be squared", () => {
    const d = { ...base(), constructed: [{ id: cornerId(id("14"), id("17")), kind: "square" as const, from: id("17"), to: id("14"), ref: [id("4"), id("1")] as [string, string] }] };
    const again = lineFromText("17 corner 14", POINTS, [], d, false);
    expect("ids" in again && again.constructed).toEqual([]);
    const open = { ...base(), lots: [], features: [] };
    expect(lineFromText("14 corner 20", POINTS, [], open, false)).toEqual({ problem: "No surveyed line at 14 or 20 says which way the corner between them is square: survey the corner, or leave the word out." });
    expect(lineFromText("corner 14 17", POINTS, [], base(), false)).toEqual({ problem: "A square corner goes between two numbers: type corner between them." });
    expect(lineFromText("14 17 corner", POINTS, [], base(), false)).toEqual({ problem: "A square corner goes between two numbers: type corner between them." });
  });
});

describe("after a line's points change", () => {
  const withCorner = (): SurveyDocument => {
    const c = { id: cornerId(id("14"), id("17")), kind: "square" as const, from: id("17"), to: id("14"), ref: [id("4"), id("1")] as [string, string] };
    return { ...base(), features: [{ id: "box", layer: "BUILDINGS", code: "", closed: false, points: [id("13"), id("14"), c.id, id("17")] }], constructed: [c] };
  };

  it("leaves a corner still between its own points as it is", () => {
    const d = withCorner();
    expect(refreshCorners(d, POINTS).plan).toEqual(d);
  });

  it("works a corner out again between its new neighbours when one was dragged onto another point", () => {
    const d = withCorner();
    d.features[0]!.points[1] = id("20");
    const { plan, removed } = refreshCorners(d, POINTS);
    expect(removed).toEqual([]);
    expect(plan.features[0]!.points).toEqual([id("13"), id("20"), cornerId(id("20"), id("17")), id("17")]);
    expect(plan.constructed!.map((c) => c.id)).toEqual([cornerId(id("20"), id("17"))]);
  });

  it("takes a corner out, and drops the field, when nothing squares it any more or no line uses it", () => {
    // 20, the stale corner, 17: with no lot, nothing but the line through the corner itself, which never counts.
    const d = withCorner();
    const stale = { ...d, lots: [], features: [{ ...d.features[0]!, points: [id("20"), d.features[0]!.points[2]!, id("17")] }] };
    const { plan, removed } = refreshCorners(stale, POINTS);
    expect(plan.features[0]!.points).toEqual([id("20"), id("17")]);
    expect(removed).toEqual([[id("20"), id("17")]]);
    expect("constructed" in plan).toBe(false);
    const gone = refreshCorners({ ...withCorner(), features: [] }, POINTS).plan;
    expect("constructed" in gone).toBe(false);
  });
});

describe("the checks", () => {
  it("stop a plan whose corner isn't between the two points it's worked out from", () => {
    const c = { id: cornerId(id("14"), id("17")), kind: "square" as const, from: id("17"), to: id("14"), ref: [id("4"), id("1")] as [string, string] };
    const d = surveyDocumentSchema.parse({ ...base(), features: [{ id: "box", layer: "BUILDINGS", code: "", closed: false, points: [id("13"), c.id, id("17")] }], constructed: [c] });
    const v = buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null });
    expect(v.findings.find((f) => f.code === "CONSTRUCTED_CORNER_MISPLACED")).toMatchObject({ severity: "error", blocks: ["export", "approval"] });
  });
});

describe("a point worked out by hand, by its name (stage 264)", () => {
  it("is taken by the name the surveyor gave it, and shown by it", () => {
    const meet = { id: "00000000-0000-4000-8000-0000000000a1", kind: "meet" as const, name: "3a", a: [id("14"), id("13")] as [string, string], b: [id("1"), id("2")] as [string, string] };
    const d = { ...base(), constructed: [meet] };
    const r = lineFromText("17, 3A, 14", POINTS, [], d, false);
    expect(r).toEqual({ ids: [id("17"), meet.id, id("14")], constructed: [] });
  });
});

describe("after review (stage 264)", () => {
  const meet = { id: "00000000-0000-4000-8000-0000000000a1", kind: "meet" as const, name: "13", a: [id("14"), id("13")] as [string, string], b: [id("1"), id("2")] as [string, string] };
  it("takes a surveyed number as the surveyed point even where a hand-worked point was given that name", () => {
    const r = lineFromText("17, 13", POINTS, [], { ...base(), constructed: [meet] }, false);
    expect(r).toEqual({ ids: [id("17"), id("13")], constructed: [] });
  });
  it("says a square corner can't stand beside a point that wasn't surveyed", () => {
    const named = { ...meet, name: "3a" };
    expect(lineFromText("3a, corner, 17", POINTS, [], { ...base(), constructed: [named] }, false)).toEqual({ problem: "A square corner goes between two surveyed points, not beside a point that wasn't surveyed." });
  });
});
