/** The stage 194 readers review's cases: every file is SYNTHETIC, built to the formats' published layouts. */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { suggestColumns } from "./columns";
import { parseDelimited, previewDelimited, COLUMN_ORDERS } from "./delimited";
import { unreadableFile } from "./detect";
import { parseGsi } from "./gsi";
import { parseJobXml } from "./jobxml";
import { parseLandXml } from "./landxml";
import { parseSdr } from "./sdr";
import { XmlProblem, decodeXml, elements, stripXml } from "./xml";

const SLD99 = crsById("EPSG:5235")!;
const metric = `<Metric linearUnit="meter"/>`;
const landxml = (body: string, close = true) => `<?xml version="1.0"?>\n<LandXML version="1.2">\n<Units>${metric}</Units>\n<CgPoints>\n${body}\n</CgPoints>${close ? "\n</LandXML>" : ""}`;
const quick = (f: () => unknown) => {
  const t0 = performance.now();
  f();
  return performance.now() - t0;
};

describe("XML read in one pass, and refused when cut short", () => {
  it("refuses an unclosed quote, tag or comment in a large file quickly", () => {
    const many = (s: string) => s.repeat(Math.floor(1_800_000 / s.length));
    for (const body of [many(`<CgPoint name="`), many(`<CgPoint `), many(`<!-- `), many(`<CgPoint name="1">1 2 `)]) {
      let r: ReturnType<typeof parseLandXml> | null = null;
      expect(quick(() => (r = parseLandXml(landxml(body))))).toBeLessThan(1500);
      expect(r!.points).toEqual([]);
      expect(r!.issues[0]!.code).toBe("FILE_CUT_SHORT");
    }
  });

  it("gives line numbers for many points without counting from the start each time", () => {
    const body = Array.from({ length: 15_000 }, (_, i) => `<CgPoint name="${i + 1}" code="CP">${700000 + i} ${450000 + i}</CgPoint>`).join("\n");
    let r: ReturnType<typeof parseLandXml> | null = null;
    expect(quick(() => (r = parseLandXml(landxml(body))))).toBeLessThan(2000);
    expect(r!.points).toHaveLength(15_000);
    expect(r!.points[14_999]!.line).toBe(5 + 15_000 - 1);
  });

  it("refuses a file cut off after its last point, or with a point never closed", () => {
    expect(parseLandXml(landxml(`<CgPoint name="1">700000 450000</CgPoint>`, false)).issues[0]).toMatchObject({ code: "FILE_CUT_SHORT", line: 2 });
    expect(parseLandXml(landxml(`<CgPoint name="1">700000 450000`)).issues[0]!.code).toBe("FILE_CUT_SHORT");
    expect(parseJobXml(`<JOBFile version="5.2"><Reductions><Point><Name>1</Name>`).issues[0]!.code).toBe("FILE_CUT_SHORT");
  });

  it("keeps line numbers true across a comment, and a > inside a quoted value", () => {
    const r = parseLandXml(landxml(`<!-- a note\nover\nthree lines -->\n<CgPoint name="1" desc="wall > fence">700000 abc</CgPoint>`));
    expect(r.issues[0]).toMatchObject({ code: "NOT_A_NUMBER", line: 8 });
    const ok = parseLandXml(landxml(`<CgPoint name="1" desc="wall > fence">700000 450000</CgPoint>`));
    expect(ok.points[0]!.code).toBe("wall > fence");
    expect(stripXml("a<!--x\ny-->b").split("\n")).toHaveLength(2);
  });

  it("refuses a reference to a character XML doesn't allow, and decodes the rest", () => {
    expect(decodeXml("&lt;&#65;&#x1F600;")).toBe("<A\u{1F600}");
    expect(() => decodeXml("&#1;")).toThrow(XmlProblem);
    expect(parseLandXml(landxml(`<CgPoint name="A&#1;">700000 450000</CgPoint>`)).issues[0]!.code).toBe("FILE_CUT_SHORT");
    expect(elements(`<a:Point x="1"/><PointRecord/><Point>2</Point>`, "Point").map((e) => e.inner)).toEqual(["", "2"]);
  });

  it("says when a LandXML file holds observations beside its points", () => {
    const r = parseLandXml(landxml(`<CgPoint name="1">700000 450000</CgPoint>\n<Survey><InstrumentSetup id="s1"/><RawObservation horizAngle="1"/><RawObservation horizAngle="2"/></Survey>`));
    expect(r.points).toHaveLength(1);
    expect(r.issues).toEqual([expect.objectContaining({ code: "RECORDS_LEFT_OUT", severity: "warning", message: expect.stringContaining("(2)") })]);
  });

  it("leaves out a JobXML point deleted as 1 as well as true", () => {
    const job = `<JOBFile version="5.2"><FieldBook><PointRecord ID="a1" TimeStamp="2026-11-14T10:00:00"><Deleted>1</Deleted></PointRecord></FieldBook><Reductions><Point><ID>a1</ID><Name>1</Name><Grid><North>700000</North><East>450000</East></Grid></Point><Point><ID>a2</ID><Name>2</Name><Grid><North>700001</North><East>450001</East></Grid></Point></Reductions></JOBFile>`;
    expect(parseJobXml(job).points.map((p) => p.pointId)).toEqual(["2"]);
  });
});

