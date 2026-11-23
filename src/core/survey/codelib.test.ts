/** A firm's code library as a file (stage 226, ADR 0237). Every library here is SYNTHETIC, laid out as Carlson's minimum header gives it. */
import { describe, expect, it } from "vitest";
import { libraryFor, librarySummary, looksLikeCodeLibrary, parseCodeLibrary } from "./codelib";

const FCL = ["Code,Linework,3D Linework,Layer,Description,Linetype", "IP,None,No,MON,Iron Pin,", "FN,2D Polyline,No,FENCE,Wire Fence,DASHED", 'MW,2D Polyline,No,WALL,"Masonry Wall, 230 mm",', "TR,None,No,VEG,Tree,", "IP,None,No,MON,Iron Pin again,"].join("\r\n");

describe("a firm's code library", () => {
  it("is known by its .fcl name, or a CSV with a Code column and a Description, Layer or Linework one", () => {
    expect(looksLikeCodeLibrary("office.fcl", "anything")).toBe(true);
    expect(looksLikeCodeLibrary("codes.csv", "Code,Description\nIP,Iron Pin")).toBe(true);
    expect(looksLikeCodeLibrary("codes.csv", "code,layer\nIP,MON")).toBe(true);
    expect(looksLikeCodeLibrary("photo.jpg", "Code,Description")).toBe(false);
  });

  it("is never a points file, whatever its coordinate columns are called", () => {
    for (const header of ["Point,Easting,Northing,Code", "Point,Easting (m),Northing (m),Elevation,Code,Description", "Pt,Eastings,Northings,RL,Code,Desc", "POINT_ID,EASTING_M,NORTHING_M,ELEV,CODE,DESCRIPTION", "Point,E (m),N (m),Code,Description", "Code,Description,X,Y", "Code,Description,Latitude,Longitude"]) {
      expect(looksLikeCodeLibrary("points.csv", `${header}\n1,450000,700000,20,CP,corner`)).toBe(false);
    }
  });

  it("reads each code as the firm wrote it: lines from Linework, dashes from Linetype, meaning from the Description", () => {
    const r = parseCodeLibrary(FCL);
    expect(r).toEqual({
      ok: true,
      total: 4,
      repeated: 1,
      tooLong: [],
      entries: [
        { code: "IP", meaning: "Iron Pin", kind: "mark", line: "solid", legend: true },
        { code: "FN", meaning: "Wire Fence", kind: "line", line: "dashed", legend: true },
        { code: "MW", meaning: "Masonry Wall, 230 mm", kind: "line", line: "solid", legend: true },
        { code: "TR", meaning: "Tree", kind: "mark", line: "solid", legend: true },
      ],
    });
  });

  it("keeps a quoted line break inside its cell, refuses long codes by name, and treats only exact repeats as repeats", () => {
    const r = parseCodeLibrary(['Code,Description', 'IP,"Iron Pin\nfound in concrete"', "BOUNDARY_WALL,Wall", "BM1,Bench mark one", "BM2,Bench mark two", "P,Building", "p,Pole"].join("\n"));
    if (!r.ok) throw new Error(r.problem);
    expect(r.entries.map((e) => e.code)).toEqual(["IP", "BM1", "BM2", "P", "p"]);
    expect(r.entries[0]!.meaning).toBe("Iron Pin found in concrete");
    expect(r.tooLong).toEqual(["BOUNDARY_WALL"]);
    expect(r.repeated).toBe(0);
  });

  it("falls back to the layer, then the code, for a meaning, and refuses a file with no Code column or nothing usable", () => {
    const r = parseCodeLibrary("Code,Layer\nIP,MONUMENTS\nX1,");
    expect(r.ok && r.entries.map((e) => e.meaning)).toEqual(["MONUMENTS", "X1"]);
    expect(parseCodeLibrary("Name,Layer\nIP,MON")).toEqual({ ok: false, problem: "This code library has no Code column in its first line." });
    expect(parseCodeLibrary("Code,Layer\n,\n")).toMatchObject({ ok: false });
    expect(parseCodeLibrary("Code,Layer\nTOO_LONG_A_CODE,X")).toEqual({ ok: false, problem: "No code in this library could be used: its code is longer than 12 characters." });
  });

  it("takes the whole library when it fits, else the codes the survey uses first, read as the plan reads them, and says what's left out", () => {
    const small = parseCodeLibrary(FCL);
    if (!small.ok) throw new Error(small.problem);
    expect(libraryFor(small.entries, [])).toEqual({ codes: small.entries, leftOut: 0 });
    const big = Array.from({ length: 100 }, (_, i) => ({ code: `Q${i}A`, meaning: `Code ${i}`, kind: "mark" as const, line: "solid" as const, legend: true }));
    big.push({ code: "MW", meaning: "Masonry Wall", kind: "mark", line: "solid", legend: true }, { code: "St", meaning: "Stone", kind: "mark", line: "solid", legend: true });
    const taken = libraryFor(big, ["MW2 wall corner", "St / found"]);
    expect(taken.codes).toHaveLength(80);
    expect(taken.codes.slice(0, 2).map((c) => c.code)).toEqual(["MW", "St"]);
    expect(taken.leftOut).toBe(22);
    expect(librarySummary({ ok: true, entries: big, total: big.length, repeated: 1, tooLong: ["BOUNDARY_WALL"] }, ["MW2"])).toBe(
      "Office code library, 102 codes: a plan holds 80 codes, so the ones these files use come first and 22 are left out; 1 repeated code left out; 1 code over 12 characters left out (BOUNDARY_WALL). It becomes this plan's code list, for you to check once.",
    );
  });
});
