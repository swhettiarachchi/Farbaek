/** The automatic draft (stage 194): SYNTHETIC field data, as a total station would record it, drawn into a plan. */
import { describe, expect, it } from "vitest";
import { autoDraft, isBoundaryMark, outlineFrom } from "./autodraft";
import { codeBase, codesAreDsrList, dsrCodes, entryFor, lookupCode } from "./codes";
import { compareDocuments, itemLabel } from "./compare";
import { crsById } from "./crs";
import { emptyDocument, surveyDocumentSchema } from "./document";
import { suggestFeatures } from "./fieldToFinish";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { blocked, checkSurvey } from "./qc";

const E0 = 500_000;
const N0 = 600_000;
let seq = 0;
const pt = (pointId: string, e: number, n: number, code: string | null): SurveyPoint => ({ id: `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`, pointId, e: E0 + e, n: N0 + n, z: null, code });

// A 40 m by 25 m land walked anticlockwise: four concrete posts, a wall along the north, a house, an electric post, and the road's two edges.
function field(): SurveyPoint[] {
  seq = 0;
  return [
    pt("1", 0, 0, "CP"),
    pt("2", 40, 0, "CP"),
    pt("3", 40, 25, "CP MW"),
    pt("4", 20, 25.1, "MW"),
    pt("5", 0, 25, "CP MW"),
    pt("10", 10, 8, "P"),
    pt("11", 22, 8, "P"),
    pt("12", 22, 16, "P"),
    pt("13", 10, 16, "P"),
    pt("20", 30, -3, "EP"),
    pt("30", -5, -1, "RD1"),
    pt("31", 45, -1, "RD1"),
    pt("32", -5, -6, "RD2"),
    pt("33", 45, -6, "RD2"),
  ];
}

