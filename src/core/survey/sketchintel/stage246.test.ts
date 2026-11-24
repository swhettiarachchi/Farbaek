/**
 * Stage 246 (ADR 0254), on SYNTHETIC points: lines that cross where no number is are asked about, the report puts what needs the surveyor
 * first, and the reader is told a turned number isn't in doubt for being turned.
 */
import { describe, expect, it } from "vitest";
import { type SketchReading, type SketchRecord } from "../autosurvey/sketch";
import { commonCodes } from "../codes";
import { crsById } from "../crs";
import type { SurveyPoint } from "../parcel";
import { SKETCH_READ_PROMPT } from "@/server/ai/sketch-reader";
import type { SketchDrawing, SketchLine } from "./drawing";
import { emptyDocument, type SurveyDocument } from "../document";
import { applySketch } from "./apply";
import { interpretDocument, sketchQuestionFindings } from "./findings";
import { crossesAway, interpretSketch } from "./interpret";
import { sketchReport, sketchReportMarkdown } from "./report";

const LOCAL = crsById("LOCAL")!;
const codes = commonCodes();
const at = (pointId: string, e: number, n: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e, n, z: null, code: null });
let k = 0;
const line = (points: string[], o: Partial<SketchLine> = {}): SketchLine => ({ id: `l${++k}`, file: "s.jpg", points, label: "MW", style: "double", closes: false, certain: true, ...o });
// A walled square with a house wall inside: 1 to 4 round the lot, 5 and 6 on the house wall, 7 the house's far corner.
const PTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 10), at("4", 0, 10), at("5", 3, 2), at("6", 3, 9.5), at("7", 7, 8)];
const crossings = (d: SketchDrawing) => interpretSketch(d, PTS, codes).questions.filter((q) => q.text.includes("in the survey, at a place with no number"));

describe("lines that cross where no number is", () => {
  it("tells a crossing from a shared end, a touch and a point on the other line", () => {
    const [a, b, c, d] = [at("a", 0, 0), at("b", 10, 10), at("c", 0, 10), at("d", 10, 0)];
    expect(crossesAway(a, b, c, d)).toBe(true);
    expect(crossesAway(a, b, a, d)).toBe(false);
    expect(crossesAway(a, b, at("e", 5, 5), d)).toBe(false);
    // Crossing 5 cm from an end isn't a crossing: the survey's marks are that close on a wall.
    expect(crossesAway(a, at("f", 10, 0.05), at("g", 9.97, -1), at("h", 9.97, 1))).toBe(false);
  });

  it("asks when a wall read to the wrong number crosses the house wall, and names the line read with doubt", () => {
    // The north wall should run 4 to 3; read as 4 to 7 (a number that exists), it cuts across the house wall 5 to 6.
    const q = crossings({ lines: [line(["1", "2", "3"]), line(["4", "7"], { certain: false }), line(["5", "6"], { label: "", style: "single" })], symbols: [], areas: [] });
    expect(q).toHaveLength(1);
    expect(q[0]!.text).toBe("The line through 4 and 7 crosses the line through 5 and 6 in the survey, at a place with no number.");
    expect(q[0]!.evidence.join(" ")).toContain("The line through 4 and 7 was read with doubt.");
    expect(q[0]!.answeredBy).toBe("confirm");
  });

  it("says nothing when the lines only meet at their numbers", () => {
    expect(crossings({ lines: [line(["1", "2", "3", "4"], { closes: true }), line(["5", "6", "7"], { label: "", style: "single" })], symbols: [], areas: [] })).toEqual([]);
  });

  it("asks about five crossings at most, and a pair once however often it's read", () => {
    // Three lines across and three along a grid cross nine times.
    const grid = [0, 1, 2].flatMap((i) => [at(`h${i}a`, 0, 2 + 2 * i), at(`h${i}b`, 10, 2 + 2 * i), at(`v${i}a`, 2 + 2 * i, 0), at(`v${i}b`, 2 + 2 * i, 10)]);
    const lines = [0, 1, 2].flatMap((i) => [line([`h${i}a`, `h${i}b`]), line([`v${i}a`, `v${i}b`])]);
    const asked = (ls: SketchLine[]) => interpretSketch({ lines: ls, symbols: [], areas: [] }, grid, codes).questions.filter((q) => q.text.includes("at a place with no number"));
    expect(asked(lines)).toHaveLength(5);
    expect(asked([line(["h0a", "h0b"]), line(["v0a", "v0b"]), line(["v0a", "v0b"]), line(["h0a", "h0b"])])).toHaveLength(1);
  });

  it("doesn't count a wall built along a boundary, a centimetre either side of it, or a dashed line", () => {
    const pts = [...PTS, at("8", 3, 0.01), at("9", 6, -0.01)];
    const asked = (ls: SketchLine[]) => interpretSketch({ lines: ls, symbols: [], areas: [] }, pts, codes).questions.filter((q) => q.text.includes("at a place with no number"));
    expect(asked([line(["1", "2"]), line(["8", "9"], { label: "", style: "single" })])).toEqual([]);
    expect(asked([line(["1", "2", "3"]), line(["4", "7"], { label: "", style: "dashed" }), line(["5", "6"], { label: "", style: "single" })])).toEqual([]);
  });

  it("is answered by confirming the plan's own copy of the line, and the surveyor's own line already answers it", () => {
    const drawing: SketchDrawing = { lines: [line(["1", "2", "3"]), line(["4", "7"], { certain: false }), line(["5", "6"], { label: "", style: "single" })], symbols: [], areas: [] };
    const doc: SurveyDocument = { ...emptyDocument(), codes, sketch: { model: "claude", readAt: "2026-11-24T08:00:00.000Z", files: ["s.jpg"], readings: [], unreadable: [], drawing } };
    const open = (d: SurveyDocument) => sketchQuestionFindings(interpretDocument(d, PTS), d).filter((x) => x.message.includes("at a place with no number"));
    const placed = applySketch(doc, interpretDocument(doc, PTS)!).document;
    expect(open(placed)).toHaveLength(1);
    // The same line, already on the plan under its own id: the sketch's copy is never added.
    const own = { ...placed, features: placed.features.map((x) => ({ ...x, id: `own-${x.id}` })), provenance: {} };
    expect(open(own)).toEqual([]);
    const drafted = { ...own, provenance: Object.fromEntries(own.features.map((x) => [`feature:${x.id}`, { source: "auto" as const, reviewed: false }])) };
    expect(open(drafted)).toHaveLength(1);
  });
});

