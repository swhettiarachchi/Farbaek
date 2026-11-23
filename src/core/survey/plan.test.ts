/**
 * Import, parcel, checks, sheet and export tests. All data is SYNTHETIC
 * (src/core/survey/fixtures.ts and inline strings), labelled as such.
 */
import DxfParser from "dxf-parser";
import { describe, expect, it } from "vitest";
import { crsById, looksSwapped } from "./crs";
import { codeNote, codeOf, commonCodes } from "./codes";
import { formatDms, toDms } from "./angles";
import { inverse } from "./cogo";
import { regionLine, runsText, titleSentence } from "./description";
import { emptyDocument, parseSurveyDocument, surveyDocumentSchema, unreviewed, usedPointIds } from "./document";
import { writeDxf } from "./export/dxf";
import { lotScheduleCsv } from "./export/schedule";
import { pointsCsv, surveyGeoJson } from "./export/points";
import { suggestFeatures } from "./fieldToFinish";
import { SAMPLE_AREA_M2, SAMPLE_LOT_AREAS_M2, SAMPLE_POINTS, sampleDocument } from "./fixtures";
import { andList, arpClassic, countPhrase, dotDate, hectares, roadWidthText } from "./formats";
import { parseDelimited, previewDelimited, COLUMN_ORDERS } from "./import/delimited";
import { detectFormat } from "./import/detect";
import { parseGeoJsonPoints } from "./import/geojson";
import { computeLots } from "./lots";
import { computeParcel, type SurveyPoint } from "./parcel";
import { roadWidth } from "./roads";
import { blocked, checkSurvey } from "./qc";
import { composeSheet, fmt, overlappingLabels, suggestScale } from "./sheet/compose";
import { toModel, toPage } from "./sheet/scene";
import { approvalHash } from "./view";
import { canonicalize, sha256Hex } from "../trust/canonical-json";
import { SURVEY_ENGINE_VERSION } from "./version";
import { SRI_LANKA_CADASTRAL_V1 } from "./sheet/template";
import { computeTraverse } from "./traverse";
import { formatArp, toArp } from "./units";

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
    expect(r.points.map((p) => p.pointId)).toEqual(["1"]);
    // Row 2's thousands separators split it into more columns than the mapping: refused, never read as 6 and 000.
    const codes = r.issues.map((i) => [i.code, i.line]);
    expect(codes).toContainEqual(["EXTRA_COLUMNS", 2]);
    expect(codes).toContainEqual(["MISSING_COORDINATE", 3]);
    expect(codes).toContainEqual(["NOT_A_NUMBER", 4]);
  });

  it("keeps exact duplicates once and drops conflicting ones altogether", () => {
    const dup = "1,600004.210,500012.345\n1,600004.210,500012.345\n2,600007.884,500043.912\n2,600007.000,500043.912\n";
    const r = parseDelimited(dup, { delimiter: ",", hasHeader: false, columns: COLUMN_ORDERS.PNE });
    expect(r.points.map((p) => p.pointId)).toEqual(["1"]);
    expect(r.issues.map((i) => i.code)).toEqual(["DUPLICATE_POINT_SAME", "DUPLICATE_POINT_CONFLICT"]);
    // The same coordinates with another code is a conflict, not a repeat.
    const recoded = parseDelimited("1,600004.210,500012.345,CP\n1,600004.210,500012.345,MW\n", { delimiter: ",", hasHeader: false, columns: ["point", "northing", "easting", "code"] });
    expect(recoded.points).toEqual([]);
    expect(recoded.issues.map((i) => i.code)).toEqual(["DUPLICATE_POINT_CONFLICT"]);
  });

  it("keeps the code to its own column, unless it's the last one", () => {
    const middle = parseDelimited("1,CP,500000.000,400000.000\n", { delimiter: ",", hasHeader: false, columns: ["point", "code", "easting", "northing"] });
    expect(middle.points[0]).toMatchObject({ code: "CP", e: 500000, n: 400000 });
    const leftOut = parseDelimited("1,500000.000,400000.000,CP,station 4\n", { delimiter: ",", hasHeader: false, columns: ["point", "easting", "northing", "code", "ignore"] });
    expect(leftOut.points[0]!.code).toBe("CP");
    const last = parseDelimited("1 500000.000 400000.000 St wall corner\n", { delimiter: "whitespace", hasHeader: false, columns: ["point", "easting", "northing", "code"] });
    expect(last.points[0]!.code).toBe("St wall corner");
    // A wide row never loses words: the preview maps the usual row length, a space-separated description
    // runs on in a last code column, and anything else extra is refused with its line.
    const spaced = "1 600004.210 500012.345 21.43 CP\n2 600007.884 500043.912 21.88 Concrete post\n3 600036.470 500048.105 22.61 St\n";
    const pv = previewDelimited(spaced);
    if ("error" in pv) throw new Error(pv.error.message);
    expect(pv.columnCount).toBe(5);
    expect(parseDelimited(spaced, { delimiter: "whitespace", hasHeader: false, columns: COLUMN_ORDERS.PNEZD }).points.map((p) => p.code)).toEqual(["CP", "Concrete post", "St"]);
    const unquoted = parseDelimited("1,600004.210,500012.345,Wall, masonry\n", { delimiter: ",", hasHeader: false, columns: ["point", "northing", "easting", "code"] });
    expect(unquoted.issues.map((i) => i.code)).toEqual(["EXTRA_COLUMNS"]);
    // Nothing is cut short or cleaned quietly: an over-long code is refused with its line.
    const long = parseDelimited(`1,500000.000,400000.000,${"x".repeat(65)}\n`, { delimiter: ",", hasHeader: false, columns: ["point", "easting", "northing", "code"] });
    expect(long.issues.map((i) => [i.code, i.line])).toEqual([["CODE_NOT_READABLE", 1]]);
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
    const r = parseGeoJsonPoints(JSON.stringify({ type: "FeatureCollection", features: [{ type: "Feature", geometry: { type: "Point", coordinates: [80.1, 7.2] }, properties: {} }] }), 5235);
    expect(r.points).toEqual([]);
    expect(r.issues[0]!.message).toMatch(/longitude and latitude/);
  });

  it("reads grid points when the file names an EPSG code", () => {
    const r = parseGeoJsonPoints(JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: "urn:ogc:def:crs:EPSG::5235" } }, features: [{ type: "Feature", geometry: { type: "Point", coordinates: [500012.345, 600004.21, 21.4] }, properties: { point: "1", code: "CP" } }] }), 5235);
    expect(r.namedEpsg).toBe(5235);
    expect(r.points[0]).toMatchObject({ pointId: "1", e: 500012.345, n: 600004.21, z: 21.4, code: "CP" });
  });

  it("refuses a file in another grid than the project's, and never cuts an id short", () => {
    const file = (epsg: number, props: Record<string, unknown> = { point: "1" }) => JSON.stringify({ type: "FeatureCollection", crs: { type: "name", properties: { name: `EPSG:${epsg}` } }, features: [{ type: "Feature", geometry: { type: "Point", coordinates: [374_500.0, 766_000.0] }, properties: props }] });
    // UTM 44N numbers for western Sri Lanka fall inside SLD99's range, so only the file's own code can tell.
    expect(parseGeoJsonPoints(file(32644), 5235).issues[0]!.message).toMatch(/EPSG:32644.*EPSG:5235/);
    expect(parseGeoJsonPoints(file(4258), 5235).points).toEqual([]);
    expect(parseGeoJsonPoints(file(5235), null).issues[0]!.message).toMatch(/local coordinates/);
    expect(parseGeoJsonPoints(file(5235, { point: "P".repeat(40) }), 5235).issues[0]!.code).toBe("POINT_ID_TOO_LONG");
  });
});