// GSI-16 words: point, easting, northing, height, remark.
const w = (wi: string, data: string, unit = "0", sign = "+") => `${wi}..0${unit}${sign}${data.padStart(16, "0")}`;
const idw = (id: string) => `110001+${id.padStart(16, "0")}`;

describe("GSI read strictly", () => {
  it("refuses coordinates without a point number, a zero point number, and a word given twice", () => {
    const r = parseGsi([`*${w("81", "450012345")} ${w("82", "700004210")}`, `*${idw("0")} ${w("81", "450012345")} ${w("82", "700004210")}`, `*${idw("3")} ${w("81", "450012345")} ${w("81", "450012346")} ${w("82", "700004210")}`].join("\n"), SLD99);
    expect(r.points).toEqual([]);
    expect(r.issues.map((i) => [i.line, i.code])).toEqual([
      [1, "MISSING_POINT_ID"],
      [2, "MISSING_POINT_ID"],
      [3, "NOT_A_NUMBER"],
    ]);
  });

  it("takes the code from the first filled word, keeps 0. in a number, and counts heights and observations left out", () => {
    const r = parseGsi(
      [
        `*${idw("1")} ${w("81", "450012345")} ${w("82", "700004210")} 71....+${"0".repeat(16)} 41....+${"CP".padStart(16, "0")}`,
        `*${idw("0.5")} ${w("81", "450013345")} ${w("82", "700005210")}`,
        `*${idw("7")} ${w("83", "21430")}`,
        `*${idw("8")} 21.324+${"1".padStart(16, "0")} 22.324+${"2".padStart(16, "0")} 31..00+${"3".padStart(16, "0")}`,
      ].join("\n"),
      SLD99,
    );
    expect(r.points.map((p) => [p.pointId, p.code])).toEqual([
      ["1", "CP"],
      ["0.5", null],
    ]);
    expect(r.issues.map((i) => [i.code, i.severity])).toEqual([
      ["RECORDS_LEFT_OUT", "warning"],
      ["RECORDS_LEFT_OUT", "warning"],
    ]);
  });

  it("blames GSI-8 only when the coordinates themselves are 8 digits", () => {
    const line = `110001+00000001 ${w("81", "450012345")} ${w("82", "700004210")}`;
    expect(parseGsi(`${line}\n${line.replace("+00000001", "+00000002").replace("450012345", "450013345")}`, SLD99).issues.map((i) => i.code)).toEqual(["CHECK_FILE"]);
  });

  it("refuses invisible characters in point numbers and codes, in every reader", () => {
    expect(parseDelimited("1​,700004.21,450012.345,21.43,CP", { delimiter: ",", hasHeader: false, columns: [...COLUMN_ORDERS.PNEZD] }).issues[0]!.code).toBe("POINT_ID_TOO_LONG");
    expect(parseDelimited("1,700004.21,450012.345,21.43,C‮P", { delimiter: ",", hasHeader: false, columns: [...COLUMN_ORDERS.PNEZD] }).issues[0]!.code).toBe("CODE_NOT_READABLE");
    expect(parseLandXml(landxml(`<CgPoint name="1­">700000 450000</CgPoint>`)).issues[0]!.code).toBe("MISSING_POINT_ID");
  });
});

