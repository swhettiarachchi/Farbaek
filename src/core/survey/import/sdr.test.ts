/** Sokkia SDR (stage 194): records laid out byte by byte as Sokkia's interface document gives them, with SYNTHETIC values. */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { gridScaleFactor } from "../scale";
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
    expect(obs.issues.at(-1)!.message).toMatch(/^This job holds the instrument's measurements \(angles and distances, 1 record\), and none could be worked out into coordinates: line 2: no station is set up before it\./);
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

describe("Sokkia SDR observations (stage 225, ADR 0236)", () => {
  // SDR33 records laid out as Sokkia's document gives them. Station 1 sits on SLD99's central meridian at height 0, where the grid
  // scale factor is exactly k0, so every expected coordinate is hand arithmetic. SYNTHETIC values.
  const K0 = 0.9999238418;
  const rad = (d: number) => (d * Math.PI) / 180;
  const f16 = (s: string) => rpad(s, 16);
  const instr = `01NM${" ".repeat(46)}1${" ".repeat(32)}${f16("-30")}`;
  const stn = (id: string, n: string, e: string, z: string, hi: string) => `02TP${lpad(id, 16)}${f16(n)}${f16(e)}${f16(z)}${f16(hi)}${f16("STN")}`;
  const target = (h: string) => `03NM${f16(h)}`;
  const bkb = (from: string, to: string, az: string, circle: string) => `07TP${lpad(from, 16)}${lpad(to, 16)}${f16(az)}${f16(circle)}`;
  const obs = (d: string, from: string, to: string, sd: string, va: string, ha: string, code: string) => `09${d}${lpad(from, 16)}${lpad(to, 16)}${f16(sd)}${f16(va)}${f16(ha)}${f16(code)}`;
  const job = () =>
    [
      header33("111111"),
      instr,
      stn("1", "700000.000", "500000.000", "0.000", "1.500"),
      pos33("2", "700100.000", "500000.000", "0.000", "CP"),
      target("1.600"),
      // Backsight to 2 (azimuth 0°) read on the circle at 30°: subtract 30° from every reading at station 1.
      bkb("1", "2", "0.0000", "30.0000"),
      obs("F1", "1", "2", "100.000", "90.0000", "30.0000", "CP"),
      obs("F1", "1", "10", "50.000", "90.0000", "120.0000", "CP"),
      obs("F2", "1", "10", "50.002", "270.0000", "300.0000", "CP"),
      obs("F1", "1", "11", "30.000", "80.0000", "210.0000", "St"),
      // Station 10, set up with no coordinates in its record: they come from the shots above. Backsight to 1, due west.
      stn("10", "", "", "", "1.400"),
      target("1.600"),
      bkb("10", "1", "270.0000", "0.0000"),
      obs("F1", "10", "12", "20.000", "90.0000", "90.0000", "MW"),
    ].join("\n");

  it("works out each shot by radiation, a traverse station from the shots before it, and checks the backsight", () => {
    const r = parseSdr(job(), crsById("EPSG:5235"));
    expect(r.reduced).toEqual({ points: 3, stations: 2 });
    const at = (id: string) => r.points.find((p) => p.pointId === id)!;
    // Given in the file, so its coordinates stand; the shot to it is a check.
    expect([at("2").n, at("2").e]).toEqual([700100, 500000]);
    // Face left and right averaged: 50.001 m level, due east.
    expect(at("10").e).toBeCloseTo(500_000 + 50.001 * K0, 9);
    expect(at("10").n).toBeCloseTo(700_000, 9);
    expect(at("10").z).toBeCloseTo(-0.1, 9);
    expect(at("10").code).toBe("CP");
    // Due south, 10° above level.
    expect(at("11").n).toBeCloseTo(700_000 - 30 * Math.sin(rad(80)) * K0, 9);
    expect(at("11").e).toBeCloseTo(500_000, 9);
    expect(at("11").z).toBeCloseTo(1.5 + 30 * Math.cos(rad(80)) - 1.6, 9);
    // From station 10: oriented by its backsight to 1, a circle reading of 90° is due north.
    const f10 = gridScaleFactor(crsById("EPSG:5235")!, at("10").e, at("10").z);
    expect(at("12").n).toBeCloseTo(700_000 + 20 * f10, 9);
    expect(at("12").e).toBeCloseTo(at("10").e, 9);
    expect(r.points.map((p) => p.pointId)).toEqual(["1", "2", "10", "11", "12"]);
    const says = r.issues.map((i) => [i.code, i.message]);
    expect(says).toContainEqual(["OBSERVATIONS_REDUCED", expect.stringMatching(/^3 points were worked out from the instrument's observations, by radiation from 2 stations \(1, 10\), with nothing adjusted: degrees, distances reduced to the grid with SLD99 .*'s scale factor and each station's height \(0\.99992\d+ to 0\.99992\d+\)\. The instrument's prism constant was -30 mm, taken as already applied to the recorded distances\. Heights don't include earth curvature/)]);
    // The shot to 2 lands 7.6 mm short of its given coordinates (100 m on the ground is 99.9924 m on the grid): within 2 cm.
    expect(says).toContainEqual(["OBSERVATION_CHECK", "1 check agrees within 2 cm: a point given in the file or shot twice, worked out the same."]);
  });

  it("says by how much a check differs, and leaves out what it can't work out, with the reason", () => {
    const off = job().replace(obs("F1", "1", "2", "100.000", "90.0000", "30.0000", "CP"), obs("F1", "1", "2", "100.100", "90.0000", "30.0000", "CP"));
    const r = parseSdr(off, crsById("LOCAL"));
    expect(r.issues.find((i) => i.code === "OBSERVATION_CHECK")!.message).toBe("Point 2: its coordinates in the file and the shot from station 1 differ by 0.100 m. Check the observations and coordinates: nothing was adjusted.");
    const noBacksight = parseSdr(job().replace(bkb("1", "2", "0.0000", "30.0000"), ""), crsById("LOCAL"));
    expect(noBacksight.issues.find((i) => i.code === "RECORDS_LEFT_OUT")!.message).toBe("5 records were left out: station 1 has no backsight, so its circle readings can't be turned into bearings (lines 7, 8, 9 and 10); station 10 has no coordinates, in its record or from an earlier shot, so nothing can be worked out from it (line 14).");
  });

  it("uses distances as measured on a local grid, and reads gons", () => {
    const local = parseSdr(job(), crsById("LOCAL"));
    expect(local.points.find((p) => p.pointId === "10")!.e).toBeCloseTo(500_050.001, 9);
    expect(local.issues.find((i) => i.code === "OBSERVATIONS_REDUCED")!.message).toMatch(/distances used as measured, since the coordinate system has no projection/);
    // 100 gons is 90°: the same job in gons gives the same points.
    const gons = job().replace(header33("111111"), header33("211111")).replace(/(09F[12].{32}.{16})(.{16})(.{16})/g, (_, head: string, va: string, ha: string) => `${head}${f16(String(Number(va) / 0.9))}${f16(String(Number(ha) / 0.9))}`).replace(/(07TP.{32})(.{16})(.{16})/g, (_, head: string, az: string, c: string) => `${head}${f16(String(Number(az) / 0.9))}${f16(String(Number(c) / 0.9))}`);
    expect(parseSdr(gons, crsById("LOCAL")).points.find((p) => p.pointId === "12")!.n).toBeCloseTo(700_020, 6);
  });
});

describe("Sokkia SDR observations, after the stage 225 review", () => {
  const f16 = (s: string) => rpad(s, 16);
  const stn = (id: string, n: string, e: string, z: string, hi: string) => `02TP${lpad(id, 16)}${f16(n)}${f16(e)}${f16(z)}${f16(hi)}${f16("STN")}`;
  const bkb = (from: string, to: string, az: string, circle: string) => `07TP${lpad(from, 16)}${lpad(to, 16)}${f16(az)}${f16(circle)}`;
  const obs = (d: string, from: string, to: string, sd: string, va: string, ha: string) => `09${d}${lpad(from, 16)}${lpad(to, 16)}${f16(sd)}${f16(va)}${f16(ha)}${f16("CP")}`;
  const instr = (option: string) => `01NM${" ".repeat(46)}${option}`;
  const at = (r: ReturnType<typeof parseSdr>, id: string) => r.points.find((p) => p.pointId === id)!;

  it("orients each shot by the backsight in force when it was taken, not a later one", () => {
    const r = parseSdr([header33("111111"), instr("1"), stn("1", "1000", "1000", "0", "1.5"), bkb("1", "2", "0", "0"), obs("F1", "1", "A", "10", "90", "90"), bkb("1", "2", "0", "30"), obs("F1", "1", "B", "10", "90", "120")].join("\n"), crsById("LOCAL"));
    expect([at(r, "A").n, at(r, "A").e]).toEqual([expect.closeTo(1000, 9), expect.closeTo(1010, 9)]);
    expect([at(r, "B").n, at(r, "B").e]).toEqual([expect.closeTo(1000, 9), expect.closeTo(1010, 9)]);
  });

  it("reads vertical angles from the horizontal, face left and right, wrapped to one turn", () => {
    // 5° down face left (355°) and 5° up face right (175°): both kept, 10 m slope.
    const r = parseSdr([header33("111111"), instr("2"), stn("1", "1000", "1000", "0", "0"), bkb("1", "2", "0", "0"), `03NM${f16("0")}`, obs("F1", "1", "D", "10", "355", "0"), obs("F2", "1", "U", "10", "175", "270")].join("\n"), crsById("LOCAL"));
    expect(at(r, "D").n).toBeCloseTo(1000 + 10 * Math.cos((5 * Math.PI) / 180), 9);
    expect(at(r, "D").z).toBeCloseTo(-10 * Math.sin((5 * Math.PI) / 180), 9);
    expect(at(r, "U").e).toBeCloseTo(1000 + 10 * Math.cos((5 * Math.PI) / 180), 9);
    expect(at(r, "U").z).toBeCloseTo(10 * Math.sin((5 * Math.PI) / 180), 9);
  });

  it("reads SDR2x's narrow observation records, and mils", () => {
    const h2x = `00NM${rpad("SDR20 V03-05", 16)}${rpad("", 4)}${rpad("14-Nov-26 09:30", 16)}311111`;
    const s2 = `02TP${lpad("1", 4)}${rpad("1000", 10)}${rpad("1000", 10)}${rpad("0", 10)}${rpad("1.5", 10)}${rpad("STN", 16)}`;
    const b2 = `07TP${lpad("1", 4)}${lpad("2", 4)}${rpad("0", 10)}${rpad("0", 10)}`;
    // 1600 mils is a quarter turn: zenith 90°, and east.
    const o2 = `09F1${lpad("1", 4)}${lpad("7", 4)}${rpad("25", 10)}${rpad("1600", 10)}${rpad("1600", 10)}${rpad("CP", 16)}`;
    const r = parseSdr([h2x, instr("1"), s2, b2, o2].join("\n"), crsById("LOCAL"));
    expect([at(r, "7").n, at(r, "7").e]).toEqual([expect.closeTo(1000, 9), expect.closeTo(1025, 9)]);
  });

  it("takes readings near 90° and 270° as zenith angles without a 01 record, and says so; nothing else is guessed", () => {
    const base = [header33("111111"), stn("1", "1000", "1000", "0", "1.5"), bkb("1", "2", "0", "0")];
    const zen = parseSdr([...base, obs("F1", "1", "7", "10", "90", "90")].join("\n"), crsById("LOCAL"));
    expect(at(zen, "7").e).toBeCloseTo(1010, 9);
    expect(zen.issues.some((i) => i.code === "CHECK_FILE" && /no instrument record \(01\).*taken as zenith angles/.test(i.message))).toBe(true);
    const unsure = parseSdr([...base, obs("F1", "1", "7", "10", "10", "90")].join("\n"), crsById("LOCAL"));
    expect(unsure.points.map((p) => p.pointId)).toEqual(["1"]);
    expect(unsure.issues.find((i) => i.code === "RECORDS_LEFT_OUT")!.message).toMatch(/the file has no instrument record \(01\) saying how vertical angles are measured, and its readings don't settle it/);
    // A 01 record that doesn't say is named as such.
    const blank = parseSdr([header33("111111"), instr(" "), stn("1", "1000", "1000", "0", "1.5"), bkb("1", "2", "0", "0"), obs("F1", "1", "7", "10", "10", "90")].join("\n"), crsById("LOCAL"));
    expect(blank.issues.find((i) => i.code === "RECORDS_LEFT_OUT")!.message).toMatch(/the instrument record \(01\) doesn't say how vertical angles are measured/);
  });

  it("names a station with no coordinates even when nothing is shot from it, and an angles-only shot as such", () => {
    const r = parseSdr([header33("111111"), stn("9", "", "", "", "1.5"), pos33("2", "700004.21", "450012.345", "21.43", "CP")].join("\n"));
    expect(r.points.map((p) => p.pointId)).toEqual(["2"]);
    expect(r.issues.find((i) => i.code === "RECORDS_LEFT_OUT")!.message).toBe("1 record was left out: station 9 has no coordinates, in its record or from an earlier shot, so nothing can be worked out from it (line 2).");
    const angles = parseSdr([header33("111111"), instr("1"), stn("1", "1000", "1000", "0", "1.5"), bkb("1", "2", "0", "0"), obs("F1", "1", "2", "", "90", "0")].join("\n"), crsById("LOCAL"));
    expect(angles.issues.find((i) => i.code === "RECORDS_LEFT_OUT")!.message).toMatch(/it has no distance \(an angles-only shot\)/);
  });

  it("counts only the stations worked-out points came from", () => {
    const r = parseSdr([header33("111111"), instr("1"), pos33("2", "1000", "1100", "0", "CP"), stn("1", "1000", "1000", "0", "1.5"), bkb("1", "2", "90", "0"), obs("F1", "1", "5", "10", "90", "0"), stn("2", "1000", "1100", "0", "1.5"), bkb("2", "1", "270", "0"), obs("F1", "2", "1", "100", "90", "0")].join("\n"), crsById("LOCAL"));
    expect(r.reduced).toEqual({ points: 1, stations: 1 });
  });

  it("stays quick on a large job", () => {
    const shots = Array.from({ length: 20_000 }, () => obs("F1", "1", "7", "10", "90", "90"));
    const text = [header33("111111"), instr("1"), stn("1", "1000", "1000", "0", "1.5"), bkb("1", "2", "0", "0"), ...shots].join("\n");
    const t = performance.now();
    parseSdr(text, crsById("LOCAL"));
    expect(performance.now() - t).toBeLessThan(1000);
  });
});
