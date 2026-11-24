/**
 * Faults a fresh review found in stage 242's readers (ADR 0250), each reproduced and kept fixed. SYNTHETIC drawings and printouts.
 */
import { describe, expect, it } from "vitest";
import { unreadableFile } from "./detect";
import { parseDxfPoints } from "./dxfpoints";
import { parseSokkiaList } from "./sokkialist";

type Codes = [number, string | number][];
const ent = (type: string, codes: Codes) => ["0", type, ...codes.flatMap(([c, v]) => [String(c), String(v)])];
const body = (entities: string[][]) => ["0", "SECTION", "2", "ENTITIES", ...entities.flat(), "0", "ENDSEC"];
const drawing = (entities: string[][], header: Codes = []) =>
  [...(header.length ? ["0", "SECTION", "2", "HEADER", ...header.flatMap(([c, v]) => [String(c), String(v)]), "0", "ENDSEC"] : []), ...body(entities), "0", "EOF"].join("\r\n");
const spot = (id: string, e: number, n: number, z = 0) => [
  ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, e], [20, n], [30, z]]),
  ent("TEXT", [[8, "STEXT"], [10, e + 0.3], [20, n + 0.05], [30, 0], [40, 0.3], [1, id]]),
];
const ten = Array.from({ length: 10 }, (_, i) => spot(String(i + 1), i * 5, 0)).flat();
const ids = (text: string) => parseDxfPoints(text).points.map((p) => p.pointId);
const errors = (text: string) => parseDxfPoints(text).issues.filter((i) => i.severity === "error").map((i) => i.message);

describe("a DXF read whole, or not at all", () => {
  it("refuses a drawing cut short, rather than read part of it", () => {
    const cut = ["0", "SECTION", "2", "ENTITIES", ...ten.slice(0, 12).flat()].join("\r\n");
    expect(parseDxfPoints(cut).points).toEqual([]);
    expect(errors(cut)[0]).toMatch(/cut short/);
    // Its entities' section ended but not the file: still cut short.
    expect(errors(body(ten).join("\r\n"))[0]).toMatch(/stops before its end mark/);
  });

  it("reads a whole drawing with blank lines or an end-of-file character after its end mark", () => {
    expect(ids(`${drawing(ten)}\r\n\r\n`)).toHaveLength(10);
    expect(ids(`${drawing(ten)}\r\n${String.fromCharCode(26)}\r\n`)).toHaveLength(10);
  });

  it("names a binary DXF as one, wherever it's met", () => {
    const binary = `AutoCAD Binary DXF\r\n${String.fromCharCode(26)}${String.fromCharCode(0)}`;
    expect(unreadableFile("plan.dxf", binary)).toMatch(/^This is a binary DXF/);
    expect(parseDxfPoints(binary).issues[0]!.message).toMatch(/^This is a binary DXF/);
  });
});

describe("where a label is", () => {
  it("places MTEXT by its insertion point: its 11 and 21 are a direction", () => {
    const mtext = Array.from({ length: 10 }, (_, i) => [
      ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, i * 5], [20, 0], [30, 0]]),
      ent("MTEXT", [[8, "NUM"], [10, i * 5 + 0.3], [20, 0.05], [40, 0.3], [71, 1], [72, 5], [11, 1], [21, 0], [31, 0], [73, 1], [1, String(i + 1)]]),
    ]).flat();
    expect(ids(drawing(mtext))).toHaveLength(10);
  });

  it("places aligned or fit TEXT by its start, whatever its length", () => {
    const aligned = Array.from({ length: 10 }, (_, i) => {
      const t = String(i + 1);
      return [ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, i * 5], [20, 0], [30, 0]]), ent("TEXT", [[8, "NUM"], [10, i * 5 + 0.3], [20, 0.05], [40, 0.3], [72, 3], [11, i * 5 + 0.3 + 0.25 * t.length], [21, 0.05], [1, t]])];
    }).flat();
    expect(ids(drawing(aligned))).toHaveLength(10);
  });
});

describe("numbers by attribute", () => {
  const block = (attribs: [string, string][], e: number, layer = "PNTS", name = "PNT") => [
    ent("INSERT", [[8, layer], [2, name], [66, 1], [10, e], [20, 0], [30, 0]]),
    ...attribs.map(([tag, value]) => ent("ATTRIB", [[8, layer], [10, e], [20, 0], [2, tag], [1, value]])),
    ent("SEQEND", [[8, layer]]),
  ];
  it("refuses a block whose number attributes disagree, and reads one whose first number attribute is empty", () => {
    const two = drawing([...block([["NAME", "FENCE"], ["NUMBER", "12"]], 0), ...block([["NAME", "GATE"], ["NUMBER", "13"]], 5)]);
    expect(parseDxfPoints(two).points).toEqual([]);
    expect(errors(two)[0]).toMatch(/has two numbers \(FENCE and 12\)/);
    expect(ids(drawing([...block([["NAME", ""], ["NUMBER", "12"]], 0), ...block([["NAME", ""], ["NUMBER", "13"]], 5)]))).toEqual(["12", "13"]);
  });

  it("never takes a block that appears once (a title block) for a point", () => {
    const title = block([["NO", "2900"]], 250, "SHEET", "TITLE");
    const r = parseDxfPoints(drawing([...ten, ...title]));
    expect(r.points.map((p) => p.pointId)).not.toContain("2900");
    expect(r.issues.map((i) => i.message).join(" ")).toContain("1 block TITLE on layer SHEET, which appears once");
  });

  it("keeps the code and height attributes of a block numbered by its label", () => {
    const labelled = [0, 5, 10].flatMap((e, i) => [
      ent("INSERT", [[8, "SPOTX"], [2, "X"], [66, 1], [10, e], [20, 0], [30, 0]]),
      ent("ATTRIB", [[8, "SPOTX"], [10, e], [20, 0], [2, "CODE"], [1, i ? "MW" : "CP"]]),
      ent("ATTRIB", [[8, "SPOTX"], [10, e], [20, 0], [2, "ELEV"], [1, `5.${i}00`]]),
      ent("SEQEND", [[8, "SPOTX"]]),
      ent("TEXT", [[8, "STEXT"], [10, e + 0.3], [20, 0.05], [40, 0.3], [1, String(i + 1)]]),
    ]);
    expect(parseDxfPoints(drawing(labelled)).points.map((p) => [p.pointId, p.z, p.code])).toEqual([["1", 5, "CP"], ["2", 5.1, "MW"], ["3", 5.2, "MW"]]);
  });
});

