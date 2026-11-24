/**
 * Points from a DXF drawing (stage 242, ADR 0250), on SYNTHETIC drawings: laid out as surveying software exports them (a block at each
 * point with its number beside it, as Sokkia Link does; blocks with attributes, as Carlson and Civil 3D do) and as Farbaek's own DXF
 * writes them. Made-up points on a local grid.
 */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument } from "../document";
import { writeDxf } from "../export/dxf";
import { computeLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { looksLikeDxf, parseDxfPoints } from "./dxfpoints";

type Codes = [number, string | number][];
const ent = (type: string, codes: Codes) => ["0", type, ...codes.flatMap(([c, v]) => [String(c), String(v)])];
const drawing = (entities: string[][], header: Codes = []) =>
  [...(header.length ? ["0", "SECTION", "2", "HEADER", ...header.flatMap(([c, v]) => [String(c), String(v)]), "0", "ENDSEC"] : []), "0", "SECTION", "2", "ENTITIES", ...entities.flat(), "0", "ENDSEC", "0", "EOF"].join("\r\n");

/** A Sokkia-like point: the block, its number 0.3 east and 0.05 north of it, its height 0.4 below the number. */
const spot = (id: string, e: number, n: number, z = 0) => [
  ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, e], [20, n], [30, z]]),
  ent("TEXT", [[8, "STEXT"], [10, e + 0.3], [20, n + 0.05], [30, 0], [40, 0.3], [1, id]]),
  ent("TEXT", [[8, "STEXT3"], [10, e + 0.3], [20, n - 0.35], [30, 0], [40, 0.3], [1, z.toFixed(3)]]),
];
const station = [ent("CIRCLE", [[8, "STN"], [10, 100], [20, 100], [30, 0], [40, 0.5]]), ent("TEXT", [[8, "TEXT"], [10, 100.35], [20, 100.35], [40, 0.3], [1, "100"]])];