describe("lots and their checks (synthetic)", () => {
  const doc = sampleDocument();
  const lots = computeLots(SAMPLE_POINTS, doc.lots);
  const qc = (d = doc, extra: Partial<Parameters<typeof checkSurvey>[0]> = {}) => checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(SAMPLE_POINTS, d.lots), surveyorProfile: false, ...extra });

  it("matches the independently computed areas, and the lots add up to the entire land", () => {
    for (const r of lots.lots) expect(r.parcel!.areaM2).toBeCloseTo(SAMPLE_LOT_AREAS_M2[r.lot.id as keyof typeof SAMPLE_LOT_AREAS_M2], 6);
    expect(lots.sumAreaM2).toBeCloseTo(SAMPLE_AREA_M2, 6);
    expect(lots.outlineAreaM2).toBeCloseTo(SAMPLE_AREA_M2, 6);
    expect(lots.outline!.map((p) => p.pointId).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7"]);
    expect(lots.overlaps).toEqual([]);
    expect([lots.pieces, lots.holes]).toEqual([1, 0]);
  });

  it("catches overlapping lots and a repeated label (gaps and T-junctions are tested below)", () => {
    const over = { ...doc, lots: [doc.lots[0]!, { ...doc.lots[1]!, points: [SAMPLE_POINTS[0]!.id, SAMPLE_POINTS[1]!.id, SAMPLE_POINTS[4]!.id, SAMPLE_POINTS[5]!.id] }] };
    expect(qc(over).map((f) => f.code)).toContain("LOTS_OVERLAP");
    // B¹ and B³ alone touch along a leg: no overlap.
    expect(qc({ ...doc, lots: [doc.lots[0]!, doc.lots[2]!] }).map((f) => f.code)).not.toContain("LOTS_OVERLAP");
    const dup = { ...doc, lots: doc.lots.map((l) => ({ ...l, sup: "1" })) };
    expect(qc(dup).map((f) => f.code)).toContain("LOT_LABEL_DUPLICATE");
  });

  it("checks a complete sample without blocking errors, and flags what needs the surveyor", () => {
    const findings = qc();
    expect(findings.filter((f) => f.severity === "error")).toEqual([]);
    expect(findings.map((f) => f.code)).toEqual(expect.arrayContaining(["LEGEND_UNREVIEWED", "NO_SURVEYOR"]));
    expect(blocked(findings, "export")).toEqual([]);
    expect(blocked(findings, "approval").length).toBeGreaterThan(0);
    // Marking the code list as checked clears that one.
    expect(qc({ ...doc, provenance: { codes: { source: "engine", reviewed: true } } }).map((f) => f.code)).not.toContain("LEGEND_UNREVIEWED");
  });

  it("holds approval while anything the AI filled is unchecked", () => {
    const ai = { ...doc, provenance: { "sheet.landName": { source: "ai_brief" as const, reviewed: false }, "lot:lot-b1": { source: "ai_brief" as const, reviewed: true } } };
    const f = qc(ai).find((x) => x.code === "AI_ITEMS_UNREVIEWED");
    expect(f?.blocks).toEqual(["approval"]);
    expect(f?.detail).toContain("sheet.landName");
    expect(unreviewed(ai)).toEqual(["sheet.landName"]);
  });

  it("blocks a crossing boundary and an unconfirmed coordinate system", () => {
    const b1 = doc.lots[0]!;
    const crossed = { ...doc, lots: [{ ...b1, points: [b1.points[0]!, b1.points[2]!, b1.points[1]!, b1.points[3]!, b1.points[4]!] }] };
    const f = qc(crossed, { crsConfirmed: false, surveyorProfile: true });
    expect(f.map((x) => x.code)).toEqual(expect.arrayContaining(["BOUNDARY_SELF_INTERSECTS", "CRS_NOT_CONFIRMED"]));
    expect(blocked(f, "export").map((x) => x.code)).toContain("BOUNDARY_SELF_INTERSECTS");
  });

  it("reports missing points instead of skipping them", () => {
    expect(computeParcel(SAMPLE_POINTS, [doc.lots[0]!.points[0]!, "00000000-0000-4000-8000-999999999999"])).toEqual({ ok: false, missing: ["00000000-0000-4000-8000-999999999999"] });
  });

  it("notices swapped axes for SLD99 only where a swap leaves the grid's range", () => {
    expect(looksSwapped(SAMPLE_POINTS.map((p) => ({ e: p.n, n: p.e })), SLD99)).toBe(false);
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
    expect(formatArp(toArp(10_000, 4))).toBe("2A 1R 35.3686P");
  });
});

