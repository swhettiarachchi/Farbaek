/**
 * Sokkia Link's point list and a DXF drawing's points (stage 242, ADR 0250), end to end as Generate Plan reads an upload: detected
 * from their contents, read by their own readers, and checked against the grid like any points file. SYNTHETIC files on a local grid.
 */
import { describe, expect, it } from "vitest";
import { readSurveyFile } from "../autosurvey/start";
import { crsById } from "../crs";
import { detectFormat, IMPORT_FORMATS, unreadableFile } from "./detect";
import { readPoints } from "./read";

const row = (pt: string, type: string, dc: string, a: string, b = "", c = "", code = "") =>
  `${pt.padEnd(8)}${type.padEnd(12)}${dc.padEnd(5)}${a.padEnd(45)}${b.padEnd(45)}${c.padEnd(35)}${code}`.padEnd(160);
const rule = "-".repeat(135);
const PRINTOUT = [
  "< Condition >",
  "Project : SYNTHETIC",
  "File Name : E:\\SOKKIA Link\\Projects\\SYNTHETIC.dir\\synthetic.sdr",
  "Print Date : 2026-11-23 10:00:00 AM",
  "Distance Unit : Meters",
  "Angle Unit : Degrees [dd.mmss]",
  "Pt. Count : 2",
  "",
  rule,
  row("Pt.", "Record Type", "DC", "North/Hor", "East/Vert", "Elev./Dist", "Code"),
  rule,
  row("1", "POS", "TP", "North: 1001.0000", "East: 1002.0000", "Elev: 0.0000"),
  rule,
  row("2", "POS", "TP", "North: 1005.0000", "East: 1004.0000", "Elev: 0.0000", "MW"),
  rule,
].join("\r\n");

const ent = (type: string, codes: [number, string | number][]) => ["0", type, ...codes.flatMap(([c, v]) => [String(c), String(v)])];
const spot = (id: string, e: number, n: number) => [ent("INSERT", [[8, "SPOTX"], [2, "X"], [10, e], [20, n], [30, 0]]), ent("TEXT", [[8, "STEXT"], [10, e + 0.3], [20, n + 0.05], [40, 0.3], [1, id]])];
const DXF = ["0", "SECTION", "2", "ENTITIES", ...[...spot("1", 1002, 1001), ...spot("2", 1004, 1005), ...spot("3", 1010, 1003)].flat(), "0", "ENDSEC", "0", "EOF"].join("\r\n");

describe("the two formats in Generate Plan", () => {
  it("knows each by its contents, whatever the file is called", () => {
    expect(detectFormat("job_Point List.txt", PRINTOUT)).toBe("sokkialist");
    expect(detectFormat("export.txt", DXF)).toBe("dxf");
    expect(detectFormat("AutoSavePrj.dxf", DXF)).toBe("dxf");
    expect(unreadableFile("job_Point List.txt", PRINTOUT)).toBeNull();
    expect(IMPORT_FORMATS.map((f) => f.id)).toEqual(expect.arrayContaining(["sokkialist", "dxf"]));
  });

  it("reads them as an upload is read, on a local grid", () => {
    const list = readSurveyFile("job_Point List.txt", PRINTOUT, crsById("LOCAL"));
    expect(list).toMatchObject({ ok: true, read: { format: "sokkialist", formatLabel: "Sokkia Link point list (printout)" } });
    if (list.ok) expect(list.read.points.map((p) => [p.pointId, p.e, p.n, p.code])).toEqual([["1", 1002, 1001, null], ["2", 1004, 1005, "MW"]]);
    const dxf = readSurveyFile("AutoSavePrj.dxf", DXF, crsById("LOCAL"));
    expect(dxf).toMatchObject({ ok: true, read: { format: "dxf" } });
    if (dxf.ok) expect(dxf.read.points.map((p) => p.pointId)).toEqual(["1", "2", "3"]);
  });

  it("refuses what each reader refuses, with its reason, never as columns it can't tell apart", () => {
    const feet = readSurveyFile("list.txt", PRINTOUT.replace("Distance Unit : Meters", "Distance Unit : US Feet"), crsById("LOCAL"));
    expect(feet).toMatchObject({ ok: false, problem: expect.stringMatching(/distances are in US Feet/) });
    expect(readPoints("dxf", DXF, { delimiter: ",", hasHeader: false, columns: [], crs: null }).points).toHaveLength(3);
  });

  it("still refuses Sokkia Link's other reports, naming the job file to upload instead", () => {
    const other = ["                JOB         NM   Job ID: SAMPLE", "Project       :     SAMPLE", "File Name     :     E:\\SOKKIA Link\\Projects\\SAMPLE.dir\\sample.sdr", "Print Date    :     2026-08-04", "Distance Unit :     Meters", "Pt.        Record Type   DC   North/Hor      East/Vert      Elev/Slope     Code"].join("\r\n");
    expect(unreadableFile("report.txt", other)).toMatch(/^This is Sokkia Link's printout of the job SAMPLE/);
  });
});
