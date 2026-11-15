/**
 * Import, parcel, checks, sheet and export tests. All data is SYNTHETIC
 * (src/core/survey/fixtures.ts and inline strings), labelled as such.
 */
import DxfParser from "dxf-parser";
import { describe, expect, it } from "vitest";
import { crsById, looksSwapped } from "./crs";
import { emptyDocument, legendIsBriefExamples } from "./document";
import { writeDxf } from "./export/dxf";
import { pointsCsv, surveyGeoJson } from "./export/points";
import { SAMPLE_AREA_M2, SAMPLE_POINTS, sampleDocument } from "./fixtures";
import { parseDelimited, previewDelimited, COLUMN_ORDERS } from "./import/delimited";
import { detectFormat } from "./import/detect";
import { parseGeoJsonPoints } from "./import/geojson";
import { computeParcel } from "./parcel";
import { blocked, checkSurvey } from "./qc";
import { composeSheet, fmt, suggestScale } from "./sheet/compose";
import { toModel, toPage } from "./sheet/scene";
import { SRI_LANKA_CADASTRAL_V1 } from "./sheet/template";
import { computeTraverse } from "./traverse";
import { ACRE_M2, HECTARE_M2, formatArp, toArp } from "./units";

const SLD99 = crsById("EPSG:5235")!;

describe("delimited point files (synthetic)", () => {
  const pnezd = "PNT,N,E,Z,DESC\n1,600004.210,500012.345,21.43,CP\n2,600007.884,500043.912,21.88,CP\n3,600036.470,500048.105,22.61,St wall corner\n";

  it("detects the delimiter and the header, and reads PNEZD", () => {
    const p = previewDelimited(pnezd);
    if ("error" in p) throw new Error(p.error.message);
    expect(p).toMatchObject({ delimiter: ",", hasHeader: true, totalRows: 3, columnCount: 5 });
    const r = parseDelimited(pnezd, { delimiter: ",", hasHeader: true, columns: COLUMN_ORDERS.PNEZD });
    expect(r.issues).toEqual([]);
    expect(r.points[0]).toMatchObject({ line: 2, pointId: "1", e: 500012.345, n: 600004.21, z: 21.43, code: "CP" });
    expect(r.points[2]!.code).toBe("St wall corner");
  });

  it("reads PENZD with spaces and tabs, and a file with no header", () => {
    const txt = "1 500012.345 600004.210 21.43 CP\n2\t500043.912\t600007.884\t21.88\tCP\n";
    const tabbed = parseDelimited("1\t500012.345\t600004.210\n", { delimiter: "\t", hasHeader: false, columns: COLUMN_ORDERS.PEN });
    expect(tabbed.points[0]).toMatchObject({ e: 500012.345, n: 600004.21, z: null });
    const spaced = parseDelimited(txt.replace(/\t/g, " "), { delimiter: "whitespace", hasHeader: false, columns: COLUMN_ORDERS.PENZD });
    expect(spaced.points.map((p) => p.pointId)).toEqual(["1", "2"]);
  });

  it("reports bad rows by line and never repairs them", () => {
    const bad = "1,600004.210,500012.345\n2,6,000,07.884,500043.912\n3,,500048.105\n4,600036.470,abc\n";
    const r = parseDelimited(bad, { delimiter: ",", hasHeader: false, columns: COLUMN_ORDERS.PNE });
    expect(r.points.map((p) => p.pointId)).toEqual(["1", "2"]);
    // Row 2 reads "6" and "000" as northing and easting: the mapping takes what's there; QC catches the range.
    const codes = r.issues.map((i) => [i.code, i.line]);
    expect(codes).toContainEqual(["MISSING_COORDINATE", 3]);
    expect(codes).toContainEqual(["NOT_A_NUMBER", 4]);
  });

  it("keeps exact duplicates once and drops conflicting ones altogether", () => {
    const dup = "1,600004.210,500012.345\n1,600004.210,500012.345\n2,600007.884,500043.912\n2,600007.000,500043.912\n";
    const r = parseDelimited(dup, { delimiter: ",", hasHeader: false, columns: COLUMN_ORDERS.PNE });
    expect(r.points.map((p) => p.pointId)).toEqual(["1"]);
    expect(r.issues.map((i) => i.code)).toEqual(["DUPLICATE_POINT_SAME", "DUPLICATE_POINT_CONFLICT"]);
  });

  it("refuses thousands separators, exponents and binary files", () => {
    const r = parseDelimited("1;600,004.210;500012.345\n2;6.0e5;500012.345\n", { delimiter: ";", hasHeader: false, columns: COLUMN_ORDERS.PNE });
    expect(r.points).toEqual([]);
    expect(parseDelimited("a\u0000b", { delimiter: ",", hasHeader: false, columns: COLUMN_ORDERS.PNE }).issues[0]!.code).toBe("NOT_TEXT");
    expect(parseDelimited("1,2,3", { delimiter: ",", hasHeader: false, columns: ["point", "easting", "ignore"] }).issues[0]!.code).toBe("MISSING_MAPPING");
  });

  it("tells formats apart by name and content", () => {
    expect(detectFormat("pts.csv", "1,2,3")).toBe("delimited");
    expect(detectFormat("pts.geojson", "{}")).toBe("geojson");
    expect(detectFormat("pts.txt", '{"type":"FeatureCollection","features":[]}')).toBe("geojson");
  });
});