describe("roads, field codes and formats (synthetic)", () => {
  it("measures a road's width square across its edges, and writes it in feet as plans do", () => {
    const [a1, a2, b1, b2] = ["9", "10", "11", "12"].map((n) => SAMPLE_POINTS.find((p) => p.pointId === n)!);
    const w = roadWidth([a1!, a2!], [b1!, b2!])!;
    // Hand-worked: vertical gaps 4.420 m and 4.570 m on a leg sloping 1.93 m in 62 m (cos 0.99952).
    expect(w.minM).toBeCloseTo(4.42 * 0.999516, 3);
    expect(w.maxM).toBeCloseTo(4.57 * 0.999516, 3);
    expect(roadWidthText(w.minM, w.maxM, "feet")).toBe("(14.5ft - 15ft wide)");
    expect(roadWidthText(3.66, 3.66, "feet")).toBe("(12ft. wide)");
    expect(roadWidthText(3.66, 4.0, "metres")).toBe("(3.7m - 4.0m wide)");
  });

  it("suggests lines from consecutive field codes, keeps numbered strings apart, and closes outlines", () => {
    const P = (n: number, code: string): SurveyPoint => ({ id: `00000000-0000-4000-8000-${String(900 + n).padStart(12, "0")}`, pointId: String(n), e: 500_000 + n, n: 600_000 + (n % 3), z: null, code });
    const pts = [P(1, "MW1"), P(2, "MW1"), P(3, "MW2"), P(4, "MW2"), P(5, "MW2 END"), P(6, "MW2"), P(7, "CP"), P(8, "P"), P(9, "P"), P(10, "P"), P(11, "LF"), P(12, "LF"), P(13, "LF CLO"), P(14, "LF")];
    const s = suggestFeatures(pts, commonCodes());
    expect(s.map((f) => [f.code, f.pointNumbers.join(" "), f.closed])).toEqual([
      ["MW", "1 2", false],
      ["MW", "3 4 5", false],
      ["P", "8 9 10", true],
      ["LF", "11 12 13", true],
    ]);
  });

  it("writes extents, dates and counts the way plans do", () => {
    expect(hectares(2139.8)).toBe("0.21398");
    expect(arpClassic(toArp(2139.8))).toBe("0 A. 2 R. 04.60 P.");
    expect(arpClassic(toArp(SAMPLE_AREA_M2))).toBe("0 A. 2 R. 09.65 P.");
    expect(dotDate("2026-11-05")).toBe("05.11.2026");
    expect(dotDate("as typed")).toBe("as typed");
    expect(countPhrase(3)).toBe("three (03)");
    expect(countPhrase(14)).toBe("fourteen (14)");
    expect(countPhrase(21)).toBe("twenty-one (21)");
    expect(andList(["1", "2", "3"])).toBe("1, 2 & 3");
  });

  it("composes the title sentence for each kind of survey, never inventing a missing part", () => {
    const doc = sampleDocument();
    const text = (s = doc.sheet, l = doc.lots, x: typeof doc.lots[number] | null = null) => runsText(titleSentence(s, l, x));
    expect(text()).toBe("of three (03) allotments of land marked lots B1, B2 & B3 called SAMPLE WATTA being resurvey of the existing boundaries & sub division of lot B depicted in Plan No.SAMPLE-0 dated 15.01.2020 made by A. Sample, Licensed Surveyor situated at Sample Village in Sample Pattu of Sample Korale");
    const runs = titleSentence(doc.sheet, doc.lots);
    expect(runs.filter((r) => r.style === "sup").map((r) => r.text)).toEqual(["1", "2", "3"]);
    const one = { ...doc.sheet, operation: "amalgamation" as const, parentLots: "3 & 5", previousPlan: { ...doc.sheet.previousPlan, mine: true }, alias: "Second Name", nowKnownAs: "" };
    expect(text(one, [{ id: "a", label: "A", sup: "", note: "", points: [] }])).toBe("of an allotment of land marked lot A called SAMPLE WATTA alias SECOND NAME being resurvey of the existing boundaries & amalgamation of lots 3 & 5 depicted in my Plan No.SAMPLE-0 dated 15.01.2020 situated at Sample Village in Sample Pattu of Sample Korale");
    expect(text({ ...doc.sheet, landName: "", previousPlan: { ...doc.sheet.previousPlan, filing: "Sample Court, Case No. 1/P" } })).toContain("called .......... being");
    expect(text({ ...doc.sheet, previousPlan: { ...doc.sheet.previousPlan, filing: "Sample Court, Case No. 1/P" } })).toContain("(Filed of record in Sample Court, Case No. 1/P)");
    expect(text(doc.sheet, doc.lots, doc.lots[1]!)).toMatch(/^of Lot B2 out of three \(03\) allotments of land marked lots B1, B2 & B3/);
    const reserved = [...doc.lots.slice(0, 2), { ...doc.lots[2]!, note: "Res. for Access, 10ft. wide" }];
    expect(text(doc.sheet, reserved)).toContain("B2 & B3(Res. for Access, 10ft. wide) called");
    expect(regionLine("Sample", "DISTRICT")).toBe("SAMPLE DISTRICT");
    expect(regionLine("Sample District", "DISTRICT")).toBe("SAMPLE DISTRICT");
  });

  it("upgrades a stage 190 document: its boundary becomes the first lot, its legend the code library, in the panel layout", () => {
    const v1 = {
      schema: 1,
      boundary: doc1Points,
      features: [],
      labelOffsets: { lot: { dx: 1, dy: 2 } },
      layers: Object.fromEntries(["BOUNDARY", "POINTS", "POINT_NUMBERS", "DIMENSIONS", "LOT_TEXT", "BOUNDARY_MARKS", "BUILDINGS", "WALLS", "FENCES", "DRAINS", "ROADS", "UTILITIES", "TEXT", "TITLE"].map((k) => [k, { visible: true, locked: false }])),
      sheet: { planNumber: "S-1", planDate: "", lot: "7", landName: "X", village: "", gnDivision: "", dsDivision: "", district: "", province: "", previousPlans: "None", boundaries: { north: "", east: "", south: "", west: "" }, statedExtent: "", surveyDate: "", remarks: "", legend: [{ code: "MW", meaning: "Masonry wall" }, { code: "QQ", meaning: "Something" }] },
      settings: { paper: "A3", orientation: "landscape", scale: null, perchDecimals: 2, secondDecimals: 0, distanceDecimals: 2, overleaf: true, permitBox: false },
      surveyorUserId: null,
    };
    const up = parseSurveyDocument(v1)!;
    expect(up.schema).toBe(2);
    expect(up.lots).toEqual([{ id: "lot-1", label: "7", sup: "", points: doc1Points, note: "" }]);
    expect(up.settings.template).toBe("panel");
    expect(up.codes.find((c) => c.code === "MW")).toMatchObject({ meaning: "Masonry wall", kind: "line" });
    expect(up.codes.find((c) => c.code === "QQ")).toMatchObject({ kind: "mark" });
    expect(up.labelOffsets["lot:lot-1"]).toEqual({ dx: 1, dy: 2 });
    expect(surveyDocumentSchema.safeParse(up).success).toBe(true);
    expect(parseSurveyDocument({ schema: 3 })).toBeNull();
  });
});

const doc1Points = SAMPLE_POINTS.slice(0, 4).map((p) => p.id);