describe("the automatic draft from field data", () => {
  it("knows boundary marks from posts that aren't on a boundary", () => {
    const codes = emptyDocument().codes;
    expect(["CP", "St", "OSt", "M"].map((c) => isBoundaryMark(lookupCode(codes, c)))).toEqual([true, true, true, true]);
    expect(["EP", "TP", "Cul", "MW", "P", "Well"].map((c) => isBoundaryMark(lookupCode(codes, c)))).toEqual([false, false, false, false, false, false]);
  });

  it("draws the lot through the marks in the order observed, the lines, the house and the road", () => {
    const points = field();
    const r = autoDraft({ points, document: emptyDocument(), surveyDate: "2026-11-14", surveyorUserId: "11111111-1111-4111-8111-111111111111" });
    const d = r.document;
    expect(d.lots).toHaveLength(1);
    expect(d.lots[0]!.points.map((id) => points.find((p) => p.id === id)!.pointId)).toEqual(["1", "2", "3", "5"]);
    expect(d.provenance["lot:lot-1"]).toEqual({ source: "auto", reviewed: false });
    expect(d.features.map((f) => [f.code, f.closed, f.points.length])).toEqual([["MW", false, 3], ["P", true, 4]]);
    expect(d.roads).toHaveLength(1);
    expect(d.roads[0]!.edgeA.map((id) => points.find((p) => p.id === id)!.pointId)).toEqual(["30", "31"]);
    expect(d.provenance["road:road-1"]).toEqual({ source: "auto", reviewed: false });
    expect(d.sheet.surveyDate).toBe("2026-11-14");
    expect(d.provenance["sheet.surveyDate"]).toEqual({ source: "auto", reviewed: false });
    expect(d.surveyorUserId).toBe("11111111-1111-4111-8111-111111111111");
    expect(r.drawn).toEqual([
      "Lot 1 through 4 boundary marks (1, 2, 3, 5), in the order they were observed.",
      "2 lines from the field codes: 1 masonry wall, 1 permanent building.",
      "A road between its two surveyed edges (2 and 2 points), 5.00 to 5.00 m wide.",
      "The survey date, 2026-11-14, as the file states it.",
      "Your surveyor details in the surveyor block.",
    ]);
    expect(r.notDrawn).toEqual([]);
    // The draft is a valid drawing, and its lot is the 1,000 m² land.
    expect(surveyDocumentSchema.safeParse(d).success).toBe(true);
    expect(computeLots(points, d.lots).lots[0]!.parcel!.areaM2).toBeCloseTo(1000, 6);
  });

  it("holds approval until the surveyor checks what it drew", () => {
    const points = field();
    const d = autoDraft({ points, document: emptyDocument() }).document;
    const qc = (doc: typeof d) => checkSurvey({ points, crs: crsById("EPSG:5235"), crsConfirmed: true, document: doc, lots: computeLots(points, doc.lots), surveyorProfile: true });
    const f = qc(d).find((x) => x.code === "AUTO_ITEMS_UNREVIEWED")!;
    expect(f.message).toBe("2 items drawn from the field data haven't been checked yet.");
    expect(blocked([f], "approval")).toHaveLength(1);
    const checked = structuredClone(d);
    for (const k of Object.keys(checked.provenance)) checked.provenance[k]!.reviewed = true;
    expect(qc(checked).some((x) => x.code === "AUTO_ITEMS_UNREVIEWED")).toBe(false);
  });

  it("orders the marks around their centre when they weren't observed in order", () => {
    seq = 0;
    const shuffled = [pt("1", 0, 0, "CP"), pt("3", 40, 25, "CP"), pt("2", 40, 0, "St"), pt("4", 0, 25, "CP")];
    const o = outlineFrom(shuffled)!;
    expect(o.how).toBe("around");
    expect(o.ring.map((p) => p.pointId)).toEqual(["1", "2", "3", "4"]);
  });

  it("draws no lot when the marks don't make one clear outline, and says why", () => {
    seq = 0;
    // A sub division: the outer marks out of order and two marks deep inside the land.
    const marks = [pt("1", 0, 0, "CP"), pt("7", 20, 12, "CP"), pt("3", 40, 25, "CP"), pt("2", 40, 0, "CP"), pt("8", 20, 13, "CP"), pt("4", 0, 25, "CP")];
    const r = autoDraft({ points: marks, document: emptyDocument() });
    expect(r.document.lots).toEqual([]);
    expect(r.notDrawn).toEqual(["No lot: the 6 boundary marks don't make one clear outline, in the order observed or around their centre (marks inside the land, as on a sub division, do this). Give each lot's corners on the Lots step, or describe the lots on the Draft step."]);
    expect(autoDraft({ points: marks.slice(0, 2), document: emptyDocument() }).notDrawn[0]).toBe("No lot: only 2 points carry a boundary-mark code, and a lot needs three.");
    expect(autoDraft({ points: [pt("9", 0, 0, "EP")], document: emptyDocument() }).notDrawn[0]).toMatch(/^No lot: no point carries a boundary-mark code/);
  });

  it("counts a mark observed twice once", () => {
    seq = 0;
    const marks = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP"), pt("3", 40, 25, "CP"), pt("4", 0, 25, "CP")];
    const again = { ...marks[0]!, id: "00000000-0000-4000-8000-000000000099" };
    expect(outlineFrom([...marks, again])!.ring.map((p) => p.pointId)).toEqual(["1", "2", "3", "4"]);
  });

  it("never draws over a plan that has lots", () => {
    const points = field();
    const doc = emptyDocument();
    doc.lots = [{ id: "lot-a", label: "A", sup: "", note: "", points: points.slice(0, 3).map((p) => p.id) }];
    const r = autoDraft({ points, document: doc });
    expect(r.document.lots).toEqual(doc.lots);
    expect(r.notDrawn[0]).toBe("No lot: the plan already has lots, so none was drawn over them. Add the new points to them on the Lots step.");
  });

  it("draws no road from one edge, or from edges it can't tell apart", () => {
    seq = 0;
    const one = [pt("30", -5, -1, "RD1"), pt("31", 45, -1, "RD1")];
    expect(autoDraft({ points: one, document: emptyDocument() }).document.roads).toEqual([]);
    const unsided = [pt("30", -5, -1, "RD"), pt("31", 45, -1, "RD"), pt("32", -5, -6, "RD1"), pt("33", 45, -6, "RD1"), pt("34", -5, -9, "RD2"), pt("35", 45, -9, "RD2")];
    expect(autoDraft({ points: unsided, document: emptyDocument() }).document.roads).toEqual([]);
  });
});

