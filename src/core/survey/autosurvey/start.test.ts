/** AutoSurvey's start (stage 222): sorting uploads and reading them without questions the files settle. Every value is SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { crsById } from "../crs";
import { gridProblem, importOrder, importPointsOf, kindOfUpload, notReadYet, pointClashes, readSurveyFile, readTogether, startName, startingCrs, statedSurveyDate, drawsWithDsrList, type FileRead } from "./start";

const SLD99 = crsById("EPSG:5235")!;
const LOCAL = crsById("LOCAL")!;

const csv = ["Point,Easting,Northing,Height,Code", "1,450012.345,700004.210,21.43,CP", "2,450043.912,700007.884,21.88,BM1", "3,450040.100,699980.500,21.10,BM2"].join("\n");

function read(name: string, text: string, crs = SLD99): FileRead {
  const r = readSurveyFile(name, text, crs);
  if (!r.ok) throw new Error(r.problem);
  return r.read;
}

describe("sorting what a surveyor uploads", () => {
  it("treats pictures as sketches, PDFs and office or CAD files as documents, and the rest as survey data", () => {
    expect(kindOfUpload("site sketch.jpg", "image/jpeg")).toBe("sketch");
    expect(kindOfUpload("IMG_2041.HEIC", "")).toBe("sketch");
    expect(kindOfUpload("scan", "image/png")).toBe("sketch");
    expect(kindOfUpload("old plan.pdf", "application/pdf")).toBe("document");
    expect(kindOfUpload("drawing.dwg", "")).toBe("document");
    expect(kindOfUpload("points.xlsx", "")).toBe("document");
    // A DXF drawing is read for its points since stage 242 (ADR 0250).
    for (const name of ["drawing.dxf", "points.csv", "job.sdr", "job.gsi", "job.xml", "job.jxl", "points.txt", "pts.dat", "no extension"]) expect(kindOfUpload(name, "")).toBe("survey-data");
  });

  it("says plainly why a picture or document isn't read, so nothing looks read that wasn't", () => {
    expect(notReadYet("a.dwg")).toMatch(/can't be read/);
    expect(notReadYet("a.xlsx")).toMatch(/Save the sheet as CSV/);
    expect(notReadYet("a.pdf")).toMatch(/Documents aren't read yet/);
  });
});

describe("reading a survey file without asking what the file settles", () => {
  it("reads a points file with a header row, column by column", () => {
    const r = read("points.csv", csv);
    expect(r.format).toBe("delimited");
    expect(r.hasHeader).toBe(true);
    expect(r.columns).toEqual(["point", "easting", "northing", "elevation", "code"]);
    expect(r.points.map((p) => [p.pointId, p.e, p.n, p.code])).toEqual([
      ["1", 450012.345, 700004.21, "CP"],
      ["2", 450043.912, 700007.884, "BM1"],
      ["3", 450040.1, 699980.5, "BM2"],
    ]);
  });

  it("asks, instead of guessing, when the file doesn't say which column is which", () => {
    // No header, and both orders of the pair fit inside SLD99's area.
    const r = readSurveyFile("pts.txt", ["1,500000.000,510000.000", "2,500010.000,510010.000", "3,500020.000,510000.000"].join("\n"), SLD99);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/can't tell which column is which/);
  });

  it("refuses latitude and longitude, binaries and empty files, each with what to do", () => {
    for (const text of [["Point,Latitude,Longitude", "1,6.9271,79.8612", "2,6.9272,79.8613"], ["1,6.927079,79.861244,12.3", "2,6.927301,79.861502,12.9"]]) {
      const latLong = readSurveyFile("gnss.csv", text.join("\n"), SLD99);
      expect(latLong.ok).toBe(false);
      if (!latLong.ok) expect(latLong.problem).toMatch(/latitude and longitude/);
    }
    const binary = readSurveyFile("job.dbx", "abc\u0000def", SLD99);
    expect(binary.ok).toBe(false);
    if (!binary.ok) expect(binary.problem).toMatch(/job database/);
    const empty = readSurveyFile("empty.csv", "  \n ", SLD99);
    expect(empty.ok).toBe(false);
  });

  it("reads instrument files through their own readers", () => {
    const rpad = (s: string, n: number) => s.padEnd(n);
    const lpad = (s: string, n: number) => s.padStart(n);
    const header = `00NM${rpad("SDR33 V04-04.02", 16)}${rpad("", 4)}${rpad("14-Nov-26 09:30", 16)}211111`;
    const pos = (id: string, n: string, e: string, code: string) => `08KI${lpad(id, 16)}${rpad(n, 16)}${rpad(e, 16)}${rpad("21.43", 16)}${rpad(code, 16)}`;
    const r = read("job.sdr", [header, pos("31", "700004.210", "450012.345", "CP"), pos("32", "700007.884", "450043.912", "MW")].join("\r\n"));
    expect(r.format).toBe("sdr");
    expect(r.points.map((p) => p.pointId)).toEqual(["31", "32"]);
  });

  it("names the first problem in a file and how many more there are, and imports nothing from it", () => {
    const r = readSurveyFile("points.csv", ["Point,Easting,Northing", "1,450012.345,700004.210", "2,not a number,700007.884", "3,450040.100,"].join("\n"), SLD99);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.problem).toMatch(/^Line \d+: .+ \(1 more problem like this\.\)$/);
  });
});

describe("the files read together", () => {
  it("keeps an exact repeat once, and stops when one point number has two places", () => {
    const a = read("a.csv", csv);
    const same = read("b.csv", ["Point,Easting,Northing,Height,Code", "1,450012.345,700004.210,21.43,CP"].join("\n"));
    expect(pointClashes([a, same])).toEqual([]);
    const moved = read("c.csv", ["Point,Easting,Northing,Height,Code", "1,450012.355,700004.210,21.43,CP"].join("\n"));
    const clashes = pointClashes([a, moved]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0]!.file).toBe("c.csv");
    expect(clashes[0]!.problem).toMatch(/^Point 1 is at a different place here and in a\.csv\./);
  });

  // Stage 252: one survey exported three ways, as a real job's instrument file, printed list and DXF were.
  const H = "Point,Easting,Northing,Height,Code";
  const file = (name: string, rows: string[], header = H) => read(name, [header, ...rows].join("\n"));
  const kept = (rs: FileRead[]) => readTogether(importOrder(rs)).kept;

  it("reads one survey exported three ways (instrument file, printed list, drawing) as one set of points", () => {
    // The instrument's file has codes and no heights; the list prints 0 heights; the drawing has neither codes nor heights, one point fewer.
    const instrument = file("job.csv", ["1,450012.345,700004.210,CP", "2,450043.912,700007.884,CP", "3,450040.100,699980.500,CP"], "Point,Easting,Northing,Code");
    const list = file("job-list.csv", ["1,450012.345,700004.210,0,CP", "2,450043.912,700007.884,0,CP", "3,450040.100,699980.500,0,CP"]);
    const drawing = file("job-drawing.csv", ["1,450012.345,700004.210,0,", "2,450043.912,700007.884,0,"]);
    expect(pointClashes([instrument, list, drawing])).toEqual([]);
    const ordered = importOrder([instrument, list, drawing]);
    const together = readTogether(ordered);
    expect(together.kept.size).toBe(3);
    expect(together.repeats.map((r) => [r.file, r.count, r.of])).toEqual([
      ["job.csv", 0, []],
      ["job-list.csv", 3, ["job.csv"]],
      ["job-drawing.csv", 2, ["job.csv"]],
    ]);
    // Every file sends each point exactly as kept, so the database keeps it once; the drawing's missing codes take the instrument's.
    const sent = ordered.map((_, i) => importPointsOf(ordered, i, together.kept));
    for (const s of sent.slice(1)) for (const p of s) expect([p.e, p.n, p.z, p.code]).toEqual([sent[0]!.find((q) => q.pointId === p.pointId)!.e, sent[0]!.find((q) => q.pointId === p.pointId)!.n, sent[0]!.find((q) => q.pointId === p.pointId)!.z, sent[0]!.find((q) => q.pointId === p.pointId)!.code]);
    expect(sent[2]!.map((p) => p.code)).toEqual(["CP", "CP"]);
  });

  it("keeps a point's height from the file that has one, whichever comes first", () => {
    const flat = file("flat.csv", ["1,450012.345,700004.210,0,CP"]);
    const withHeights = read("heights.csv", csv);
    expect(importOrder([flat, withHeights]).map((r) => r.name)).toEqual(["heights.csv", "flat.csv"]);
    expect(pointClashes([flat, withHeights])).toEqual([]);
    expect(kept([flat, withHeights]).get("1")!.z).toBe(21.43);
    // A height missing for one point of a file with heights is filled from another file that gives it.
    const gap = file("gap.csv", ["1,450012.345,700004.210,,CP", "2,450043.912,700007.884,21.88,BM1"]);
    const full = file("full.csv", ["1,450012.345,700004.210,21.43,CP"]);
    expect(pointClashes([gap, full])).toEqual([]);
    expect(kept([gap, full]).get("1")!.z).toBe(21.43);
  });

  it("finds a real height difference whatever order the files come in", () => {
    const drawing = file("drawing.csv", ["1,450012.345,700004.210,0,CP"]);
    const a = file("a.csv", ["1,450012.345,700004.210,21.432,CP"]);
    const b = file("b.csv", ["1,450012.345,700004.210,21.430,CP"]);
    for (const order of [[drawing, a, b], [a, drawing, b], [b, a, drawing]]) expect(pointClashes(order)).toHaveLength(1);
    expect(pointClashes([drawing, a, b])[0]!.problem).toMatch(/^Point 1 has a different height here/);
  });

  it("tells files apart by their place, not their name: two uploads called points.csv", () => {
    const noHeights = file("points.csv", ["1,450012.345,700004.210,CP"], "Point,Easting,Northing,Code");
    const zeros = file("points.csv", ["1,450012.345,700004.210,0,CP"]);
    const ordered = importOrder([noHeights, zeros]);
    const together = readTogether(ordered);
    expect(together.clashes).toEqual([]);
    expect(importPointsOf(ordered, 1, together.kept)[0]!.z).toBe(importPointsOf(ordered, 0, together.kept)[0]!.z);
  });

  it("still stops on a real difference, and says which: a place 2 mm off, another code, or another height", () => {
    const a = read("a.csv", csv);
    expect(pointClashes([a, file("off.csv", ["1,450012.347,700004.210,21.43,CP"])])[0]!.problem).toMatch(/^Point 1 is at a different place here and in a\.csv\./);
    expect(pointClashes([a, file("code.csv", ["1,450012.345,700004.210,21.43,EP"])])[0]!.problem).toMatch(/^Point 1 has the code EP here and CP in a\.csv\./);
    expect(pointClashes([a, file("height.csv", ["1,450012.345,700004.210,22.43,CP"])])[0]!.problem).toMatch(/^Point 1 has a different height here \(22\.43\) and in a\.csv \(21\.43\)\./);
  });

  it("checks the points fit the chosen grid, and never fixes swapped columns by itself", () => {
    const inside = read("a.csv", csv).points;
    expect(gridProblem(inside, SLD99)).toBeNull();
    const swapped = inside.map((p) => ({ e: p.n, n: p.e }));
    expect(gridProblem(swapped, SLD99)!.problem).toMatch(/swapped/);
    const far = inside.map((p) => ({ e: p.e + 900_000, n: p.n }));
    expect(gridProblem(far, SLD99)!.problem).toMatch(/^3 of 3 points fall outside the area SLD99/);
    // A local grid has no area to check against.
    expect(gridProblem(far, LOCAL)).toBeNull();
  });

  it("draws with the Survey Department's list only when the files use at least two of its codes", () => {
    const pts = (codes: string[]) => codes.map((code, i) => ({ line: i + 1, pointId: String(i + 1), e: 450000 + i, n: 700000 + i, z: null, code }));
    const library = commonCodes();
    expect(drawsWithDsrList(pts(["CP", "BM", "CP"]), library)).toBe(false);
    const dsrOnly = ["GP", "kmP", "SM"].filter((c) => !library.some((e) => e.code === c));
    expect(dsrOnly.length).toBeGreaterThanOrEqual(2);
    expect(drawsWithDsrList(pts(dsrOnly), library)).toBe(true);
  });

  it("offers the first stated survey date", () => {
    const a = { ...read("a.csv", csv), surveyDate: null };
    const b = { ...read("b.csv", csv), surveyDate: "2026-11-14" };
    expect(statedSurveyDate([a, b])).toBe("2026-11-14");
    expect(statedSurveyDate([a])).toBeNull();
  });
});

describe("what the start fills in for the surveyor", () => {
  const day = new Date("2026-11-23T08:00:00Z");

  it("uses the surveyor's own name for the project, or one from the first file and the day", () => {
    expect(startName("  Lot 4   boundary ", "a.csv", day)).toBe("Lot 4 boundary");
    expect(startName("", "bankuwatta_job.sdr", day)).toBe("Survey from bankuwatta job, 23 Nov 2026");
    expect(startName("", null, day)).toBe("Survey of 23 Nov 2026");
    expect(startName("x".repeat(200), null, day)).toHaveLength(120);
  });

  it("starts from the coordinate system the surveyor last confirmed, only when Farbaek still knows it", () => {
    expect(startingCrs("EPSG:5235")?.id).toBe("EPSG:5235");
    expect(startingCrs("EPSG:9999")).toBeNull();
    expect(startingCrs(null)).toBeNull();
  });
});
