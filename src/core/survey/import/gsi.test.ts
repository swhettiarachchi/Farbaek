/** Leica GSI (stage 194): lines from Leica's own manuals, and SYNTHETIC GSI-16 lines built to the same layout. */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { angleOf, looksLikeGsi, parseGsi } from "./gsi";

const SLD99 = crsById("EPSG:5235")!;
// GSI-16 words for a synthetic point: E 450012.345, N 700004.210, H 21.430, code CP.
const gsi16 = (id: string, e: string, n: string, h: string, code = "CP") => `*110001+${id.padStart(16, "0")} 81..00+${e.padStart(16, "0")} 82..00+${n.padStart(16, "0")} 83..00+${h.padStart(16, "0")} 71....+${code.padStart(16, "0")}`;

describe("Leica GSI files", () => {
  it("reads Leica's own GSI-8 example: point A110 at E 5.387 m, N -0.992 m", () => {
    const r = parseGsi("110001+0000A110 81..00+00005387 82..00-00000992\n110004+0000A113 81..00+00003839 82..00-00003080");
    expect(r.issues).toEqual([]);
    expect(r.variant).toBe("GSI-8");
    expect(r.points).toEqual([
      { line: 1, pointId: "A110", e: 5.387, n: -0.992, z: null, code: null },
      { line: 2, pointId: "A113", e: 3.839, n: -3.08, z: null, code: null },
    ]);
  });

  it("reads GSI-16 grid coordinates with heights and remarks, from a leading star", () => {
    const r = parseGsi([gsi16("1", "450012345", "700004210", "21430"), gsi16("2", "450043912", "700007884", "21880", "MW")].join("\r\n"), SLD99);
    expect(r.issues).toEqual([]);
    expect(r.variant).toBe("GSI-16");
    expect(r.points.map((p) => [p.pointId, p.e, p.n, p.z, p.code])).toEqual([
      ["1", 450012.345, 700004.21, 21.43, "CP"],
      ["2", 450043.912, 700007.884, 21.88, "MW"],
    ]);
  });

  it("reads the finer metre units, and refuses feet", () => {
    const fine = parseGsi("*110001+0000000000000007 81..06+0000004500123456 82..08+0000070000421000");
    expect(fine.points[0]!).toMatchObject({ pointId: "7", e: 450012.3456, n: 700004.21 });
    const feet = parseGsi("*110001+0000000000000007 81..01+0000000450012345 82..01+0000000700004210");
    expect(feet.points).toEqual([]);
    expect(feet.issues[0]!.message).toBe("Line 1, point 7: the easting is in feet. Set the instrument's distance unit to metres and export again: Leica doesn't say which foot.");
  });

  it("refuses raw observations with no station to work them out from, with the reason, using Leica's own observation line", () => {
    const r = parseGsi("110004+0OP-1343 21.002+29147250 22.002+10321850 31...0+00020025");
    expect(r.points).toEqual([]);
    expect(r.issues.at(-1)!.message).toMatch(/^This file holds raw observations \(angles and distances on 1 line\), and none could be worked out into coordinates: line 1: no station is set up before it\./);
  });

  it("doesn't guess which point a code line belongs to", () => {
    const r = parseGsi(["*410018+00000000000LYR15 42....+0000000000A_OP12", gsi16("1", "450012345", "700004210", "21430", "")].join("\n"));
    expect(r.points.map((p) => [p.pointId, p.code])).toEqual([["1", null]]);
    expect(r.issues.map((i) => i.severity)).toEqual(["warning"]);
    expect(r.issues[0]!.message).toMatch(/^1 code line stands on its own\./);
  });

  it("refuses GSI-8 grid coordinates that can't have kept their leading digits", () => {
    const r = parseGsi("110001+00000001 81..00+50012345 82..00+00004210", SLD99);
    expect(r.issues.some((i) => i.severity === "error" && /GSI-8 keeps only 8 digits/.test(i.message))).toBe(true);
  });

  it("refuses unset all-zero points, bad words and binary files, each with its line", () => {
    expect(parseGsi("*110001+0000000000000003 81..00+0000000000000000 82..00+0000000000000000").issues[0]!.message).toBe("Line 1, point 3: every coordinate is zero, which is how an unset field is written. Check the point in the instrument.");
    expect(parseGsi("110001+00000001 81..00+5001234 82..00+00004210").issues[0]!.message).toBe('Line 1, word 2 ("81..00+5001234") isn\'t a GSI word of 15 or 23 characters.');
    expect(parseGsi("abc\u0000def").issues[0]!.code).toBe("NOT_TEXT");
  });

  it("refuses a point number repeated with different coordinates", () => {
    const r = parseGsi([gsi16("1", "450012345", "700004210", "21430"), gsi16("1", "450012999", "700004210", "21430")].join("\n"));
    expect(r.points).toEqual([]);
    expect(r.issues[0]!.code).toBe("DUPLICATE_POINT_CONFLICT");
  });

  it("knows a GSI file from a CSV", () => {
    expect(looksLikeGsi("110001+0000A110 81..00+00005387 82..00-00000992")).toBe(true);
    expect(looksLikeGsi(gsi16("1", "450012345", "700004210", "21430"))).toBe(true);
    expect(looksLikeGsi("1,450012.345,700004.210,21.43,CP")).toBe(false);
  });
});

