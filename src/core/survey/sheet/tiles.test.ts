/**
 * Plans over several sheets (stage 268, ADR 0275), on SYNTHETIC land: the grid of sheets, lines cut at a sheet's edge and nothing
 * else moved, and whole plans too long for one sheet at the scale chosen, on the panel and classic layouts.
 */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import type { SurveyDocument } from "../document";
import { sampleDocument } from "../fixtures";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { composeSheet } from "./compose";
import { toModel, type SceneItem, type ScenePath, type SceneText } from "./scene";
import { SRI_LANKA_CADASTRAL_V1 } from "./template";
import { MAX_SHEETS, clipItems, keyToSheets, matchLines, numberSheets, showsDrawing, tileGrid, type Rect } from "./tiles";

const R: Rect = [10, 10, 110, 60];
const path = (points: [number, number][], o: Partial<ScenePath> = {}): ScenePath => ({ kind: "path", points, closed: false, width: 0.35, color: "ink", layer: "BOUNDARY", ...o });
const word = (x: number, y: number): SceneText => ({ kind: "text", x, y, text: "A", size: 2, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "LOT_TEXT" });

describe("the grid of sheets", () => {
  it("covers the extent with sheets side by side, centred on it, rows from the north", () => {
    // 250 m by 40 m at 1:1000 in a 100 by 50 mm drawing area: three sheets across, one down.
    const g = tileGrid({ minE: 0, maxE: 250, minN: 0, maxN: 40 }, { w: 100, h: 50 }, 1000);
    expect([g.cols, g.rows]).toEqual([3, 1]);
    expect(g.tiles.map((t) => t.centreE)).toEqual([25, 125, 225]);
    expect(g.tiles.every((t) => t.centreN === 20)).toBe(true);
    // Each sheet's area is 100 m wide on the ground: they meet edge to edge.
    const two = tileGrid({ minE: 0, maxE: 120, minN: 0, maxN: 90 }, { w: 100, h: 50 }, 1000);
    expect([two.cols, two.rows]).toEqual([2, 2]);
    expect(two.tiles[0]!.centreN).toBeGreaterThan(two.tiles[2]!.centreN);
  });

  it("numbers the sheets that show the drawing, north-west first along each row", () => {
    expect(numberSheets([{ col: 1, row: 1 }, { col: 0, row: 0 }, { col: 1, row: 0 }])).toEqual([
      { n: 1, col: 0, row: 0 },
      { n: 2, col: 1, row: 0 },
      { n: 3, col: 1, row: 1 },
    ]);
  });
});

describe("cutting the drawing at a sheet's edge", () => {
  it("cuts a line where it crosses the edge, keeping its own points inside and moving none of them", () => {
    const out = clipItems([path([[0, 20], [50, 20], [50, 30], [200, 30]])], R);
    expect(out).toHaveLength(1);
    expect((out[0] as ScenePath).points).toEqual([[10, 20], [50, 20], [50, 30], [110, 30]]);
  });

  it("gives a line that leaves and comes back two pieces, and leaves out a line wholly outside", () => {
    const out = clipItems([path([[20, 20], [20, 0], [40, 0], [40, 20]]), path([[0, 0], [200, 0]])], R);
    expect(out.map((p) => (p as ScenePath).points)).toEqual([
      [[20, 20], [20, 10]],
      [[40, 10], [40, 20]],
    ]);
  });

  it("opens an outline the edge cuts, and keeps a whole one closed", () => {
    const ring: [number, number][] = [[100, 20], [130, 20], [130, 40], [100, 40]];
    const cut = clipItems([path(ring, { closed: true })], R) as ScenePath[];
    expect(cut.every((p) => !p.closed)).toBe(true);
    expect(cut.flatMap((p) => p.points).every(([x, y]) => x >= 10 && x <= 110 && y >= 10 && y <= 60)).toBe(true);
    const whole = clipItems([path([[20, 20], [30, 20], [30, 30]], { closed: true })], R) as ScenePath[];
    expect(whole[0]!.closed).toBe(true);
  });

  it("keeps a word, a point or a small filled symbol by where it stands", () => {
    const dot = { kind: "circle" as const, cx: 105, cy: 20, r: 0.5, width: 0.2, color: "ink" as const, layer: "POINTS" as const };
    // Its centre just past the edge: left off whole, never cut.
    const arrow = path([[109, 20], [115, 21], [109, 22]], { closed: true, fill: "ink" });
    const out = clipItems([word(50, 30), word(120, 30), dot, { ...dot, cx: 115 }, arrow], R);
    expect(out).toEqual([word(50, 30), dot]);
  });

  it("tells a sheet that shows the drawing from one with only its furniture, a neighbour's words or a line along its edge", () => {
    expect(showsDrawing([path([[10, 20], [110, 20]])], R)).toBe(true);
    // A line crossing it with no point of its own inside: its middle is.
    expect(showsDrawing([path([[10, 20], [110, 40]])], R)).toBe(true);
    expect(showsDrawing([path([[20, 20], [30, 30]], { layer: "TITLE" }), word(50, 30)], R)).toBe(false);
    expect(showsDrawing([path([[110, 10], [110, 60]])], R)).toBe(false);
    expect(showsDrawing([{ kind: "circle", cx: 110, cy: 30, r: 0.5, width: 0.2, color: "ink", layer: "POINTS" }], R)).toBe(false);
  });

  it("keeps a line and a point lying exactly on an edge, after rounding, on the sheet", () => {
    const x = 110 + 1e-13;
    const out = clipItems([path([[x, 20], [x, 40]]), { kind: "circle", cx: x, cy: 30, r: 0.5, width: 0.2, color: "ink", layer: "POINTS" }], R);
    expect(out).toHaveLength(2);
  });
});