describe("the plan sheet (synthetic)", () => {
  const doc = sampleDocument();
  const input = (d = doc) => ({ template: SRI_LANKA_CADASTRAL_V1, document: d, points: SAMPLE_POINTS, lots: computeLots(SAMPLE_POINTS, d.lots), crs: SLD99, crsConfirmation: "Confirmed by Test Person on 2026-11-15", surveyor: null, approval: null });
  const texts = (page: { items: { kind: string }[] }) => page.items.filter((i): i is { kind: "text"; text: string } & typeof i => i.kind === "text").map((i) => (i as unknown as { text: string }).text);

  it("lays out the classic sheet with every element the reference plans show", () => {
    const sheet = composeSheet(input());
    expect(sheet.scale).toBe(500);
    expect(sheet.paper).toBe("A4");
    expect(sheet.findings.filter((f) => f.severity === "error")).toEqual([]);
    const front = texts(sheet.pages[0]!);
    for (const want of ["PLAN No.SAMPLE-1", "Reference", "Scale:- 1:500", "PLAN", "SAMPLE DISTRICT", "SAMPLE PROVINCE", "Entire land bounded as follows", "North by", ":-", "Surveyed & partitioned on 15.11.2026", "For boundaries schedule see overleaf", "Sample Road", "(14.5ft - 15ft wide)", "To Houses", "Land claimed by the sample owner", "Well", "EP"]) {
      expect(front, want).toContain(want);
    }
    expect(front.some((t) => t.startsWith("Containing in Extent 0.22674 Hectares ( 0 A. 2 R. 09.65 P. )"))).toBe(true);
    expect(front.some((t) => t.startsWith("DRAFT."))).toBe(true);
    // Lot labels: the letter and its raised number as separate texts; no bearings on the classic face.
    expect(front.filter((t) => t === "B")).toHaveLength(3);
    expect(front).toEqual(expect.arrayContaining(["1", "2", "3"]));
    expect(front.some((t) => t.includes("°"))).toBe(false);
    // The Reference lists the codes used, and only those.
    expect(front).toEqual(expect.arrayContaining(["CP", "Concrete Post", "St", "Stake", "MW", "Masonry Wall", "P", "Permanent Building", "EP", "Electric Post"]));
    expect(front).not.toContain("Net Fence");
    // Slanted lettering, except the upright heading and region lines.
    const items = sheet.pages[0]!.items.filter((i) => i.kind === "text");
    expect(items.find((i) => i.kind === "text" && i.text === "Reference")).toMatchObject({ slant: 15 });
    expect(items.find((i) => i.kind === "text" && i.text === "PLAN")).not.toHaveProperty("slant");
    // Everything inside the paper.
    for (const page of sheet.pages) {
      for (const item of page.items) {
        const xs = item.kind === "path" ? item.points.map((p) => p[0]) : item.kind === "circle" ? [item.cx] : [item.x];
        const ys = item.kind === "path" ? item.points.map((p) => p[1]) : item.kind === "circle" ? [item.cy] : [item.y];
        for (const x of xs) expect(x >= 0 && x <= page.widthMm, `x ${x}`).toBe(true);
        for (const y of ys) expect(y >= 0 && y <= page.heightMm, `y ${y}`).toBe(true);
      }
    }
  });

  it("puts the boundaries schedule overleaf: every lot's legs, the corners, and the entire extent", () => {
    const sheet = composeSheet(input());
    const over = sheet.pages.filter((p) => p.role === "overleaf").flatMap((p) => texts(p));
    expect(over).toEqual(expect.arrayContaining(["Lot B1", "Lot B2", "Lot B3", "Coordinates of the corners", "Extent", "Boundaries schedule"]));
    expect(over.some((t) => t.includes("Entire land: 2,267.410 m²"))).toBe(true);
    expect(over.some((t) => /^\d{3}°\d{2}′\d{2}″$/.test(t))).toBe(true);
  });

  it("keeps the drawing at exactly its scale and the labels apart", () => {
    const sheet = composeSheet(input());
    const v = sheet.viewport!;
    const [x1] = toPage(v, 500_000, 600_000);
    const [x2] = toPage(v, 500_010, 600_000);
    expect(x2 - x1).toBeCloseTo((10 * 1000) / v.scale, 9);
    const back = toModel(v, ...toPage(v, 500_020.5, 600_015));
    expect(back.e).toBeCloseTo(500_020.5, 9);
    expect(sheet.findings.map((f) => f.code)).not.toContain("LABELS_OVERLAP");
    expect(suggestScale(30, 40, 250, 260)).toBe(200);
    expect(suggestScale(1e7, 1e7, 100, 100)).toBeNull();
  });

  it("chooses the paper and scale automatically, and says when a chosen pair doesn't fit", () => {
    // At 1:200 the road makes the drawing about 310 mm wide: only A2 holds it.
    expect(composeSheet(input({ ...doc, settings: { ...doc.settings, scale: 200 } })).paper).toBe("A2");
    const tight = composeSheet(input({ ...doc, settings: { ...doc.settings, scale: 100, paper: "A4" } }));
    expect(tight.findings.map((f) => f.code)).toContain("DRAWING_OFF_SHEET");
  });

  it("draws an extract of one lot, its neighbours light, with the red extract line", () => {
    const sheet = composeSheet(input({ ...doc, sheet: { ...doc.sheet, extractOf: "lot-b2" } }));
    const front = texts(sheet.pages[0]!);
    expect(front).toContain("Extract of Lot B2");
    expect(front).toContain("Lot B2 bounded as follows");
    expect(front.some((t) => t.startsWith(`Containing in Extent ${hectares(585.025)}`))).toBe(true);
    const red = sheet.pages[0]!.items.find((i) => i.kind === "text" && i.text === "Extract of Lot B2");
    expect(red).toMatchObject({ color: "red" });
  });

  it("keeps the panel layout for surveyors who want bearings on the face", () => {
    const sheet = composeSheet(input({ ...doc, settings: { ...doc.settings, template: "panel", paper: "A3", orientation: "landscape", faceDimensions: true } }));
    const front = texts(sheet.pages[0]!);
    expect(front).toContain("PLAN No. SAMPLE-1");
    expect(front.some((t) => t.includes("°"))).toBe(true);
    const check = sheet.pages[0]!.items.find((i) => i.kind === "path" && i.entity === "checkline");
    expect(check && check.kind === "path" ? check.points[1]![0] - check.points[0]![0] : 0).toBe(100);
  });

  it("drops the DRAFT line only for an approved version", () => {
    const approved = composeSheet({ ...input(), approval: { by: "Test Person", at: "2026-11-15" } });
    expect(approved.pages.some((p) => p.items.some((i) => i.kind === "text" && i.text.startsWith("DRAFT.")))).toBe(false);
  });

  it("reports labels that cover each other without moving them, and scripts it can't print", () => {
    const at = (x: number, y: number, text: string, rotate = 0) => ({ kind: "text" as const, x, y, text, size: 2.2, weight: "regular" as const, font: "sans" as const, anchor: "middle" as const, rotate, color: "ink" as const, layer: "DIMENSIONS" as const });
    expect(overlappingLabels([at(100, 100, "045°00′00″  20.00"), at(102, 100.5, "MW")])).toEqual([["045°00′00″  20.00", "MW"]]);
    expect(overlappingLabels([at(100, 100, "045°00′00″  20.00"), at(100, 104, "MW")])).toEqual([]);
    expect(overlappingLabels([at(100, 100, "045°00′00″  20.00", 90), at(110, 100, "MW")])).toEqual([]);
    const sinhala = composeSheet(input({ ...doc, sheet: { ...doc.sheet, landName: "සාම්පල වත්ත" } }));
    expect(sinhala.findings.find((f) => f.code === "TEXT_SCRIPT_NOT_SUPPORTED")?.blocks).toEqual(["export"]);
    const long = composeSheet(input({ ...doc, sheet: { ...doc.sheet, planNumber: "WMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWMWM" } }));
    expect(long.findings.map((f) => f.code)).toContain("TEXT_OVERFLOW");
  });

  it("refuses a boundary with no real area, and diagnoses a crossing ring as crossing", () => {
    const line: SurveyPoint[] = [0, 50, 100].map((d, i) => ({ id: `00000000-0000-4000-8000-00000000010${i}`, pointId: String(i + 1), e: 500_000 + d, n: 600_000, z: null, code: null }));
    const flatDoc = { ...emptyDocument(), lots: [{ id: "l", label: "1", sup: "", note: "", points: line.map((p) => p.id) }] };
    const findings = checkSurvey({ points: line, crs: SLD99, crsConfirmed: true, document: flatDoc, lots: computeLots(line, flatDoc.lots), surveyorProfile: false });
    expect(findings.find((f) => f.code === "BOUNDARY_NO_AREA")?.blocks).toEqual(["export", "approval"]);
    const tie: SurveyPoint[] = [[0, 0], [10, 10], [10, 0], [0, 10]].map(([de, dn], i) => ({ id: `00000000-0000-4000-8000-00000000030${i}`, pointId: String(i + 1), e: 500_000 + de!, n: 600_000 + dn!, z: null, code: null }));
    const tieDoc = { ...emptyDocument(), lots: [{ id: "l", label: "1", sup: "", note: "", points: tie.map((p) => p.id) }] };
    const codes = checkSurvey({ points: tie, crs: SLD99, crsConfirmed: true, document: tieDoc, lots: computeLots(tie, tieDoc.lots), surveyorProfile: false }).map((f) => f.code);
    expect(codes).toContain("BOUNDARY_SELF_INTERSECTS");
    expect(codes).not.toContain("BOUNDARY_NO_AREA");
  });

  it("puts every leg's bearing outside a concave lot on the panel layout", () => {
    const u = [[0, 0], [30, 0], [30, 30], [20, 30], [20, 10], [10, 10], [10, 30], [0, 30]].map(([de, dn], i) => ({ id: `00000000-0000-4000-8000-0000000002${String(i).padStart(2, "0")}`, pointId: String(i + 1), e: 500_000 + de!, n: 600_000 + dn!, z: null, code: null }));
    const uDoc = { ...emptyDocument(), lots: [{ id: "u", label: "U", sup: "", note: "", points: u.map((p) => p.id) }], settings: { ...emptyDocument().settings, template: "panel" as const, faceDimensions: true, paper: "A3" as const, orientation: "landscape" as const } };
    const sheet = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: uDoc, points: u, lots: computeLots(u, uDoc.lots), crs: SLD99, crsConfirmation: "Confirmed", surveyor: null, approval: null });
    const ring = u.map((p) => toPage(sheet.viewport!, p.e, p.n));
    const inside = (x: number, y: number) => ring.reduce((acc, [x1, y1], i) => {
      const [x2, y2] = ring[(i + 1) % ring.length]!;
      return (y1 > y) !== (y2 > y) && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1 ? !acc : acc;
    }, false);
    const labels = sheet.pages[0]!.items.filter((i) => i.kind === "text" && i.layer === "DIMENSIONS");
    expect(labels).toHaveLength(8);
    for (const l of labels) if (l.kind === "text") expect(inside(l.x, l.y)).toBe(false);
  });

  it("formats numbers the same everywhere", () => {
    expect(fmt(1.005, 2)).toBe("1.01");
    expect(fmt(-0.001, 2)).toBe("0.00");
    expect(fmt(1311.118096, 2)).toBe("1,311.12");
    expect(fmt(500012.345, 3)).toBe("500,012.345");
    expect(fmt(-0.5, 1)).toBe("-0.5");
  });
});

