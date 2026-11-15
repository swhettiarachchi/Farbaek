/**
 * What the stage 195 reviews found in the drafting assistant's core, each as a test of the fix (on the SYNTHETIC sample plan): values
 * that read differently from what was said, changes not tied to the words, and readers that guessed instead of refusing.
 */
import { describe, expect, it } from "vitest";
import { SAMPLE_POINTS, sampleDocument } from "../fixtures";
import type { SurveyPoint } from "../parcel";
import { applyOps } from "./apply";
import { checkTurn, hasFigure, writtenIn } from "./check";
import { assistContext } from "./context";
import { readCoordinateRows, readLegs } from "./measure";
import type { AssistOp, AssistOutput } from "./ops";
import { readCommand } from "./reader";
import { bearingText, numbersIn, readLotName, readNumber, readPointList, readScale } from "./spoken";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const none = { from: "none" as const, quote: "" };

function turn(instruction: string, ops: AssistOp[], opts: { selection?: string[]; doc?: ReturnType<typeof sampleDocument> } = {}) {
  const doc = opts.doc ?? sampleDocument();
  const ctx = assistContext({ doc, points: SAMPLE_POINTS, selection: opts.selection ?? [], recent: [], step: "plan" });
  const output: AssistOutput = { say: "", ops };
  return checkTurn({ instruction, output, doc, points: SAMPLE_POINTS, selection: opts.selection ?? [], refs: ctx.refs, inputMethod: "typed" });
}
const read = (words: string, doc = sampleDocument(), selection: string[] = []) => {
  const r = readCommand(words);
  if (r?.kind !== "output") throw new Error(`not read: ${words}`);
  const ctx = assistContext({ doc, points: SAMPLE_POINTS, selection, recent: [], step: "plan" });
  return checkTurn({ instruction: words, output: r.output, doc, points: SAMPLE_POINTS, selection, refs: ctx.refs, inputMethod: "voice" });
};

describe("bearings keep their quadrant", () => {
  it("reads quadrant letters, alone or touching the figures, and refuses half a quadrant or a stray word", () => {
    expect(bearingText("S 45 30 E")).toBe("S 45 30 E");
    expect(bearingText("N45°30'E")).toBe("N 45 30 E");
    expect(bearingText("S45 30 15 W")).toBe("S 45 30 15 W");
    expect(bearingText("south forty five thirty east")).toBe("S 45 30 E");
    expect(bearingText("forty five degrees and thirty minutes")).toBe("45 30");
    expect(bearingText("S 45 30")).toBeNull();
    expect(bearingText("45 about 30")).toBeNull();
    expect(readLegs("from 101 to 102 bearing S 45 30 E distance 25.40")).toMatchObject({ rows: [{ from: "101", to: "102", bearing: "S 45 30 E", distance: "25.40" }], problems: [] });
  });
});

describe("coordinates said with a decimal point", () => {
  it("keeps 'point' as a decimal after a number, and stops a row that runs into the next", () => {
    expect(readCoordinateRows("point 215 northing 600004 easting 450012 point 345")).toEqual({ rows: [{ point: "215", n: "600004", e: "450012.345", z: "", code: "" }], problems: [] });
    expect(readCoordinateRows("point 215 northing 600004 easting 450012 height twenty one point four").rows[0]?.z).toBe("21.4");
    const ran = readCoordinateRows("point 215 northing 600004 easting 450012 height 21 point 216 northing 600005 easting 450013");
    expect(ran.rows).toEqual([]);
    expect(ran.problems[0]).toMatch(/two of the same value/);
    expect(readCoordinateRows("point 215 northing 600004 easting 450012 code CP point 216 northing 600005 easting 450013").rows.map((r) => r.point)).toEqual(["215", "216"]);
  });
});