describe("the stage 194 review's cases", () => {
  it("never draws a line twice or replaces a road, however often it's drawn", () => {
    const points = field();
    const first = autoDraft({ points, document: emptyDocument() }).document;
    first.roads[0]!.name = "Temple Road";
    first.provenance["road:road-1"] = { source: "auto", reviewed: true };
    const keep = { ...first, lots: [] };
    const again = autoDraft({ points, document: keep });
    expect(again.document.features.map((x) => x.id)).toEqual(first.features.map((x) => x.id));
    expect(again.document.roads[0]!.name).toBe("Temple Road");
    expect(again.document.provenance["road:road-1"]!.reviewed).toBe(true);
    expect(new Set(again.document.features.map((x) => x.id)).size).toBe(again.document.features.length);
  });

  it("keeps within what a drawing holds and says what it left out", () => {
    seq = 0;
    const longWall = Array.from({ length: 501 }, (_, i) => pt(String(i + 1), i, 0, "MW"));
    const r = autoDraft({ points: longWall, document: emptyDocument() });
    expect(r.document.features).toEqual([]);
    expect(r.notDrawn).toContain("1 line has more than 500 points and wasn't drawn: split the string with a numbered code (MW1, MW2).");
    expect(r.shapes).toBe(0);
    seq = 0;
    const walls = Array.from({ length: 401 }, (_, i) => [pt(`a${i}`, i, 0, `MW${i % 2 ? "1" : "2"} `), pt(`b${i}`, i, 1, `MW${i % 2 ? "1" : "2"} END`)]).flat();
    const many = autoDraft({ points: walls, document: emptyDocument() });
    expect(many.document.features).toHaveLength(300);
    expect(many.drawn[0]).toMatch(/^300 lines from the field codes/);
    expect(many.notDrawn.some((x) => /^\d+ more lines from the codes weren't drawn: a plan holds 300 lines\.$/.test(x))).toBe(true);
  });

  it("orders around the centre only for a convex land, and names inward corners in the observed order", () => {
    seq = 0;
    // A notched lot with two neighbouring corners swapped: no safe order, so no lot.
    const notched = [pt("1", 0, 30, "CP"), pt("2", 40, 20, "CP"), pt("3", 50, 35, "CP"), pt("5", 25, 5, "CP"), pt("4", 50, 5, "CP")];
    expect(outlineFrom(notched)).toBeNull();
    // A square observed in order with a stake inside, shot last: drawn as observed, with the inward corner named.
    seq = 0;
    const square = [pt("1", 0, 0, "CP"), pt("2", 100, 0, "CP"), pt("3", 100, 100, "CP"), pt("4", 0, 100, "CP"), pt("5", 50, 50, "St")];
    const r = autoDraft({ points: square, document: emptyDocument() });
    expect(r.drawn[0]).toMatch(/Check the inward corner at 5: a corner of the land, or a mark inside it\?$/);
  });

  it("drops a mark shot again at the same place under a new number", () => {
    seq = 0;
    const marks = [pt("1", 0, 0, "CP"), pt("2", 40, 0, "CP"), pt("3", 40, 25, "CP"), pt("4", 0, 25, "CP"), pt("101", 0, 0, "CP")];
    expect(outlineFrom(marks)!.ring.map((p) => p.pointId)).toEqual(["1", "2", "3", "4"]);
  });

  it("pairs road edges only when they make one road of a plausible width", () => {
    seq = 0;
    const apart = [pt("30", 0, -5, "RD1"), pt("31", 100, -5, "RD1"), pt("32", 300, 0, "RD2"), pt("33", 300, 100, "RD2")];
    const r = autoDraft({ points: apart, document: emptyDocument() });
    expect(r.document.roads).toEqual([]);
    expect(r.notDrawn).toContain("No road: the RD1 and RD2 edges don't make one road between 1 and 60 m wide. Check their codes, or give the road on the Lots step.");
  });

  it("knows a street isn't a tree, and keeps large mark sets quick", () => {
    expect(isBoundaryMark({ code: "SM", meaning: "Street Marker", kind: "mark", line: "solid", legend: true })).toBe(true);
    expect(isBoundaryMark({ code: "TR", meaning: "Tree", kind: "mark", line: "solid", legend: true })).toBe(false);
    seq = 0;
    const scattered = Array.from({ length: 480 }, (_, i) => pt(String(i), Math.cos(i * 2.399) * (10 + (i % 7) * 13), Math.sin(i * 2.399) * (10 + (i % 7) * 13), "CP"));
    const t0 = performance.now();
    autoDraft({ points: scattered, document: emptyDocument() });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
});

describe("the stage 194 draft-flow review's cases", () => {
  it("looks a numbered code up by its letters, as field-to-finish does", () => {
    const codes = emptyDocument().codes;
    expect(codeBase("MW2")).toBe("MW");
    expect(codeBase("MW")).toBe("MW");
    expect(codeBase("2A")).toBe("2A");
    expect(entryFor(codes, "MW1 corner")?.code).toBe("MW");
    expect(entryFor(codes, "CP3")?.code).toBe("CP");
    expect(entryFor(codes, "XYZ1")).toBeNull();
  });

  it("holds approval until the Survey Department's list is checked too", () => {
    const points = field();
    const d = { ...autoDraft({ points, document: emptyDocument() }).document, codes: dsrCodes() };
    expect(codesAreDsrList(d.codes)).toBe(true);
    const qc = (doc: typeof d) => checkSurvey({ points, crs: crsById("EPSG:5235"), crsConfirmed: true, document: doc, lots: computeLots(points, doc.lots), surveyorProfile: true });
    expect(qc(d).find((x) => x.code === "LEGEND_UNREVIEWED")?.message).toMatch(/Survey Department's list/);
    const checked = { ...d, provenance: { ...d.provenance, codes: { source: "engine" as const, reviewed: true } } };
    expect(qc(checked).map((x) => x.code)).not.toContain("LEGEND_UNREVIEWED");
  });

  it("puts the Survey Department's fences, walls, drains and tar edges on their layers", () => {
    seq = 0;
    const codes = dsrCodes();
    const lines = suggestFeatures([pt("1", 0, 0, "WF"), pt("2", 10, 0, "WF"), pt("3", 0, 5, "BW"), pt("4", 10, 5, "BW"), pt("5", 0, 9, "Dh"), pt("6", 10, 9, "Dh"), pt("7", 0, 12, "TE"), pt("8", 10, 12, "TE")], codes);
    expect(lines.map((l) => [l.code, l.layer])).toEqual([
      ["WF", "FENCES"],
      ["BW", "WALLS"],
      ["Dh", "DRAINS"],
      ["TE", "ROADS"],
    ]);
  });

  it("counts drawn items honestly in the history, and names title fields as the editor does", () => {
    const before = emptyDocument();
    const points = field();
    const after = autoDraft({ points, document: before }).document;
    const lines = compareDocuments(before, after, points).map((c) => c.text);
    expect(lines.some((x) => /drawn from the field data, waiting to be checked\.$/.test(x))).toBe(true);
    const checked = { ...after, provenance: Object.fromEntries(Object.entries(after.provenance).map(([k, p]) => [k, { ...p, reviewed: true }])) };
    expect(compareDocuments(before, checked, points).some((c) => /drawn from the field data, all checked\.$/.test(c.text))).toBe(true);
    const again = { ...checked, provenance: { ...checked.provenance, "lot:lot-1": { source: "auto" as const, reviewed: false } } };
    expect(compareDocuments(checked, again, points).some((c) => /checking again/.test(c.text))).toBe(true);
    expect(itemLabel("sheet.surveyDate")).toBeTruthy();
    expect(itemLabel("sheet.previousPlan.number")).toBeTruthy();
    expect(itemLabel("sheet.nothing")).toBeNull();
  });
});