describe("exports (synthetic)", () => {
  const doc = sampleDocument();
  const lots = computeLots(SAMPLE_POINTS, doc.lots);

  it("writes an R12 DXF that an independent reader opens with every lot, road and coordinate", () => {
    const dxf = writeDxf({ document: doc, points: SAMPLE_POINTS, lots, crs: SLD99, scale: 500, projectName: "Sample", status: "DRAFT, version 1. Not certified." });
    expect(dxf.startsWith("0\r\nSECTION\r\n2\r\nHEADER\r\n9\r\n$ACADVER\r\n1\r\nAC1009")).toBe(true);
    expect(dxf.trimEnd().endsWith("EOF")).toBe(true);
    expect(/[^\x09\x0a\x0d\x20-\x7e]/.test(dxf)).toBe(false);
    const parsed = new DxfParser().parseSync(dxf)!;
    expect(Object.keys(parsed.tables.layer.layers)).toEqual(expect.arrayContaining(["BOUNDARY", "POINTS", "POINT_NUMBERS", "DIMENSIONS", "BUILDINGS", "WALLS", "ROADS", "ADJOINING"]));
    const boundaries = parsed.entities.filter((e) => e.layer === "BOUNDARY") as unknown as { vertices: { x: number; y: number }[] }[];
    expect(boundaries).toHaveLength(3);
    lots.lots.forEach((r, i) => {
      boundaries[i]!.vertices.forEach((v, k) => {
        expect(Math.abs(v.x - r.parcel!.vertices[k]!.e)).toBeLessThan(0.001);
        expect(Math.abs(v.y - r.parcel!.vertices[k]!.n)).toBeLessThan(0.001);
      });
    });
    const t = parsed.entities.filter((e) => e.type === "TEXT") as unknown as { text: string; layer: string }[];
    expect(t.filter((x) => x.layer === "POINT_NUMBERS").map((x) => x.text).sort()).toEqual(["1", "2", "3", "4", "5", "6", "7", "8"]);
    expect(t.some((x) => x.layer === "DIMENSIONS" && x.text.includes("%%d"))).toBe(true);
    expect(t.some((x) => x.layer === "ROADS" && x.text === "Sample Road")).toBe(true);
    expect(t.some((x) => x.layer === "ADJOINING" && x.text === "Lot 2 in Plan No. SAMPLE-0")).toBe(true);
    expect(t.filter((x) => x.layer === "LOT_TEXT" && x.text === "Lot B")).toHaveLength(3);
    expect(t.some((x) => x.layer === "TEXT" && x.text === "DRAFT, version 1. Not certified.")).toBe(true);
  });

  it("writes CSV that spreadsheets can't run, and GeoJSON with one polygon per lot", () => {
    const csv = pointsCsv([...SAMPLE_POINTS, { id: "x", pointId: "=CMD()", e: 1, n: 2, z: null, code: "+x" }]);
    expect(csv.split("\r\n")[0]).toBe("point,easting,northing,elevation,code");
    expect(csv).toContain("'=CMD(),1,2,,'+x");
    expect(pointsCsv([{ id: "y", pointId: "-1", e: 1, n: 2, z: null, code: null }]).split("\r\n")[1]).toBe("-1,1,2,,");
    const gj = JSON.parse(surveyGeoJson({ points: SAMPLE_POINTS, lots, crs: SLD99, crsConfirmed: false, status: "DRAFT", projectName: "Sample" }));
    expect(gj.farbaek).toMatchObject({ coordinate_system_confirmed: false, status: "DRAFT" });
    expect(gj.crs.properties.name).toBe("urn:ogc:def:crs:EPSG::5235");
    const parcels = gj.features.filter((f: { properties: { kind: string } }) => f.properties.kind === "parcel");
    expect(parcels.map((f: { properties: { lot: string } }) => f.properties.lot)).toEqual(["B1", "B2", "B3"]);
    for (const f of parcels) {
      const ring = f.geometry.coordinates[0];
      expect(ring[0]).toEqual(ring[ring.length - 1]);
    }
    expect(parcels.reduce((s: number, f: { properties: { area_m2: number } }) => s + f.properties.area_m2, 0)).toBeCloseTo(SAMPLE_AREA_M2, 6);
  });

  it("keeps an empty document drawable", () => {
    const empty = composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: emptyDocument(), points: [], lots: computeLots([], []), crs: null, crsConfirmation: null, surveyor: null, approval: null });
    expect(empty.viewport).toBeNull();
    expect(empty.pages).toHaveLength(1);
  });
});