describe("numbers by label", () => {
  it("judges each group by its own members: far-off blocks of another kind don't hide the points' numbers", () => {
    const ticks = Array.from({ length: 11 }, (_, i) => ent("INSERT", [[8, "TICKS"], [2, "T"], [10, 500 + i * 7], [20, 500], [30, 0]]));
    expect(ids(drawing([...ten, ...ticks]))).toHaveLength(10);
  });

  it("reads a POINT and a block at the same place as one point, numbered by their one label", () => {
    const pts = Array.from({ length: 10 }, (_, i) => ent("POINT", [[8, "PNTS"], [10, i * 5], [20, 0], [30, 0]]));
    const r = parseDxfPoints(drawing([...ten, ...pts]));
    expect(r.points).toHaveLength(10);
    expect(r.issues.map((i) => i.message)).toContain("10 points are drawn twice at the same place (a POINT and a block), and read once.");
  });

  it("never takes heights with one decimal for numbers", () => {
    const heights = Array.from({ length: 10 }, (_, i) => [ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, i * 5], [20, 0], [30, 0]]), ent("TEXT", [[8, "HEIGHTS"], [10, i * 5 + 0.3], [20, 0.05], [40, 0.3], [1, `10.${i}`]])]).flat();
    expect(ids(drawing(heights))).toEqual([]);
  });

  it("leaves out a turned block that isn't a point, and still refuses a turned point", () => {
    const arrow = ent("INSERT", [[8, "SHEET"], [2, "NORTH"], [10, 200], [20, 200], [30, 0], [210, 0], [220, 0], [230, -1]]);
    expect(ids(drawing([...ten, arrow]))).toHaveLength(10);
    const turnedPoint = ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, 60], [20, 0], [30, 0], [210, 0], [220, 0], [230, -1]]);
    expect(errors(drawing([...ten, turnedPoint]))[0]).toMatch(/drawn in another plane/);
  });

  it("reads a drawing as large as an upload can be in a few seconds at most", () => {
    const many = Array.from({ length: 10_000 }, (_, i) => spot(String(i + 1), (i % 100) * 4, Math.floor(i / 100) * 4)).flat();
    const text = drawing(many);
    expect(text.length).toBeLessThan(2 * 1024 * 1024);
    const t = Date.now();
    expect(ids(text)).toHaveLength(10_000);
    expect(Date.now() - t).toBeLessThan(8000);
  });
});

describe("the printout's counts", () => {
  const row = (pt: string, type: string, a: string, b = "", c = "") => `${pt.padEnd(8)}${type.padEnd(12)}${"TP".padEnd(5)}${a.padEnd(45)}${b.padEnd(45)}${c.padEnd(35)}`.padEnd(160);
  const head = (count: number) => ["< Condition >", "Distance Unit : Meters", `Pt. Count : ${count}`, row("Pt.", "Record Type", "North/Hor", "East/Vert", "Elev./Dist").replace("TP   ", "DC   ") + "Code"];
  const pos = (id: string, n: number) => row(id, "POS", `North: ${n}.0000`, "East: 5000.0000", "Elev: 0.0000");
  const stn = (id: string) => row(id, "STN", "North: 5000.0000", "East: 5000.0000", "Elev: 0.0000");

  it("counts POS records only: a station never makes up a missing point", () => {
    const r = parseSokkiaList([...head(3), stn("100"), pos("1", 5001), pos("2", 5002)].join("\r\n"));
    expect(r.issues.find((i) => i.severity === "error")!.message).toMatch(/says it lists 3 points, and 2 were found/);
  });

  it("says so when the records match the count but a point was listed twice", () => {
    const r = parseSokkiaList([...head(3), pos("1", 5001), pos("2", 5002), pos("2", 5003)].join("\r\n"));
    expect(r.issues.map((i) => i.message).join(" ")).toMatch(/counts 3 point records, and they hold 2 different points/);
  });

  it("refuses a printout of only its station, listed twice", () => {
    const r = parseSokkiaList([...head(0), stn("100"), stn("100")].join("\r\n"));
    expect(r.issues.some((i) => i.severity === "error" && /only its station/.test(i.message))).toBe(true);
  });
});
