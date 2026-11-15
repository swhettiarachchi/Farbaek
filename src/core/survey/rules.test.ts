/** A plan's lots against planning rules (stage 193): SYNTHETIC lots with hand-worked areas, frontages and depths. */
import { describe, expect, it } from "vitest";
import { crsById } from "./crs";
import { compareDocuments } from "./compare";
import { emptyDocument, parseSurveyDocument, type SurveyDocument } from "./document";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { checkSurvey } from "./qc";
import { approvalHash } from "./view";

const SLD99 = crsById("EPSG:5235")!;
const E0 = 500_000;
const N0 = 600_000;
const pt = (n: string, e: number, nn: number): SurveyPoint => ({ id: `00000000-0000-4000-d000-${n.padStart(12, "0")}`, pointId: n, e: E0 + e, n: N0 + nn, z: null, code: null });

// A road along the south (its north edge 1 to 4, its south edge R1 to R2), three lots fronting it and one behind.
//   lot A: 1 (0, 0), 2 (12, 0), 7 (12, 25), 8 (0, 25): 300 m², 12 m on the road, 25 m deep.
//   lot B: 2 (12, 0), 3 (17, 0), 6 (17, 25), 7 (12, 25): 125 m², 5 m on the road.
//   lot C: 3 (17, 0), 4 (40, 0), 5 (40, 25), 6 (17, 25): 575 m², 23 m on the road, 25 m deep.
//   lot D: 8 (0, 25), 7 (12, 25), 9 (12, 40), 10 (0, 40): 180 m², nowhere on the road.
const PTS = [pt("1", 0, 0), pt("2", 12, 0), pt("3", 17, 0), pt("4", 40, 0), pt("5", 40, 25), pt("6", 17, 25), pt("7", 12, 25), pt("8", 0, 25), pt("9", 12, 40), pt("10", 0, 40), pt("21", 0, -6), pt("22", 40, -6)];
const id = (n: string) => PTS.find((p) => p.pointId === n)!.id;
const lot = (key: string, label: string, corners: string[], note = "") => ({ id: `lot-${key}`, label, sup: "", note, points: corners.map(id) });

function plan(rules: SurveyDocument["rules"], lots = [lot("a", "A", ["1", "2", "7", "8"]), lot("b", "B", ["2", "3", "6", "7"]), lot("c", "C", ["3", "4", "5", "6"]), lot("d", "D", ["8", "7", "9", "10"])], withRoad = true): SurveyDocument {
  const d = emptyDocument();
  d.lots = lots;
  d.roads = withRoad ? [{ id: "road-1", name: "Main Road", edgeA: [id("1"), id("2"), id("3"), id("4")], edgeB: [id("21"), id("22")], width: "feet", start: "", end: "" }] : [];
  d.rules = rules;
  return d;
}
const qc = (d: SurveyDocument, points = PTS) => checkSurvey({ points, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(points, d.lots), surveyorProfile: false });
const ruleFindings = (d: SurveyDocument, points = PTS) => qc(d, points).filter((f) => f.code.startsWith("LOT_UNDER") || f.code.startsWith("LOT_NO_ROAD") || f.code.startsWith("RULES_"));