describe("GeoJSON points (synthetic)", () => {
  it("refuses RFC 7946 longitude and latitude instead of drawing them wrongly", () => {
    const r = parseGeoJsonPoints(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [80.1, 7.2] }, properties: {} }] }));
    expect(r.points).toEqual([]);
    expect(r.issues[0]!.message).toMatch(/longitude and latitude/);
  });

  it("reads grid points when the file names an EPSG code", () => {
    const r = parseGeoJsonPoints(JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::5235" } }, features: [{ type: "Feature", geometry: { type: "Point", coordinates: [500012.345, 600004.21, 21.4] }, properties: { point: "1", code: "CP" } }] }));
    expect(r.namedEpsg).toBe(5235);
    expect(r.points[0]).toMatchObject({ pointId: "1", e: 500012.345, n: 600004.21, z: 21.4, code: "CP" });
  });
});

describe("the parcel and its checks (synthetic)", () => {
  const doc = sampleDocument();
  const result = computeParcel(SAMPLE_POINTS, doc.boundary);
  if (!result.ok) throw new Error("sample parcel missing points");
  const parcel = result.parcel;

  it("matches the independently computed area to the micrometre squared", () => {
    expect(parcel.areaM2).toBeCloseTo(SAMPLE_AREA_M2, 6);
    expect(parcel.legs).toHaveLength(5);
    expect(parcel.crossings).toEqual([]);
    expect(parcel.perimeterM).toBeCloseTo(parcel.legs.reduce((s, l) => s + l.distance, 0), 9);
  });

  it("reports missing points instead of skipping them", () => {
    expect(computeParcel(SAMPLE_POINTS, [doc.boundary[0]!, "00000000-0000-4000-8000-999999999999"])).toEqual({ ok: false, missing: ["00000000-0000-4000-8000-999999999999"] });
  });

  it("checks a complete sample without blocking errors, and flags what needs the surveyor", () => {
    const findings = checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: doc, parcel: result, surveyorProfile: false });
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(findings.map((f) => f.code)).toEqual(expect.arrayContaining(["LEGEND_UNREVIEWED", "NO_SURVEYOR"]));
    expect(blocked(findings, "export")).toEqual([]);
    expect(blocked(findings, "approval").length).toBeGreaterThan(0);
  });

  it("blocks a crossing boundary and an unconfirmed coordinate system", () => {
    const crossed = { ...doc, boundary: [doc.boundary[0]!, doc.boundary[2]!, doc.boundary[1]!, doc.boundary[3]!] };
    const r = computeParcel(SAMPLE_POINTS, crossed.boundary);
    const f = checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: false, document: crossed, parcel: r, surveyorProfile: true });
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(["BOUNDARY_SELF_INTERSECTS", "CRS_NOT_CONFIRMED"]));
    expect(blocked(f, "export").map((x) => x.code)).toContain("BOUNDARY_SELF_INTERSECTS");
  });

  it("notices swapped axes for SLD99 only where a swap leaves the grid's range", () => {
    // Near the grid's middle (E 500 km, N 600 km) both orders are in range, so a swap can't be detected there.
    expect(looksSwapped(SAMPLE_POINTS.map((p) => ({ e: p.n, n: p.e })), SLD99)).toBe(false);
    // In the north (N about 800 km), northing-as-easting falls outside the easting range.
    const north = [{ e: 400_000, n: 800_000 }, { e: 400_050, n: 800_040 }];
    expect(looksSwapped(north.map((p) => ({ e: p.n, n: p.e })), SLD99)).toBe(true);
    expect(looksSwapped(north, SLD99)).toBe(false);
  });

  it("computes a closed traverse's misclosure without adjusting it", () => {
    const t = computeTraverse({ e: 0, n: 0 }, [
      { bearing: 0, distance: 100 },
      { bearing: 90, distance: 100 },
      { bearing: 180, distance: 100 },
      { bearing: 270, distance: 99.98 },
    ], { e: 0, n: 0 });
    expect(t.points).toHaveLength(5);
    expect(t.misclosure!.linear).toBeCloseTo(0.02, 9);
    expect(t.misclosure!.precision).toBeCloseTo(399.98 / 0.02, 3);
  });

  it("states 1 ha as 2A 1R 35.37P (NIST Handbook 44 values)", () => {
    expect(formatArp(toArp(HECTARE_M2, 4))).toBe("2A 1R 35.3686P");
    expect(formatArp(toArp(HECTARE_M2))).toBe("2A 1R 35.37P");
    expect(toArp(ACRE_M2 * 3).acres).toBe(3);
  });
});

