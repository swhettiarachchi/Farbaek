/** The surveyor's sketch habits (stage 298, ADR 0304), on the common code list and the SYNTHETIC sketch job (fixture.ts). */
import { describe, expect, it } from "vitest";
import { commonCodes, dsrCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { applySketch } from "./apply";
import { asThing, classifyLine, habitChoices, habitEntry, habitSaid, LAYER_OF } from "./classify";
import { SYNTH_DRAWING, SYNTH_POINTS } from "./fixture";
import { interpretDocument } from "./findings";
import { interpretSketch } from "./interpret";
import type { SketchLine } from "./drawing";
import type { SurveyPoint } from "../parcel";
import { exceptionsFor } from "../exceptions";
import { buildPlan } from "../view";

const codes = commonCodes();

describe("what a line drawn a certain way is, by the surveyor's habit", () => {
  it("asks without a habit, and takes the surveyor's word with one", () => {
    expect(classifyLine("", "double", codes)).toMatchObject({ kind: "wall", code: null, fromWriting: false });
    const own = classifyLine("", "double", codes, [{ style: "double", code: "MW" }]);
    expect(own).toMatchObject({ kind: "wall", fromWriting: false, fromHabit: true });
    expect(own.code?.code).toBe("MW");
    expect(own.why).toBe("it's drawn as a double line, which is a masonry wall (MW) on your sketches, as you said");
    expect(classifyLine("", "crossed", codes, [{ style: "crossed", code: "NF" }]).code?.code).toBe("NF");
  });

  it("never overrides what's written, another style, or a code that isn't a line in the list", () => {
    const habit = [{ style: "double" as const, code: "MW" }];
    expect(classifyLine("NF", "double", codes, habit).code?.code).toBe("NF");
    expect(classifyLine("", "single", codes, habit).fromHabit).toBeUndefined();
    // MW is also a mark on a wall in the list; a code that's only a point mark, or not in the list at all, isn't taken.
    expect(classifyLine("", "double", codes, [{ style: "double", code: "XX" }]).fromHabit).toBeUndefined();
    // A habit whose code is a line of another kind (a drain, for a double line) is never taken: set by hand, it would make every one a drain.
    expect(classifyLine("", "double", codes, [{ style: "double", code: "EDn" }]).fromHabit).toBeUndefined();
  });

  it("finds the line a habit names, never a mark with the same code, and nothing in a list without one", () => {
    const merged = [{ code: "MW", meaning: "Mark on Wall", kind: "mark" as const, line: "solid" as const, legend: true }, ...codes];
    expect(habitEntry({ style: "double", code: "MW" }, merged)?.meaning).toBe("Masonry Wall");
    expect(classifyLine("", "double", merged, [{ style: "double", code: "MW" }]).code?.meaning).toBe("Masonry Wall");
    // The Survey Department's list has MW only as a mark: a habit carried onto it does nothing.
    expect(habitEntry({ style: "double", code: "MW" }, dsrCodes())).toBeNull();
    expect(habitSaid("double", habitEntry({ style: "double", code: "MW" }, codes)!)).toBe("a double line is a masonry wall (MW)");
    expect(asThing("Earth Drain")).toBe("an earth drain");
  });

  it("offers the list's codes of the kind the style is drawn for, the ones written on the sketch first", () => {
    const walls = habitChoices("double", codes, []).map((c) => c.code);
    expect(walls.length).toBeGreaterThan(0);
    expect(walls).toContain("MW");
    for (const c of habitChoices("double", codes, [])) expect(c.meaning.toLowerCase()).toContain("wall");
    for (const c of habitChoices("crossed", codes, [])) expect(c.meaning.toLowerCase()).toMatch(/fence|hedge|building/);
    const other = walls.find((c) => c !== "MW");
    if (other) expect(habitChoices("double", codes, [other, other])[0]!.code).toBe(other);
  });
});

describe("x marks as a building's wall (the owner's word: some surveyors hatch a house's walls)", () => {
  it("offers the list's building beside its fences, never crowded out, and never a double line's or a toilet's", () => {
    expect(habitChoices("crossed", codes, []).map((c) => c.code)).toEqual(["LF", "NF", "P"]);
    const fences = ["AF", "BF", "CF", "DF"].map((code) => ({ code, meaning: `${code} Fence`, kind: "line" as const, line: "dashed" as const, legend: true }));
    expect(habitChoices("crossed", [...fences, ...codes], []).map((c) => c.code)).toContain("P");
    expect(habitChoices("double", codes, [], Number.POSITIVE_INFINITY).map((c) => c.code)).not.toContain("P");
    // The Survey Department's list has no building outline: only its fences are offered.
    for (const c of habitChoices("crossed", dsrCodes(), [], Number.POSITIVE_INFINITY)) expect(c.meaning.toLowerCase()).toMatch(/fence|hedge/);
    expect(habitEntry({ style: "crossed", code: "T" }, codes)).toBeNull();
    expect(habitEntry({ style: "double", code: "P" }, codes)).toBeNull();
  });

  it("reads an unlabelled line with x marks as a wall of the building, on the buildings layer, and says so", () => {
    const own = classifyLine("", "crossed", codes, [{ style: "crossed", code: "P" }]);
    expect(own).toMatchObject({ kind: "building", fromHabit: true });
    expect(own.code?.code).toBe("P");
    expect(own.why).toBe("it's drawn as a line with x marks, which is a wall of a permanent building (P) on your sketches, as you said");
    expect(LAYER_OF[own.kind]).toBe("BUILDINGS");
    expect(habitSaid("crossed", habitEntry({ style: "crossed", code: "P" }, codes)!)).toBe("a line with x marks is a wall of a permanent building (P)");
    // P written along a line says the same, as writing.
    expect(classifyLine("P", "single", codes)).toMatchObject({ kind: "building", fromWriting: true });
  });

  it("draws the fixture's line with x marks as the building's wall, open, with no question", () => {
    const drawing = { ...SYNTH_DRAWING, lines: SYNTH_DRAWING.lines.map((l) => (l.id === "l3" ? { ...l, style: "crossed" as const } : l)) };
    const doc: SurveyDocument = { ...emptyDocument(), codes, sketchHabits: [{ style: "crossed", code: "P" }], sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [], unreadable: [], drawing } };
    const read = interpretDocument(doc, SYNTH_POINTS)!;
    const p = read.proposals.find((x) => x.kind === "line" && x.from.includes("l3"));
    expect(p).toMatchObject({ kind: "line", feature: "building", code: "P", layer: "BUILDINGS", closed: false });
    expect(p!.evidence.join(" ")).toContain("Read as a building's wall: it's drawn as a line with x marks, which is a wall of a permanent building (P)");
    expect(read.questions.filter((q) => q.text.startsWith("What is the line 31 and 32"))).toEqual([]);
  });
});