describe("a plan's lots against planning rules", () => {
  it("checks nothing until the surveyor chooses a set", () => {
    expect(ruleFindings(plan(null))).toEqual([]);
  });

  it("warns of each lot under the UDA minimums, citing the regulations, and blocks nothing", () => {
    const f = ruleFindings(plan({ id: "uda-2020" }));
    expect(f.map((x) => [x.code, x.message])).toEqual([
      ["LOT_UNDER_MINIMUM_AREA", "Lot B is 125.00 m², under the UDA minimum of 150 m²."],
      ["LOT_UNDER_MINIMUM_FRONTAGE", "Lot B's frontage is 5.00 m, under the UDA minimum of 6.0 m."],
      ["LOT_NO_ROAD_FRONTAGE", "Lot D has no leg along a road or an access strip on this plan."],
      ["RULES_REMINDER", "Dividing land in a UDA-declared area needs prior written consent from the UDA and the local authority. (reg. 4(1))"],
    ]);
    expect(f.every((x) => x.blocks.length === 0)).toBe(true);
    expect(f[0]!.detail).toBe("UDA Planning & Development Regulations (the copy titled 2020), regs. 9(a) and 14(1), for UDA-declared areas, unless a Development Plan says otherwise.");
    expect(f[0]!.target).toEqual({ kind: "lot", id: "lot-b" });
  });

  it("takes a reserved access lot as frontage, and leaves the reserved lot itself unchecked", () => {
    // An access strip 3.048 m (10 ft) wide up the west side; lot G fronts the road, lot F behind it fronts the strip.
    //   G: 16.952 m on the road (its 15 m side on the strip is shorter), 254.28 m², mean depth 15 m.
    //   F: 15 m on the strip, 254.28 m², mean depth 16.952 m.
    const pts = [pt("1", 0, 0), pt("2", 3.048, 0), pt("3", 20, 0), pt("4", 20, 15), pt("5", 3.048, 15), pt("6", 20, 30), pt("7", 3.048, 30), pt("8", 0, 30), pt("21", 0, -6), pt("22", 20, -6)];
    const pid = (n: string) => pts.find((p) => p.pointId === n)!.id;
    const l = (key: string, label: string, corners: string[], note = "") => ({ id: `lot-${key}`, label, sup: "", note, points: corners.map(pid) });
    const d = emptyDocument();
    d.lots = [l("e", "E", ["1", "2", "5", "7", "8"], "(Res. for Access, 10ft. wide)"), l("g", "G", ["2", "3", "4", "5"]), l("f", "F", ["5", "4", "6", "7"])];
    d.roads = [{ id: "road-1", name: "", edgeA: [pid("1"), pid("3")], edgeB: [pid("21"), pid("22")], width: "feet", start: "", end: "" }];
    d.rules = { id: "uda-2020" };
    const f = ruleFindings(d, pts);
    expect(f.map((x) => x.code)).toEqual(["RULES_LOTS_MEET", "RULES_REMINDER"]);
    expect(f[0]!.message).toBe("All 2 lots meet the UDA minimums (150 m², 6.0 m frontage and 12.0 m depth).");
    expect(f[0]!.detail).toMatch(/ 1 reserved lot wasn't checked\.$/);
    // Without the strip, lot F has no frontage.
    d.lots = d.lots.slice(1);
    expect(ruleFindings(d, pts).map((x) => x.code)).toContain("LOT_NO_ROAD_FRONTAGE");
  });

  it("checks the surveyor's own minimums once they say where they come from", () => {
    const own = (source: string) => plan({ id: "own", areaM2: 200, frontageM: 0, depthM: 20, source });
    expect(ruleFindings(own("  ")).map((x) => x.code)).toEqual(["RULES_SOURCE_MISSING"]);
    const f = ruleFindings(own("Development Plan, zone R2"));
    // Lot B is 125 m² (under 200); lot D 180 m² (under 200). Frontage isn't asked for, so lot D's missing frontage isn't reported; depths are 25 m.
    expect(f.map((x) => x.message)).toEqual(["Lot B is 125.00 m², under the minimum you entered of 200 m².", "Lot D is 180.00 m², under the minimum you entered of 200 m²."]);
    expect(f[0]!.detail).toBe("From the minimums you entered: Development Plan, zone R2.");
  });

  it("checks depth as area over frontage", () => {
    const f = ruleFindings(plan({ id: "own", areaM2: 0, frontageM: 0, depthM: 26, source: "a brief" }));
    // Lots A, B and C are 25 m deep; lot D has no frontage, so no depth.
    expect(f.map((x) => x.message)).toEqual(["Lot A's mean depth (its area over its frontage) is 25.00 m, under the minimum you entered of 26.0 m.", "Lot B's mean depth (its area over its frontage) is 25.00 m, under the minimum you entered of 26.0 m.", "Lot C's mean depth (its area over its frontage) is 25.00 m, under the minimum you entered of 26.0 m."]);
  });

  it("says frontages weren't checked on a plan with no roads", () => {
    const f = ruleFindings(plan({ id: "uda-2020" }, undefined, false));
    expect(f.map((x) => x.code)).toEqual(["LOT_UNDER_MINIMUM_AREA", "RULES_FRONTAGE_UNCHECKED", "RULES_REMINDER"]);
  });

  it("keeps earlier approvals, records the choice in the version, and says when it changes", async () => {
    const none = plan(null);
    const { rules: _r, ...older } = none;
    void _r;
    // A document without the field parses to null and hashes the same as one saved before it existed.
    expect(parseSurveyDocument(JSON.parse(JSON.stringify(older)))?.rules ?? null).toBeNull();
    const hash = (d: SurveyDocument) => approvalHash({ document: d, crsId: "EPSG:5235", points: PTS });
    const uda = plan({ id: "uda-2020" });
    expect(await hash(uda)).not.toBe(await hash(none));
    expect(compareDocuments(none, uda, PTS).map((c) => c.text)).toContain("Lots are now checked against the UDA minimums.");
    expect(compareDocuments(uda, none, PTS).map((c) => c.text)).toContain("Lots are no longer checked against planning minimums.");
  });
});
