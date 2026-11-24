/**
 * The sketch interpretation report and how the reader records doubt (stage 245, ADR 0253), on the SYNTHETIC job in fixture.ts: every
 * number with its text, place on the photo, side, meaning, how sure and what the survey says; what's uncertain listed apart; a photo
 * position never reaching anything that draws.
 */
import { describe, expect, it } from "vitest";
import { SketchOutputSchema, acceptSketch, sketchFindings, type SketchOutputReading, type SketchReadOutput, type SketchRecord } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { crsById } from "../crs";
import { emptyDocument, type SurveyDocument } from "../document";
import { SYNTH_DRAWING, SYNTH_POINTS } from "./fixture";
import { interpretDocument } from "./findings";
import { confidenceOf, sketchReport, sketchReportMarkdown } from "./report";

const LOCAL = crsById("LOCAL")!;
const codes = commonCodes();
const reading = (o: Partial<SketchOutputReading> & Pick<SketchOutputReading, "kind" | "text">): SketchOutputReading => ({ image: 0, from: "", to: "", near: "", ...o });

const ANSWER: SketchReadOutput = {
  readings: [
    reading({ kind: "point", text: "5", certain: true, doubt: "", photoX: 120, photoY: 880 }),
    reading({ kind: "distance", text: "6.00", from: "5", to: "41", certain: true, doubt: "", photoX: 100, photoY: 800 }),
    reading({ kind: "distance", text: "1.58", from: "41", to: "42", certain: false, doubt: "a point number, or part of the distance beside it", photoX: 95, photoY: 640 }),
    reading({ kind: "distance", text: "4.0", from: "5", to: "40" }),
    reading({ kind: "dimension", text: "2.5", certain: true, doubt: "", photoX: 400, photoY: 500 }),
    reading({ kind: "feature", text: "MW", near: "5" }),
    reading({ kind: "point", text: "060", photoX: 900, photoY: 880 }),
    reading({ kind: "point", text: "77", certain: false, doubt: "77 or 71", photoX: 1004, photoY: 20 }),
    reading({ kind: "road", text: "Station Road", certain: false, doubt: "the first word is faint" }),
  ],
  unreadable: ["a figure along the side from 62 to 61"],
  ...SYNTH_DRAWING,
  lines: SYNTH_DRAWING.lines.map((l) => ({ image: 0, points: l.points, label: l.label, style: l.style, closes: l.closes, certain: l.certain })),
  symbols: SYNTH_DRAWING.symbols.map((s) => ({ image: 0, kind: s.kind, label: s.label, at: s.at })),
  areas: SYNTH_DRAWING.areas.map((a) => ({ image: 0, label: a.label, around: a.around })),
};
const record = (): SketchRecord => acceptSketch(ANSWER, ["sketch.jpg"], "claude-sonnet-5-5", new Date("2026-11-24T08:00:00Z"));
const docWith = (sketch: SketchRecord): SurveyDocument => ({ ...emptyDocument(), codes, sketch });
const report = (crs = LOCAL as typeof LOCAL | null) => {
  const sketch = record();
  return sketchReport({ sketch, points: SYNTH_POINTS, codes, crs, interpretation: interpretDocument(docWith(sketch), SYNTH_POINTS) });
};

describe("the reader records doubt and place, never a measurement", () => {
  it("keeps doubt, the reader's words and the place on the photo; drops a place off the photo", () => {
    const r = record().readings;
    expect(r[2]).toMatchObject({ text: "1.58", certain: false, doubt: "a point number, or part of the distance beside it", photo: { x: 95, y: 640 } });
    expect(r[1]).not.toHaveProperty("certain");
    expect(r[1]).not.toHaveProperty("doubt");
    expect(r[7]).toMatchObject({ text: "77", certain: false });
    expect(r[7]).not.toHaveProperty("photo");
    // An answer from before stage 245 keeps the record exactly as it was.
    expect(Object.keys(r[3]!).sort()).toEqual(["file", "from", "id", "kind", "near", "text", "to"]);
  });

  it("treats a reading with a doubt as uncertain, whatever it says, and hides a doubt carrying invisible characters", () => {
    const zwsp = String.fromCharCode(0x200b);
    const s = acceptSketch({ readings: [reading({ kind: "point", text: "3", certain: true, doubt: "3 or 8" }), reading({ kind: "point", text: "4", certain: false, doubt: `4${zwsp}` })], unreadable: [] }, ["a.jpg"], "claude", new Date());
    expect(s.readings[0]).toMatchObject({ certain: false, doubt: "3 or 8" });
    expect(s.readings[1]).toMatchObject({ certain: false });
    expect(s.readings[1]).not.toHaveProperty("doubt");
  });

  it("asks the model for no number but the photo and the place on it", () => {
    const shape = (SketchOutputSchema.shape.readings as unknown as { element: { shape: Record<string, { def?: { type?: string } }> } }).element.shape;
    expect(Object.entries(shape).filter(([, v]) => v.def?.type === "number").map(([k]) => k)).toEqual(["image", "photoX", "photoY"]);
  });

  it("never lets a place on the photo, or a reading made with doubt, change what's drawn", () => {
    const sketch = record();
    const moved: SketchRecord = { ...sketch, readings: sketch.readings.map((r) => ({ ...r, photo: { x: 1, y: 999 } })) };
    expect(interpretDocument(docWith(moved), SYNTH_POINTS)).toEqual(interpretDocument(docWith(sketch), SYNTH_POINTS));
    // The doubtful road name isn't used: the same as not having read it.
    const without: SketchRecord = { ...sketch, readings: sketch.readings.filter((r) => r.kind !== "road") };
    expect(interpretDocument(docWith(sketch), SYNTH_POINTS)).toEqual(interpretDocument(docWith(without), SYNTH_POINTS));
  });

  it("says in the plan's checks that a differing reading was read with doubt", () => {
    const f = sketchFindings(record(), SYNTH_POINTS, LOCAL, new Set()).find((x) => x.code === "SKETCH_DIFFERS" && x.message.includes("1.58"));
    expect(f?.detail).toContain("It was read with doubt: a point number, or part of the distance beside it.");
    expect(sketchFindings(record(), SYNTH_POINTS, LOCAL, new Set())[0]!.detail).toContain("3 were read with doubt");
  });
});