describe("the second review's cases (synthetic)", () => {
  /** Points on a local grid, offset into SLD99's range: number, east, north. */
  const grid = (rows: [string, number, number][]): SurveyPoint[] => rows.map(([n, e, nn]) => ({ id: `00000000-0000-4000-9000-${n.padStart(12, "0")}`, pointId: n, e: 500_000 + e, n: 600_000 + nn, z: null, code: null }));
  const lot = (pts: SurveyPoint[], label: string, numbers: string[]) => ({ id: `lot-${label}`, label, sup: "", note: "", points: numbers.map((n) => pts.find((p) => p.pointId === n)!.id) });
  const docOf = (lots: ReturnType<typeof lot>[]) => ({ ...emptyDocument(), lots });
  const qcOf = (pts: SurveyPoint[], d: ReturnType<typeof emptyDocument>) => checkSurvey({ points: pts, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(pts, d.lots), surveyorProfile: false }).map((f) => f.code);
  const square = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10]]);
  const compose = (d: ReturnType<typeof emptyDocument>, pts: readonly SurveyPoint[]) => composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: d, points: pts, lots: computeLots(pts, d.lots), crs: SLD99, crsConfirmation: "Test", surveyor: null, approval: null });

  it("catches one lot entered twice, which would double the extent", () => {
    for (const second of [["1", "2", "3", "4"], ["4", "3", "2", "1"]]) {
      const lots = [lot(square, "A", ["1", "2", "3", "4"]), lot(square, "B", second)];
      expect(computeLots(square, lots).overlaps).toEqual([[0, 1]]);
      expect(qcOf(square, docOf(lots))).toContain("LOTS_OVERLAP");
    }
  });

  it("finds a gap pinched against the outline at one corner, whatever order the lots come in", () => {
    const pts = grid([["1", 0, 0], ["2", 20, 0], ["3", 20, 20], ["4", 0, 20], ["5", 0, 10], ["6", 10, 5], ["7", 10, 15]]);
    const a = lot(pts, "A", ["3", "4", "5", "7"]);
    const b = lot(pts, "B", ["2", "3", "7", "6"]);
    const c = lot(pts, "C", ["1", "2", "6", "5"]);
    for (const order of [[a, b, c], [b, c, a], [c, a, b], [a, c, b]]) {
      const r = computeLots(pts, order);
      expect([r.holes, r.pieces]).toEqual([1, 1]);
      expect(qcOf(pts, docOf(order))).toContain("LOTS_GAP");
    }
  });

  it("reads a T-junction as joined, with nothing missing", () => {
    // Lot B's corner 5 rests on lot A's leg 2-3 without being one of A's corners.
    const pts = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10], ["5", 10, 5], ["6", 20, 5], ["7", 20, 10]]);
    const r = computeLots(pts, [lot(pts, "A", ["1", "2", "3", "4"]), lot(pts, "B", ["5", "6", "7", "3"])]);
    expect([r.overlaps, r.holes, r.pieces]).toEqual([[], 0, 1]);
    expect(r.outlineAreaM2).toBeCloseTo(150, 9);
    expect(r.sumAreaM2).toBeCloseTo(150, 9);
  });

  it("names two corner numbers a couple of millimetres apart as probably one mark", () => {
    const pts = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10], ["20", 10.002, 0], ["30", 10.002, 10], ["5", 20, 0], ["6", 20, 10]]);
    expect(qcOf(pts, docOf([lot(pts, "A", ["1", "2", "3", "4"]), lot(pts, "B", ["20", "5", "6", "30"])]))).toContain("POINTS_NEAR_DUPLICATE");
  });

  it("keeps an adjoining land on its leg however the lot's corners are listed, and stops the export when the leg is gone", () => {
    const d = sampleDocument();
    const b2 = d.lots.find((l) => l.id === "lot-b2")!;
    b2.points = [b2.points[1]!, b2.points[2]!, b2.points[3]!, b2.points[0]!];
    const adjText = (s: ReturnType<typeof compose>) => s.pages[0]!.items.filter((i) => i.kind === "text" && i.layer === "ADJOINING").map((i) => (i as { text: string }).text).join(" ");
    expect(adjText(compose(d, SAMPLE_POINTS))).toContain("sample owner");
    // Leave out corner 6: the label's leg 6 to 7 no longer exists.
    const six = SAMPLE_POINTS.find((p) => p.pointId === "6")!.id;
    b2.points = b2.points.filter((id) => id !== six);
    expect(qcOf(SAMPLE_POINTS, d)).toContain("ADJOINING_NO_LEG");
    expect(adjText(compose(d, SAMPLE_POINTS))).not.toContain("sample owner");
  });

  it("writes a lot's label inside that lot, even a narrow access strip", () => {
    const pts = grid([["1", 0, 0], ["2", 80, 0], ["3", 80, 80], ["4", 77, 80], ["5", 77, 3], ["6", 0, 3], ["7", 0, 80]]);
    const strip = lot(pts, "R", ["1", "2", "3", "4", "5", "6"]);
    const rest = lot(pts, "A", ["6", "5", "4", "7"]);
    for (const scale of [500, 1000]) {
      const d = { ...docOf([rest, strip]), settings: { ...emptyDocument().settings, scale } };
      const sheet = compose(d, pts);
      const label = sheet.pages[0]!.items.find((i) => i.kind === "text" && i.entity === "lot:lot-R") as { x: number; y: number } | undefined;
      expect(label).toBeDefined();
      const at = toModel(sheet.viewport!, label!.x, label!.y);
      const e = at.e - 500_000;
      const n = at.n - 600_000;
      // Inside the L: the 3 m strip along the south or along the east.
      expect((n > 0 && n < 3 && e > 0 && e < 80) || (e > 77 && e < 80 && n > 0 && n < 80)).toBe(true);
    }
  });

  it("asks for a lot's label instead of inventing one, and upgrades stage 190's unchecked legend to the common list", () => {
    const sheetV1 = { planNumber: "", planDate: "", lot: "", landName: "", village: "", gnDivision: "", dsDivision: "", district: "", province: "", previousPlans: "", boundaries: { north: "", east: "", south: "", west: "" }, statedExtent: "", surveyDate: "", remarks: "", legend: [["MW", "Masonry wall"], ["MDn", "Masonry drain"], ["CP", "Concrete post"], ["EP", "Electric post"], ["TP", "Telephone post"], ["St", "Stake"], ["M", "Mark"], ["P", "Permanent building"], ["NF", "Net fence"], ["RW", "Retaining wall"]].map(([code, meaning]) => ({ code, meaning })) };
    const v1 = { schema: 1, boundary: SAMPLE_POINTS.slice(0, 4).map((p) => p.id), features: [], labelOffsets: { "lot-extent": { dx: 1, dy: 2 } }, layers: Object.fromEntries(Object.entries(emptyDocument().layers).filter(([k]) => k !== "ADJOINING")), sheet: sheetV1, settings: { paper: "A3", orientation: "landscape", scale: null, perchDecimals: 2, secondDecimals: 0, distanceDecimals: 2, overleaf: true, permitBox: false }, surveyorUserId: null };
    const up = parseSurveyDocument(v1)!;
    expect(up.lots[0]!.label).toBe("");
    expect(up.labelOffsets["lot-extent:lot-1"]).toEqual({ dx: 1, dy: 2 });
    expect(surveyDocumentSchema.safeParse(up).success).toBe(true);
    expect(qcOf(SAMPLE_POINTS, up)).toEqual(expect.arrayContaining(["LOT_LABEL_MISSING", "LEGEND_UNREVIEWED"]));
    const long = parseSurveyDocument({ ...v1, sheet: { ...sheetV1, lot: "Lot 12 of Plan 1234" } })!;
    expect(surveyDocumentSchema.safeParse(long).success).toBe(true);
    // A surveyor who rewrote a meaning keeps their words.
    const edited = parseSurveyDocument({ ...v1, sheet: { ...sheetV1, legend: sheetV1.legend.map((e) => (e.code === "P" ? { ...e, meaning: "Permanent building, 2 storey" } : e)) } })!;
    expect(edited.codes.find((c) => c.code === "P")!.meaning).toBe("Permanent building, 2 storey");
  });

  it("ignores marks for items no longer on the plan", () => {
    const d = sampleDocument();
    d.provenance["lot:gone"] = { source: "ai_brief", reviewed: false };
    d.provenance["sheet.landName"] = { source: "ai_brief", reviewed: false };
    expect(unreviewed(d)).toEqual(["sheet.landName"]);
  });

  it("labels each leg once in the DXF, shared legs included", () => {
    const d = sampleDocument();
    const dxf = writeDxf({ document: d, points: SAMPLE_POINTS, lots: computeLots(SAMPLE_POINTS, d.lots), crs: SLD99, scale: 500, projectName: "Sample", status: "DRAFT" });
    const parsed = new DxfParser().parseSync(dxf)!;
    const dims = (parsed.entities.filter((e) => e.type === "TEXT") as unknown as { text: string; layer: string }[]).filter((t) => t.layer === "DIMENSIONS");
    // B1 has 5 legs, B2 and B3 4 each; 7-8, 8-3 and 8-5 are shared.
    expect(dims).toHaveLength(10);
  });
});

describe("the second review's re-check (synthetic)", () => {
  const compose = (d: ReturnType<typeof sampleDocument>) => composeSheet({ template: SRI_LANKA_CADASTRAL_V1, document: d, points: SAMPLE_POINTS, lots: computeLots(SAMPLE_POINTS, d.lots), crs: SLD99, crsConfirmation: "Test", surveyor: null, approval: null });

  it("reads plans saved while stage 191 was built, with an adjoining land's leg as a number", () => {
    const d = sampleDocument() as unknown as Record<string, unknown>;
    const old = { ...d, adjoining: [{ id: "adj-west", text: "Land claimed by the sample owner", lot: "lot-b2", leg: 3 }, { id: "adj-gone", text: "Gone", lot: "lot-x", leg: 0 }] };
    const up = parseSurveyDocument(old)!;
    expect(up.adjoining).toEqual([{ id: "adj-west", text: "Land claimed by the sample owner", lot: "lot-b2", from: SAMPLE_POINTS.find((p) => p.pointId === "6")!.id, to: SAMPLE_POINTS.find((p) => p.pointId === "7")!.id }]);
  });

  it("stops the export when text runs past the border, and says when a lot's label is bigger than the lot", () => {
    const d = sampleDocument();
    d.labelOffsets["adjoining:adj-east"] = { dx: 60, dy: 0 };
    expect(compose(d).findings.map((f) => f.code)).toContain("TEXT_OFF_SHEET");
    const tiny = sampleDocument();
    tiny.settings.scale = 10000;
    tiny.settings.paper = "A4";
    expect(compose(tiny).findings.map((f) => f.code)).toContain("LOT_LABEL_CRAMPED");
  });

  it("keeps drawing labels off the north arrow", () => {
    const sheet = compose(sampleDocument());
    const front = sheet.pages[0]!.items;
    const arrow = front.filter((i) => i.kind === "path" && i.layer === "TITLE");
    const xs = arrow.flatMap((i) => (i.kind === "path" ? i.points.map((p) => p[0]) : []));
    const right = Math.min(...xs.filter((x) => x > 150));
    const labels = front.filter((i) => i.kind === "text" && i.layer === "ADJOINING") as { x: number }[];
    expect(labels.every((t) => t.x < right)).toBe(true);
  });
});