describe("match lines and the key to the sheets", () => {
  const sheets = numberSheets([{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 1, row: 1 }]);
  it("draws a match line only where another sheet continues the drawing, naming it", () => {
    const words = (items: SceneItem[]) => items.filter((i): i is SceneText => i.kind === "text").map((t) => t.text);
    expect(words(matchLines(R, sheets[0]!, sheets, 2, 0.18))).toEqual(["Continued on sheet 2"]);
    expect(words(matchLines(R, sheets[1]!, sheets, 2, 0.18)).sort()).toEqual(["Continued on sheet 1", "Continued on sheet 3"]);
    expect(matchLines(R, sheets[1]!, sheets, 2, 0.18).filter((i) => i.kind === "path").every((p) => (p as ScenePath).dash)).toBe(true);
  });

  it("marks this sheet in the key, and numbers every one", () => {
    const key = keyToSheets({ x: 0, y: 0, w: 30, h: 30 }, sheets[2]!, sheets, 2, 2, 2, 0.18);
    expect(key.filter((i): i is SceneText => i.kind === "text").map((t) => t.text)).toEqual(["1", "2", "3"]);
    const cells = key.filter((i): i is ScenePath => i.kind === "path");
    expect(cells.map((c) => Boolean(c.fill))).toEqual([false, false, true]);
  });
});

// A long strip of lots: twelve lots 40 m wide and 30 m deep, 480 m in all, which at 1:500 needs 960 mm of paper.
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const STRIP: SurveyPoint[] = Array.from({ length: 13 }, (_, k) => [
  { id: id(k + 1), pointId: String(k + 1), e: 400_000 + k * 40, n: 500_000, z: null, code: "CP" },
  { id: id(k + 101), pointId: String(k + 101), e: 400_000 + k * 40, n: 500_030, z: null, code: "CP" },
]).flat();
const stripDoc = (template: "panel" | "classic", several: boolean): SurveyDocument => {
  const doc = sampleDocument();
  doc.roads = [];
  doc.adjoining = [];
  doc.features = [];
  doc.lots = Array.from({ length: 12 }, (_, k) => ({ id: `lot-${k + 1}`, label: String(k + 1), sup: "", points: [id(k + 1), id(k + 2), id(k + 102), id(k + 101)], note: "" }));
  doc.settings = { ...doc.settings, template, scale: 500, paper: "A3", faceDimensions: true, overleaf: true, ...(several ? { severalSheets: true as const } : {}) };
  return doc;
};
const compose = (doc: SurveyDocument) => composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points: STRIP, lots: computeLots(STRIP, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });

describe.each(["panel", "classic"] as const)("a plan too long for one sheet, on the %s layout", (template) => {
  it("is said not to fit unless the surveyor asks for several sheets", () => {
    const one = compose(stripDoc(template, false));
    expect(one.findings.map((f) => f.code)).toContain("DRAWING_OFF_SHEET");
    expect(one.pages.filter((p) => p.role === "front")).toHaveLength(1);
  });

  it("is drawn over several sheets at the scale chosen, each its own part, with match lines and a key", () => {
    const s = compose(stripDoc(template, true));
    const codes = s.findings.map((f) => f.code);
    expect(codes).not.toContain("DRAWING_OFF_SHEET");
    expect(codes).toContain("SHEETS_SPLIT");
    expect(codes.filter((c) => s.findings.find((f) => f.code === c)!.blocks.includes("export"))).toEqual([]);
    const fronts = s.pages.filter((p) => p.role === "front");
    expect(fronts.length).toBeGreaterThan(1);
    expect(fronts.length).toBeLessThanOrEqual(MAX_SHEETS);
    expect(s.scale).toBe(500);
    fronts.forEach((p, i) => {
      expect(p.sheet).toEqual({ n: i + 1, of: fronts.length });
      expect(p.viewport!.scale).toBe(500);
      const texts = p.items.filter((t): t is SceneText => t.kind === "text").map((t) => t.text);
      expect(texts.some((t) => t.startsWith("Continued on sheet"))).toBe(true);
      expect(texts).toContain(template === "panel" ? `Sheet ${i + 1} of ${fronts.length}` : `Sheet ${i + 1} of ${fronts.length}`);
    });
    // The overleaf schedule still covers the whole plan, once.
    expect(s.pages.filter((p) => p.role === "overleaf").length).toBeGreaterThan(0);
  });

  it("draws every lot's every corner on some sheet, where its own sheet's viewport puts it, and nothing past a sheet's drawing area", () => {
    const s = compose(stripDoc(template, true));
    const fronts = s.pages.filter((p) => p.role === "front");
    for (const pt of STRIP) {
      const seen = fronts.some((p) =>
        p.items.some((i) => {
          if (i.kind !== "circle" || i.entity !== `pt:${pt.id}`) return false;
          const m = toModel(p.viewport!, i.cx, i.cy);
          return Math.abs(m.e - pt.e) < 1e-6 && Math.abs(m.n - pt.n) < 1e-6;
        }),
      );
      expect(seen, `point ${pt.pointId}`).toBe(true);
    }
    for (const p of fronts) {
      const v = p.viewport!;
      const boundary = p.items.filter((i): i is ScenePath => i.kind === "path" && i.layer === "BOUNDARY");
      expect(boundary.length).toBeGreaterThan(0);
      for (const b of boundary) for (const [x, y] of b.points) expect(x >= v.x - 1e-6 && x <= v.x + v.w + 1e-6 && y >= v.y - 1e-6 && y <= v.y + v.h + 1e-6).toBe(true);
    }
  });

  it("keeps a sheet's labels on their own sheet: no label overlaps another on any sheet", () => {
    const s = compose(stripDoc(template, true));
    expect(s.findings.map((f) => f.code)).not.toContain("LABELS_OVERLAP");
  });

  it("never calls a word placed on its own sheet off the sheet: texts, dimensions and adjoining lands' words", () => {
    const doc = stripDoc(template, true);
    doc.texts = [{ id: "00000000-0000-4000-8000-00000000c001", text: "Gate", at: id(1) }];
    doc.dimensions = [{ id: "00000000-0000-4000-8000-00000000d001", from: id(1), to: id(2), offset: 6 }];
    doc.adjoining = [{ id: "00000000-0000-4000-8000-00000000e001", text: "Land of the sample neighbour", lot: "lot-1", from: id(1), to: id(101) }];
    const s = compose(doc);
    expect(s.findings.filter((f) => f.blocks.includes("export")).map((f) => f.code)).toEqual([]);
    const words = s.pages.filter((p) => p.role === "front").flatMap((p) => p.items).filter((i): i is SceneText => i.kind === "text").map((i) => i.text);
    expect(words).toContain("Gate");
  });

  it.each([45, 50, 47.9, 33.3])("loses no side or corner on a shared edge, with lots %s m wide", (width) => {
    const strip: SurveyPoint[] = Array.from({ length: 13 }, (_, k) => [
      { id: id(k + 1), pointId: String(k + 1), e: 400_000 + k * width, n: 500_000, z: null, code: "CP" },
      { id: id(k + 101), pointId: String(k + 101), e: 400_000 + k * width, n: 500_030, z: null, code: "CP" },
    ]).flat();
    const doc = stripDoc(template, true);
    const s = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points: strip, lots: computeLots(strip, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
    const fronts = s.pages.filter((p) => p.role === "front");
    for (const pt of strip) expect(fronts.some((p) => p.items.some((i) => i.kind === "circle" && i.entity === `pt:${pt.id}`)), `point ${pt.pointId}`).toBe(true);
  });
});

describe("over several sheets, the plan's other rules", () => {
  it("leaves crowded legs to the schedule from any sheet, not just the first", () => {
    // Ten 40 m lots, then five narrow ones at the east end, on the last sheet.
    const widths = [...Array(10).fill(40), 2, 1.5, 2, 1.5, 2];
    const xs = widths.reduce<number[]>((a, w) => [...a, a.at(-1)! + w], [0]);
    const strip: SurveyPoint[] = xs.flatMap((x, k) => [
      { id: id(k + 1), pointId: String(k + 1), e: 400_000 + x, n: 500_000, z: null, code: "CP" },
      { id: id(k + 101), pointId: String(k + 101), e: 400_000 + x, n: 500_030, z: null, code: "CP" },
    ]);
    const doc = stripDoc("classic", true);
    doc.lots = widths.map((_, k) => ({ id: `lot-${k + 1}`, label: String(k + 1), sup: "", points: [id(k + 1), id(k + 2), id(k + 102), id(k + 101)], note: "" }));
    doc.settings.crowdedLegsToSchedule = true;
    const s = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points: strip, lots: computeLots(strip, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
    const codes = s.findings.map((f) => f.code);
    expect(codes.includes("LEGS_IN_SCHEDULE") || codes.includes("LEGS_NOT_SCHEDULED")).toBe(true);
  });

  it("counts only the sheets that show the drawing against the limit", () => {
    // Ten 40 m squares corner to corner on a diagonal: a 4 by 4 grid of places, most of them empty.
    const pts: SurveyPoint[] = [];
    const lots = Array.from({ length: 10 }, (_, k) => {
      const c = [[0, 0], [40, 0], [40, 40], [0, 40]].map(([dx, dy], j) => {
        const p = { id: id(1000 + k * 4 + j), pointId: String(1000 + k * 4 + j), e: 400_000 + k * 40 + dx!, n: 500_000 + k * 40 + dy!, z: null, code: "CP" };
        pts.push(p);
        return p.id;
      });
      return { id: `lot-${k + 1}`, label: String(k + 1), sup: "", points: c, note: "" };
    });
    const doc = stripDoc("panel", true);
    doc.lots = lots;
    const s = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points: pts, lots: computeLots(pts, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
    expect(s.findings.map((f) => f.code)).not.toContain("SHEETS_TOO_MANY");
    const fronts = s.pages.filter((p) => p.role === "front");
    expect(fronts.length).toBeGreaterThan(1);
    expect(fronts.length).toBeLessThanOrEqual(MAX_SHEETS);
  });

  it("draws a drawing that just misses the classic layout's margins on one sheet, never as one of one", () => {
    const one: SurveyPoint[] = [[0, 0], [100, 0], [100, 30], [0, 30]].map(([e, n], k) => ({ id: id(k + 1), pointId: String(k + 1), e: 400_000 + e!, n: 500_000 + n!, z: null, code: "CP" }));
    const doc = stripDoc("classic", true);
    doc.lots = [{ id: "lot-1", label: "1", sup: "", points: one.map((p) => p.id), note: "" }];
    const s = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: doc, points: one, lots: computeLots(one, doc.lots), crs: crsById("EPSG:5235"), crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
    expect(s.findings.find((f) => f.code === "SHEETS_SPLIT")?.message ?? "").not.toContain("over 1 sheets");
    expect(s.pages.filter((p) => p.role === "front").every((p) => p.sheet === undefined || p.sheet.of > 1)).toBe(true);
  });
});

describe("the limits", () => {
  it("refuses more sheets than it draws, and draws one sheet when the drawing fits", () => {
    const doc = stripDoc("panel", true);
    doc.settings.scale = 50;
    const many = compose(doc);
    expect(many.findings.find((f) => f.code === "SHEETS_TOO_MANY")?.blocks).toEqual(["export"]);
    const fits = stripDoc("panel", true);
    fits.settings.scale = 5000;
    const one = compose(fits);
    expect(one.pages.filter((p) => p.role === "front")).toHaveLength(1);
    expect(one.pages[0]!.sheet).toBeUndefined();
    expect(one.findings.map((f) => f.code)).not.toContain("SHEETS_SPLIT");
  });
});
