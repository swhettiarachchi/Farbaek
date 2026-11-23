/**
 * Sokkia Link's printed point list (stage 242, ADR 0250), on SYNTHETIC printouts laid out in the columns of a real one (Sokkia Link,
 * 2026): made-up points on a local grid, carrying none of any real job's coordinates or names.
 */
import { describe, expect, it } from "vitest";
import { looksLikeSokkiaList, parseSokkiaList } from "./sokkialist";

/** One line of the record table, in its columns: Pt. 0, Record Type 8, DC 20, North/Hor 25, East/Vert 70, Elev./Dist 115, Code 150. */
const row = (pt: string, type: string, dc: string, a: string, b = "", c = "", code = "") =>
  `${pt.padEnd(8)}${type.padEnd(12)}${dc.padEnd(5)}${a.padEnd(45)}${b.padEnd(45)}${c.padEnd(35)}${code}`.padEnd(160);
const rule = "-".repeat(135);
const pos = (pt: string, n: string, e: string, z = "0.0000", code = "", type = "POS") => [row(pt, type, "TP", `North: ${n}`, `East: ${e}`, `Elev: ${z}`, code), rule];

const printout = (body: string[], o: { unit?: string | null; count?: number | null; file?: string } = {}) =>
  [
    "< Condition >",
    "Project : SYNTHETIC-JOB",
    `File Name : ${o.file ?? "E:\\SOKKIA Link\\Projects\\SYNTHETIC.dir\\synthetic.sdr"}`,
    "Print Date : 2026-11-23 10:00:00 AM",
    ...(o.unit === null ? [] : [`Distance Unit : ${o.unit ?? "Meters"}`]),
    "Angle Unit : Degrees [dd.mmss]",
    ...(o.count === null ? [] : [`Pt. Count : ${o.count ?? 3}`]),
    "",
    rule,
    row("Pt.", "Record Type", "DC", "North/Hor", "East/Vert", "Elev./Dist", "Code"),
    rule,
    row("", "JOB", "NM", "Job ID: SYNTH", "SYNTHETIC/synthetic.sdr"),
    rule,
    ...body,
  ].join("\r\n");

const station = [row("100", "STN", "TP", "North: 5000.0000", "East: 5000.0000", "Elev: 10.0000"), row("", "", "", "Theo Ht: 1.5000"), rule];
const backsight = [row("100", "BKB", "TP", "Azimuth: 0.0000", "Hor Obs: 0.0000"), rule, row("100", "OBS", "F1", "Hor Obs: 0.0000", "Vert Obs: 90.0000", "Slp Dist:"), rule];