describe("the plan sheet (synthetic)", () => {
  const doc = sampleDocument();
  const r = computeParcel(SAMPLE_POINTS, doc.boundary);
  if (!r.ok) throw new Error("sample parcel");
  const input = { template: SRI_LANKA_CADASTRAL_V1, document: doc, points: SAMPLE_POINTS, parcel: r.parcel, crs: SLD99, crsConfirmation: "Confirmed by Test Person on 2026-11-15", surveyor: null, approval: null };

  it("suggests the largest standard scale that fits, and draws at exactly that scale", () => {
    const sheet = composeSheet(input);
    expect(sheet.scale).toBe(sheet.suggestedScale);
    expect(sheet.findings.filter((f) => f.severity === "error")).toEqual([]);
    const v = sheet.viewport!;
    // A known 10 m in the model is 10 × 1000 / scale mm on paper.
    const [x1] = toPage(v, 500_000, 600_000);
    const [x2] = toPage(v, 500_010, 600_000);
    expect(x2 - x1).toBeCloseTo((10 * 1000) / v.scale, 9);
    const back = toModel(v, ...toPage(v, 500_020.5, 600_015));
    expect(back.e).toBeCloseTo(500_020.5, 9);
    expect(back.n).toBeCloseTo(600_015, 9);
    expect(suggestScale(30, 40, 250, 260)).toBe(200);
    expect(suggestScale(1e7, 1e7, 100, 100)).toBeNull();
  });

  it("lays out an A3 landscape front page and an overleaf, inside the paper", () => {
    const sheet = composeSheet(input);
    expect(sheet.pages.map((p) => [p.widthMm, p.heightMm, p.role])).toEqual([[420, 297, "front"], [420, 297, "overleaf"]]);
    for (const page of sheet.pages) {
      for (const item of page.items) {
        const xs = item.kind === "path" ? item.points.map((p) => p[0]) : item.kind === "circle" ? [item.cx] : [item.x];
        const ys = item.kind === "path" ? item.points.map((p) => p[1]) : item.kind === "circle" ? [item.cy] : [item.y];
        for (const x of xs) {
          expect(x).toBeGreaterThanOrEqual(0);
          expect(x).toBeLessThanOrEqual(page.widthMm);
        }
        for (const y of ys) {
          expect(y).toBeGreaterThanOrEqual(0);
          expect(y).toBeLessThanOrEqual(page.heightMm);
        }
      }
    }
    const texts = sheet.pages[0]!.items.filter((i) => i.kind === "text").map((i) => (i.kind === "text" ? i.text : ""));
    expect(texts).toContain("PLAN No. SAMPLE-1");
    // The 100 mm check line is exactly 100 mm on the page.
    const check = sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "checkline");
    expect(check && check.kind === "path" ? check.points[1]![0] - check.points[0]![0] : 0).toBe(100);
    expect(texts.some((t) => t.startsWith("DRAFT."))).toBe(true);
    expect(texts.some((t) => t.includes("Starting examples"))).toBe(true);
    expect(texts.some((t) => t === formatArp(toArp(SAMPLE_AREA_M2)))).toBe(true);
    expect(legendIsBriefExamples(doc.sheet.legend)).toBe(true);
  });

  it("says when a chosen scale doesn't fit, and never shrinks the drawing to make it fit", () => {
    const tight = { ...input, document: { ...doc, settings: { ...doc.settings, scale: 50, paper: "A4" as const } } };
    const sheet = composeSheet(tight);
    expect(sheet.scale).toBe(50);
    expect(sheet.findings.map((f) => f.code)).toContain("DRAWING_OFF_SHEET");
  });

  it("drops the DRAFT line only for an approved version", () => {
    const approved = composeSheet({ ...input, approval: { by: "Test Person", at: "2026-11-15" } });
    expect(approved.pages[0]!.items.some((i) => i.kind === "text" && i.text.startsWith("DRAFT."))).toBe(false);
  });

  it("formats numbers the same everywhere", () => {
    expect(fmt(1311.118096, 2)).toBe("1,311.12");
    expect(fmt(500012.345, 3)).toBe("500,012.345");
    expect(fmt(-0.5, 1)).toBe("-0.5");
  });
});