describe("Leica GSI observations (stage 228, ADR 0236)", () => {
  // GSI-16 words built to Leica's layout. Station 1 sits on SLD99's central meridian at height 0, where the grid scale factor is
  // exactly k0, so expected coordinates are hand arithmetic. SYNTHETIC values.
  const K0 = 0.9999238418;
  const f = (wi: string, info: string, digits: string) => `${wi}${info}+${digits.padStart(16, "0")}`;
  const id = (p: string) => f("11", "0001", p);
  const job = [
    `*${id("2")} ${f("81", "..00", "500000000")} ${f("82", "..00", "700100000")} ${f("83", "..00", "0")}`,
    `*${id("1")} ${f("84", "..00", "500000000")} ${f("85", "..00", "700000000")} ${f("86", "..00", "0")} ${f("88", "..00", "1500")}`,
    // Backsight to 2 (due north) read on the circle at 30°, angles only: it orients the circle.
    `*${id("2")} ${f("21", ".003", "3000000")} ${f("22", ".003", "9000000")}`,
    `*${id("10")} ${f("21", ".003", "12000000")} ${f("22", ".003", "9000000")} ${f("31", "..00", "50000")} ${f("87", "..00", "1600")} ${f("71", "....", "CP")}`,
    `*${id("2")} ${f("21", ".003", "3000000")} ${f("22", ".003", "9000000")} ${f("31", "..00", "100000")}`,
  ].join("\n");

  it("reads Leica's own angle decodes: gons, and degrees packed as DDDMMSSs", () => {
    expect(angleOf({ wi: "22", unit: "2", sign: "+", data: "07567500" })).toBeCloseTo(75.675 * 0.9, 12);
    expect(angleOf({ wi: "21", unit: "4", sign: "+", data: "21857580" })).toBeCloseTo(218 + 57 / 60 + 58 / 3600, 12);
    expect(angleOf({ wi: "21", unit: "3", sign: "+", data: "0000000012000000" })).toBe(120);
    expect(angleOf({ wi: "21", unit: "4", sign: "+", data: "21877580" })).toBeNull();
  });

  it("orients each station by its first shot to a point the file gives, works out the rest, and checks the others", () => {
    const r = parseGsi(job, SLD99);
    expect(r.reduced).toEqual({ points: 1, stations: 1 });
    const p10 = r.points.find((p) => p.pointId === "10")!;
    expect(p10.e).toBeCloseTo(500_000 + 50 * K0, 9);
    expect(p10.n).toBeCloseTo(700_000, 9);
    expect(p10.z).toBeCloseTo(-0.1, 9);
    expect(p10.code).toBe("CP");
    const says = r.issues.map((i) => i.message);
    expect(says).toContainEqual(expect.stringMatching(/^1 point was worked out from the instrument's observations, by radiation from 1 station \(1\), with nothing adjusted\. Each station's circle was oriented by its first shot to a point the file gives coordinates for;/));
    // 100 m on the ground is 99.9924 m on the grid: the distance shot to 2 lands 7.6 mm short, within 2 cm.
    expect(says).toContain("1 check agrees within 2 cm: a point given in the file or shot twice, worked out the same.");
  });

  it("works out nothing at a station with no shot to a known point, and says why", () => {
    const blind = job.split("\n").filter((_, i) => i !== 0 && i !== 2 && i !== 4).join("\n");
    const r = parseGsi(blind, SLD99);
    expect(r.points.map((p) => p.pointId)).toEqual(["1"]);
    expect(r.issues.find((i) => i.code === "RECORDS_LEFT_OUT")!.message).toBe("1 shot was left out: station 1 has no shot to a point the file gives coordinates for, so its circle can't be oriented (line 2).");
  });
});