describe("the report puts what needs the surveyor first", () => {
  const reading = (o: Partial<SketchReading> & Pick<SketchReading, "kind" | "text">): SketchReading => ({ id: `r${++k}`, file: "s.jpg", from: "", to: "", near: "", ...o });
  const sketch: SketchRecord = {
    model: "claude",
    readAt: "2026-11-24T08:00:00.000Z",
    files: ["s.jpg"],
    unreadable: [],
    readings: [
      reading({ kind: "point", text: "2", certain: false, doubt: "2 or 7" }),
      reading({ kind: "note", text: "job 14", certain: false, doubt: "faint" }),
      reading({ kind: "distance", text: "4.00", from: "1", to: "2" }),
      reading({ kind: "distance", text: "9.99", from: "2", to: "3", certain: false, doubt: "9.99 or 9.89" }),
      reading({ kind: "dimension", text: "3.5", certain: false, doubt: "3.5 or 3.6" }),
    ],
    drawing: { lines: [line(["1", "2", "3"], { certain: false })], symbols: [], areas: [] },
  };
  const r = sketchReport({ sketch, points: PTS, codes, crs: LOCAL, interpretation: null });

  it("ranks the survey's disagreements first, then doubtful readings nothing confirms, then lines read with doubt", () => {
    // A doubtful point number stays in front even though the survey has the number; 9.99 is only within the usual difference.
    expect(r.unclear.filter((u) => !u.quiet).map((u) => u.what.split(" ")[0])).toEqual(["4.00", "2", "9.99", "3.5", "The"]);
  });

  it("puts doubtful labels, and measurements the survey agrees with exactly, in the quieter group", () => {
    expect(r.unclear.filter((u) => u.quiet).map((u) => u.what.split(" ")[0])).toEqual(["job"]);
    const exact = sketchReport({ sketch: { ...sketch, readings: [reading({ kind: "distance", text: "10.00", from: "2", to: "3", certain: false, doubt: "faint" })] }, points: PTS, codes, crs: LOCAL, interpretation: null });
    expect(exact.unclear.find((u) => u.what.startsWith("10.00"))?.quiet).toBe(true);
    const md = sketchReportMarkdown(r);
    expect(md.indexOf("### Also read with doubt")).toBeGreaterThan(md.indexOf("- **4.00 between 1 and 2"));
  });
});

describe("the reader's guidance on turned numbers", () => {
  it("says a turned number isn't in doubt for being turned, and never takes a letter for its other reading", () => {
    expect(SKETCH_READ_PROMPT).toContain("A number isn't in doubt for being turned.");
    expect(SKETCH_READ_PROMPT).toContain("Never give a letter or a mark as the other reading of a number.");
    expect(SKETCH_READ_PROMPT).toContain('an upside-down "OZ" is 20');
  });
});