describe("near misses and the stated extent (stage 192, synthetic)", () => {
  const grid = (rows: [string, number, number][]): SurveyPoint[] => rows.map(([n, e, nn]) => ({ id: `00000000-0000-4000-a000-${n.padStart(12, "0")}`, pointId: n, e: 500_000 + e, n: 600_000 + nn, z: null, code: null }));
  const lot = (pts: SurveyPoint[], label: string, numbers: string[]) => ({ id: `lot-${label}`, label, sup: "", note: "", points: numbers.map((n) => pts.find((p) => p.pointId === n)!.id) });
  const check = (pts: SurveyPoint[], d: ReturnType<typeof emptyDocument>) => checkSurvey({ points: pts, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(pts, d.lots), surveyorProfile: false });

  it("names a corner a few centimetres off a neighbour's leg, and lets the surveyor keep it as surveyed", () => {
    // Lot B's corner 5 is 3 cm east of lot A's leg 2-3: the lots nearly meet.
    const pts = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10], ["5", 10.03, 5], ["6", 20, 5], ["7", 20, 10]]);
    const d = { ...emptyDocument(), lots: [lot(pts, "A", ["1", "2", "3", "4"]), lot(pts, "B", ["5", "6", "7", "3"])] };
    const near = check(pts, d).find((f) => f.code === "CORNER_NEAR_LEG")!;
    expect(near.message).toBe("The lots nearly meet: corner 5 is 3.0 cm off lot A's leg 2 to 3.");
    expect(near.blocks).toEqual(["approval"]);
    expect(near.keep).toEqual({ key: expect.stringMatching(/^leg:/), kept: false });
    const kept = { ...d, kept: [near.keep!.key] };
    const after = check(pts, kept);
    expect(after.map((f) => f.code)).not.toContain("CORNER_NEAR_LEG");
    expect(after.find((f) => f.code === "CORNER_NEAR_LEG_KEPT")!.blocks).toEqual([]);
    // A corner exactly on the leg is a T-junction, not a near miss; one 10 cm off isn't near.
    for (const e of [10, 10.1]) {
      const p2 = pts.map((p) => (p.pointId === "5" ? { ...p, e: 500_000 + e } : p));
      expect(check(p2, d).map((f) => f.code)).not.toContain("CORNER_NEAR_LEG");
    }
  });

  it("keeps two marks a few millimetres apart only on the surveyor's word", () => {
    const pts = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10], ["20", 10.002, 0], ["30", 10.002, 10], ["5", 20, 0], ["6", 20, 10]]);
    const d = { ...emptyDocument(), lots: [lot(pts, "A", ["1", "2", "3", "4"]), lot(pts, "B", ["20", "5", "6", "30"])] };
    const dups = check(pts, d).filter((f) => f.code === "POINTS_NEAR_DUPLICATE");
    expect(dups.map((f) => f.message)).toEqual(["Corner points 2 and 20 are 2.0 mm apart: probably one mark observed twice.", "Corner points 3 and 30 are 2.0 mm apart: probably one mark observed twice."]);
    const after = check(pts, { ...d, kept: [dups[0]!.keep!.key] }).map((f) => f.code);
    expect(after.filter((c) => c === "POINTS_NEAR_DUPLICATE")).toHaveLength(1);
    expect(after).toContain("POINTS_NEAR_DUPLICATE_KEPT");
  });

  it("sets the stated extent beside the computed land, in the deed's own units, and never in its place", () => {
    const d = sampleDocument();
    // The Sample's land is 2,267.41 m² = 89.6459... perches = 0 A. 2 R. 09.65 P.
    d.sheet.statedExtent = "0 A. 2 R. 09.65 P.";
    const agree = checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(SAMPLE_POINTS, d.lots), surveyorProfile: false });
    expect(agree.find((f) => f.code === "STATED_EXTENT_AGREES")).toBeDefined();
    d.sheet.statedExtent = "0 A. 2 R. 20 P.";
    const differ = checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(SAMPLE_POINTS, d.lots), surveyorProfile: false }).find((f) => f.code === "STATED_EXTENT_DIFFERS")!;
    // 100 P = 2,529.29 m²; the difference is 10.35 P (261.88 m², 11.5%).
    expect(differ.detail).toBe("Stated 2,529.29 m², computed 2,267.41 m²: the stated extent is 10.35 perches (11.5%) more. It comes to 100.00 perches, a round figure as a deed's extent usually is: it may be the title's extent, not this survey's.");
    expect(differ.blocks).toEqual([]);
    d.sheet.statedExtent = "about half an acre";
    expect(checkSurvey({ points: SAMPLE_POINTS, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(SAMPLE_POINTS, d.lots), surveyorProfile: false }).map((f) => f.code)).toContain("STATED_EXTENT_UNREAD");
  });
});

describe("the lot schedule CSV (stage 192, synthetic)", () => {
  it("lists every lot, the sum and the entire land, in plain numbers, from the engine's own areas", () => {
    const d = sampleDocument();
    const csv = lotScheduleCsv(computeLots(SAMPLE_POINTS, d.lots), 2);
    expect(csv.split("\r\n")).toEqual([
      "lot,corners,area_m2,hectares,acres_roods_perches",
      "Lot B1,1 2 3 8 7,1057.380,0.10574,0 A. 1 R. 01.81 P.",
      "Lot B2,7 8 5 6,585.025,0.05850,0 A. 0 R. 23.13 P.",
      "Lot B3,8 3 4 5,625.005,0.06250,0 A. 0 R. 24.71 P.",
      "Sum of the lots,,2267.410,0.22674,0 A. 2 R. 09.65 P.",
      expect.stringMatching(/^Entire land,[\d ]+,2267\.410,0\.22674,0 A\. 2 R\. 09\.65 P\.$/),
      "",
    ]);
  });
});

describe("field codes with two codes and a note, and the inverse (stage 192, synthetic)", () => {
  const p = (n: string, e: number, nn: number, code: string | null, z: number | null = null): SurveyPoint => ({ id: `00000000-0000-4000-b000-${n.padStart(12, "0")}`, pointId: n, e, n: nn, z, code });

  it("joins a point with two codes into both lines, and reads a note after a slash as a note", () => {
    const pts = [p("1", 0, 0, "MW"), p("2", 10, 0, "MW"), p("3", 20, 0, "CP MW"), p("4", 20, 10, "CP LF / found"), p("5", 20, 20, "LF END"), p("6", 30, 30, "St / disturbed")];
    const s = suggestFeatures(pts, commonCodes());
    expect(s.map((f) => [f.code, f.pointNumbers.join(" ")])).toEqual([
      ["MW", "1 2 3"],
      ["LF", "4 5"],
    ]);
    expect(codeOf("St / disturbed")).toBe("St");
    expect(codeNote("St / disturbed")).toBe("disturbed");
  });

  it("works out the inverse between two points by hand", () => {
    // 3-4-5 triangle: bearing atan2(3, 4) = 36.869897...°, distance 5.
    const r = inverse(p("1", 500_000, 600_000, null, 21.5), p("2", 500_003, 600_004, null, 22));
    expect(r.distanceM).toBeCloseTo(5, 12);
    expect(r.bearing!).toBeCloseTo(36.86989764584402, 10);
    expect(formatDms(toDms(r.bearing!, 0))).toBe("036°52′12″");
    expect([r.dE, r.dN, r.dZ]).toEqual([3, 4, 0.5]);
    expect(inverse(p("1", 1, 1, null), p("2", 1, 1, null)).bearing).toBeNull();
  });
});

