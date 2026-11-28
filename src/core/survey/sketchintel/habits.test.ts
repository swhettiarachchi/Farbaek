/** The surveyor's sketch habits (stage 298, ADR 0304), on the common code list and the SYNTHETIC sketch job (fixture.ts). */
import { describe, expect, it } from "vitest";
import { commonCodes } from "../codes";
import { emptyDocument, surveyDocumentSchema, type SurveyDocument } from "../document";
import { applySketch } from "./apply";
import { classifyLine, habitChoices } from "./classify";
import { SYNTH_DRAWING, SYNTH_POINTS } from "./fixture";
import { interpretDocument } from "./findings";

const codes = commonCodes();

describe("what a line drawn a certain way is, by the surveyor's habit", () => {
  it("asks without a habit, and takes the surveyor's word with one", () => {
    expect(classifyLine("", "double", codes)).toMatchObject({ kind: "wall", code: null, fromWriting: false });
    const own = classifyLine("", "double", codes, [{ style: "double", code: "MW" }]);
    expect(own).toMatchObject({ kind: "wall", fromWriting: false, fromHabit: true });
    expect(own.code?.code).toBe("MW");
    expect(own.why).toBe("it's drawn as a double line, which is masonry wall (MW) on your sketches, as you said");
    expect(classifyLine("", "crossed", codes, [{ style: "crossed", code: "NF" }]).code?.code).toBe("NF");
  });

  it("never overrides what's written, another style, or a code that isn't a line in the list", () => {
    const habit = [{ style: "double" as const, code: "MW" }];
    expect(classifyLine("NF", "double", codes, habit).code?.code).toBe("NF");
    expect(classifyLine("", "single", codes, habit).fromHabit).toBeUndefined();
    // MW is also a mark on a wall in the list; a code that's only a point mark, or not in the list at all, isn't taken.
    expect(classifyLine("", "double", codes, [{ style: "double", code: "XX" }]).fromHabit).toBeUndefined();
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
    expect(p.evidence.join(" ")).toContain("which is masonry wall (MW) on your sketches, as you said");
  });

  it("is kept only as the surveyor's two habits, one for each style", () => {
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: [{ style: "single", code: "MW" }] }).success).toBe(false);
    expect(surveyDocumentSchema.safeParse({ ...emptyDocument(), sketchHabits: [{ style: "double", code: "" }] }).success).toBe(false);
  });
});
