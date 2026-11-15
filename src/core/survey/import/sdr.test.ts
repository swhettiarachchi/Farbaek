/** Sokkia SDR (stage 194): records laid out byte by byte as Sokkia's interface document gives them, with SYNTHETIC values. */
import { describe, expect, it } from "vitest";
import { looksLikeSdr, parseSdr } from "./sdr";

const rpad = (s: string, n: number) => s.padEnd(n);
const lpad = (s: string, n: number) => s.padStart(n);
// SDR33 header: version in bytes 5-20, date 25-40, units 41-46 (degrees, metres, mmHg, Celsius, N-E-Elev, 1).
const header33 = (units = "211111") => `00NM${rpad("SDR33 V04-04.02", 16)}${rpad("", 4)}${rpad("14-Nov-26 09:30", 16)}${units}`;
const pos33 = (id: string, n: string, e: string, z: string, code: string) => `08KI${lpad(id, 16)}${rpad(n, 16)}${rpad(e, 16)}${rpad(z, 16)}${rpad(code, 16)}`;
const header2x = `00NM${rpad("SDR20 V03-05", 16)}${rpad("", 4)}${rpad("14-Nov-26 09:30", 16)}111111`;
const pos2x = (id: string, n: string, e: string, z: string, code: string) => `08KI${lpad(id, 4)}${rpad(n, 10)}${rpad(e, 10)}${rpad(z, 10)}${rpad(code, 16)}`;

describe("Sokkia SDR files", () => {
  it("reads SDR33 coordinate records, northing first, with zero-filled numbers unfilled", () => {
    const text = ["\u0002", header33(), "10NMSURVEY1          121111", pos33("00000031", "700004.21000000", "450012.34500000", "21.43000000", "CP"), pos33("AUTO1000", "700007.884", "450043.912", "21.88", "MW"), "\u000359766"].join("\r\n");
    const r = parseSdr(text);
    expect(r.layout).toBe("SDR33");
    expect(r.issues).toEqual([]);
    expect(r.points.map((p) => [p.pointId, p.n, p.e, p.z, p.code])).toEqual([
      ["31", 700004.21, 450012.345, 21.43, "CP"],
      ["AUTO1000", 700007.884, 450043.912, 21.88, "MW"],
    ]);
  });

  it("reads SDR2x's narrow fields, and stations as points", () => {
    const station = `02TP${lpad("9001", 4)}${rpad("700000.00", 10)}${rpad("450000.00", 10)}${rpad("20.00", 10)}${rpad("1.50", 10)}${rpad("stncp", 16)}`;
    const r = parseSdr([header2x, station, pos2x("1", "700004.21", "450012.35", "21.43", "CP")].join("\n"));
    expect(r.layout).toBe("SDR2x");
    expect(r.points.map((p) => [p.pointId, p.n, p.e, p.code])).toEqual([
      ["9001", 700000, 450000, "stncp"],
      ["1", 700004.21, 450012.35, "CP"],
    ]);
  });

  it("uses the later record for a point stored twice, as the SDR does, and says so", () => {
    const r = parseSdr([header33(), pos33("5", "700004.210", "450012.345", "21.43", "CP"), pos33("5", "700004.215", "450012.345", "21.43", "CP")].join("\n"));
    expect(r.points.map((p) => [p.pointId, p.n])).toEqual([["5", 700004.215]]);
    expect(r.issues[0]!.message).toBe("Line 3: point 5 was stored again with different values. The SDR's rule is that the later record replaces the earlier one (line 2), so line 3 is used.");
  });

  it("refuses feet and observation-only files, and warns of an easting-first display", () => {
    expect(parseSdr([header33("221111"), pos33("1", "1", "2", "3", "CP")].join("\n")).issues[0]!.message).toMatch(/^The SDR file is in feet\./);
    expect(parseSdr([header33(), "13DU3:US Feet:", pos33("1", "1", "2", "3", "CP")].join("\n")).points).toEqual([]);
    const obs = parseSdr([header33(), `09F1${lpad("1", 16)}${lpad("2", 16)}${rpad("12.345", 16)}${rpad("90.0", 16)}${rpad("45.0", 16)}${rpad("CP", 16)}`].join("\n"));
    expect(obs.issues[0]!.message).toMatch(/^This SDR file holds observations \(1 record\), not coordinates\./);
    const en = parseSdr([header33("211121"), pos33("1", "700004.21", "450012.345", "21.43", "CP")].join("\n"));
    expect(en.points).toHaveLength(1);
    expect(en.issues[0]!.severity).toBe("warning");
  });

  it("knows an SDR file, and refuses one without its header", () => {
    expect(looksLikeSdr([header33(), pos33("1", "1", "2", "3", "CP")].join("\n"))).toBe(true);
    expect(looksLikeSdr("1,700004.21,450012.345,21.43,CP")).toBe(false);
    expect(parseSdr(pos33("1", "1", "2", "3", "CP")).issues[0]!.message).toBe("This isn't an SDR file: its first record isn't an SDR2x or SDR33 header (00NM or 00ED).");
  });
});
