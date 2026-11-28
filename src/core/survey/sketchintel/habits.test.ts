/** The surveyor's sketch habits (stage 298, ADR 0304), on the common code list and the SYNTHETIC sketch job (fixture.ts). */
import { describe, expect, it } from "vitest";
import { commonCodes, dsrCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { applySketch } from "./apply";
import { asThing, classifyLine, habitChoices, habitEntry, habitSaid } from "./classify";
import { SYNTH_DRAWING, SYNTH_POINTS } from "./fixture";
import { interpretDocument } from "./findings";
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
    for (const c of habitChoices("crossed", codes, [])) expect(c.meaning.toLowerCase()).toMatch(/fence|hedge/);
    const other = walls.find((c) => c !== "MW");
    if (other) expect(habitChoices("double", codes, [other, other])[0]!.code).toBe(other);
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