describe("the stage 192 review's cases (synthetic)", () => {
  const p = (n: string, e: number, nn: number, code: string | null): SurveyPoint => ({ id: `00000000-0000-4000-d000-${n.padStart(12, "0")}`, pointId: n, e, n: nn, z: null, code });

  it("keeps END and CLO with their line code, and never reads description words as codes", () => {
    const pts = [p("1", 0, 0, "MW"), p("2", 10, 0, "MW wall END"), p("3", 20, 0, "MW"), p("4", 30, 0, "MW"), p("5", 40, 0, "MW t junction"), p("6", 50, 0, "LF b")];
    const s = suggestFeatures(pts, commonCodes());
    expect(s.map((f) => [f.code, f.pointNumbers.join(" ")])).toEqual([
      ["MW", "1 2"],
      ["MW", "3 4 5"],
    ]);
  });

  it("finds a corner a few centimetres from a neighbour's corner, and every near miss however many", () => {
    const grid = (rows: [string, number, number][]) => rows.map(([n, e, nn]) => p(n, 500_000 + e, 600_000 + nn, null));
    const pts = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10], ["30", 10.03, 10], ["5", 20, 10], ["6", 20, 20], ["7", 10, 20]]);
    const lot = (label: string, ns: string[]) => ({ id: `lot-${label}`, label, sup: "", note: "", points: ns.map((n) => pts.find((x) => x.pointId === n)!.id) });
    const d = { ...emptyDocument(), lots: [lot("A", ["1", "2", "3", "4"]), lot("B", ["30", "5", "6", "7"])] };
    const codes = checkSurvey({ points: pts, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(pts, d.lots), surveyorProfile: false });
    expect(codes.find((f) => f.code === "POINTS_NEAR_DUPLICATE")!.message).toBe("Corner points 3 and 30 are 30.0 mm apart: perhaps one mark observed twice.");
    // Thirty separate pairs, all reported.
    const many: SurveyPoint[] = [];
    const lots = [];
    for (let i = 0; i < 30; i++) {
      const x = i * 100;
      const a = grid([[`a${i}`, x, 0], [`b${i}`, x + 10, 0], [`c${i}`, x + 10, 10], [`d${i}`, x, 10]]);
      const b = grid([[`e${i}`, x + 10.002, 0], [`f${i}`, x + 20, 0], [`g${i}`, x + 20, 10], [`h${i}`, x + 10.002, 10]]);
      many.push(...a, ...b);
      lots.push({ id: `A${i}`, label: `A${i}`, sup: "", note: "", points: a.map((q) => q.id) }, { id: `B${i}`, label: `B${i}`, sup: "", note: "", points: b.map((q) => q.id) });
    }
    expect(computeLots(many, lots).nearDuplicates).toHaveLength(60);
  });

  it("keeps earlier approvals valid: a document with no kept near misses hashes as before the field existed", async () => {
    const d = sampleDocument();
    const withField = await approvalHash({ document: d, crsId: "EPSG:5235", points: SAMPLE_POINTS });
    const { kept: _kept, ...older } = d;
    void _kept;
    const withoutField = await approvalHash({ document: parseSurveyDocument(older)!, crsId: "EPSG:5235", points: SAMPLE_POINTS });
    expect(withoutField).toBe(withField);
    const keptOne = await approvalHash({ document: { ...d, kept: ["dup:a|b"] }, crsId: "EPSG:5235", points: SAMPLE_POINTS });
    expect(keptOne).not.toBe(withField);
  });

  it("compares the stated extent with separate pieces of land too", () => {
    const grid = (rows: [string, number, number][]) => rows.map(([n, e, nn]) => p(n, 500_000 + e, 600_000 + nn, null));
    const pts = grid([["1", 0, 0], ["2", 10, 0], ["3", 10, 10], ["4", 0, 10], ["5", 50, 0], ["6", 60, 0], ["7", 60, 10], ["8", 50, 10]]);
    const lot = (label: string, ns: string[]) => ({ id: `lot-${label}`, label, sup: "", note: "", points: ns.map((n) => pts.find((x) => x.pointId === n)!.id) });
    const d = { ...emptyDocument(), lots: [lot("A", ["1", "2", "3", "4"]), lot("B", ["5", "6", "7", "8"])] };
    d.sheet.statedExtent = "200 m²";
    const f = checkSurvey({ points: pts, crs: SLD99, crsConfirmed: true, document: d, lots: computeLots(pts, d.lots), surveyorProfile: false });
    expect(f.map((x) => x.code)).toContain("STATED_EXTENT_AGREES");
  });
});

describe("the stage 192 re-check (synthetic)", () => {
  const p = (n: string, e: number, nn: number, code: string | null): SurveyPoint => ({ id: `00000000-0000-4000-e000-${n.padStart(12, "0")}`, pointId: n, e, n: nn, z: null, code });

  it("still finds two numbers 2 mm apart on one lot", () => {
    const pts = [p("1", 500_000, 600_000, null), p("2", 500_010, 600_000, null), p("5", 500_010, 600_010, null), p("105", 500_010, 600_010.002, null), p("4", 500_000, 600_010, null)];
    const lot = { id: "lot-A", label: "A", sup: "", note: "", points: ["1", "2", "5", "105", "4"].map((n) => pts.find((x) => x.pointId === n)!.id) };
    expect(computeLots(pts, [lot]).nearDuplicates.map((d) => [d.a.pointId, d.b.pointId].sort().join(" "))).toEqual(["105 5"]);
  });

  it("reads descriptions after a code as a description, upper case or not", () => {
    const pts = [p("1", 0, 0, "MW T jn"), p("2", 10, 0, "MW T jn"), p("3", 20, 0, "LF B"), p("4", 30, 0, "LF B"), p("5", 40, 0, "MW MW"), p("6", 50, 0, "MW MW")];
    expect(suggestFeatures(pts, commonCodes()).map((f) => [f.code, f.pointNumbers.join(" ")])).toEqual([
      ["MW", "1 2"],
      ["LF", "3 4"],
      ["B", "3 4"],
      ["MW", "5 6"],
    ]);
  });

  it("matches the approval hash formula used before the kept, rules, sketch and grammar fields existed", async () => {
    const d = sampleDocument();
    const { kept: _k, rules: _r, sketch: _s, grammar: _g, ...older } = d;
    void _k;
    void _r;
    void _s;
    void _g;
    const used = usedPointIds(d);
    const points = SAMPLE_POINTS.filter((x) => used.has(x.id)).map((x) => ({ id: x.id, point: x.pointId, e: x.e, n: x.n, z: x.z, code: x.code })).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    const before = await sha256Hex(canonicalize({ engine: SURVEY_ENGINE_VERSION, crs: "EPSG:5235", document: older, points }));
    expect(await approvalHash({ document: d, crsId: "EPSG:5235", points: SAMPLE_POINTS })).toBe(before);
  });
});
