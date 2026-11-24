/**
 * Drafting as practising surveyors draft (stage 261, ADR 0269), on SYNTHETIC points: a 20 m square lot with walls along its sides.
 * Lines carried on past their ends, walls drawn once along the boundary, a wall's code written once along a straight run, outside the
 * lot, with its tick clear of the corners, wells as plain circles and an adjoining owner's words in two lines.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { compareDocuments } from "../compare";
import { emptyDocument, surveyDocumentSchema, type DrawingFeature, type SurveyDocument } from "../document";
import { writeDxf } from "../export/dxf";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { acceptDrawing } from "../sketchintel/drawing";
import { approvalHash, buildPlan } from "../view";
import { adjoiningLines, RUN_ON_MM, textQuad, wallTick } from "./draw";
import { Placer } from "./labels";

const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
const E0 = 500_000;
const N0 = 600_000;
// The lot 1-2-3-4. Wall points 5, 6 lie 0.12 m and 0.08 m inside its east side; 7 is out of line by 1 m. 8 is a well.
const POINTS = [
  at("1", E0, N0),
  at("2", E0 + 20, N0),
  at("3", E0 + 20, N0 + 20),
  at("4", E0, N0 + 20),
  at("5", E0 + 19.88, N0 + 6),
  at("6", E0 + 19.92, N0 + 14),
  at("7", E0 + 12, N0 + 8),
  at("8", E0 + 6, N0 + 14),
  at("9", E0 + 14, N0 + 20),
];
const id = (n: string) => POINTS.find((p) => p.pointId === n)!.id;
const feature = (fid: string, nums: string[], extra: Partial<DrawingFeature> = {}): DrawingFeature => ({ id: fid, layer: "WALLS", code: "MW", closed: false, points: nums.map(id), ...extra });
const doc = (features: DrawingFeature[], settings: Partial<SurveyDocument["settings"]> = {}, more: Partial<SurveyDocument> = {}): SurveyDocument =>
  surveyDocumentSchema.parse({
    ...emptyDocument(),
    codes: commonCodes(),
    lots: [{ id: "lotX", label: "X", sup: "", points: ["1", "2", "3", "4"].map(id), note: "" }],
    features,
    settings: { ...emptyDocument().settings, ...settings },
    ...more,
  });
const plan = (d: SurveyDocument) => buildPlan({ points: POINTS, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null });
const items = (d: SurveyDocument) => plan(d).sheet.pages[0]!.items;
const paths = (d: SurveyDocument, entity: string) => items(d).filter((i) => i.kind === "path" && i.entity === entity) as Extract<ReturnType<typeof items>[number], { kind: "path" }>[];
const texts = (d: SurveyDocument, entity: string) => items(d).filter((i) => i.kind === "text" && i.entity === entity) as Extract<ReturnType<typeof items>[number], { kind: "text" }>[];

describe("a line carried on past its end", () => {
  it("draws a stub of fixed paper length past the end it names, on the sheet and in the DXF", () => {
    const plain = doc([feature("w", ["4", "1"])]);
    const on = doc([feature("w", ["4", "1"], { runsOn: "end" })]);
    const stubs = paths(on, "feature:w").filter((p) => p.points.length === 2 && Math.abs(Math.hypot(p.points[1]![0] - p.points[0]![0], p.points[1]![1] - p.points[0]![1]) - RUN_ON_MM) < 1e-6);
    expect(stubs).toHaveLength(1);
    expect(paths(plain, "feature:w").some((p) => p.points.length === 2 && Math.abs(Math.hypot(p.points[1]![0] - p.points[0]![0], p.points[1]![1] - p.points[0]![1]) - RUN_ON_MM) < 1e-6)).toBe(false);
    const dxf = (d: SurveyDocument) => writeDxf({ document: d, points: POINTS, lots: computeLots(POINTS, d.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" });
    const polylines = (s: string) => s.split(/\r?\n/).filter((l) => l.trim() === "POLYLINE").length;
    expect(polylines(dxf(on))).toBe(polylines(dxf(plain)) + 1);
  });

  it("is kept from the reader for open lines only, and is absent until used so earlier approvals stand", async () => {
    const clean = (s: string, max: number) => s.trim().slice(0, max);
    const kept = acceptDrawing(
      {
        lines: [
          { image: 0, points: ["1", "2"], label: "MW", style: "double", closes: false, certain: true, runsOn: "start" },
          { image: 0, points: ["1", "2", "3"], label: "", style: "single", closes: true, certain: true, runsOn: "both" },
          { image: 0, points: ["3", "4"], label: "", style: "single", closes: false, certain: true, runsOn: "none" },
        ],
        symbols: [],
        areas: [],
      },
      ["a.jpg"],
      clean,
      () => false,
    );
    expect(kept.lines.map((l) => l.runsOn)).toEqual(["start", undefined, undefined]);
    const before = doc([feature("w", ["4", "1"])]);
    expect(Object.keys(before.features[0]!)).not.toContain("runsOn");
    const hash = (d: SurveyDocument) => approvalHash({ document: d, crsId: "LOCAL", points: POINTS });
    expect(await hash(doc([feature("w", ["4", "1"], { runsOn: "end" })]))).not.toBe(await hash(before));
    expect(compareDocuments(before, doc([feature("w", ["4", "1"], { runsOn: "end" })]), POINTS).map((c) => c.text)).toContain("1 line is drawn on past its ends differently.");
  });
});

describe("a wall along the lot's boundary", () => {
  it("is drawn once, by the boundary, keeps its code, and the checks say so", () => {
    const d = doc([feature("east", ["2", "5", "6", "3"])]);
    expect(paths(d, "feature:east")).toHaveLength(0);
    expect(texts(d, "feature:east").map((t) => t.text)).toEqual(["MW"]);
    const f = plan(d).findings.find((x) => x.code === "LINES_DRAWN_AS_BOUNDARY");
    expect(f).toMatchObject({ severity: "information", blocks: [] });
    expect(f!.detail).toContain("MW from 2 to 3");
    expect(f!.detail).toContain("0.12 m");
    // The DXF keeps it as surveyed.
    expect(writeDxf({ document: d, points: POINTS, lots: computeLots(POINTS, d.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" })).toContain("WALLS");
  });

  it("is drawn where it leaves the boundary, carried on to it", () => {
    // 2-5 runs along the east side; 5-7 leaves it.
    const d = doc([feature("w", ["2", "5", "7"])]);
    const drawn = paths(d, "feature:w");
    expect(drawn).toHaveLength(1);
    // From the boundary (x of the east side on the page) to 7: carried 0.12 m on to the side from 5.
    const plan0 = plan(doc([]));
    const side = plan0.sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && i.points[0]![0] > 0) as Extract<ReturnType<typeof items>[number], { kind: "path" }> | undefined;
    expect(side).toBeDefined();
    expect(drawn[0]!.points.length).toBe(3);
    expect(Math.abs(drawn[0]!.points[0]![0] - side!.points[0]![0])).toBeLessThan(1e-6);
  });

  it("draws a building's side along the boundary once, and its other sides as an open run", () => {
    const d = doc([{ id: "house", layer: "BUILDINGS", code: "P", closed: true, points: ["5", "6", "7"].map(id) }]);
    const drawn = paths(d, "feature:house");
    expect(drawn).toHaveLength(1);
    expect(drawn[0]!.closed).toBe(false);
    // 6, 7 and 5, each end carried on to the boundary: five points.
    expect(drawn[0]!.points).toHaveLength(5);
  });

  it("isn't changed for a line more than a wall's thickness from the boundary", () => {
    const d = doc([feature("w", ["7", "8"])]);
    expect(paths(d, "feature:w")).toHaveLength(1);
    expect(plan(d).findings.some((x) => x.code === "LINES_DRAWN_AS_BOUNDARY")).toBe(false);
  });
});

describe("a wall's code", () => {
  it("is written once along a straight run of the same wall, and on each wall that turns a corner", () => {
    // 2-5 and 5-6-3 carry straight on: one code. 3-9 turns the corner: its own.
    const d = doc([feature("a", ["2", "5"]), feature("b", ["5", "6", "3"]), feature("c", ["3", "9"])]);
    const all = [...texts(d, "feature:a"), ...texts(d, "feature:b"), ...texts(d, "feature:c")];
    expect(all.map((t) => t.entity).sort()).toEqual(["feature:b", "feature:c"]);
  });

  it("goes outside the lot along its boundary", () => {
    const d = doc([feature("east", ["2", "5", "6", "3"])]);
    const t = texts(d, "feature:east")[0]!;
    const side = plan(doc([])).sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && i.points[0]![0] > 0) as Extract<ReturnType<typeof items>[number], { kind: "path" }>;
    // East of the east side, on the page.
    expect(textQuad(t).every(([x]) => x > side.points[0]![0])).toBe(true);
  });

  it("goes outside an L-shaped lot's arm, though the lot's label is on that side of the arm's line", () => {
    // The main body 0-12 by 0-10 and an arm 9-12 up to 20; the wall runs up the arm's west side (outside is west).
    const L = [at("a", E0, N0), at("b", E0 + 12, N0), at("c", E0 + 12, N0 + 20), at("d", E0 + 9, N0 + 20), at("e", E0 + 9, N0 + 10), at("f", E0, N0 + 10)];
    const lid = (n: string) => L.find((p) => p.pointId === n)!.id;
    const d = surveyDocumentSchema.parse({
      ...emptyDocument(),
      codes: commonCodes(),
      lots: [{ id: "lotL", label: "L", sup: "", points: ["a", "b", "c", "d", "e", "f"].map(lid), note: "" }],
      features: [{ id: "arm", layer: "WALLS", code: "MW", closed: false, points: ["e", "d"].map(lid) }],
    });
    const its = buildPlan({ points: L, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).sheet.pages[0]!.items;
    const t = its.find((i) => i.kind === "text" && i.entity === "feature:arm") as Extract<(typeof its)[number], { kind: "text" }>;
    const side = its.find((i) => i.kind === "path" && i.entity === "lot:lotL" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && Math.abs(i.points[0]![1] - i.points[1]![1]) > 30) as Extract<(typeof its)[number], { kind: "path" }>;
    // The arm's west side is the shorter of the two long verticals, nearer the middle of the page: its x is the larger of the left ones.
    const xs = its.filter((i): i is Extract<(typeof its)[number], { kind: "path" }> => i.kind === "path" && i.entity === "lot:lotL" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6).map((p) => p.points[0]![0]);
    expect(side).toBeDefined();
    const armX = [...new Set(xs)].sort((a, b) => a - b)[1]!;
    expect(textQuad(t).every(([x]) => x < armX)).toBe(true);
  });

  it("goes outside at a large scale whichever way the wall was drawn, though the wall lies 0.2 m inside the boundary", () => {
    // Review of stage 261: tested off the wall's own line, both sides of a wall 2 mm inside on paper were in the lot.
    const inner = [at("21", E0 + 19.8, N0 + 3), at("22", E0 + 19.8, N0 + 17)];
    const pts = [...POINTS, ...inner];
    const wid = (n: string) => pts.find((p) => p.pointId === n)!.id;
    for (const order of [["21", "22"], ["22", "21"]]) {
      const d = surveyDocumentSchema.parse({ ...doc([]), features: [{ id: "east", layer: "WALLS", code: "MW", closed: false, points: order.map(wid) }], settings: { ...emptyDocument().settings, scale: 200 } });
      const its = buildPlan({ points: pts, document: d, crsId: "LOCAL", crsConfirmation: "Confirmed for this test", surveyor: null, approval: null }).sheet.pages[0]!.items;
      const t = its.find((i) => i.kind === "text" && i.entity === "feature:east") as Extract<(typeof its)[number], { kind: "text" }>;
      const xs = its.filter((i): i is Extract<(typeof its)[number], { kind: "path" }> => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6).map((p) => p.points[0]![0]);
      expect(textQuad(t).every(([x]) => x > Math.max(...xs))).toBe(true);
    }
  });

  it("keeps a code the surveyor dragged where it was, counted from the places as they were before", () => {
    const plainPlan = items(doc([feature("east", ["2", "5", "6", "3"])]));
    const moved = doc([feature("east", ["2", "5", "6", "3"])], {}, { labelOffsets: { "feature:east": { dx: 0, dy: 0 } } });
    const t0 = plainPlan.find((i) => i.kind === "text" && i.entity === "feature:east") as Extract<ReturnType<typeof items>[number], { kind: "text" }>;
    const t1 = texts(moved, "feature:east")[0]!;
    // An older drag (no saved place) is measured from the first place as it was counted before: the lot's side, here inside.
    const side = plan(doc([])).sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && i.points[0]![0] > 0) as Extract<ReturnType<typeof items>[number], { kind: "path" }>;
    expect(textQuad(t1).every(([x]) => x < side.points[0]![0])).toBe(true);
    expect(textQuad(t0).every(([x]) => x > side.points[0]![0])).toBe(true);
  });

  it("puts the tick on the boundary's line where the wall is drawn as it, and moves it with a dragged code", () => {
    const d = doc([feature("east", ["5", "6"])], { wallTicks: true });
    const tick = paths(d, "feature:east").find((p) => p.points.length === 9)!;
    const side = plan(doc([])).sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && i.points[0]![0] > 0) as Extract<ReturnType<typeof items>[number], { kind: "path" }>;
    expect(tick.points[4]![0]).toBeCloseTo(side.points[0]![0], 6);
    const draggedDoc = doc([feature("east", ["5", "6"])], { wallTicks: true }, { labelOffsets: { "feature:east": { dx: 0, dy: -3, slot: 0 } } });
    const moved = paths(draggedDoc, "feature:east").find((p) => p.points.length === 9)!;
    expect(Math.abs(moved.points[4]![1] - tick.points[4]![1] - -3)).toBeLessThan(0.5);
  });

  it("carries on from the boundary when the line's end leg is drawn as it", () => {
    const d = doc([feature("east", ["5", "6"], { runsOn: "end" })]);
    const stub = paths(d, "feature:east").find((p) => p.points.length === 2)!;
    const side = plan(doc([])).sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && i.points[0]![0] > 0) as Extract<ReturnType<typeof items>[number], { kind: "path" }>;
    expect(stub.points[0]![0]).toBeCloseTo(side.points[0]![0], 6);
    expect(stub.points[1]![0]).toBeCloseTo(side.points[0]![0], 6);
  });

  it("leaves a dashed line, a drain, and a lot missing a point out of it", () => {
    expect(paths(doc([feature("east", ["2", "5", "6", "3"], { dashed: true })]), "feature:east")).toHaveLength(1);
    expect(paths(doc([feature("east", ["2", "5", "6", "3"], { layer: "DRAINS", code: "" })]), "feature:east")).toHaveLength(1);
    const broken = surveyDocumentSchema.parse({ ...doc([feature("east", ["2", "5", "6", "3"])]), lots: [{ id: "lotX", label: "X", sup: "", points: [id("1"), id("2"), id("3"), id("4"), "00000000-0000-4000-8000-0000000000ff"], note: "" }] });
    expect(paths(broken, "feature:east")).toHaveLength(1);
  });

  it("carries a small tick across the wall, clear of the leg's ends, when the sheet asks for it", () => {
    const d = doc([feature("east", ["2", "3"])], { wallTicks: true });
    const tick = paths(d, "feature:east").find((p) => p.points.length === 9);
    expect(tick).toBeDefined();
    const ends = plan(d).sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "lot:lotX" && i.points.length === 2 && Math.abs(i.points[0]![0] - i.points[1]![0]) < 1e-6 && i.points[0]![0] > 0) as Extract<ReturnType<typeof items>[number], { kind: "path" }>;
    const ys = [ends.points[0]![1], ends.points[1]![1]];
    const mid = tick!.points[4]!;
    expect(Math.min(...ys.map((y) => Math.abs(mid[1] - y)))).toBeGreaterThan(1.2);
  });

  it("draws the tick as an S about a fifth taller than the code's capitals", () => {
    const pts = wallTick(0, 0, 1, 0, 2);
    expect(pts).toHaveLength(9);
    const ys = pts.map(([, y]) => y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(2, 6);
    expect(pts[4]).toEqual([0, 0]);
  });
});

describe("the label solver's preference", () => {
  const sq = (x: number): [number, number][] => [[x, 0], [x + 1, 0], [x + 1, 1], [x, 1]];
  it("tries places in the order given, while their numbers, which dragged labels count in, stay as they were", () => {
    expect(new Placer().choose("a", [[sq(0)], [sq(10)], [sq(20)]], { order: [2, 0, 1] })).toBe(2);
    const busy = new Placer();
    busy.add(sq(20));
    expect(busy.choose("a", [[sq(0)], [sq(10)], [sq(20)]], { order: [2, 0, 1] })).toBe(0);
    // A dragged label's saved place is a number, whatever the preference.
    expect(new Placer().choose("a", [[sq(0)], [sq(10)], [sq(20)]], { order: [2, 0, 1], slot: 1, pinned: true })).toBe(1);
    // Numbers the order leaves out come after it; ones out of range are dropped.
    expect(new Placer().choose("a", [[sq(0)], [sq(10)], [sq(20)]], { order: [7, 1] })).toBe(1);
  });
});

describe("symbols and owners' words", () => {
  it("draws a well as a plain circle, and other symbols with a cross", () => {
    const d = doc([], {}, { symbols: [{ id: "w1", code: "Well", point: id("8") }] });
    const entry = commonCodes().find((c) => c.code === "Well");
    expect(entry?.kind).toBe("symbol");
    const its = items(d).filter((i) => i.entity === `pt:${id("8")}`);
    expect(its.some((i) => i.kind === "circle")).toBe(true);
    expect(its.some((i) => i.kind === "path")).toBe(false);
  });

  it("letters 'Land claimed by' on its own line above the owner's name", () => {
    expect(adjoiningLines("Land claimed by A. B. Perera", 2.08)).toEqual(["Land claimed by", "A. B. Perera"]);
    expect(adjoiningLines("Road", 2.08)).toEqual(["Road"]);
  });
});
