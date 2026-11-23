/**
 * Curves on the plan (stage 239, ADR 0247): a wall coded PC to PT, drawn on the sheet, written to the DXF as true arcs, and checked.
 * The wall's points are SYNTHETIC, on a circle beside Farbaek's sample land.
 */
import DxfParser from "dxf-parser";
import { describe, expect, it } from "vitest";
import { autoDraft } from "./autodraft";
import { compareDocuments } from "./compare";
import { crsById } from "./crs";
import { surveyDocumentSchema, type SurveyDocument } from "./document";
import { writeDxf } from "./export/dxf";
import { SAMPLE_POINTS, sampleDocument } from "./fixtures";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { drawnExtent, drawnPoints } from "./sheet/compose";
import { toPage, type ScenePath } from "./sheet/scene";
import { approvalHash, buildPlan } from "./view";

const centre = { e: 500_025, n: 600_030 };
const R = 25;
const angles = [30, 60, 90, 120, 150];
const wall: SurveyPoint[] = angles.map((deg, i) => ({
  id: `00000000-0000-4000-8000-0000000009${String(i).padStart(2, "0")}`,
  pointId: `9${i}`,
  e: centre.e + R * Math.cos((deg * Math.PI) / 180),
  n: centre.n + R * Math.sin((deg * Math.PI) / 180),
  z: null,
  code: "MW",
}));
const points = [...SAMPLE_POINTS, ...wall];

