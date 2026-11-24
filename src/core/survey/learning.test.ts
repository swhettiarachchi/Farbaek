/**
 * Learning from corrections (stage 270, ADR 0277), on SYNTHETIC plans: what a surveyor's recent plans suggest for an office profile,
 * and that nothing is applied unless chosen, nor offered again once turned down.
 */
import { describe, expect, it } from "vitest";
import type { EarlierPlan } from "./autosurvey/defaults";
import type { CodeEntry } from "./codes";
import { emptyDocument, type SurveyDocument } from "./document";
import { applySuggestion, declineSuggestion, suggestionsFor } from "./learning";
import { officeProfileBodySchema, type OfficeProfileBody } from "./profile";

const BW: CodeEntry = { code: "BW", meaning: "Boundary wall", kind: "line", line: "solid", legend: true };
const GT: CodeEntry = { code: "GT", meaning: "Gate", kind: "mark", line: "solid", legend: true };
const WL: CodeEntry = { code: "WL", meaning: "Well", kind: "symbol", line: "solid", legend: false };
const sheet = (() => {
  const s = emptyDocument().settings;
  return { template: s.template, paper: s.paper, orientation: s.orientation, perchDecimals: s.perchDecimals, secondDecimals: s.secondDecimals, distanceDecimals: s.distanceDecimals, overleaf: s.overleaf, permitBox: s.permitBox, slant: s.slant, faceDimensions: s.faceDimensions };
})();
const body = (o: Partial<OfficeProfileBody> = {}): OfficeProfileBody => ({ crsId: "EPSG:5235", equipment: [], codes: { entries: [BW], grammar: "farbaek" }, sheet, statement: "", ...o });
const plan = (name: string, f: (d: SurveyDocument) => void = () => {}): EarlierPlan => {
  const d = emptyDocument();
  f(d);
  return { name, document: d };
};
const ticks = (d: SurveyDocument) => void (d.settings.wallTicks = true);
const checked = (codes: CodeEntry[]) => (d: SurveyDocument) => {
  d.codes = codes;
  d.provenance = { ...d.provenance, codes: { source: "engine", reviewed: true } };
};

describe("drafting choices learned from the surveyor's plans", () => {
  it("suggests one their recent plans all make and the profile doesn't, and applies it only when asked", () => {
    const recent = [plan("Plan C", ticks), plan("Plan B", ticks), plan("Plan A", ticks)];
    const s = suggestionsFor(body(), recent);
    expect(s.map((x) => x.key)).toEqual(["setting:wallTicks=on"]);
    expect(s[0]!.sentence).toBe("Your last three plans all letter walls' codes small, with a tick across the wall. Start new plans from this profile that way.");
    expect(s[0]!.from).toEqual(["Plan C", "Plan B", "Plan A"]);
    const applied = applySuggestion(body(), recent, "setting:wallTicks=on")!;
    expect(applied.sheet!.wallTicks).toBe(true);
    // The profile as saved still reads.
    expect(officeProfileBodySchema.safeParse(applied).success).toBe(true);
    // Once added, it isn't suggested again.
    expect(suggestionsFor(applied, recent)).toEqual([]);
  });

  it("needs two plans at least, all agreeing, and only the three most recent count", () => {
    expect(suggestionsFor(body(), [plan("Only", ticks)])).toEqual([]);
    expect(suggestionsFor(body(), [plan("C", ticks), plan("B"), plan("A", ticks)])).toEqual([]);
    // An older plan without it doesn't count once three newer ones agree.
    expect(suggestionsFor(body(), [plan("D", ticks), plan("C", ticks), plan("B", ticks), plan("A")]).map((x) => x.key)).toEqual(["setting:wallTicks=on"]);
  });

  it("suggests turning off one the profile starts with when their recent plans all turn it off", () => {
    const withTicks = body({ sheet: { ...sheet, wallTicks: true } });
    const s = suggestionsFor(withTicks, [plan("B"), plan("A")]);
    expect(s.map((x) => x.key)).toEqual(["setting:wallTicks=off"]);
    expect(applySuggestion(withTicks, [plan("B"), plan("A")], "setting:wallTicks=off")!.sheet!.wallTicks).toBeUndefined();
  });

  it("leaves alone a profile that keeps no sheet", () => {
    expect(suggestionsFor(body({ sheet: null }), [plan("B", ticks), plan("A", ticks)])).toEqual([]);
  });
});

describe("codes learned from the surveyor's checked lists", () => {
  it("suggests codes every recent checked list has and the profile's lacks, and a meaning they all give differently", () => {
    const recent = [plan("B", checked([{ ...BW, meaning: "Brick wall" }, GT, WL])), plan("A", checked([{ ...BW, meaning: "Brick wall" }, GT, WL]))];
    const s = suggestionsFor(body(), recent);
    expect(s.map((x) => x.key)).toEqual(["codes:add:GT|WL", "codes:mean:BW=Brick wall"]);
    expect(s[0]!.sentence).toContain("GT (Gate) and WL (Well)");
    const added = applySuggestion(body(), recent, "codes:add:GT|WL")!;
    expect(added.codes!.entries.map((e) => e.code)).toEqual(["BW", "GT", "WL"]);
    const meant = applySuggestion(body(), recent, "codes:mean:BW=Brick wall")!;
    expect(meant.codes!.entries[0]!.meaning).toBe("Brick wall");
  });

  it("learns nothing from a list the surveyor didn't check, the common list, or a single plan", () => {
    const unchecked = (d: SurveyDocument) => void (d.codes = [BW, GT]);
    expect(suggestionsFor(body(), [plan("B", unchecked), plan("A", unchecked)])).toEqual([]);
    expect(suggestionsFor(body(), [plan("A", checked([BW, GT]))])).toEqual([]);
    // A profile on Farbaek's list (no list of its own) isn't offered codes.
    expect(suggestionsFor(body({ codes: null }), [plan("B", checked([BW, GT])), plan("A", checked([BW, GT]))])).toEqual([]);
  });
});

describe("answering a suggestion", () => {
  const recent = [plan("B", ticks), plan("A", ticks)];
  it("never offers again one turned down, and records it in the profile", () => {
    const declined = declineSuggestion(body(), recent, "setting:wallTicks=on")!;
    expect(declined.declined).toEqual(["setting:wallTicks=on"]);
    expect(officeProfileBodySchema.safeParse(declined).success).toBe(true);
    expect(suggestionsFor(declined, recent)).toEqual([]);
  });

  it("refuses a key that isn't suggested now: made up, or no longer true of the plans", () => {
    expect(applySuggestion(body(), recent, "setting:noLotLetters=on")).toBeNull();
    expect(applySuggestion(body(), [plan("B", ticks), plan("A")], "setting:wallTicks=on")).toBeNull();
    expect(declineSuggestion(body(), recent, "codes:add:XX")).toBeNull();
  });
});