describe("points from a DXF drawing", () => {
  it("is known by its opening group codes", () => {
    expect(looksLikeDxf(drawing([]))).toBe(true);
    expect(looksLikeDxf("999\r\nmade by a test\r\n0\r\nSECTION\r\n")).toBe(true);
    expect(looksLikeDxf("Point,Easting,Northing\n")).toBe(false);
  });

  it("numbers each block by the text at the offset every point shares, even where the next point's number is nearer", () => {
    // 28 and 29 lie 0.07 m apart: 29's number is nearer to 28 than 28's own is.
    const r = parseDxfPoints(drawing([...station, ...spot("1", 96.413, 94.163), ...spot("28", 108.355, 115.832, 12.5), ...spot("29", 108.302, 115.779), ...spot("A3", 101, 105)]));
    expect(r.points.map((p) => [p.pointId, p.e, p.n, p.z])).toEqual([
      ["1", 96.413, 94.163, 0],
      ["28", 108.355, 115.832, 12.5],
      ["29", 108.302, 115.779, 0],
      ["A3", 101, 105, 0],
    ]);
    // The heights' layer is never taken for numbers; the station's circle and text are left out, and said.
    expect(r.issues).toEqual([{ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: "Left out, as not numbered points: 1 line, circle or other shape." }]);
  });

  it("reads blocks with attributes, their code, and on a flat drawing their height attribute, said so", () => {
    const pnt = (id: string, e: number, n: number, elev: string, desc: string) => [
      ent("INSERT", [[8, "PNTS"], [2, "PNT"], [66, 1], [10, e], [20, n], [30, 0]]),
      ent("ATTRIB", [[8, "PNTS"], [10, e], [20, n], [2, "PNTNO"], [1, id]]),
      ent("ATTRIB", [[8, "PNTS"], [10, e], [20, n], [2, "ELEV"], [1, elev]]),
      ent("ATTRIB", [[8, "PNTS"], [10, e], [20, n], [2, "DESC"], [1, desc]]),
      ent("SEQEND", [[8, "PNTS"]]),
    ];
    const ok = parseDxfPoints(drawing([...pnt("1", 10, 20, "5.250", "CP"), ...pnt("2", 30, 20, "5.400", "MW")]));
    expect(ok.points.map((p) => [p.pointId, p.e, p.n, p.z, p.code])).toEqual([]);
    // PNTNO isn't a number tag Farbaek knows: nothing is guessed, and the blocks are left out.
    expect(ok.issues.at(-1)!.message).toBe("No numbered points were found in the drawing: no POINT or block with a number attribute, or with its number written beside it. Export the points as CSV instead.");
    const named = (id: string, e: number, n: number, elev: string, desc: string) => pnt(id, e, n, elev, desc).map((x) => x.map((v) => (v === "PNTNO" ? "PNT" : v)));
    const r = parseDxfPoints(drawing([...named("1", 10, 20, "5.250", "CP"), ...named("2", 30, 20, "5.400", "MW")]));
    expect(r.points.map((p) => [p.pointId, p.e, p.n, p.z, p.code])).toEqual([["1", 10, 20, 5.25, "CP"], ["2", 30, 20, 5.4, "MW"]]);
    expect(r.issues[0]!.message).toBe("The drawing is flat (every point at height 0), so 2 heights were read from the blocks' height attribute.");
    // Where the drawing has heights and a label says otherwise, Farbaek doesn't choose.
    const clash = parseDxfPoints(drawing([...named("1", 10, 20, "5.250", "CP").map((x, i) => (i === 0 ? ent("INSERT", [[8, "PNTS"], [2, "PNT"], [66, 1], [10, 10], [20, 20], [30, 6]]) : x)), ...named("2", 30, 20, "5.400", "MW")]));
    expect(clash.issues.find((i) => i.severity === "error")!.message).toMatch(/point 1: its height in the drawing is 6 and its label says 5\.250\. Farbaek doesn't choose/);
  });

  it("reads Farbaek's own DXF back: its corners by their number labels, never its codes or dimensions", () => {
    const at = (pointId: string, e: number, n: number, code: string | null): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code });
    const pts = [at("1", 5000, 5000, "CP"), at("2", 5020, 5000, "CP"), at("3", 5020, 5015, "CP"), at("4", 5000, 5015, "CP")];
    const doc = { ...emptyDocument(), codes: commonCodes(), lots: [{ id: "a", label: "A", sup: "", points: pts.map((p) => p.id), note: "" }] };
    const dxf = writeDxf({ document: doc, points: pts, lots: computeLots(pts, doc.lots), crs: null, scale: 500, projectName: "Synthetic", status: "DRAFT" });
    const r = parseDxfPoints(dxf);
    expect(r.issues.filter((i) => i.severity === "error")).toEqual([]);
    expect(r.points.map((p) => [p.pointId, p.e, p.n])).toEqual(pts.map((p) => [p.pointId, p.e, p.n]));
  });

  it("refuses what it can't place or number: other units, a point without its number, two numbers at one point, a turned block", () => {
    expect(parseDxfPoints(drawing(spot("1", 1, 2), [[9, "$INSUNITS"], [70, 2]])).issues[0]!.message).toMatch(/^The drawing says its units aren't metres \(\$INSUNITS 2\)/);
    expect(parseDxfPoints(drawing([...spot("1", 1, 2), ...spot("2", 6, 2)], [[9, "$INSUNITS"], [70, 6]])).points).toHaveLength(2);
    // One point alone can't show the offset its number sits at: it isn't numbered by a guess.
    expect(parseDxfPoints(drawing(spot("1", 1, 2))).points).toEqual([]);
    // Nine numbered, one without its number: the group is points, and the one is refused with its line.
    const ten = Array.from({ length: 10 }, (_, i) => spot(String(i + 1), i * 5, 0)).flat();
    const missing = parseDxfPoints(drawing(ten.filter((x) => !(x[1] === "TEXT" && x.includes("STEXT") && x.at(-1) === "10"))));
    expect(missing.issues.find((i) => i.severity === "error")).toMatchObject({ code: "MISSING_POINT_ID", message: expect.stringMatching(/the block X on layer SPOTX at 45\.000, 0\.000 has no number beside it/) });
    const twice = parseDxfPoints(drawing([...ten, ent("TEXT", [[8, "STEXT"], [10, 45.3], [20, 0.05], [40, 0.3], [1, "99"]])]));
    expect(twice.issues.find((i) => i.severity === "error")!.message).toMatch(/at 45\.000, 0\.000 has two texts where its number would be/);
    const turned = parseDxfPoints(drawing([ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, 1], [20, 2], [30, 0], [210, 0], [220, 0], [230, -1]])]));
    expect(turned.issues[0]!.message).toMatch(/drawn in another plane/);
  });

  it("leaves out blocks that aren't points, and refuses two layers that could both be the numbers", () => {
    const ten = Array.from({ length: 10 }, (_, i) => spot(String(i + 1), i * 5, 0)).flat();
    const arrow = ent("INSERT", [[8, "SHEET"], [2, "NORTH"], [10, 200], [20, 200], [30, 0]]);
    const r = parseDxfPoints(drawing([...ten, arrow]));
    expect(r.points).toHaveLength(10);
    expect(r.issues.at(-1)!.message).toBe("Left out, as not numbered points: 1 block NORTH on layer SHEET, which appears once.");
    const copy = ten.filter((x) => x.includes("STEXT")).map((x) => x.map((v) => (v === "STEXT" ? "NUMBERS" : v)));
    expect(parseDxfPoints(drawing([...ten, ...copy])).issues[0]!.message).toMatch(/^Two layers could hold the point numbers \((STEXT and NUMBERS|NUMBERS and STEXT)\)/);
  });

  it("refuses what isn't an ASCII DXF", () => {
    expect(parseDxfPoints("AutoCAD Binary DXF\r\n\u001a\u0000").issues[0]!.code).toBe("NOT_TEXT");
    expect(parseDxfPoints("0\r\nSECTION\r\nnot a code\r\nx").issues[0]!.message).toMatch(/group codes couldn't be read/);
  });
});