describe("Sokkia Link's printed point list", () => {
  it("is known by its Condition header and its record table, and nothing else is", () => {
    expect(looksLikeSokkiaList(printout(pos("1", "5001.0000", "5002.0000")))).toBe(true);
    expect(looksLikeSokkiaList("Point,Easting,Northing\n1,5002,5001\n")).toBe(false);
    expect(looksLikeSokkiaList("< Condition >\nProject : X\n")).toBe(false);
  });

  it("reads each point and station where its columns put it, with its code, and says what it left out", () => {
    const r = parseSokkiaList(printout([...station, ...backsight, ...pos("1", "5001.2340", "4998.7650", "10.1250", "MW"), ...pos("2", "5003.0000", "4997.5000", ""), ...pos("A7", "4999.0010", "5004.0000", "-0.5000", "WELL 2")]));
    expect(r.points).toEqual([
      { line: 14, pointId: "100", e: 5000, n: 5000, z: 10, code: null },
      { line: 21, pointId: "1", e: 4998.765, n: 5001.234, z: 10.125, code: "MW" },
      { line: 23, pointId: "2", e: 4997.5, n: 5003, z: null, code: null },
      { line: 25, pointId: "A7", e: 5004, n: 4999.001, z: -0.5, code: "WELL 2" },
    ]);
    expect(r.issues).toEqual([{ code: "RECORDS_LEFT_OUT", severity: "warning", line: null, message: "1 observation line without a distance (a backsight or an empty shot) was left out: it places no point." }]);
  });

  it("refuses what it can't read as written: another unit, no unit, or a shot to be worked out", () => {
    expect(parseSokkiaList(printout(pos("1", "5001", "5002"), { unit: "US Feet" })).issues[0]!.message).toMatch(/^The printout's distances are in US Feet\. Farbaek reads metres only and converts nothing/);
    expect(parseSokkiaList(printout(pos("1", "5001", "5002"), { unit: null })).issues[0]!.message).toMatch(/doesn't say its distance unit/);
    const shot = parseSokkiaList(printout([...station, row("7", "OBS", "F1", "Hor Obs: 45.3000", "Vert Obs: 90.0000", "Slp Dist: 12.3450"), rule, ...pos("1", "5001", "5002")]));
    expect(shot.points).toEqual([]);
    expect(shot.issues[0]!.message).toBe("The printout lists 1 shot from the instrument (line 17), which Farbaek doesn't work out from a printout. Upload the job's .sdr file (synthetic.sdr) instead: Farbaek works out a total station's shots from it.");
  });

  it("catches a missing page by the header's point count", () => {
    const r = parseSokkiaList(printout([...pos("1", "5001", "5002"), ...pos("2", "5003", "5004")], { count: 3 }));
    expect(r.issues.map((i) => i.message)).toContain("The printout says it lists 3 points, and 2 were found: a page may be missing. Print it again, or upload the job's .sdr file (synthetic.sdr) instead: Farbaek works out a total station's shots from it.");
    expect(parseSokkiaList(printout([...pos("1", "5001", "5002"), ...pos("2", "5003", "5004")], { count: 2 })).issues).toEqual([]);
    expect(parseSokkiaList(printout([...pos("1", "5001", "5002")], { count: null })).issues).toEqual([]);
  });

  it("uses a later line for the same point, as the SDR does, and says so", () => {
    const r = parseSokkiaList(printout([...pos("1", "5001", "5002"), ...pos("1", "5001.0100", "5002"), ...pos("2", "5003", "5004")], { count: 3 }));
    expect(r.points.map((p) => [p.pointId, p.n])).toEqual([["1", 5001.01], ["2", 5003]]);
    expect(r.issues[0]).toMatchObject({ code: "DUPLICATE_POINT_REPLACED", severity: "warning", line: 16 });
  });

  it("refuses a coordinate out of its column, a number that isn't one, and a code with hidden characters, each with its line", () => {
    const shifted = `1       POS         TP     North: 5001.0000`.padEnd(160);
    expect(parseSokkiaList(printout([shifted, rule], { count: 1 })).issues[0]).toMatchObject({ code: "WRONG_COLUMN_COUNT", line: 14 });
    expect(parseSokkiaList(printout(pos("1", "5O01.0000", "5002"), { count: 1 })).issues[0]).toMatchObject({ code: "NOT_A_NUMBER", line: 14 });
    expect(parseSokkiaList(printout(pos("1", "5001", "5002", "0", "M\u200bW"), { count: 1 })).issues[0]).toMatchObject({ code: "CODE_NOT_READABLE", line: 14 });
    // A record before the table's heading has no columns to be read by.
    expect(parseSokkiaList(["< Condition >", "Distance Unit : Meters", ...pos("1", "5001", "5002")].join("\n")).issues[0]!.message).toMatch(/comes before the printout's table heading/);
  });

  it("refuses a printout with only its station, or nothing", () => {
    expect(parseSokkiaList(printout([...station], { count: 0 })).issues.map((i) => i.message)).toContain("The printout lists only its station, no points. Upload the job's .sdr file (synthetic.sdr) instead: Farbaek works out a total station's shots from it.");
    expect(parseSokkiaList(printout([], { count: 0 })).issues.at(-1)!.message).toBe("The printout lists no points with coordinates.");
  });
});