describe("exports (synthetic)", () => {
  const doc = sampleDocument();
  const r = computeParcel(SAMPLE_POINTS, doc.boundary);
  if (!r.ok) throw new Error("sample parcel");

  it("writes an R12 DXF that an independent reader opens with every layer and coordinate", () => {
    const dxf = writeDxf({ document: doc, points: SAMPLE_POINTS, parcel: r.parcel, crs: SLD99, scale: 250, projectName: "Sample" });
    expect(dxf.startsWith("0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(dxf)).toBe(false);
    const parsed = new DxfParser().parseSync(dxf)!;
    const layers = Object.keys(parsed.tables.layer.layers);
    expect(layers).toEqual(expect.arrayContaining(["BOUNDARY", "POINTS", "POINT_NUMBERS", "DIMENSIONS", "BUILDINGS", "WALLS"]));
    const boundary = parsed.entities.find((e) => e.layer === "BOUNDARY") as unknown as { vertices: { x: number; y: number }[]; shape?: boolean };
    expect(boundary.vertices).toHaveLength(5);
    boundary.vertices.forEach((v, i) => {
      expect(Math.abs(v.x - r.parcel.vertices[i]!.e)).toBeLessThan(0.001);
      expect(Math.abs(v.y - r.parcel.vertices[i]!.n)).toBeLessThan(0.001);
    });
    expect(boundary.shape).toBe(true);
    const texts = parsed.entities.filter((e) => e.type === "TEXT") as unknown as { text: string; layer: string }[];
    expect(texts.filter((t) => t.layer === "POINT_NUMBERS").map((t) => t.text)).toEqual(["1", "2", "3", "4", "5"]);
    expect(texts.some((t) => t.layer === "DIMENSIONS" && t.text.includes("%%d"))).toBe(true);
    expect(parsed.entities.filter((e) => e.type === "POINT")).toHaveLength(5);
  });

  it("writes CSV that spreadsheets can't run, and GeoJSON that names its grid", () => {
    const csv = pointsCsv([...SAMPLE_POINTS, { id: "x", pointId: "=CMD()", e: 1, n: 2, z: null, code: "+x" }]);
    expect(csv.split("\r\n")[0]).toBe("point,easting,northing,elevation,code");
    expect(csv).toContain("'=CMD(),1,2,,'+x");
    const gj = JSON.parse(surveyGeoJson({ points: SAMPLE_POINTS, parcel: r.parcel, crs: SLD99, projectName: "Sample", lot: "1" }));
    expect(gj.crs.properties.name).toBe("urn:ogc:def:crs:EPSG::5235");
    const parcelFeature = gj.features.find((f: { properties: { kind: string } }) => f.properties.kind === "parcel");
    const ring = parcelFeature.geometry.coordinates[0];
    expect(ring[0]).toEqual(ring[ring.length - 1]);
    expect(parcelFeature.properties.area_m2).toBeCloseTo(SAMPLE_AREA_M2, 6);
  });

  it("keeps an empty document drawable", () => {
    const empty = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: emptyDocument(), points: [], parcel: null, crs: null, crsConfirmation: null, surveyor: null, approval: null });
    expect(empty.viewport).toBeNull();
    expect(empty.pages).toHaveLength(1);
  });
});
