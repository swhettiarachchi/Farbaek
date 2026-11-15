/**
 * Planning rules for dividing land, as versioned data (stage 193). Each set
 * names the document it was read from, the sections, its verification status
 * and when it's due for review, so a check never passes off a guess as a rule
 * (survey skill, rule 8). The figures are the surveyor's to apply: a set is
 * chosen per check, never assumed, and a Development Plan or other local rule
 * can replace the minimums with the surveyor's own, cited in their words.
 *
 * Sources and statuses: docs/survey/STANDARDS_RESEARCH.md, "Subdivision rules".
 */

export interface RuleMinimums {
  areaM2: number;
  frontageM: number;
  depthM: number;
}

export interface RuleSet {
  /** Stable and versioned: a new copy of the regulations is a new id. */
  id: string;
  /** How a share's problems name the source: "the UDA minimum of 150 m²". */
  label: string;
  title: string;
  /** Where the figures come from, as the surveyor would cite it. */
  source: string;
  status: "verified_official" | "professional_configuration_required";
  appliesTo: string;
  /** ISO date the source is due to be replaced, if known. */
  reviewBy: string | null;
  minimums: RuleMinimums;
  /** Reminders with their sections, shown when they apply to the land being divided. Information, not a pass or a fail. */
  reminders: { section: string; text: string; when: "always" | "large" }[];
  /** Land at or above this area, or this many lots, counts as large for the reminders. */
  large: { areaM2: number; lots: number } | null;
}

/** UDA Planning & Development Regulations (the copy titled 2020), regulations 4, 7, 9(a), 14(1) and 23. */
export const UDA_2020: RuleSet = {
  id: "uda-2020",
  label: "the UDA minimum",
  title: "UDA Planning & Development Regulations (the copy titled 2020)",
  source: "Urban Development Authority, Planning & Development Regulations, regs. 9(a) and 14(1)",
  status: "verified_official",
  appliesTo: "UDA-declared areas, unless a Development Plan says otherwise",
  reviewBy: "2026-12-31",
  minimums: { areaM2: 150, frontageM: 6, depthM: 12 },
  reminders: [
    { section: "reg. 4(1)", text: "Dividing land in a UDA-declared area needs prior written consent from the UDA and the local authority.", when: "always" },
    { section: "reg. 7", text: "At 1 hectare or more, or 8 lots or more, a declaration from a Relevant Qualified Person may be required.", when: "large" },
    { section: "reg. 23", text: "Land of 1 hectare or more sets aside at least 10% of its area, excluding streets, for community use, recreation and open space, with the exceptions in regs. 24 to 26.", when: "large" },
  ],
  large: { areaM2: 10_000, lots: 8 },
};

export const RULE_SETS: readonly RuleSet[] = [UDA_2020];

/** The surveyor's own minimums (a Development Plan, a by-law, a client's brief), cited in their words. Nothing here is checked against a source. */
export function ownRules(minimums: RuleMinimums, source: string): RuleSet {
  return {
    id: "own",
    label: "the minimum you entered",
    title: "Minimums you entered",
    source: source.trim().slice(0, 200),
    status: "professional_configuration_required",
    appliesTo: "Where the source you named applies",
    reviewBy: null,
    minimums,
    reminders: [],
    large: null,
  };
}

/** The rules a plan's lots are checked against, as stored in the drawing (document.ts). */
export type PlanRulesChoice = { id: "uda-2020" } | { id: "own"; areaM2: number; frontageM: number; depthM: number; source: string };

/** The set a plan's choice names: null for none, and for the surveyor's own minimums until they've said where those come from. */
export function ruleSetFrom(choice: PlanRulesChoice | null): RuleSet | null {
  if (!choice) return null;
  if (choice.id === "uda-2020") return UDA_2020;
  return choice.source.trim() ? ownRules({ areaM2: choice.areaM2, frontageM: choice.frontageM, depthM: choice.depthM }, choice.source) : null;
}

/**
 * A lot whose note marks it reserved: "(Res. for Access, 10ft. wide)", "Res for road", "Resd. for drain", "Reserved for…" or a
 * "… Reservation". Not a building lot, so not held to the minimums.
 */
export const RESERVED_NOTE = /^\(?\s*res(?:\.|d\.|\b)|\breserv(?:ed|ation)\b/i;
/** A reserved lot that gives access: its legs count as road frontage for the lots beside it. A way leave for a power line doesn't. */
export const ACCESS_NOTE = /\b(?:access|road|roadway|lane|path|footpath|right of way|carriageway)\b/i;

/** A figure under a minimum, with enough decimals that rounding never shows it equal to the minimum ("149.996", not "150.00"). */
export function shortOf(value: number, min: number): string {
  let dp = 2;
  while (dp < 6 && Number(value.toFixed(dp)) >= min) dp++;
  return value.toFixed(dp);
}

/** A minimum as the rule or the surveyor gives it: 150, 6.0, 6.25, 12.04. */
export function minimumText(x: number, oneDecimal: boolean): string {
  const t = Number(x.toFixed(3));
  return oneDecimal && Number.isInteger(t) ? t.toFixed(1) : String(t);
}

/** A typed figure as a plain decimal ("12", "12.5", ".5"), or NaN: no hexadecimal, exponents or signs slip through as Number() would let them. */
export function readDecimal(text: string): number {
  return /^\s*(?:\d+(?:\.\d*)?|\.\d+)\s*$/.test(text) ? Number(text) : Number.NaN;
}

/** The reminders that apply to dividing land of this area into this many lots. */
export function remindersFor(rules: RuleSet, landM2: number, lots: number): string[] {
  const large = rules.large !== null && (landM2 >= rules.large.areaM2 || lots >= rules.large.lots);
  return rules.reminders.filter((r) => r.when === "always" || large).map((r) => `${r.text} (${r.section})`);
}

/** A note on the set's age: due for review on a date, or past it. Null when it has no review date. `today` is an ISO date. */
export function reviewNote(rules: RuleSet, today: string): string | null {
  if (!rules.reviewBy) return null;
  const due = new Date(`${rules.reviewBy}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  return today > rules.reviewBy ? `These regulations were due to be replaced on ${due}. Check for newer ones before relying on these figures.` : `New regulations are due by ${due}; these figures may change then.`;
}
