/**
 * Learning from corrections (stage 270, ADR 0277), on SYNTHETIC plans: what a surveyor's recent plans from an office profile suggest for
 * it, one code at a time; that plans from another profile, or none, say nothing; and that nothing is applied unless chosen, nor offered
 * again once turned down.
 */
import { describe, expect, it } from "vitest";
import type { EarlierPlan } from "./autosurvey/defaults";
import type { CodeEntry } from "./codes";
import { emptyDocument, type SurveyDocument } from "./document";
import { applySuggestion, declineSuggestion, suggestionsFor, type ProfileForLearning } from "./learning";
import { officeProfileBodySchema, profileSummary, type OfficeProfileBody } from "./profile";

const ID = "77777777-7777-4777-8777-777777777777";
const OTHER = "88888888-8888-4888-8888-888888888888";
const BW: CodeEntry = { code: "BW", meaning: "Boundary wall", kind: "line", line: "solid", legend: true };
const GT: CodeEntry = { code: "GT", meaning: "Gate", kind: "mark", line: "solid", legend: true };
const WL: CodeEntry = { code: "WL", meaning: "Well", kind: "symbol", line: "solid", legend: false };
const sheet = (() => {
  const s = emptyDocument().settings;
  return { template: s.template, paper: s.paper, orientation: s.orientation, perchDecimals: s.perchDecimals, secondDecimals: s.secondDecimals, distanceDecimals: s.distanceDecimals, overleaf: s.overleaf, permitBox: s.permitBox, slant: s.slant, faceDimensions: s.faceDimensions };
})();
const body = (o: Partial<OfficeProfileBody> = {}): OfficeProfileBody => ({ crsId: "EPSG:5235", equipment: [], codes: { entries: [BW], grammar: "farbaek" }, sheet, statement: "", ...o });
const profile = (o: Partial<OfficeProfileBody> = {}): ProfileForLearning => ({ id: ID, body: body(o) });
/** A plan started from the profile (or `from` another, or none), its latest version changed by `f`. */
const plan = (name: string, f: (d: SurveyDocument) => void = () => {}, from: string | null = ID): EarlierPlan => {
  const d = emptyDocument();
  if (from) d.fromProfile = { id: from, version: 1 };
  f(d);
  return { name, document: d };
};
const ticks = (d: SurveyDocument) => void (d.settings.wallTicks = true);
const checked = (codes: CodeEntry[]) => (d: SurveyDocument) => {
  d.codes = codes;
  d.provenance = { ...d.provenance, codes: { source: "engine", reviewed: true } };
};

describe("drafting choices learned from the surveyor's plans from the profile", () => {
  it("suggests one their recent plans from it all end with, and applies it only when asked", () => {
    const recent = [plan("Plan C", ticks), plan("Plan B", ticks), plan("Plan A", ticks)];
    const s = suggestionsFor(profile(), recent);
    expect(s.map((x) => x.key)).toEqual(["setting:wallTicks=on"]);
    expect(s[0]!.sentence).toBe("Your last three plans from this profile all letter walls' codes small, with a tick across the wall. Start new plans from it that way.");
    expect(s[0]!.from).toEqual(["Plan C", "Plan B", "Plan A"]);
    const applied = applySuggestion(profile(), recent, "setting:wallTicks=on")!;
    expect(applied.sheet!.wallTicks).toBe(true);
    expect(officeProfileBodySchema.safeParse(applied).success).toBe(true);
    expect(profileSummary({ id: ID, name: "P", version: 2, body: applied, updatedAt: "" })).toContain("1 drafting choice");
    expect(suggestionsFor({ id: ID, body: applied }, recent)).toEqual([]);
  });

  it("learns nothing from plans started from another profile, or from none", () => {
    expect(suggestionsFor(profile(), [plan("B", ticks, OTHER), plan("A", ticks, OTHER)])).toEqual([]);
    expect(suggestionsFor(profile(), [plan("B", ticks, null), plan("A", ticks, null)])).toEqual([]);
    // A blank plan says nothing either: it was never started from the profile.
    expect(suggestionsFor(profile({ sheet: { ...sheet, wallTicks: true } }), [plan("B", () => {}, null), plan("A", () => {}, null)])).toEqual([]);
  });

  it("needs two plans at least, all agreeing, and only the three most recent from the profile count", () => {
    expect(suggestionsFor(profile(), [plan("Only", ticks)])).toEqual([]);
    expect(suggestionsFor(profile(), [plan("C", ticks), plan("B"), plan("A", ticks)])).toEqual([]);
    expect(suggestionsFor(profile(), [plan("D", ticks), plan("C", ticks), plan("X", () => {}, OTHER), plan("B", ticks), plan("A")]).map((x) => x.key)).toEqual(["setting:wallTicks=on"]);
  });

  it("suggests stopping one the profile starts with when their plans from it all end without it", () => {
    const withTicks = profile({ sheet: { ...sheet, wallTicks: true } });
    const s = suggestionsFor(withTicks, [plan("B"), plan("A")]);
    expect(s.map((x) => x.key)).toEqual(["setting:wallTicks=off"]);
    expect(s[0]!.sentence).toBe("This profile starts plans to letter walls' codes small, with a tick across the wall, and your last two plans from it don't. Stop starting them that way.");
    expect(applySuggestion(withTicks, [plan("B"), plan("A")], "setting:wallTicks=off")!.sheet!.wallTicks).toBeUndefined();
  });

  it("leaves alone a profile that keeps no sheet", () => {
    expect(suggestionsFor(profile({ sheet: null }), [plan("B", ticks), plan("A", ticks)])).toEqual([]);
  });
});