describe("a habit on the plan", () => {
  // The fixture's unlabelled line 31 to 32, drawn double here.
  const withDouble = (habits?: SurveyDocument["sketchHabits"]): SurveyDocument => {
    const drawing = { ...SYNTH_DRAWING, lines: SYNTH_DRAWING.lines.map((l) => (l.id === "l3" ? { ...l, style: "double" as const } : l)) };
    const doc: SurveyDocument = { ...emptyDocument(), codes, ...(habits ? { sketchHabits: habits } : {}), sketch: { model: "claude-sonnet-5-5", readAt: "2026-11-23T10:00:00Z", files: ["sketch.jpg"], readings: [], unreadable: [], drawing } };
    return applySketch(doc, interpretDocument(doc, SYNTH_POINTS)!).document;
  };
  const asked = (doc: SurveyDocument) => interpretDocument(doc, SYNTH_POINTS)!.questions.filter((q) => q.text.startsWith("What is the line 31 and 32"));
  const l3 = (doc: SurveyDocument) => interpretDocument(doc, SYNTH_POINTS)!.proposals.find((p) => p.kind === "line" && p.from.includes("l3"));

  it("answers the question a double line raised, and draws it with the surveyor's code", () => {
    expect(asked(withDouble())).toHaveLength(1);
    const own = withDouble([{ style: "double", code: "MW" }]);
    expect(surveyDocumentSchema.safeParse(own).success).toBe(true);
    expect(asked(own)).toEqual([]);
    const p = l3(own)!;
    expect(p.kind === "line" && p.code).toBe("MW");
    expect(p.evidence.join(" ")).toContain("which is a masonry wall (MW) on your sketches, as you said");
  });

  it("is offered on the line's card while no habit for its style is set, the plan's wall codes to choose from", () => {
    const doc = withDouble();
    const findings = buildPlan({ points: SYNTH_POINTS, document: doc, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings;
    const card = exceptionsFor(doc, SYNTH_POINTS, findings).confirm.find((e) => e.confirm === `feature:${l3(doc)!.id}`)!;
    expect(card.habit?.style).toBe("double");
    expect(card.habit?.choices.map((c) => c.code)).toContain("MW");
    // With the habit set, the line's card offers nothing more, and no other line's card offers a habit for that style.
    const own = { ...doc, sketchHabits: [{ style: "double" as const, code: "MW" }] };
    const ownFindings = buildPlan({ points: SYNTH_POINTS, document: own, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings;
    expect(exceptionsFor(own, SYNTH_POINTS, ownFindings).confirm.some((e) => e.habit?.style === "double")).toBe(false);
    // A habit carried from a plan with another list, naming nothing in this one, is as good as none: the card offers this list's.
    const dead = { ...doc, sketchHabits: [{ style: "double" as const, code: "BW" }] };
    const deadFindings = buildPlan({ points: SYNTH_POINTS, document: dead, crsId: "LOCAL", crsConfirmation: "Confirmed (synthetic test)", surveyor: null, approval: null }).findings;
    expect(asked(dead)).toHaveLength(1);
    expect(exceptionsFor(dead, SYNTH_POINTS, deadFindings).confirm.find((e) => e.confirm === `feature:${l3(doc)!.id}`)?.habit?.choices.map((c) => c.code)).toContain("MW");
  });

  it("is kept only as the surveyor's two habits, one for each style", () => {
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: [{ style: "single", code: "MW" }] }).success).toBe(false);
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: [{ style: "double", code: "" }] }).success).toBe(false);
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: [], sketchHabitsSaidAt: "yesterday" }).success).toBe(false);
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: [], sketchHabitsSaidAt: "2026-11-28T08:00:00.000Z" }).success).toBe(true);
  });
});

