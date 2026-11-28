/** A returning surveyor sets nothing twice (stage 226, ADR 0237). Every plan here is SYNTHETIC. */
import { describe, expect, it } from "vitest";
import { commonCodes, dsrCodes } from "../codes";
import { emptyDocument, type SurveyDocument } from "../document";
import { checkSurvey } from "../qc";
import { crsById } from "../crs";
import { computeLots } from "../lots";
import { defaultsFrom, withDefaults } from "./defaults";

const office = [
  { code: "IP", meaning: "Iron Pin", kind: "mark" as const, line: "solid" as const, legend: true },
  { code: "FN", meaning: "Wire Fence", kind: "line" as const, line: "dashed" as const, legend: true },
];
const plan = (patch: Partial<SurveyDocument>): SurveyDocument => ({ ...emptyDocument(), ...patch });

describe("the surveyor's sketch habits, carried (stage 298)", () => {
  const habit = [{ style: "double" as const, code: "MW" }];
  const said = "2026-11-20T09:00:00.000Z";
  const forgotten = "2026-11-21T09:00:00.000Z";

  it("come from the plan they were last said on, with when, whichever plan was saved last", () => {
    const d = defaultsFrom([
      { name: "Lot 9 (latest)", document: plan({}) },
      { name: "Lot 8", document: plan({ sketchHabits: habit, sketchHabitsSaidAt: said }) },
    ]);
    expect(d.habits).toEqual({ entries: habit, from: "Lot 8", saidAt: said });
    const next = withDefaults(emptyDocument(), d);
    expect(next.sketchHabits).toEqual(habit);
    expect(next.sketchHabitsSaidAt).toBe(said);
    expect(defaultsFrom([]).habits).toBeNull();
  });

  it("never bring back a habit forgotten later, even when the plan it was said on is saved after", () => {
    // Said on Lot 8, forgotten on Lot 10, then Lot 8's title fixed: Lot 8 is now the newest plan, but the newest decision is Lot 10's.
    const forgot = defaultsFrom([
      { name: "Lot 8", document: plan({ sketchHabits: habit, sketchHabitsSaidAt: said }) },
      { name: "Lot 10", document: plan({ sketchHabits: [], sketchHabitsSaidAt: forgotten }) },
    ]);
    expect(forgot.habits).toEqual({ entries: [], from: "Lot 10", saidAt: forgotten });
    // The decision is carried on, so it holds once Lot 10 is no longer among the recent plans.
    const next = withDefaults(emptyDocument(), forgot);
    expect(next.sketchHabits).toEqual([]);
    expect(defaultsFrom([{ name: "Lot 11", document: next }, { name: "Lot 8", document: plan({ sketchHabits: habit, sketchHabitsSaidAt: said }) }]).habits?.entries).toEqual([]);
  });
});

describe("a new plan's defaults", () => {
  it("carries the newest code list the surveyor checked, waiting for one check, and the latest plan's sheet presentation, never its scale or land", () => {
    const latest = plan({ settings: { ...emptyDocument().settings, paper: "A3", orientation: "landscape", scale: 500, overleaf: false }, sheet: { ...emptyDocument().sheet, landName: "Sample Watta" } });
    const checked = plan({ codes: office, provenance: { codes: { source: "engine", reviewed: true } } });
    const d = defaultsFrom([
      { name: "Lot 9 (latest)", document: latest },
      { name: "Lot 7", document: checked },
    ]);
    expect(d.codes).toEqual({ entries: office, from: "Lot 7" });
    expect(d.settings?.from).toBe("Lot 9 (latest)");
    expect(d.settings?.values).toMatchObject({ paper: "A3", orientation: "landscape", overleaf: false });
    expect(d.settings?.values).not.toHaveProperty("scale");
    const next = withDefaults(emptyDocument(), d);
    expect(next.codes).toEqual(office);
    expect(next.provenance["codes"]).toEqual({ source: "engine", reviewed: false });
    expect([next.settings.paper, next.settings.scale, next.sheet.landName]).toEqual(["A3", null, ""]);
    // A check has no reviewer and a list can change after it, so the carried list asks once more: one press on the new plan.
    const qc = checkSurvey({ points: [], crs: crsById("EPSG:5235"), crsConfirmed: true, document: next, lots: computeLots([], []), surveyorProfile: true });
    expect(qc.some((f) => f.code === "LEGEND_UNREVIEWED")).toBe(true);
  });

  it("carries no list the surveyor didn't check, or one that's still the common or Survey Department list, and nothing for a first plan", () => {
    expect(defaultsFrom([{ name: "a", document: plan({ codes: office }) }]).codes).toBeNull();
    expect(defaultsFrom([{ name: "a", document: plan({ codes: commonCodes(), provenance: { codes: { source: "engine", reviewed: true } } }) }]).codes).toBeNull();
    expect(defaultsFrom([{ name: "a", document: plan({ codes: dsrCodes(), provenance: { codes: { source: "engine", reviewed: true } } }) }]).codes).toBeNull();
    expect(defaultsFrom([])).toEqual({ codes: null, settings: null, grammar: null, habits: null });
    // The newest decision stands: checked on the common list last time, so an older office list isn't carried.
    const newer = plan({ codes: commonCodes(), provenance: { codes: { source: "engine", reviewed: true } } });
    const older = plan({ codes: office, provenance: { codes: { source: "engine", reviewed: true } } });
    expect(defaultsFrom([{ name: "new", document: newer }, { name: "old", document: older }]).codes).toBeNull();
    expect(withDefaults(emptyDocument(), { codes: null, settings: null })).toEqual(emptyDocument());
  });

  it("carries how the crew writes line words with the codes the surveyor checked last, whichever list, and not Farbaek's own (ADR 0243)", () => {
    const carlson = plan({ codes: commonCodes(), grammar: "carlson", provenance: { codes: { source: "engine", reviewed: true } } });
    const d = defaultsFrom([{ name: "Lot 12", document: carlson }]);
    expect(d.grammar).toEqual({ id: "carlson", from: "Lot 12" });
    expect(withDefaults(emptyDocument(), d).grammar).toBe("carlson");
    // Not from a plan whose codes weren't checked, and nothing to carry for Farbaek's own words.
    expect(defaultsFrom([{ name: "a", document: plan({ grammar: "carlson" }) }]).grammar).toBeNull();
    expect(defaultsFrom([{ name: "a", document: plan({ grammar: "farbaek", provenance: { codes: { source: "engine", reviewed: true } } }) }]).grammar).toBeNull();
  });
});