describe("the interpretation report", () => {
  it("rates how sure it is by one fixed rule", () => {
    expect(confidenceOf("clear", "agrees")).toBe("high");
    expect(confidenceOf("clear", "close")).toBe("high");
    expect(confidenceOf("clear", "not_checked")).toBe("medium");
    expect(confidenceOf("doubt", "agrees")).toBe("medium");
    expect(confidenceOf("doubt", "not_checked")).toBe("low");
    expect(confidenceOf("clear", "differs")).toBe("low");
    expect(confidenceOf("clear", "unmatched")).toBe("low");
  });

  it("puts each measurement beside the side it's written along, with what the survey gives", () => {
    const r = report();
    const side = r.sides.find((s) => s.from === "5" && s.to === "41")!;
    expect(side).toMatchObject({ drawn: "double line", label: "MW", feature: "wall", ends: ["5", "41"] });
    expect(side.gridM).toBeCloseTo(6.0, 2);
    expect(side.entries).toEqual([expect.objectContaining({ text: "6.00", meaning: "The side's measured length", status: "agrees", confidence: "high", photo: { x: 100, y: 800 } })]);
    const short = r.sides.find((s) => s.from === "41" && s.to === "42")!;
    expect(short.entries[0]).toMatchObject({ text: "1.58", read: "doubt", status: "differs", confidence: "low" });
    // A side with nothing written beside it is still listed.
    expect(r.sides.find((s) => s.from === "31" && s.to === "32")?.entries).toEqual([]);
  });

  it("lists ties and dimensions apart from the sides, and the other writing", () => {
    const r = report();
    expect(r.between.map((e) => [e.text, e.meaning, e.status])).toEqual([
      ["4.0", "A length measured between two numbered points (a tie or a diagonal)", "differs"],
      ["2.5", "A dimension, not between numbered points", "not_checked"],
    ]);
    expect(r.other.map((e) => [e.text, e.meaning])).toEqual([
      ["MW", "What a drawn line or object is"],
      ["Station Road", "A road's name"],
    ]);
  });

  it("matches every point number, written or drawn, and says how", () => {
    const r = report();
    expect(r.points.find((p) => p.label === "060")).toMatchObject({ pointId: "60", how: "leading zeros", entries: [expect.objectContaining({ status: "agrees", confidence: "high" })] });
    expect(r.points.find((p) => p.label === "99")).toMatchObject({ pointId: null, how: "none", entries: [] });
    expect(r.points.find((p) => p.label === "77")?.entries[0]).toMatchObject({ read: "doubt", status: "unmatched", confidence: "low" });
  });

  it("lists everything uncertain apart, with the reasons, and nothing that's sure", () => {
    const u = report().unclear;
    const what = u.map((x) => x.what);
    expect(what).toContain("1.58 between 41 and 42 (the side's measured length)");
    expect(u.find((x) => x.what.startsWith("1.58"))?.reasons.join(" ")).toMatch(/Read with doubt: a point number, or part of the distance beside it\. The sketch says 1\.58 between 41 and 42/);
    expect(what).toContain("4.0 between 5 and 40 (a length measured between two numbered points (a tie or a diagonal))");
    expect(what).toContain("Point number 99");
    expect(what.some((w) => w.startsWith("77"))).toBe(true);
    expect(what.some((w) => w.startsWith("Station Road"))).toBe(true);
    expect(what.some((w) => w.startsWith("The double line 32 to 64"))).toBe(true);
    expect(what.some((w) => w.startsWith("6.00") || w.startsWith("MW") || w.startsWith("2.5"))).toBe(false);
  });

  it("doesn't compare measurements before the coordinate system is confirmed, but still matches point numbers", () => {
    const r = report(null);
    expect(r.compared).toBe(false);
    expect(r.sides.find((s) => s.from === "5" && s.to === "41")!.entries[0]).toMatchObject({ status: "not_checked", confidence: "medium" });
    expect(r.points.find((p) => p.label === "5")!.entries[0]).toMatchObject({ status: "agrees" });
  });

  it("writes Markdown with every section, and the sketch's text escaped", () => {
    const sketch = record();
    sketch.readings.push({ id: "r99", file: "sketch.jpg", kind: "note", text: "a|b <script>", from: "", to: "", near: "" });
    const md = sketchReportMarkdown(sketchReport({ sketch, points: SYNTH_POINTS, codes, crs: LOCAL, interpretation: null }));
    for (const h of ["## Each side of the sketch", "## Point numbers", "## Measurements not along one drawn side", "## Other writing", "## Unclear or uncertain, for the surveyor to decide", "## Seen but not read"]) expect(md).toContain(h);
    expect(md).toContain(`a${String.fromCharCode(92)}|b &lt;script>`);
    expect(md).not.toContain("<script>");
    expect(md).toContain("| 5 to 41 | double line | MW | 6.00 | The side's measured length | 6.000 m on the grid | Agrees with the survey | Clearly | High | sketch.jpg, 10% across, 80% down |");
  });
});
