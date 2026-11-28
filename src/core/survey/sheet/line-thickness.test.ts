/**
 * The plan's line thickness (stage 304, ADR 0310), on SYNTHETIC points: a 20 m square lot with a wall across it. A practising surveyor
 * asked for 0.13 mm lines: a new plan draws every line of its drawing at that, the frame keeps its own, a plan made before keeps the
 * template's weights, and the surveyor's choice goes on to their next plan.
 */
import { describe, expect, it } from "vitest";
import { defaultsFrom, withDefaults } from "../autosurvey/defaults";
import { commonCodes } from "../codes";
import { compareDocuments } from "../compare";
import { defaultSettings, emptyDocument, NEW_PLAN_LINE_MM, surveyDocumentSchema, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import type { SceneItem } from "./scene";
import { drawingLines, SRI_LANKA_CLASSIC_V1 } from "./template";

const at = (pointId: string, e: number, n: number, code: string | null = null): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code });
const POINTS = [at("1", 500_000, 600_000), at("2", 500_020, 600_000), at("3", 500_020, 600_020), at("4", 500_000, 600_020), at("5", 500_005, 600_005), at("6", 500_015, 600_005)];
const doc = (settings: Partial<SurveyDocument["settings"]> = {}, base: SurveyDocument = emptyDocument()): SurveyDocument => ({
  ...base,
  codes: commonCodes(),
  lots: [{ id: "lotX", label: "X", sup: "", points: POINTS.slice(0, 4).map((p) => p.id), note: "" }],
  features: [{ id: "w1", code: "MW", layer: "WALLS", points: ["5", "6"].map((id) => POINTS.find((p) => p.pointId === id)!.id), closed: false }],
  settings: { ...base.settings, ...settings },
});
const paths = (d: SurveyDocument) =>
  buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null })
    .sheet.pages[0]!.items.filter((i): i is Extract<SceneItem, { kind: "path" }> => i.kind === "path");
const widthOf = (d: SurveyDocument, layer: string) => [...new Set(paths(d).filter((p) => p.layer === layer).map((p) => p.width))];

describe("the plan's line thickness", () => {
  it("draws every line of a new plan's drawing at 0.13 mm, and keeps the frame's own", () => {
    const d = doc();
    expect(d.settings.lineMm).toBe(NEW_PLAN_LINE_MM);
    expect(widthOf(d, "BOUNDARY")).toEqual([0.13]);
    expect(widthOf(d, "WALLS")).toEqual([0.13]);
    expect(widthOf(d, "SHEET")).toContain(SRI_LANKA_CLASSIC_V1.lines.frame);
    // Nothing in the drawing is heavier than the thickness chosen.
    expect(Math.max(...paths(d).filter((p) => p.layer !== "SHEET").map((p) => p.width))).toBe(0.13);
  });

  it("draws the lots' boundaries heavier only when chosen", () => {
    expect(widthOf(doc({ boundaryMm: 0.35 }), "BOUNDARY")).toEqual([0.35]);
    expect(widthOf(doc({ boundaryMm: 0.35 }), "WALLS")).toEqual([0.13]);
    expect(widthOf(doc({ lineMm: 0.18 }), "WALLS")).toEqual([0.18]);
  });

  it("keeps a plan made before it as it was drawn, thin boundaries and all", () => {
    const older: SurveyDocument = { ...emptyDocument(), settings: defaultSettings() };
    expect(older.settings.lineMm).toBeUndefined();
    expect(widthOf(doc({}, older), "BOUNDARY")).toEqual([SRI_LANKA_CLASSIC_V1.lines.boundary]);
    expect(widthOf(doc({}, older), "WALLS")).toEqual([SRI_LANKA_CLASSIC_V1.lines.feature]);
    expect(widthOf(doc({ thinBoundary: true }, older), "BOUNDARY")).toEqual([SRI_LANKA_CLASSIC_V1.lines.feature]);
    expect(Object.keys(surveyDocumentSchema.parse(doc({}, older)).settings)).not.toContain("lineMm");
    expect(drawingLines({}, SRI_LANKA_CLASSIC_V1.lines)).toEqual({ boundary: 0.45, feature: 0.25, thin: 0.18 });
    expect(drawingLines({ lineMm: 0.13, thinBoundary: true }, SRI_LANKA_CLASSIC_V1.lines)).toEqual({ boundary: 0.13, feature: 0.13, thin: 0.13 });
  });

  it("goes on to the surveyor's next plan, and a plan made before leaves a new plan at 0.13 mm", () => {
    const fresh = () => emptyDocument();
    expect(withDefaults(fresh(), defaultsFrom([{ name: "Last", document: doc({ lineMm: 0.18, boundaryMm: 0.35 }) }])).settings).toMatchObject({ lineMm: 0.18, boundaryMm: 0.35 });
    const older: SurveyDocument = { ...emptyDocument(), settings: defaultSettings() };
    const next = withDefaults(fresh(), defaultsFrom([{ name: "Older", document: older }]));
    expect(next.settings.lineMm).toBe(0.13);
    expect(next.settings.boundaryMm).toBeUndefined();
  });

  it("says the change between versions in millimetres", () => {
    expect(compareDocuments(doc(), doc({ lineMm: 0.18 }), POINTS).map((c) => c.text)).toEqual(["Line thickness changed from 0.13 mm to 0.18 mm."]);
    expect(compareDocuments(doc(), doc({ boundaryMm: 0.35 }), POINTS).map((c) => c.text)).toEqual(["Lot boundary thickness changed from as the other lines to 0.35 mm."]);
  });
});
