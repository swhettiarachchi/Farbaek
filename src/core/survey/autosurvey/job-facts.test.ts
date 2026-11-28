import { describe, expect, it } from "vitest";
import { NO_FACTS, jobFacts, jobFactsTogether, startName } from "./job-facts";

// Synthetic files in the layouts Sokkia writes (SDR33 fixed columns, Sokkia Link's printout); no real job's numbers.
const pad = (s: string, n: number) => s.padStart(n);
const SDR = [
  "00NMSDR33 V04-04.02     01-Jan-09 00:00 113111",
  "10NMSAMPLEJB        121111",
  "06NM1.00000000      ",
  "01NM:SET650X V30-22  123456SET650X V30-22  12345631                                0.000           ",
  `02TP${pad("100", 16)}${"1000.000".padEnd(16)}${"1000.000".padEnd(16)}0.000`,
  `08TP${pad("1", 16)}${"1008.315".padEnd(16)}${"1005.712".padEnd(16)}`,
  `02TP${pad("200", 16)}${"1010.000".padEnd(16)}${"1000.000".padEnd(16)}0.000`,
  `02TP${pad("100", 16)}${"1000.000".padEnd(16)}${"1000.000".padEnd(16)}0.000`,
].join("\r\n");

const PRINTOUT = [
  "< Condition >",
  "Project : SAMPLE-LANE5",
  "File Name : E:\\SOKKIA Link\\Projects\\SAMPLE-LANE5.dir\\sample-lane5.sdr",
  "Print Date : 2026-10-17 3:41:55 PM",
  "Distance Unit : Meters",
  "        JOB         NM   Job ID: SAMPLEJB                             SAMPLE-LANE5/sample-lane5.sdr",
  "        SCALE       NM   S.F.: 1.00000000",
  "        INSTR       NM   EDM Type: SET",
  "                    NM   EDM Ser #: 123456                            EDM Desc: SET650X V30-22                     Mntg Type: Not applicable",
  "100     STN         TP   North: 1000.0000                             East: 1000.0000                              Elev: 0.0000",
].join("\n");

const day = new Date("2026-11-28T10:00:00Z");

describe("what a file says about its job (stage 293)", () => {
  it("reads an SDR's job, instrument, serial, scale factor and stations, each station once", () => {
    expect(jobFacts("sdr", SDR)).toEqual({ project: null, job: "SAMPLEJB", instrument: "SET650X V30-22", serial: "123456", scaleFactor: "1.00000000", stations: ["100", "200"] });
  });

  it("reads Sokkia Link's printout: the project in full, the job id, the instrument by its description", () => {
    expect(jobFacts("sokkialist", PRINTOUT)).toEqual({ project: "SAMPLE-LANE5", job: "SAMPLEJB", instrument: "SET650X V30-22", serial: "123456", scaleFactor: "1.00000000", stations: ["100"] });
  });

  it("names stations as the SDR reader names points: zero-filled numbers, each layout's width, checksums skipped", () => {
    const zero = ["00NMSDR33 V04-04.02", "02TP        00000031700004.21000000450012.34500000", "06123", "02004", "\u000359766"].join("\r\n");
    expect(jobFacts("sdr", zero)).toMatchObject({ stations: ["31"], scaleFactor: null });
    // SDR2x keeps a point number in 4 characters, and its other records aren't read at SDR33's columns.
    const old = ["00NMSDR20 V03-05", "10NMOLDJOB  ", `02TP  10${"1000.000".padStart(10)}${"1000.000".padStart(10)}`].join("\r\n");
    expect(jobFacts("sdr", old)).toEqual({ ...NO_FACTS, stations: ["10"] });
    // Without an SDR header, nothing is read at a guessed column.
    expect(jobFacts("sdr", `02TP${pad("100", 16)}1000.000`)).toEqual(NO_FACTS);
  });

  it("reads nothing a file doesn't say, and nothing from formats that say none", () => {
    expect(jobFacts("sdr", "00NMSDR33 V04\r\n08TP               1 1000 1000")).toEqual(NO_FACTS);
    // An instrument record without its type mark isn't read at a guessed column.
    expect(jobFacts("sdr", `01NM${" ".repeat(46)}1`).instrument).toBeNull();
    expect(jobFacts("dxf", SDR)).toEqual(NO_FACTS);
    expect(jobFacts("delimited", "1,1000,1000,0,CP")).toEqual(NO_FACTS);
  });

  it("never reads a date: the instrument's unset clock and the print date say nothing about the survey", () => {
    expect(Object.keys(jobFacts("sdr", SDR))).not.toContain("date");
    expect(JSON.stringify(jobFacts("sokkialist", PRINTOUT))).not.toMatch(/2026|Jan-09/);
  });

  it("keeps header text plain and short", () => {
    const control = String.fromCharCode(7);
    expect(jobFacts("sdr", `00NMSDR33 V04-04.02\r\n10NMAB${control}CD${" ".repeat(11)}121111`).job).toBe("AB CD");
    expect(jobFacts("sokkialist", `< Condition >\nProject : ${"x".repeat(200)}`).project).toHaveLength(60);
  });

  it("puts several files' facts together: the first that gives each, every station once", () => {
    const together = jobFactsTogether([jobFacts("dxf", ""), jobFacts("sokkialist", PRINTOUT), jobFacts("sdr", SDR)]);
    // The SDR's short job code (SAMPLEJB) never stands in for the printout's full project name.
    expect(together).toEqual({ project: "SAMPLE-LANE5", job: "SAMPLEJB", instrument: "SET650X V30-22", serial: "123456", scaleFactor: "1.00000000", stations: ["100", "200"] });
  });
});

describe("the project's name (stage 293)", () => {
  const file = (name: string, format: "sdr" | "sokkialist" | "dxf" | "delimited", text = "") => ({ name, format, job: jobFacts(format, text) });

  it("keeps the surveyor's own, tidied", () => {
    expect(startName("  Lot 4   boundary ", [file("a.csv", "delimited")], day)).toBe("Lot 4 boundary");
    expect(startName("x".repeat(200), [], day)).toHaveLength(120);
  });

  it("names it from the project a printout names", () => {
    expect(startName("", [file("AutoSavePrj.dxf", "dxf"), file("sample-lane5_Point List.txt", "sokkialist", PRINTOUT), file("sample-lane5.sdr", "sdr", SDR)], day)).toBe("SAMPLE-LANE5, 28 Nov 2026");
  });

  it("passes over names a program gives every file, and prefers the instrument's own file to a drawing", () => {
    expect(startName("", [file("AutoSavePrj.dxf", "dxf"), file("sample-lane5.sdr", "sdr", SDR)], day)).toBe("Survey from sample-lane5, 28 Nov 2026");
    expect(startName("", [file("bankuwatta_job.sdr", "sdr")], day)).toBe("Survey from bankuwatta job, 28 Nov 2026");
    expect(startName("", [file("Drawing1.dxf", "dxf"), file("site.csv", "delimited")], day)).toBe("Survey from site, 28 Nov 2026");
  });

  it("falls back to the job an instrument file names, then the day", () => {
    expect(startName("", [file("AutoSavePrj.dxf", "dxf"), file("points.sdr", "sdr", SDR)], day)).toBe("SAMPLEJB, 28 Nov 2026");
    expect(startName("", [file("AutoSavePrj.dxf", "dxf")], day)).toBe("Survey of 28 Nov 2026");
    expect(startName("", [], day)).toBe("Survey of 28 Nov 2026");
  });
});
