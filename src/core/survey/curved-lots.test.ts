/**
 * Curved lot boundaries through the whole plan (stage 269, ADR 0276), on a SYNTHETIC lot: a 40 by 20 m lot whose north side is an arc
 * of radius 25 m bowing out, through three surveyed points. The sheet, the boundaries schedule, the DXF, GeoJSON, the checks and
 * subdivision each see the curve.
 */
import { describe, expect, it } from "vitest";
import { divide } from "./blockout";
import type { SurveyDocument } from "./document";
import { writeDxf } from "./export/dxf";
import { surveyGeoJson } from "./export/points";
import { sampleDocument } from "./fixtures";
import { area } from "./geometry";
import type { SurveyPoint } from "./parcel";
import type { ScenePath, SceneText } from "./sheet/scene";
import { buildPlan } from "./view";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const E0 = 400_000;
const N0 = 500_000;
// The arc's circle: centre (20, 5), radius 25, through (40, 20), (20, 30) and (0, 20).
const r = 25;
const yOn = (x: number) => 5 + Math.sqrt(r * r - (x - 20) ** 2);
const P: SurveyPoint[] = [
  [1, 0, 0],
  [2, 40, 0],
  [3, 40, yOn(40)],
  [4, 30, yOn(30)],
  [5, 20, yOn(20)],
  [6, 10, yOn(10)],
  [7, 0, yOn(0)],
].map(([n, e, nn]) => ({ id: id(n!), pointId: String(n), e: E0 + e!, n: N0 + nn!, z: null, code: "CP" }));
const ring = P.map((p) => p.id);

const docOf = (curved = true): SurveyDocument => {
  const doc = sampleDocument();
  doc.roads = [];
  doc.adjoining = [];
  doc.features = [];
  doc.lots = [{ id: "lot-1", label: "1", sup: "", points: ring, note: "", ...(curved ? { arcs: [{ from: 2, to: 6 }] } : {}) }];
  doc.settings = { ...doc.settings, template: "panel", scale: 500, paper: "A4", faceDimensions: true, overleaf: true };
  return doc;
};
const plan = (doc: SurveyDocument, pts = P) => buildPlan({ points: pts, document: doc, crsId: "EPSG:5235", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null });
// The area by hand: the rectangle to the arc's ends, and the segment over the chord from (40,20) to (0,20).
const half = Math.asin(20 / 25);
const EXACT = 40 * 20 + ((r * r) / 2) * (2 * half - Math.sin(2 * half));

describe("a curved lot through the whole plan", () => {
  it("takes the area inside the curve for the lot and the land", () => {
    const v = plan(docOf());
    expect(v.lots.lots[0]!.parcel!.areaM2).toBeCloseTo(EXACT, 9);
    expect(v.lots.sumAreaM2).toBeCloseTo(EXACT, 9);
    expect(v.lots.outlineAreaM2).toBeCloseTo(EXACT, 9);
    expect(v.findings.map((f) => f.code)).not.toContain("ENTIRE_AREA_MISMATCH");
    // Straight, the same corners enclose less.
    expect(plan(docOf(false)).lots.lots[0]!.parcel!.areaM2).toBeCloseTo(area(P), 9);
  });

  it("draws the curve as one arc on the sheet and letters it once: its chord, radius and length along the arc", () => {
    const items = plan(docOf()).sheet.pages[0]!.items;
    const boundary = items.filter((i): i is ScenePath => i.kind === "path" && i.layer === "BOUNDARY");
    // Two straight sides, the west side, and the arc drawn as many short chords.
    expect(boundary).toHaveLength(4);
    expect(Math.max(...boundary.map((b) => b.points.length))).toBeGreaterThan(10);
    const words = items.filter((i): i is SceneText => i.kind === "text").map((t) => t.text);
    const arcLength = r * 2 * half;
    expect(words.some((w) => w.includes(`(R 25.00, arc ${arcLength.toFixed(2)})`))).toBe(true);
    // The points on the curve are lettered as points, never as legs of their own.
    expect(words.filter((w) => w.includes("10.") && w.includes("°")).length).toBe(0);
  });

  it("gives the curve one row in the schedule, with its chord, and says its radius and length along the arc", () => {
    const pages = plan(docOf()).sheet.pages.filter((p) => p.role === "overleaf");
    const words = pages.flatMap((p) => p.items).filter((i): i is SceneText => i.kind === "text").map((t) => t.text).join(" ");
    expect(words).toContain("40.00 (chord)");
    expect(words).toContain("3 to 7 is a circular curve through 4, 5, 6: radius 25.000 m");
    expect(words).toContain("including the curves' segments");
    expect(words).toContain("by the coordinate method on grid coordinates, with the circular segments of its curves");
  });

  it("writes the curve to the DXF as bulges on its legs, and to GeoJSON as short chords enclosing the same area", () => {
    const v = plan(docOf());
    const dxf = writeDxf({ document: docOf(), points: P, lots: v.lots, crs: v.crs, scale: 500, projectName: "Sample", status: "Draft" });
    // The boundary polyline's vertices' own bulges (group 42), not the header's.
    const vertices = dxf.split(/\r?\n\s*0\r?\n/).filter((e) => e.startsWith("VERTEX") && /\n\s*8\r?\nBOUNDARY\r?\n/.test(e));
    expect(vertices).toHaveLength(P.length);
    const bulges = vertices.flatMap((v) => [...v.matchAll(/\n\s*42\r?\n([-0-9.eE]+)/g)].map((m) => Number(m[1])));
    expect(bulges.filter((b) => b !== 0)).toHaveLength(4);
    const gj = JSON.parse(surveyGeoJson({ points: P, lots: v.lots, crs: v.crs, crsConfirmed: true, status: "Draft", projectName: "Sample" })) as { features: { geometry: { type: string; coordinates: number[][][] } }[] };
    const poly = gj.features.find((f) => f.geometry.type === "Polygon")!.geometry.coordinates[0]!;
    expect(poly.length).toBeGreaterThan(P.length + 10);
    const ringArea = area(poly.slice(0, -1).map(([e, n]) => ({ e: e!, n: n! })));
    expect(Math.abs(ringArea - EXACT)).toBeLessThan(0.05);
  });

  it("stops the export when a curve isn't one, and says why", () => {
    const off = P.map((p) => (p.pointId === "5" ? { ...p, n: p.n + 0.5 } : p));
    const v = plan(docOf(), off);
    const f = v.findings.find((x) => x.code === "LOT_CURVE_NOT_FITTED")!;
    expect(f.blocks).toEqual(["export", "approval"]);
    expect(f.message).toContain("from 3 to 7");
    expect(v.lots.lots[0]!.parcel!.areaM2).toBeCloseTo(area(off), 9);
  });

  it("won't divide a curved lot, whose shares' areas would be wrong", () => {
    const r2 = divide(docOf(), P, { lot: "lot-1", leg: 0, lines: "parallel", corner: 0, from: "start", by: "area", shares: [400, null], rules: null } as never);
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toContain("curved boundary");
  });
});
