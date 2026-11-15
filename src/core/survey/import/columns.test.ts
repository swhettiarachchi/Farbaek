/** Reading a point file's columns (stage 194): SYNTHETIC files in the layouts instruments and office software write. */
import { describe, expect, it } from "vitest";
import { crsById, LOCAL_CRS } from "../crs";
import { suggestColumns } from "./columns";
import { previewDelimited } from "./delimited";

const SLD99 = crsById("EPSG:5235")!;
const guess = (text: string, crs = SLD99) => {
  const p = previewDelimited(text, 300);
  if ("error" in p) throw new Error(p.error.message);
  return suggestColumns(p, crs);
};

describe("reading a point file's columns", () => {
  it("reads named columns", () => {
    const g = guess("Point,Easting,Northing,Elevation,Code\n1,450012.345,700004.210,21.43,CP\n2,450043.912,700007.884,21.88,CP");
    expect(g.columns).toEqual(["point", "easting", "northing", "elevation", "code"]);
    expect(g.reasons[0]).toBe("Read from the column names: Point, Easting, Northing, Elevation, Code.");
    expect(g.unsure).toEqual([]);
  });

  it("settles X and Y by the grid, since instruments write them either way round", () => {
    // X holds 700,000-odd: outside SLD99's eastings, so X is the northing here.
    const g = guess("PtID,X,Y,Z,Desc\n1,700004.210,450012.345,21.43,CP\n2,700007.884,450043.912,21.88,St");
    expect(g.columns).toEqual(["point", "northing", "easting", "elevation", "code"]);
    expect(g.unsure).toEqual([]);
  });

  it("reads a file without names: PNEZD", () => {
    const g = guess("1,700004.210,450012.345,21.43,CP\n2,700007.884,450043.912,21.88,MW\n3,700020.5,450050.1,22.0,CP");
    expect(g.columns).toEqual(["point", "northing", "easting", "elevation", "code"]);
    expect(g.reasons).toEqual([
      "Column 1 is the point number: each row has a different one.",
      "Column 5 is the code: it holds words such as CP, MW.",
      "Column 2 is the northing and column 3 the easting: in that order every point lies inside SLD99 / Sri Lanka Grid 1999, and the other way round they don't.",
      "Column 4 is the elevation: the third coordinate.",
    ]);
  });

  it("reads a CASS-style file: name, code, easting, northing, height, with or without codes", () => {
    expect(guess("1,CP,450012.345,700004.210,21.43\n2,St,450043.912,700007.884,21.88").columns).toEqual(["point", "code", "easting", "northing", "elevation"]);
    expect(guess("1,,450012.345,700004.210,21.43\n2,,450043.912,700007.884,21.88").columns).toEqual(["point", "ignore", "easting", "northing", "elevation"]);
  });

  it("says when the grid can't tell the easting from the northing", () => {
    const g = guess("1,500004.210,500012.345,21.43\n2,500007.884,500043.912,21.88");
    // Northing first, as the Survey Department's PNEZC file has it, and said.
    expect(g.columns.slice(1, 3)).toEqual(["northing", "easting"]);
    expect(g.unsure).toEqual(["Both orders of column 2 and column 3 fit inside SLD99 / Sri Lanka Grid 1999, so the grid can't tell the easting from the northing. Farbaek reads them northing first, as the Survey Department's PNEZC coordinate file has them: check that against your instrument's export setting."]);
    const local = guess("1,1000.000,5000.000,10.0\n2,1012.5,5003.2,10.4", LOCAL_CRS);
    expect(local.columns.slice(1, 3)).toEqual(["northing", "easting"]);
    expect(local.unsure[0]).toMatch(/^A local grid can't tell the easting from the northing\./);
  });

  it("knows latitude and longitude, which aren't grid metres", () => {
    expect(guess("1,6.927079,79.861244,12.3\n2,6.927301,79.861502,12.9").latLong).toBe(true);
    expect(guess("1,700004.210,450012.345,21.43\n2,700007.884,450043.912,21.88").latLong).toBe(false);
  });

  it("says when coordinates fit neither order of the grid", () => {
    const g = guess("1,100.5,200.25,1\n2,110.5,210.25,1");
    expect(g.unsure[0]).toBe("Column 2 and column 3 don't fit inside SLD99 / Sri Lanka Grid 1999 in either order. Check the project's coordinate system, or that these are grid coordinates in metres.");
  });
});