function withCurve(pts: readonly SurveyPoint[] = wall): SurveyDocument {
  const doc = sampleDocument();
  doc.features.push({ id: "f-curve", layer: "WALLS", code: "MW", closed: false, points: pts.map((p) => p.id), arcs: [{ from: 0, to: pts.length - 1 }] });
  return doc;
}
const plan = (doc: SurveyDocument, pts = points) => buildPlan({ points: pts, document: doc, crsId: "EPSG:5235", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
const curvePath = (doc: SurveyDocument, pts = points) => {
  const view = plan(doc, pts);
  const path = view.sheet.pages[0]!.items.find((i): i is ScenePath => i.kind === "path" && i.entity === "feature:f-curve")!;
  return { view, path };
};

describe("a curve on the plan", () => {
  it("is drawn through every surveyed point, with chords on the circle, at the plan's scale", () => {
    const { view, path } = curvePath(withCurve());
    const v = view.sheet.viewport!;
    expect(path.points.length).toBeGreaterThan(wall.length);
    const [cx, cy] = toPage(v, centre.e, centre.n);
    const rPage = (R * 1000) / v.scale;
    for (const [x, y] of path.points) expect(Math.hypot(x - cx, y - cy)).toBeCloseTo(rPage, 6);
    for (const p of wall) {
      const [x, y] = toPage(v, p.e, p.n);
      expect(path.points.some(([px, py]) => Math.hypot(px - x, py - y) < 1e-9)).toBe(true);
    }
    expect(view.findings.find((f) => f.code === "CURVE_DRAWN_STRAIGHT")).toBeUndefined();
  });

  it("is written to the DXF as true arcs: a bulge on each curved vertex, read back by an independent parser", () => {
    const doc = withCurve();
    const dxf = writeDxf({ document: doc, points, lots: computeLots(points, doc.lots), crs: crsById("EPSG:5235"), scale: 500, projectName: "Sample", status: "DRAFT (synthetic test)" });
    const parsed = new DxfParser().parseSync(dxf)!;
    const walls = parsed.entities.filter((e) => e.type === "POLYLINE" && e.layer === "WALLS") as unknown as { vertices: { x: number; y: number; bulge?: number }[] }[];
    const curve = walls.find((w) => w.vertices.length === wall.length)!;
    const quarter = Math.tan(((30 * Math.PI) / 180) / 4);
    expect(curve.vertices.slice(0, -1).map((x) => x.bulge)).toEqual(angles.slice(0, -1).map(() => expect.closeTo(quarter, 8)));
    expect(curve.vertices.at(-1)!.bulge ?? 0).toBe(0);
    curve.vertices.forEach((x, i) => expect(Math.hypot(x.x - wall[i]!.e, x.y - wall[i]!.n)).toBeLessThan(0.0001));
  });

  it("is drawn straight, and said, when its points no longer make one", () => {
    // The same wall's middle point moved 10 cm off the circle (as if re-imported): the curve can't pass through every point.
    const moved = wall.map((p, i) => (i === 1 ? { ...p, e: p.e + 0.1 } : p));
    const { view, path } = curvePath(withCurve(moved), [...SAMPLE_POINTS, ...moved]);
    expect(path.points).toHaveLength(moved.length);
    expect(view.findings.find((f) => f.code === "CURVE_DRAWN_STRAIGHT")).toMatchObject({ severity: "warning", blocks: [], message: expect.stringContaining("A curve on the MW line is drawn as straight segments: its points don't lie on one circle") });
  });

  // After the stage 239 review.
  it("turns a plan's straight line into its curve when drawn again, to be looked at, and the comparison before approval says so", () => {
    const coded = wall.map((p, i) => ({ ...p, code: i === 0 ? "MW BEG PC" : i === wall.length - 1 ? "MW PT END" : "MW" }));
    const doc = sampleDocument();
    doc.grammar = "carlson";
    doc.features.push({ id: "f-straight", layer: "WALLS", code: "MW", closed: false, points: coded.map((p) => p.id) });
    const r = autoDraft({ points: [...SAMPLE_POINTS, ...coded], document: doc, surveyorUserId: null });
    const line = r.document.features.find((f) => f.id === "f-straight")!;
    expect(line.arcs).toEqual([{ from: 0, to: 4 }]);
    expect(r.document.provenance["feature:f-straight"]).toEqual({ source: "auto", reviewed: false });
    expect(r.drawn).toContain("The masonry wall line through points 90, 91, 92, 93, 94 is now drawn as the curve through its points.");
    expect(compareDocuments(doc, r.document, [...SAMPLE_POINTS, ...coded]).map((c) => c.text)).toContain("1 line is drawn with different curves through the same points.");
  });

  it("fits the sheet and the DXF's extent to a curve that bulges past its points", () => {
    // Three points at 315°, 45° and 135° on a 20 m circle east of the land: between the first two the curve runs 5.9 m east of them.
    const at = (deg: number, i: number): SurveyPoint => ({ ...wall[i]!, e: centre.e + 60 + 20 * Math.cos((deg * Math.PI) / 180), n: centre.n + 20 * Math.sin((deg * Math.PI) / 180) });
    const bulging = [at(315, 0), at(45, 1), at(135, 2)];
    const doc = withCurve(bulging);
    const byId = new Map([...SAMPLE_POINTS, ...bulging].map((p) => [p.id, p]));
    const eastOfPoints = Math.max(...drawnPoints(doc, byId).map((p) => p.e));
    expect(Math.max(...drawnExtent(doc, byId).map((p) => p.e))).toBeGreaterThan(eastOfPoints + 5.8);
    const pts = [...SAMPLE_POINTS, ...bulging];
    const dxf = writeDxf({ document: doc, points: pts, lots: computeLots(pts, doc.lots), crs: crsById("EPSG:5235"), scale: 500, projectName: "Sample", status: "DRAFT (synthetic test)" });
    const ext = new DxfParser().parseSync(dxf)!.header["$EXTMAX"] as { x: number };
    expect(ext.x).toBeGreaterThan(eastOfPoints + 5.8);
  });

  it("draws no curve on a line missing one of its points, whose indexes would point at the wrong points", () => {
    const doc = withCurve();
    const { path } = curvePath(doc, [...SAMPLE_POINTS, ...wall.filter((_, i) => i !== 1)]);
    expect(path.points).toHaveLength(wall.length - 1);
  });

  it("leaves a plan without curves exactly as it was, so its approval still stands", async () => {
    const doc = surveyDocumentSchema.parse(sampleDocument());
    expect(JSON.stringify(doc).includes('"arcs"')).toBe(false);
    const before = await approvalHash({ document: sampleDocument(), crsId: "EPSG:5235", points: SAMPLE_POINTS });
    expect(await approvalHash({ document: doc, crsId: "EPSG:5235", points: SAMPLE_POINTS })).toBe(before);
    expect(surveyDocumentSchema.safeParse(withCurve()).success).toBe(true);
  });
});
