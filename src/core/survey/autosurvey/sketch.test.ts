/** Field sketches (stage 223): readings kept as written, and checked against the coordinates. Every value is SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { crsById } from "../crs";
import { emptyDocument, surveyDocumentSchema } from "../document";
import type { SurveyPoint } from "../parcel";
import { approvalHash } from "../view";
import { acceptSketch, checkReading, groundFactor, parseWrittenDistance, sketchFileName, sketchFindings, type SketchReading, type SketchRecord } from "./sketch";

const SLD99 = crsById("EPSG:5235")!;
const LOCAL = crsById("LOCAL")!;

// A 30 by 40 m rectangle near SLD99's central meridian, at sea level: the diagonal 1 to 3 is 50 m on the grid.
const pts: SurveyPoint[] = [
  { id: "00000000-0000-4000-8000-000000000001", pointId: "1", e: 500000, n: 700000, z: 0, code: "CP" },
  { id: "00000000-0000-4000-8000-000000000002", pointId: "2", e: 500040, n: 700000, z: 0, code: "CP" },
  { id: "00000000-0000-4000-8000-000000000003", pointId: "3", e: 500040, n: 700030, z: 0, code: "St" },
  { id: "00000000-0000-4000-8000-000000000004", pointId: "4", e: 500000, n: 700030, z: 0, code: "St" },
];
const byNumber = new Map(pts.map((p) => [p.pointId, p] as const));
const reading = (r: Partial<SketchReading>): SketchReading => ({ id: "r1", file: "sketch.jpg", kind: "distance", text: "", from: "", to: "", near: "", ...r });

describe("keeping what was read", () => {
  it("keeps readings as written, numbers them, and drops ones on a photo not sent, of no kind, empty or with invisible characters", () => {
    const record = acceptSketch(
      {
        readings: [
          { image: 0, kind: "distance", text: " 40.00 ", from: "1", to: "2", near: "" },
          { image: 3, kind: "distance", text: "12.00", from: "1", to: "2", near: "" },
          { image: 0, kind: "point", text: "", from: "", to: "", near: "" },
          { image: 1, kind: "point", text: "1\u200b2", from: "", to: "", near: "" },
          { image: 1, kind: "adjoining", text: "Land of the  sample neighbour", from: "", to: "", near: "3" },
        ],
        unreadable: ["the distance between 3 and 4", ""],
      },
      ["sketch-a.jpg", "sketch-b.jpg"],
      "claude-sonnet-5-5",
      new Date("2026-11-23T10:00:00Z"),
    );
    expect(record.readings).toEqual([
      { id: "r1", file: "sketch-a.jpg", kind: "distance", text: "40.00", from: "1", to: "2", near: "" },
      { id: "r2", file: "sketch-b.jpg", kind: "adjoining", text: "Land of the sample neighbour", from: "", to: "", near: "3" },
    ]);
    expect(record.unreadable).toEqual(["the distance between 3 and 4"]);
    expect(record.readAt).toBe("2026-11-23T10:00:00.000Z");
  });

  it("shows a photo's name only when it has no hidden characters", () => {
    const rtl = String.fromCharCode(0x202e);
    const record = acceptSketch({ readings: [{ image: 1, kind: "point", text: "3", from: "", to: "", near: "" }], unreadable: [] }, ["north.jpg", `sketch${rtl}gpj.exe`], "claude-sonnet-5-5", new Date("2026-11-23T10:00:00Z"));
    expect(record.files).toEqual(["north.jpg", "Sketch 2"]);
    expect(record.readings[0]!.file).toBe("Sketch 2");
    expect(sketchFileName("  field  book.jpg ", 0)).toBe("field book.jpg");
    expect(sketchFileName(String.fromCharCode(7), 4)).toBe("Sketch 5");
  });

  it("is part of the plan's record, and left out of the approval fingerprint while empty", async () => {
    const before = emptyDocument();
    expect(surveyDocumentSchema.parse({ ...before, sketch: undefined }).sketch).toBeNull();
    const sketch: SketchRecord = { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00.000Z", files: ["a.jpg"], readings: [reading({ text: "40.00", from: "1", to: "2" })], unreadable: [] };
    expect(surveyDocumentSchema.safeParse({ ...before, sketch }).success).toBe(true);
    const { sketch: _gone, ...older } = before;
    void _gone;
    const hashWithout = await approvalHash({ document: surveyDocumentSchema.parse(older), crsId: "EPSG:5235", points: pts });
    expect(await approvalHash({ document: before, crsId: "EPSG:5235", points: pts })).toBe(hashWithout);
    expect(await approvalHash({ document: { ...before, sketch }, crsId: "EPSG:5235", points: pts })).not.toBe(hashWithout);
  });
});

describe("reading a written distance", () => {
  it("reads metres and feet, and how many decimals were written", () => {
    expect(parseWrittenDistance("40.00")).toEqual({ value: 40, unit: "m", decimals: 2 });
    expect(parseWrittenDistance("12.5 m")).toEqual({ value: 12.5, unit: "m", decimals: 1 });
    expect(parseWrittenDistance("12·45")).toEqual({ value: 12.45, unit: "m", decimals: 2 });
    expect(parseWrittenDistance("131.2 ft")).toEqual({ value: 131.2, unit: "ft", decimals: 1 });
    expect(parseWrittenDistance("98'")).toEqual({ value: 98, unit: "ft", decimals: 0 });
    for (const t of ["", "abc", "40.00 chains", "-3", "0", "41'6\""]) expect(parseWrittenDistance(t)).toBeNull();
  });
});

describe("checking a reading against the coordinates", () => {
  it("agrees when the written distance matches at the precision written, either way along the line", () => {
    expect(checkReading(reading({ text: "40.00", from: "1", to: "2" }), byNumber, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ text: "50.0", from: "3", to: "1" }), byNumber, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ text: "30", from: "2", to: "3" }), byNumber, SLD99).status).toBe("agrees");
  });

  it("says by how much a distance differs", () => {
    const c = checkReading(reading({ text: "40.10", from: "1", to: "2" }), byNumber, SLD99);
    expect(c.status).toBe("differs");
    expect(c.detail).toBe("The sketch says 40.10 between 1 and 2; the coordinates give 40.000 m on the grid, 0.100 m apart.");
  });

  it("converts feet to compare, and says so", () => {
    // 40 m is 131.234 ft.
    expect(checkReading(reading({ text: "131.2 ft", from: "1", to: "2" }), byNumber, SLD99).status).toBe("agrees");
    const off = checkReading(reading({ text: "132 ft", from: "1", to: "2" }), byNumber, SLD99);
    expect(off.status).toBe("differs");
    expect(off.detail).toMatch(/\(132 ft is 40\.234 m\)\.$/);
  });

  it("allows a taped distance to differ from the grid distance by the grid's own scale and the land's height", () => {
    // 100 km east of SLD99's central meridian and 1,800 m up, ground is longer than grid by about 0.28 mm per metre.
    const far = (dx: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-00000000010${dx}`, pointId: `F${dx}`, e: 600000 + dx * 100, n: 700000, z: 1800, code: null });
    const map = new Map([far(0), far(1)].map((p) => [p.pointId, p] as const));
    const factor = groundFactor(SLD99, 600050, 1800);
    expect(factor).toBeLessThan(1);
    const ground = 100 / factor;
    expect(ground - 100).toBeGreaterThan(0.02);
    expect(checkReading(reading({ text: ground.toFixed(2), from: "F0", to: "F1" }), map, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ text: "100.00", from: "F0", to: "F1" }), map, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ text: "100.10", from: "F0", to: "F1" }), map, SLD99).status).toBe("differs");
    // A local grid has no projection: grid is ground.
    expect(groundFactor(LOCAL, 600050, 1800)).toBe(1);
  });

  it("checks bearings at the precision written, as the forward or back bearing", () => {
    // 1 to 2 runs due east: 90°.
    expect(checkReading(reading({ kind: "bearing", text: "90°00'00\"", from: "1", to: "2" }), byNumber, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ kind: "bearing", text: "270°00'", from: "1", to: "2" }), byNumber, SLD99).detail).toBe("270°00' agrees with the coordinates as the bearing from 2 to 1.");
    // 1 to 3: atan(40/30) = 53°07'48.37".
    expect(checkReading(reading({ kind: "bearing", text: "53°07'48\"", from: "1", to: "3" }), byNumber, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ kind: "bearing", text: "53°08'", from: "1", to: "3" }), byNumber, SLD99).status).toBe("agrees");
    const off = checkReading(reading({ kind: "bearing", text: "53°17'48\"", from: "1", to: "3" }), byNumber, SLD99);
    expect(off.status).toBe("differs");
    expect(off.detail).toBe(`The sketch says 53°17'48" between 1 and 3; the coordinates give 053°07′48″ from 1 to 3, 0°10′00″ apart.`);
  });

  it("treats the usual measuring difference as close, shown with its size, and only more than that as a difference", () => {
    // 40.02 is 15 mm beyond rounding; the allowance for a 40 m line is 2 cm + 8 mm.
    const close = checkReading(reading({ text: "40.02", from: "1", to: "2" }), byNumber, SLD99);
    expect(close.status).toBe("close");
    expect(close.detail).toBe("The sketch says 40.02 between 1 and 2; the coordinates give 40.000 m on the grid, 0.020 m apart: within the usual measuring difference of 0.028 m for this line.");
    expect(checkReading(reading({ text: "40.04", from: "1", to: "2" }), byNumber, SLD99).status).toBe("differs");
    // A short line taped to the centimetre, a few millimetres off its coordinates, holds nothing up.
    const short = new Map([["A", { ...pts[0]!, pointId: "A" }], ["B", { ...pts[0]!, pointId: "B", e: 500010.0057 }]]);
    expect(checkReading(reading({ text: "10.00", from: "A", to: "B" }), short, SLD99).status).toBe("close");
    // 1 to 3 is 53°07'48.4": 22" off is close, 2' off differs.
    expect(checkReading(reading({ kind: "bearing", text: "53°08'10\"", from: "1", to: "3" }), byNumber, SLD99).status).toBe("close");
    expect(checkReading(reading({ kind: "bearing", text: "53°09'48\"", from: "1", to: "3" }), byNumber, SLD99).status).toBe("differs");
  });

  it("doesn't check a line from a point to itself, or between two numbers at one place", () => {
    expect(checkReading(reading({ text: "12.00", from: "1", to: "1" }), byNumber, SLD99)).toMatchObject({ status: "not_checked", detail: "It's written from point 1 to itself, so it can't be checked." });
    const twin = new Map([...byNumber, ["1A", { ...pts[0]!, pointId: "1A" }]]);
    expect(checkReading(reading({ text: "12.00", from: "1", to: "1A" }), twin, SLD99).status).toBe("not_checked");
    expect(checkReading(reading({ kind: "bearing", text: "90°", from: "1", to: "1A" }), twin, SLD99).status).toBe("not_checked");
  });

  it("never checks what it can't tie to two surveyed points, and says why", () => {
    expect(checkReading(reading({ text: "40.00", from: "1", to: "" }), byNumber, SLD99).status).toBe("not_checked");
    expect(checkReading(reading({ text: "40.00", from: "1", to: "9" }), byNumber, SLD99)).toMatchObject({ status: "unmatched", detail: "It's written between points 1 and 9, and point 9 isn't in the survey files." });
    expect(checkReading(reading({ text: "forty", from: "1", to: "2" }), byNumber, SLD99).status).toBe("not_checked");
    expect(checkReading(reading({ kind: "point", text: "3" }), byNumber, SLD99).status).toBe("agrees");
    expect(checkReading(reading({ kind: "point", text: "17" }), byNumber, SLD99).status).toBe("unmatched");
    expect(checkReading(reading({ kind: "feature", text: "Masonry wall", near: "2" }), byNumber, SLD99).status).toBe("not_checked");
    expect(checkReading(reading({ kind: "feature", text: "Masonry wall", near: "22" }), byNumber, SLD99).status).toBe("unmatched");
  });
});

describe("what the sketches add to the plan's checks", () => {
  const sketch: SketchRecord = {
    model: "claude-sonnet-5-5",
    readAt: "2026-11-23T10:00:00.000Z",
    files: ["sketch.jpg"],
    readings: [reading({ id: "r1", text: "40.00", from: "1", to: "2" }), reading({ id: "r2", text: "30.50", from: "2", to: "3" }), reading({ id: "r3", kind: "point", text: "17" })],
    unreadable: [],
  };

  it("sums up what was read, waits for the surveyor on a measurement that differs, and warns of a number not in the data", () => {
    const f = sketchFindings(sketch, pts, SLD99, new Set());
    expect(f.map((x) => [x.code, x.severity, x.blocks])).toEqual([
      ["SKETCH_READ", "information", []],
      ["SKETCH_DIFFERS", "professional_review", ["approval"]],
      ["SKETCH_POINT_UNKNOWN", "warning", []],
    ]);
    expect(f[0]!.message).toBe("3 things were read from 1 sketch by Claude: 1 agrees with the coordinates.");
    expect(f[1]!.keep).toEqual({ key: "sketch:r2", kept: false });
  });

  it("lets the surveyor keep a measurement as surveyed, which then blocks nothing", () => {
    const f = sketchFindings(sketch, pts, SLD99, new Set(["sketch:r2"]));
    const kept = f.find((x) => x.code === "SKETCH_DIFFERS_KEPT")!;
    expect(kept).toMatchObject({ severity: "information", blocks: [], keep: { key: "sketch:r2", kept: true } });
    expect(f.some((x) => x.code === "SKETCH_DIFFERS")).toBe(false);
  });

  it("compares nothing without a confirmed coordinate system, and adds nothing without readings", () => {
    expect(sketchFindings(sketch, pts, null, new Set()).map((x) => x.code)).toEqual(["SKETCH_READ"]);
    expect(sketchFindings(null, pts, SLD99, new Set())).toEqual([]);
    expect(sketchFindings({ ...sketch, readings: [] }, pts, SLD99, new Set())).toEqual([]);
  });
});
