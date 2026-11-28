/**
 * New points on a plan already drawn (stage 306, ADR 0311). SYNTHETIC field data: a 40 m by 25 m land with four concrete posts, a wall
 * along its north side and the road's two edges, then a second visit's points.
 */
import { describe, expect, it } from "vitest";
import { autoDraft } from "../autodraft";
import { emptyDocument, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { asThePlanHasThem, conflictSaid, pointConflicts, updateForNewPoints } from "./update";

const E0 = 500_000;
const N0 = 600_000;
let seq = 0;
const pt = (pointId: string, e: number, n: number, code: string | null): SurveyPoint => ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, pointId, e: E0 + e, n: N0 + n, z: null, code });

// The first visit: the posts at three corners and the wall from 3 to 4; the fourth post and the wall's end were shot the next day.
function firstVisit(): SurveyPoint[] {
  seq = 0;
  return [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP"), pt("3", 40, 25, "CP MW"), pt("4", 20, 25.1, "MW"), pt("30", -5, -1, "RD1"), pt("31", 45, -1, "RD1"), pt("32", -5, -6, "RD2"), pt("33", 45, -6, "RD2")];
}
const secondVisit = () => [pt("5", 0, 25, "CP MW"), pt("34", 60, -1, "RD1"), pt("35", 60, -6, "RD2")];

// Read with Carlson's line words, where a line runs on through other codes until it's ended, so the second visit's wall point continues it.
const drawn = (points: SurveyPoint[], grammar: SurveyDocument["grammar"] = "carlson"): SurveyDocument => autoDraft({ points, document: { ...emptyDocument(), grammar }, surveyorUserId: null, surveyDate: null }).document;
const names = (doc: SurveyDocument, points: SurveyPoint[]) => (ids: readonly string[]) => ids.map((id) => points.find((p) => p.id === id)!.pointId);

describe("new points on a plan already drawn", () => {
  it("redraws the waiting wall, lot and road with them, and draws nothing twice", () => {
    const before = firstVisit();
    const doc = drawn(before);
    const after = [...before, ...secondVisit()];
    const of = names(doc, after);
    expect(doc.lots.map((l) => of(l.points))).toEqual([["1", "2", "3"]]);
    expect(doc.features.map((f) => of(f.points))).toEqual([["3", "4"]]);
    const u = updateForNewPoints(doc, before, after, "2026-10-14");
    // The wall now runs on to 5: redrawn once, not drawn again beside the old one.
    expect(u.document.features.map((f) => `${f.code} ${of(f.points).join("-")}`)).toEqual(["MW 3-4-5"]);
    expect(u.removed).toContain(`feature:${doc.features[0]!.id}`);
    // The lot takes the fourth post; the road its new edge points.
    expect(u.document.lots.map((l) => of(l.points).sort())).toEqual([["1", "2", "3", "5"]]);
    expect(of(u.document.roads[0]!.edgeA)).toEqual(["30", "31", "34"]);
    expect(of(u.document.roads[0]!.edgeB)).toEqual(["32", "33", "35"]);
    // Each still waits for the surveyor, and the date the new file states fills the empty one.
    for (const k of ["lot:lot-1", "road:road-1", `feature:${u.document.features[0]!.id}`, "sheet.surveyDate"]) expect(u.document.provenance[k]).toEqual({ source: "auto", reviewed: false });
    expect(u.document.sheet.surveyDate).toBe("2026-10-14");
    expect(u.said.join(" ")).toContain("Lot 1 redrawn through the new boundary mark 5: now 4 corners.");
    expect(u.kept).toEqual([]);
  });

  it("leaves what the surveyor confirmed or changed as it is, and says so", () => {
    const before = firstVisit();
    const base = drawn(before);
    const wall = `feature:${base.features[0]!.id}`;
    const doc: SurveyDocument = { ...base, provenance: { ...base.provenance, "lot:lot-1": { source: "auto", reviewed: true }, [wall]: { source: "auto", reviewed: true }, "road:road-1": { source: "auto", reviewed: true } } };
    const after = [...before, ...secondVisit()];
    const of = names(doc, after);
    const u = updateForNewPoints(doc, before, after);
    expect(u.document.lots.map((l) => of(l.points))).toEqual([["1", "2", "3"]]);
    // The confirmed wall stays, and its longer line isn't drawn over it.
    expect(u.document.features.map((f) => of(f.points))).toEqual([["3", "4"]]);
    expect(of(u.document.roads[0]!.edgeA)).toEqual(["30", "31"]);
    expect(u.added).toEqual([]);
    expect(u.removed).toEqual([]);
    expect(u.kept).toEqual([
      "The masonry wall line through 3 and 4 runs on with the new points, but you confirmed or changed it, so it stays as it is. Redraw it on the Lots step if it should take them in.",
      "New boundary mark 5 isn't on any lot. The lots were confirmed, changed or drawn otherwise, so they stay: add it on the Lots step if it's a corner.",
      "New road-edge points were added, but the road was confirmed or changed, so it stays as it is. Redraw it on the Lots step if it should change.",
    ]);
  });

  it("draws a new line the second visit's codes make, beside the first visit's, under Farbaek's line words", () => {
    const before = firstVisit();
    const doc = drawn(before, "farbaek");
    const after = [...before, pt("5", 0, 25, "CP MW"), pt("6", -5, 25, "MW")];
    const of = names(doc, after);
    const u = updateForNewPoints(doc, before, after);
    expect(u.document.features.map((f) => of(f.points).join("-"))).toEqual(["3-4", "5-6"]);
    expect(u.said).toContain("1 line from the field codes drawn: the masonry wall through 5 and 6.");
  });

  it("never draws again a line the surveyor took off, and changes nothing without new points", () => {
    const before = firstVisit();
    const base = drawn(before);
    // The surveyor took the wall off; the second visit adds only a post.
    const doc: SurveyDocument = { ...base, features: [], provenance: Object.fromEntries(Object.entries(base.provenance).filter(([k]) => !k.startsWith("feature:"))) };
    const after = [...before, pt("6", 20, -0.1, "CP")];
    const u = updateForNewPoints(doc, before, after);
    expect(u.document.features).toEqual([]);
    expect(updateForNewPoints(doc, before, before)).toMatchObject({ added: [], removed: [], kept: [], said: [] });
  });

  it("draws the lot when the marks first make one", () => {
    seq = 0;
    const before = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP")];
    const doc = drawn(before);
    expect(doc.lots).toEqual([]);
    const after = [...before, pt("3", 40, 25, "CP"), pt("4", 0, 25, "CP")];
    const u = updateForNewPoints(doc, before, after);
    expect(u.document.lots).toHaveLength(1);
    expect(u.added).toContain("lot:lot-1");
  });
});

describe("a point the plan has, given somewhere else", () => {
  const at = (pointId: string, e: number, n: number, z: number | null, code: string | null, line = 1) => ({ line, pointId, e: E0 + e, n: N0 + n, z, code });

  it("is found, with how far and what else differs; the same point, within half a millimetre, isn't", () => {
    const have = firstVisit();
    const clash = pointConflicts(have, { points: [at("1", 0.12, 0, null, "CP"), at("2", 40.0004, 0, null, "CP"), at("3", 40, 25, 12.5, "CP"), at("99", 0, 0, null, null)] });
    expect(clash.map((c) => c.pointId)).toEqual(["1", "3"]);
    expect(conflictSaid(clash[0]!)).toBe("Point 1 is already in this plan; this file gives it 0.120 m from where the plan has it.");
    // The plan has 3 as "CP MW" and no height: another code is a clash, a height the plan doesn't have isn't.
    expect(conflictSaid(clash[1]!)).toBe("Point 3 is already in this plan; this file gives it at the same place, with another code.");
  });

  it("isn't found in a file that says nothing about heights or codes, as a returning surveyor's 2D export or printout (stage 306 review)", () => {
    seq = 0;
    const have = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP")].map((p, k) => ({ ...p, z: 21.4 + k }));
    // Every height 0 and no codes: a drawing exported without them.
    expect(pointConflicts(have, { points: [at("1", 0, 0, 0, null), at("2", 40, 0, 0, null)] })).toEqual([]);
    // Heights given that differ are a clash.
    expect(pointConflicts(have, { points: [at("1", 0, 0, 21.9, "CP")] }).map((c) => c.differs)).toEqual([["height"]]);
    // What's imported for them is the plan's own, so the database keeps each once.
    expect(asThePlanHasThem(have, [at("1", 0.0003, 0, 0, null), at("7", 5, 5, 0, null)])).toEqual([at("1", 0, 0, 21.4, "CP"), at("7", 5, 5, 0, null)]);
  });
});

describe("what the surveyor took off or changed (stage 306 review)", () => {
  it("never draws again a line taken off, nor one they changed, when new points would make it longer", () => {
    const before = firstVisit();
    const base = drawn(before);
    const after = [...before, ...secondVisit()];
    // The wall taken off: 3-4-5 isn't drawn.
    const off: SurveyDocument = { ...base, features: [], provenance: Object.fromEntries(Object.entries(base.provenance).filter(([k]) => !k.startsWith("feature:"))) };
    expect(updateForNewPoints(off, before, after).document.features).toEqual([]);
    // The wall changed to run 3-4-2 and confirmed: it stays, and 3-4-5 isn't drawn beside it.
    const wall = base.features[0]!;
    const changed: SurveyDocument = { ...base, features: [{ ...wall, points: [...wall.points, before.find((p) => p.pointId === "2")!.id] }], provenance: { ...base.provenance, [`feature:${wall.id}`]: { source: "auto", reviewed: true } } };
    const of = names(changed, after);
    expect(updateForNewPoints(changed, before, after).document.features.map((f) => of(f.points).join("-"))).toEqual(["3-4-2"]);
  });

  it("never draws again a lot or road taken off", () => {
    const before = firstVisit();
    const base = drawn(before);
    const bare: SurveyDocument = { ...base, lots: [], roads: [], provenance: {} };
    const u = updateForNewPoints(bare, before, [...before, ...secondVisit()]);
    expect(u.document.lots).toEqual([]);
    expect(u.document.roads).toEqual([]);
  });

  it("leaves the lot as it is when a neighbour named beside one of its sides would lose it", () => {
    const before = firstVisit();
    const base = drawn(before);
    const of = names(base, before);
    const [a, b] = base.lots[0]!.points.slice(-1).concat(base.lots[0]!.points[0]!);
    // A neighbour typed beside the side from the lot's last corner back to its first, which the new mark 5 splits.
    const doc: SurveyDocument = { ...base, adjoining: [{ id: "adj-1", text: "Land of the sample neighbour", lot: "lot-1", from: a!, to: b! }] };
    expect(of([a!, b!])).toEqual(["3", "1"]);
    const u = updateForNewPoints(doc, before, [...before, ...secondVisit()]);
    expect(u.document.lots[0]!.points).toEqual(base.lots[0]!.points);
    expect(u.kept.join(" ")).toContain("a neighbour you named lies beside a side that would go");
  });
});
