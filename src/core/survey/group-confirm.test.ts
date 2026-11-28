/** The confirm list grouped as a surveyor works through it (stage 301): questions first, the many alike folded, nothing dropped. */
import { describe, expect, it } from "vitest";
import { emptyDocument, type SurveyDocument } from "@/core/survey/document";
import { groupConfirm, type SurveyException } from "@/core/survey/exceptions";

const base: SurveyException = { id: "", code: "AI_ITEMS_UNREVIEWED", group: "confirm", severity: "warning", title: "", holds: null, item: null, evidence: null, next: "", step: null, confirm: null, keep: null };
const quiet = (id: string): SurveyException => ({ ...base, id, confirm: `feature:${id}`, sketch: { lead: "", evidence: [], questions: [], fixes: [] } });
const asked = (id: string): SurveyException => ({ ...base, id, confirm: `feature:${id}`, sketch: { lead: "", evidence: [], questions: ["What is the line 8 and 11?"], fixes: [] } });
const differs = (id: string): SurveyException => ({ ...base, id, code: "SKETCH_DIFFERS", keep: { key: `sketch:${id}`, kept: false } });
const doubted = (id: string): SurveyException => ({ ...base, id, code: "SKETCH_CHECK_DOUBT" });
const feature = (id: string, closed = false) => ({ id, layer: "WALLS" as const, code: "MW", closed, points: ["00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002"] });

describe("the confirm list, grouped", () => {
  const doc: SurveyDocument = { ...emptyDocument(), features: ["a", "b", "c", "d", "e"].map((id) => feature(id)).concat([feature("house", true)]) };

  it("keeps questions as cards and folds three or more alike, losing none", () => {
    const list = [asked("e"), quiet("a"), quiet("b"), quiet("c"), differs("r1"), differs("r2"), differs("r3"), doubted("c1"), doubted("c2"), doubted("c3"), { ...base, id: "codes", confirm: "codes" }];
    const g = groupConfirm(list, doc);
    expect(g.lead.map((e) => e.id)).toEqual(["e", "codes"]);
    expect(g.lines.map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(g.differs).toHaveLength(3);
    expect(g.doubted).toHaveLength(3);
    expect(g.lead.length + g.lines.length + g.differs.length + g.doubted.length).toBe(list.length);
  });

  it("folds two alike, so a fold doesn't vanish as its items are confirmed, but never a closed outline (a building) or a line with a habit to say", () => {
    const g = groupConfirm([quiet("a"), quiet("b"), differs("r1"), differs("r2"), doubted("c1")], doc);
    expect(g.lines).toHaveLength(2);
    expect(g.differs).toHaveLength(2);
    expect(g.lead.map((e) => e.id)).toEqual(["c1"]);
    const withHouse = groupConfirm([quiet("a"), quiet("house"), { ...quiet("c"), habit: { style: "double", choices: [] } }], doc);
    expect(withHouse.lines).toEqual([]);
    expect(withHouse.lead).toHaveLength(3);
  });
});
