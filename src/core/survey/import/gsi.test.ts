/** Leica GSI (stage 194): lines from Leica's own manuals, and SYNTHETIC GSI-16 lines built to the same layout. */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { looksLikeGsi, parseGsi } from "./gsi";

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

  it("refuses raw observations with the reason, using Leica's own observation line", () => {
    const r = parseGsi("110004+0OP-1343 21.002+29147250 22.002+10321850 31...0+00020025");
    expect(r.points).toEqual([]);
    expect(r.issues[0]!.message).toMatch(/^This file holds raw observations \(angles and distances on 1 line\), not coordinates\./);
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