describe("a building's walls round a labelled house (stage 299 review)", () => {
  // SYNTHETIC: a 10 by 20 m lot turned 30 degrees, a house in its corner behind 5, 6 and 7, "house" written inside it.
  const T = (30 * Math.PI) / 180;
  const at = (pointId: string, u: number, v: number): SurveyPoint => ({ id: `00000000-0000-4000-8000-${pointId.padStart(12, "0")}`, pointId, e: 500_000 + u * Math.cos(T) - v * Math.sin(T), n: 600_000 + u * Math.sin(T) + v * Math.cos(T), z: null, code: null });
  const POINTS = [at("1", 0, 0), at("2", 10, 0), at("3", 10, 20), at("4", 0, 20), at("5", 6, 0.05), at("6", 6, 12), at("7", 0.1, 12)];
  const FRAME: Record<string, [number, number]> = { 1: [0, 0], 2: [10, 0], 3: [10, 20], 4: [0, 20], 5: [6, 0], 6: [6, 12], 7: [0, 12] };
  const photo = (u: number, v: number) => ({ x: 850 - 25 * u, y: 250 + 25 * v });
  const placed = Object.entries(FRAME).map(([label, [u, v]]) => ({ label, file: "s.jpg", ...photo(u, v) }));
  const line = (id: string, points: string[], style: SketchLine["style"] = "single", label = "", closes = false): SketchLine => ({ id, file: "s.jpg", points, label, style, closes, certain: true });
  const BOUNDARY = line("l1", ["1", "2", "3", "4"], "double", "MW", true);
  const read = (lines: SketchLine[]) => interpretSketch({ lines: [BOUNDARY, ...lines], symbols: [], areas: [{ id: "a1", file: "s.jpg", label: "house", around: [] }] }, POINTS, codes, { placed, labels: [{ text: "house", file: "s.jpg", ...photo(3, 6) }] });

  it("draws a wall written P as one of the house's walls, never twice", () => {
    const r = read([line("l2", ["5", "6"], "single", "P"), line("l3", ["6", "7"])]);
    const house = r.proposals.find((p) => p.kind === "building");
    expect(house?.from).toEqual(expect.arrayContaining(["l2", "l3"]));
    expect(r.proposals.some((p) => p.kind === "line" && (p.from.includes("l2") || p.from.includes("l3")))).toBe(false);
    // Every side written P: still the house, from its written walls.
    expect(read([line("l2", ["5", "6"], "single", "P"), line("l3", ["6", "7"], "single", "P")]).proposals.some((p) => p.kind === "building")).toBe(true);
  });
});

describe("a hatched line's habit (stage 301: the surveyor's house walls came back hatched)", () => {
  it("offers a building's wall and walls, reads the line so, and is kept as a third habit", () => {
    expect(habitChoices("hatched", codes, []).map((c) => c.code)).toEqual(["MW", "RW", "P"]);
    const own = classifyLine("", "hatched", codes, [{ style: "hatched", code: "P" }]);
    expect(own).toMatchObject({ kind: "building", fromHabit: true });
    expect(own.why).toBe("it's drawn as a hatched line, which is a wall of a permanent building (P) on your sketches, as you said");
    expect(classifyLine("", "hatched", codes, [{ style: "hatched", code: "LF" }]).fromHabit).toBeUndefined();
    const three = [{ style: "double" as const, code: "MW" }, { style: "crossed" as const, code: "NF" }, { style: "hatched" as const, code: "P" }];
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: three }).success).toBe(true);
  });
});