describe("codes learned from the surveyor's checked lists, one at a time", () => {
  const recent = [plan("B", checked([{ ...BW, meaning: "Brick wall" }, GT, WL])), plan("A", checked([{ ...BW, meaning: "Brick wall" }, GT, WL]))];

  it("suggests each code their lists share that the profile's lacks, and a meaning they all give differently", () => {
    const s = suggestionsFor(profile(), recent);
    expect(s.map((x) => x.key)).toEqual(["codes:mean:BW:Brick%20wall", "codes:add:GT", "codes:add:WL"]);
    expect(s[1]!.sentence).toBe("Your last two plans from this profile all have GT (Gate) in their checked codes, and this profile's list doesn't. Add it.");
    expect(applySuggestion(profile(), recent, "codes:add:GT")!.codes!.entries.map((e) => e.code)).toEqual(["BW", "GT"]);
    expect(applySuggestion(profile(), recent, "codes:mean:BW:Brick%20wall")!.codes!.entries[0]!.meaning).toBe("Brick wall");
  });

  it("turns one down without the others, and a code added later is offered on its own", () => {
    const declined = declineSuggestion(profile(), recent, "codes:add:GT")!;
    const next = [plan("C", checked([BW, GT, WL, { ...GT, code: "TR", meaning: "Tree" }])), plan("B2", checked([BW, GT, WL, { ...GT, code: "TR", meaning: "Tree" }]))];
    expect(suggestionsFor({ id: ID, body: declined }, next).map((x) => x.key)).toEqual(["codes:add:WL", "codes:add:TR"]);
  });

  it("keeps codes with a | or a = whole, and changes only the code meant", () => {
    const odd: CodeEntry = { ...GT, code: "A|B", meaning: "Pole=old" };
    const eq: CodeEntry = { ...GT, code: "A=1", meaning: "Pole" };
    const own = profile({ codes: { entries: [BW, { ...GT, code: "A" }, { ...GT, code: "B" }, { ...eq, meaning: "Post" }], grammar: "farbaek" } });
    const plans = [plan("B", checked([BW, odd, eq])), plan("A", checked([BW, odd, eq]))];
    const keys = suggestionsFor(own, plans).map((x) => x.key);
    expect(keys).toEqual(["codes:add:A%7CB", "codes:mean:A%3D1:Pole"]);
    expect(applySuggestion(own, plans, keys[0]!)!.codes!.entries.map((e) => e.code)).toEqual(["BW", "A", "B", "A=1", "A|B"]);
    const meant = applySuggestion(own, plans, keys[1]!)!.codes!.entries;
    expect(meant.find((e) => e.code === "A=1")!.meaning).toBe("Pole");
    expect(meant.find((e) => e.code === "A")!.meaning).toBe("Gate");
  });

  it("offers no code to a list already at its 500, nor from unchecked or common lists, a single plan, or a profile on Farbaek's list", () => {
    const full = profile({ codes: { entries: Array.from({ length: 500 }, (_, i) => ({ ...BW, code: `C${i}` })), grammar: "farbaek" } });
    expect(suggestionsFor(full, recent).filter((s) => s.key.startsWith("codes:add:"))).toEqual([]);
    const unchecked = (d: SurveyDocument) => void (d.codes = [BW, GT]);
    expect(suggestionsFor(profile(), [plan("B", unchecked), plan("A", unchecked)])).toEqual([]);
    expect(suggestionsFor(profile(), [plan("A", checked([BW, GT]))])).toEqual([]);
    expect(suggestionsFor(profile({ codes: null }), [plan("B", checked([BW, GT])), plan("A", checked([BW, GT]))])).toEqual([]);
  });
});

describe("answering a suggestion", () => {
  const recent = [plan("B", ticks), plan("A", ticks)];
  it("never offers again one turned down, and records it in the profile", () => {
    const declined = declineSuggestion(profile(), recent, "setting:wallTicks=on")!;
    expect(declined.declined).toEqual(["setting:wallTicks=on"]);
    expect(officeProfileBodySchema.safeParse(declined).success).toBe(true);
    expect(suggestionsFor({ id: ID, body: declined }, recent)).toEqual([]);
  });

  it("refuses a key that isn't suggested now: made up, or no longer true of the plans", () => {
    expect(applySuggestion(profile(), recent, "setting:noLotLetters=on")).toBeNull();
    expect(applySuggestion(profile(), [plan("B", ticks), plan("A")], "setting:wallTicks=on")).toBeNull();
    expect(declineSuggestion(profile(), recent, "codes:add:XX")).toBeNull();
  });
});
