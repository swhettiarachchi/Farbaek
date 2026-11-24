/**
 * Road names, their direction texts and lines' codes placed by the label solver (stage 258, ADR 0266), on SYNTHETIC points: a lot with
 * a road along its north side whose far edge is also drawn as a masonry wall, as on the owner's real job.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import { buildPlan } from "../view";
import { quadsOverlap, textQuad } from "./draw";
import type { SceneText } from "./scene";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const POINTS = [at("1", 500_000, 600_000), at("2", 500_012, 600_000), at("3", 500_012, 600_020), at("4", 500_000, 600_020), at("5", 499_990, 600_023.5), at("6", 500_022, 600_023.5)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;

function doc(change: (d: SurveyDocument) => void = () => {}): SurveyDocument {
  const d: SurveyDocument = {
    ...emptyDocument(),
    codes: commonCodes(),
    lots: [{ id: "lotA", label: "A", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }],
    roads: [{ id: "r1", name: "Road", edgeA: [id("4"), id("3")], edgeB: [id("5"), id("6")], width: "none", start: "From the main road", end: "To Houses" }],
    features: [{ id: "w1", layer: "WALLS", code: "MW", closed: false, points: [id("5"), id("6")] }],
  };
  change(d);
  return d;
}
const texts = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).sheet.pages[0]!.items.filter((i): i is SceneText => i.kind === "text");

describe("road names and lines' codes", () => {
  it("keep clear of each other where a wall runs along the road's far edge", () => {
    const t = texts(doc());
    const road = t.filter((x) => x.entity === "road:r1" || x.entity?.startsWith("road-dir-"));
    const wall = t.find((x) => x.entity === "feature:w1")!;
    expect(road.map((x) => x.text).sort()).toEqual(["From the main road", "Road", "To Houses"]);
    for (const r of road) expect(quadsOverlap(textQuad(r), textQuad(wall))).toBe(false);
  });

  it("stay where they always were when nothing is in the way", () => {
    const alone = texts(doc((d) => void (d.features = [])));
    const name = alone.find((x) => x.entity === "road:r1")!;
    expect(name.slot).toBe(0);
  });

  it("keep a drag measured from where it was dragged", () => {
    const moved = texts(doc((d) => void (d.labelOffsets = { "feature:w1": { dx: 3, dy: -1 } })));
    const still = texts(doc());
    const [a, b] = [moved.find((x) => x.entity === "feature:w1")!, still.find((x) => x.entity === "feature:w1")!];
    // An older drag without its place is measured from the first place, where the code was drawn before.
    expect(a.slot).toBe(0);
    expect(b.slot).not.toBe(undefined);
  });
});