const rpad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);
const header33 = (units = "211111") => `00NM${rpad("SDR33 V04-04.02", 16)}${rpad("", 4)}${rpad("14-Nov-26 09:30", 16)}${units}`;
const pos33 = (id: string, n: string, e: string, code = "CP") => `08KI${lpad(id, 16)}${rpad(n, 16)}${rpad(e, 16)}${rpad("21.43", 16)}${rpad(code, 16)}`;

describe("SDR read strictly", () => {
  it("needs metres in the header's distance byte", () => {
    expect(parseSdr([header33("231111"), pos33("1", "700004.21", "450012.345")].join("\n")).issues[0]!.message).toMatch(/distance unit, byte 42, is "3"/);
    expect(parseSdr([header33("2"), pos33("1", "700004.21", "450012.345")].join("\n")).issues[0]!.message).toMatch(/is "blank"/);
  });

  it("says a later record replaced an earlier one, counts observations left out, and keeps to the row limit", () => {
    const r = parseSdr([header33(), pos33("1", "700004.21", "450012.345"), "09F1" + " ".repeat(60), pos33("1", "700004.22", "450012.345")].join("\n"));
    expect(r.points.map((p) => p.n)).toEqual([700004.22]);
    expect(r.issues.map((i) => i.code)).toEqual(["DUPLICATE_POINT_REPLACED", "RECORDS_LEFT_OUT"]);
    const many = [header33(), ...Array.from({ length: 20_001 }, (_, i) => pos33(String(i + 1), "700004.21", "450012.345"))].join("\n");
    expect(parseSdr(many).issues[0]!.code).toBe("TOO_MANY_ROWS");
  });

  it("trims a line of trailing spaces without slowing down", () => {
    const text = [header33(), pos33("1", "700004.21", "450012.345") + " ".repeat(600_000) + "x", pos33("2", "700005.21", "450013.345")].join("\n");
    expect(quick(() => parseSdr(text))).toBeLessThan(1000);
  });
});

describe("detection and columns", () => {
  it("knows a Topcon GTS-7 file by its version record or padded keywords, never a CSV that starts with STN", () => {
    expect(unreadableFile("job.txt", "GTS-700\nJOB     ,NM:x")).toMatch(/Topcon GTS-7/);
    expect(unreadableFile("pts.csv", "STN,700004.21,450012.345,21.43,CP\nHD,700005.21,450013.345,21.40,CP")).toBeNull();
  });

  it("reads more column names, and only the names over real columns", () => {
    const g = suggestColumns(previewDelimited("Point_ID,Northing (m),EASTING_M,Elev (m),Feature Code\n1,700004.21,450012.345,21.43,CP\n2,700007.88,450043.91,21.88,MW", 300) as never, SLD99);
    expect(g.columns).toEqual(["point", "northing", "easting", "elevation", "code"]);
    const wide = previewDelimited("P,C,N,E,Z,X,Y\n1,CP,700004.21,450012.345,21.43\n2,MW,700007.88,450043.91,21.88", 300);
    expect(() => suggestColumns(wide as never, SLD99)).not.toThrow();
  });

  it("tests latitude and longitude on the coordinate pair only", () => {
    const grid = previewDelimited("1,700004.210,450012.345,21.123456,45.654321\n2,700007.884,450043.912,21.654321,46.123456", 300);
    expect(suggestColumns(grid as never, SLD99).latLong).toBe(false);
    const ll = previewDelimited("1,7.123456,79.987654,21.4,CP\n2,7.123499,79.987611,21.9,CP", 300);
    expect(suggestColumns(ll as never, SLD99).latLong).toBe(true);
  });

  it("reads a column of small repeated whole numbers as a numeric code, not a coordinate", () => {
    const g = suggestColumns(previewDelimited("1,21,700004.210,450012.345,21.43\n2,21,700007.884,450043.912,21.88\n3,7,700009.000,450050.000,21.90", 300) as never, SLD99);
    expect(g.columns[1]).toBe("code");
    expect(g.columns.slice(2)).toEqual(["northing", "easting", "elevation"]);
  });
});