describe("numbers that read two ways are refused", () => {
  it("refuses a leading point, and joins thousands only where they can't be a list", () => {
    expect(readNumber("point five")).toBeNull();
    expect(readNumber("point forty five")).toBeNull();
    expect(numbersIn("120,150,200").map((n) => n.value)).toEqual([120, 150, 200]);
    expect(readNumber("450,012.345")?.text).toBe("450012.345");
    expect(readNumber("1,000")?.value).toBe(1000);
    expect(readNumber("12,500")?.value).toBe(12500);
    expect(readNumber("100,000")?.value).toBe(100000);
    expect(readNumber("450,012")).toBeNull();
  });

  it("reads a lot's superscript only one way", () => {
    expect(readLotName("lot 1 superscript 2")).toEqual({ label: "1", sup: "2" });
    expect(readLotName("lot 2 sup 1")).toEqual({ label: "2", sup: "1" });
    expect(readLotName("lot 12 34")).toBeNull();
    expect(readLotName("lot 2 1")).toBeNull();
    expect(readLotName("lot B one")).toEqual({ label: "B", sup: "1" });
    expect(readLotName("lot B one two")).toEqual({ label: "B", sup: "12" });
    expect(readLotName("lot four A")).toEqual({ label: "4", sup: "A" });
    expect(readLotName("lot 4A")).toEqual({ label: "4", sup: "A" });
    expect(readLotName("lot B1")).toEqual({ label: "B", sup: "1" });
  });

  it("reads a scale only when it's said as one", () => {
    expect(readScale("set the scale to 1:500")).toEqual({ scale: 500 });
    expect(readScale("1:1,000")).toEqual({ scale: 1000 });
    expect(readScale("scale 500")).toEqual({ scale: 500 });
    expect(readScale("one to five hundred")).toEqual({ scale: 500 });
    expect(readScale("500 perch lots")).toBeNull();
  });

  it("stops a long point list early instead of holding up the server", () => {
    const known = new Set(Array.from({ length: 5001 }, (_, i) => String(i + 1)));
    const started = performance.now();
    expect(readPointList("1-501 ".repeat(300), known)).toBeNull();
    expect(readPointList(Array.from({ length: 2000 }, (_, i) => `x${i}`).join(" "), known)).toBeNull();
    expect(performance.now() - started).toBeLessThan(1000);
  });
});

