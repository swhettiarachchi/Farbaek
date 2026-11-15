/** The automatic draft (stage 194): SYNTHETIC field data, as a total station would record it, drawn into a plan. */
import { describe, expect, it } from "vitest";
import { autoDraft, isBoundaryMark, outlineFrom } from "./autodraft";
import { lookupCode } from "./codes";
import { crsById } from "./crs";
import { emptyDocument, surveyDocumentSchema } from "./document";
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
      "A road between its two surveyed edges (2 and 2 points), with its width worked out from them.",
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
    expect(r.document).toBe(doc);
    expect(r.drawn).toEqual([]);
    expect(r.notDrawn).toEqual(["The plan already has lots, so nothing was drawn over them. Add the new points to the plan on the Lots step."]);
  });

  it("draws no road from one edge, or from edges it can't tell apart", () => {
    seq = 0;
    const one = [pt("30", -5, -1, "RD1"), pt("31", 45, -1, "RD1")];
    expect(autoDraft({ points: one, document: emptyDocument() }).document.roads).toEqual([]);
    const unsided = [pt("30", -5, -1, "RD"), pt("31", 45, -1, "RD"), pt("32", -5, -6, "RD1"), pt("33", 45, -6, "RD1"), pt("34", -5, -9, "RD2"), pt("35", 45, -9, "RD2")];
    expect(autoDraft({ points: unsided, document: emptyDocument() }).document.roads).toEqual([]);
  });
});
