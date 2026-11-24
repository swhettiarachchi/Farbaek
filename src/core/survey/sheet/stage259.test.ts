/**
 * Corners without circles, and lot letters left off the drawing (stage 259, ADR 0267), on SYNTHETIC points: a 20 m square lot.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { compareDocuments } from "../compare";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { writeDxf } from "../export/dxf";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { approvalHash, buildPlan } from "../view";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const POINTS = [at("1", 500_000, 600_000), at("2", 500_020, 600_000), at("3", 500_020, 600_020), at("4", 500_000, 600_020)];
const doc = (settings: Partial<SurveyDocument["settings"]> = {}): SurveyDocument => ({
  ...emptyDocument(),
  codes: commonCodes(),
  lots: [{ id: "lotX", label: "X", sup: "", points: POINTS.map((p) => p.id), note: "" }],
  settings: { ...emptyDocument().settings, ...settings },
});
const items = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).sheet.pages[0]!.items;

describe("the lot's corners and letters on the drawing", () => {
  it("draws circles at the corners and the lot's letter unless they're turned off", () => {
    const on = items(doc());
    expect(on.filter((i) => i.kind === "circle" && i.entity?.startsWith("pt:")).length).toBe(4);
    expect(on.some((i) => i.kind === "text" && i.entity === "lot:lotX")).toBe(true);
    const off = items(doc({ noCornerCircles: true, noLotLetters: true }));
    expect(off.filter((i) => i.kind === "circle" && i.entity?.startsWith("pt:")).length).toBe(0);
    expect(off.some((i) => i.kind === "text" && i.entity === "lot:lotX")).toBe(false);
    // The title still names the lot.
    expect(off.some((i) => i.kind === "text" && /lot X\b/.test(i.text))).toBe(true);
  });

  it("leaves the letter off the DXF too, as the sheet shows it", () => {
    const dxf = (d: SurveyDocument) => writeDxf({ document: d, points: POINTS, lots: computeLots(POINTS, d.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" });
    expect(dxf(doc())).toContain("Lot X");
    expect(dxf(doc({ noLotLetters: true }))).not.toContain("Lot X");
  });

  it("keeps a plan that never changes them, and its approval, as before, and says the change between versions", async () => {
    const before = doc();
    expect(Object.keys(surveyDocumentSchema.parse(before).settings)).not.toContain("noCornerCircles");
    const hash = (d: SurveyDocument) => approvalHash({ document: surveyDocumentSchema.parse(d), crsId: "LOCAL", points: POINTS });
    expect(await hash(doc({ noCornerCircles: true }))).not.toBe(await hash(before));
    expect(compareDocuments(before, doc({ noCornerCircles: true }), POINTS).map((c) => c.text)).toEqual(["Corners drawn without circles changed from off to on."]);
  });
});