describe("quotes are matched as written", () => {
  it("never lets punctuation change what the words read as", () => {
    expect(writtenIn("add lot B4 from points 1, 5, 8", "points 1-5, 8")).toBe(false);
    expect(writtenIn("add lot B4 from points one five eight", "points one-five eight")).toBe(false);
    expect(writtenIn("Add lot B4 from points 1, 5, 8.", "points 1, 5, 8")).toBe(true);
    const dashed = turn("add lot B4 from points 1, 5, 8", [{ op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 1-5, 8" }, note: "", quote: "add lot B4 from points 1, 5, 8" }]);
    expect(dashed.ops).toEqual([]);
    const right = turn("add lot B4 from points 1, 5, 8", [{ op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 1, 5, 8" }, note: "", quote: "add lot B4 from points 1, 5, 8" }]);
    expect(right.ops[0]).toMatchObject({ kind: "lot_add", lot: { points: [id(1), id(5), id(8)] } });
  });
});

describe("every change is tied to its words", () => {
  it("lets nothing through on 'zoom in' but the zoom", () => {
    const t = turn("zoom in", [
      { op: "view", action: "zoom_in", target: "", points: none, quote: "zoom in" },
      { op: "remove", target: "L2", quote: "zoom in" },
      { op: "set_sheet", setting: "paper", value: "A2", quote: "zoom in" },
      { op: "set_layer", layer: "BOUNDARY", visible: "off", locked: "on", quote: "zoom in" },
      { op: "history", action: "undo", quote: "zoom in" },
      { op: "set_sheet", setting: "overleaf", value: "off", quote: "zoom in" },
      { op: "move_label", target: "L1", direction: "left", amount: "far", quote: "zoom in" },
    ]);
    expect(t.ops.map((o) => o.kind)).toEqual(["view"]);
    expect(t.dropped).toHaveLength(6);
  });

  it("takes the unit and the scale from the words, never from the model", () => {
    const strip = turn("Add a ten foot strip along the east side of lot B1", [{ op: "divide", lot: "lot B1", by: "width", count: "", values: "ten foot", unit: "m", lines: "parallel", side: "east", quote: "Add a ten foot strip along the east side of lot B1" }]);
    expect(strip.ops[0]).toMatchObject({ kind: "divide", values: [10], unit: "ft" });
    const notScale = turn("divide lot B1 into 500 perch lots", [{ op: "set_number", setting: "scale", quote: "500 perch lots" }]);
    expect(notScale.ops).toEqual([]);
    const range = turn("show points 1 to 500", [{ op: "set_number", setting: "scale", quote: "1 to 500" }]);
    expect(range.ops).toEqual([]);
    const decimals = turn("show the bearings with one decimal on the seconds", [{ op: "set_number", setting: "perchDecimals", quote: "one decimal on the seconds" }]);
    expect(decimals.ops).toEqual([]);
  });

  it("asks rather than read a count as a size, or a width without its unit", () => {
    const both = turn("divide lot B1 into 2 lots of 20", [{ op: "divide", lot: "lot B1", by: "area", count: "2", values: "2 lots of 20", unit: "perch", lines: "", side: "", quote: "divide lot B1 into 2 lots of 20" }]);
    expect(both.ops).toEqual([]);
    expect(both.question?.choices).toEqual(["Equal lots", "The sizes I said"]);
    const counted = turn("divide lot B1 into 2 lots of 20", [{ op: "divide", lot: "lot B1", by: "area", count: "", values: "2 lots of 20", unit: "perch", lines: "", side: "", quote: "divide lot B1 into 2 lots of 20" }]);
    expect(counted.question).not.toBeNull();
    const one = sampleDocument();
    one.lots = [one.lots[0]!];
    const bare = read("Add an access road along the eastern boundary, ten wide", one);
    expect(bare.question).toMatchObject({ choices: ["feet", "metres"] });
    expect(read("Add an access road along the eastern boundary, ten wide. feet", one).ops[0]).toMatchObject({ kind: "divide", values: [10], unit: "ft" });
  });

  it("never names a lot after an article, a duplicate, or the wrong lot", () => {
    expect(turn("add a lot from points 1 2 3", [{ op: "add_lot", label: "a", corners: { from: "words", quote: "points 1 2 3" }, note: "", quote: "add a lot from points 1 2 3" }]).ops).toEqual([]);
    expect(turn("add lot A from points 1 2 3", [{ op: "add_lot", label: "A", corners: { from: "words", quote: "points 1 2 3" }, note: "", quote: "add lot A from points 1 2 3" }]).ops).toHaveLength(1);
    const twice = turn("add lot B4 from points 1 2 3 and lot B4 from points 4 5 6", [
      { op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 1 2 3" }, note: "", quote: "lot B4 from points 1 2 3" },
      { op: "add_lot", label: "lot B4", corners: { from: "words", quote: "points 4 5 6" }, note: "", quote: "lot B4 from points 4 5 6" },
    ]);
    expect(twice.ops).toHaveLength(1);
    const rename = turn("rename lot B1 to lot B2", [{ op: "edit_lot", target: "L1", change: "label", label: "lot B2", note: "", corners: none, quote: "rename lot B1 to lot B2" }]);
    expect(rename.ops).toEqual([]);
    const wrongLot = turn("remove lot B1", [{ op: "remove", target: "L2", quote: "remove lot B1" }]);
    expect(wrongLot.ops).toEqual([]);
    expect(turn("remove lot B1", [{ op: "remove", target: "L1", quote: "remove lot B1" }]).ops[0]).toMatchObject({ kind: "remove", target: "lot", id: "lot-b1" });
  });

  it("reads 'isn't mine' as not mine", () => {
    const t = turn("the previous plan isn't mine", [{ op: "set_field", field: "previousPlanMine", value: "", quote: "the previous plan isn't mine" }]);
    expect(t.ops[0]).toMatchObject({ kind: "field", field: "previousPlanMine", value: false });
  });

  it("keeps Sinhala commands working with their own words as the quote", () => {
    expect(read("ආපසු").ops[0]).toMatchObject({ kind: "history", action: "undo" });
    expect(read("විශාල කරන්න").ops[0]).toMatchObject({ kind: "view", action: "zoom_in" });
  });
});

describe("the model's own words carry no figures", () => {
  it("catches fractions, ordinals and Sinhala number words, and leaves ordinary words alone", () => {
    expect(hasFigure("half the lot")).toBe(true);
    expect(hasFigure("The first lot")).toBe(true);
    expect(hasFigure("ලොට් දෙකක්")).toBe(true);
    expect(hasFigure("point five")).toBe(true);
    expect(hasFigure("එකතු කළා")).toBe(false);
    expect(hasFigure("Ready to apply.")).toBe(false);
  });
});

describe("applying keeps where corners came from", () => {
  it("leaves an unchecked AI-drafted lot unchecked when only its note changes", () => {
    const doc = sampleDocument();
    doc.provenance["lot:lot-b1"] = { source: "ai_brief", reviewed: false };
    const points = SAMPLE_POINTS as unknown as SurveyPoint[];
    const noted = applyOps(doc, [{ kind: "lot_edit", id: "lot-b1", note: "Garden", quote: "note" }], points);
    expect(noted.ok && noted.doc.provenance["lot:lot-b1"]).toEqual({ source: "ai_brief", reviewed: false });
    const moved = applyOps(doc, [{ kind: "lot_edit", id: "lot-b1", points: [id(1), id(2), id(3), id(7)], quote: "corners" }], points);
    expect(moved.ok && moved.doc.provenance["lot:lot-b1"]).toEqual({ source: "ai_assist", reviewed: true });
  });
});
