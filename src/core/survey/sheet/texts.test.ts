/**
 * Words the surveyor writes on the plan, and a symbol given to a point (stage 255, ADR 0263), on SYNTHETIC points: a 20 m square lot with
 * a gate side and a post outside it.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { writeDxf } from "../export/dxf";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { compareDocuments } from "../compare";
import { approvalHash, buildPlan } from "../view";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const POINTS = [at("1", 500_000, 600_000), at("2", 500_020, 600_000), at("3", 500_020, 600_020), at("4", 500_000, 600_020), at("5", 500_010, 600_026)];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;

function doc(change: (d: SurveyDocument) => void = () => {}): SurveyDocument {
  const d: SurveyDocument = { ...emptyDocument(), codes: commonCodes(), lots: [{ id: "lotA", label: "A", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }] };
  change(d);
  return d;
}
const plan = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null });
const texts = (d: SurveyDocument) => plan(d).sheet.pages[0]!.items.filter((i) => i.kind === "text" && i.entity?.startsWith("text:"));

describe("words on the plan", () => {
  it("are written along the line between two points, turned with it and outside the lot, or level beside one point", () => {
    const d = doc((x) => void (x.texts = [{ id: "t1", text: "Gate", at: id("3"), along: id("4") }, { id: "t2", text: "Proposed Drain", at: id("5") }, { id: "t3", text: "Drain", at: id("2"), along: id("3") }]));
    expect(surveyDocumentSchema.safeParse(d).success).toBe(true);
    const [gate, drain, east] = texts(d);
    expect(gate).toMatchObject({ text: "Gate", rotate: 0, layer: "TEXT", entity: "text:t1" });
    expect(drain).toMatchObject({ text: "Proposed Drain", rotate: 0, entity: "text:t2" });
    // Side 2 to 3 runs up the page: the words are turned a quarter round to read along it.
    expect(east?.kind === "text" && Math.abs(east.rotate)).toBe(90);
    // Outside the lot: above the north side (3 to 4) on the page, and right of the east side (2 to 3).
    const corner = (n: string) => plan(d).sheet.pages[0]!.items.find((i) => i.kind === "circle" && i.entity === `pt:${id(n)}`);
    const [c3, c2] = [corner("3"), corner("2")];
    expect(gate?.kind === "text" && c3?.kind === "circle" && gate.y < c3.cy).toBe(true);
    expect(east?.kind === "text" && c2?.kind === "circle" && east.x > c2.cx).toBe(true);
  });

  it("leave the approval of a plan without them unchanged, and show in a comparison of versions", async () => {
    const before = doc();
    const hash = (d: SurveyDocument) => approvalHash({ document: surveyDocumentSchema.parse(d), crsId: "LOCAL", points: POINTS });
    expect(await hash(before)).toBe(await hash(JSON.parse(JSON.stringify(before)) as SurveyDocument));
    expect("texts" in surveyDocumentSchema.parse(before)).toBe(false);
    const after = doc((x) => {
      x.texts = [{ id: "t1", text: "Gate", at: id("3"), along: id("4") }];
      x.symbols = [{ id: "s1", code: "EP", point: id("5") }];
    });
    expect(await hash(after)).not.toBe(await hash(before));
    expect(compareDocuments(before, after, POINTS).filter((c) => c.area === "Words and symbols").map((c) => c.text)).toEqual(['"Gate" added, along 3 to 4.', "Point 5 is drawn as EP."]);
  });

  it("move only on paper when dragged, and hide with the Text layer", () => {
    const d = doc((x) => void (x.texts = [{ id: "t1", text: "Gate", at: id("3"), along: id("4") }]));
    const before = texts(d)[0]!;
    const moved = texts({ ...d, labelOffsets: { "text:t1": { dx: 5, dy: -2 } } })[0]!;
    expect(moved.kind === "text" && before.kind === "text" && [moved.x - before.x, moved.y - before.y]).toEqual([5, -2]);
    expect(texts({ ...d, layers: { ...d.layers, TEXT: { visible: false, locked: false } } })).toEqual([]);
  });

  it("are written to the DXF on the Text layer, turned with their line", () => {
    const d = doc((x) => void (x.texts = [{ id: "t1", text: "Gate", at: id("2"), along: id("3") }]));
    const dxf = writeDxf({ document: d, points: POINTS, lots: computeLots(POINTS, d.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" }).split("\r\n");
    const k = dxf.findIndex((x, i) => x === "Gate" && dxf[i - 1] === "1");
    expect(k).toBeGreaterThan(0);
    const entity = dxf.slice(dxf.lastIndexOf("TEXT", k), k + 12);
    expect(entity[entity.indexOf("8") + 1]).toBe("TEXT");
    // Side 2 to 3 runs north: the words are turned a quarter round to read along it.
    expect(Number(entity[entity.indexOf("50") + 1])).toBeCloseTo(90, 6);
  });

  it("are refused by the plan past its limit or with nothing to say", () => {
    expect(surveyDocumentSchema.safeParse(doc((x) => void (x.texts = [{ id: "t1", text: "", at: id("3") }]))).success).toBe(false);
    expect(surveyDocumentSchema.safeParse(doc((x) => void (x.texts = Array.from({ length: 101 }, (_, i) => ({ id: `t${i}`, text: "x", at: id("3") }))))).success).toBe(false);
  });
});

describe("a symbol given to a point", () => {
  it("isn't listed in the Reference at a lot's corner, where it isn't drawn", () => {
    const d = doc((x) => void (x.symbols = [{ id: "s1", code: "EP", point: id("1") }]));
    expect(plan(d).sheet.pages[0]!.items.some((i) => i.kind === "text" && i.text === "Electric Post")).toBe(false);
  });

  it("draws the point as that mark and lists it in the Reference, the point unchanged", () => {
    const d = doc((x) => void (x.symbols = [{ id: "s1", code: "EP", point: id("5") }]));
    const items = plan(d).sheet.pages[0]!.items;
    expect(items.some((i) => i.kind === "text" && i.entity === `mark:${id("5")}` && i.text === "EP")).toBe(true);
    expect(items.some((i) => i.kind === "text" && i.text === "Electric Post")).toBe(true);
    expect(POINTS.find((p) => p.pointId === "5")!.code).toBeNull();
  });
});
