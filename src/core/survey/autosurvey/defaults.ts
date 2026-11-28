/**
 * A returning surveyor sets nothing twice (stage 226, ADR 0237): a new plan starts from what this surveyor already decided on their
 * own recent plans in this workspace, and never from anything else.
 *
 * - The code library: from their newest plan whose list was checked (its "codes" mark reviewed), carried over unchanged; nothing
 *   when that list is still the common or Survey Department list, which the new plan starts from anyway. It waits for one press on
 *   the new plan: the mark records no reviewer, and a list can change after its check, so a carried list is never taken as checked.
 * - How the crew writes line words (ADR 0243): from that same newest checked plan, when it isn't Farbaek's own.
 * - The sheet's presentation: layout, paper, orientation, decimals, overleaf, permit box, lettering, face dimensions and line thickness
 *   from their latest plan. The scale isn't carried: it belongs to each land.
 * - The next plan number, and where their latest land was as far as the district (stage 304, plan-details.ts), each waiting for their
 *   own confirmation.
 * Nothing about the land itself (title, lots, owners, extents, boundaries) is ever carried: a past plan is never a source of legal truth.
 * An office code library uploaded with the files wins over a carried list (codelib.ts).
 */
import { codesAreCommonList, codesAreDsrList, type CodeEntry } from "../codes";
import type { SurveyDocument } from "../document";
import type { GrammarId } from "../grammar";
import { carriedDetails, withCarriedDetails, type CarriedDetails } from "./plan-details";

export interface EarlierPlan {
  name: string;
  /** The plan's latest version. */
  document: SurveyDocument;
}

export const CARRIED_SETTINGS = ["template", "paper", "orientation", "perchDecimals", "secondDecimals", "distanceDecimals", "overleaf", "permitBox", "slant", "faceDimensions", "lineMm", "boundaryMm"] as const;
export type CarriedSettings = Pick<SurveyDocument["settings"], (typeof CARRIED_SETTINGS)[number]>;

export interface StartingDefaults {
  codes: { entries: CodeEntry[]; from: string } | null;
  settings: { values: CarriedSettings; from: string } | null;
  /** How the crew writes line words (ADR 0243), from the newest plan whose codes were checked, when it isn't Farbaek's own. */
  grammar?: { id: GrammarId; from: string } | null;
  /**
   * The surveyor's own sketch habits (stage 298, ADR 0304): their newest decision about them, carried as it was said, even that there are
   * none any more (an empty list), with when it was said.
   */
  habits?: { entries: NonNullable<SurveyDocument["sketchHabits"]>; from: string; saidAt: string | null } | null;
  /** The next plan number and where the surveyor's latest land was (stage 304, ADR 0310), each waiting for their confirmation. */
  details?: CarriedDetails;
}

/** What a new plan takes from the surveyor's recent plans, newest first. */
export function defaultsFrom(earlier: readonly EarlierPlan[]): StartingDefaults {
  // The newest decision stands: a newer plan checked on the common list means the office list isn't carried.
  const newest = earlier.find((p) => p.document.provenance["codes"]?.reviewed === true && p.document.codes.length > 0);
  const checked = newest && !codesAreCommonList(newest.document.codes) && !codesAreDsrList(newest.document.codes) ? newest : null;
  const latest = earlier[0];
  // The line words go with the codes the surveyor checked, whichever list that was: how a crew writes doesn't change with the list.
  const words = newest?.document.grammar;
  // The newest decision stands (stage 298): the plan whose sketch habits were said or forgotten last, even that there are none any more
  // (forgetting the last one leaves an empty list), so a habit forgotten on one plan never comes back from another saved after it. A
  // decision with no time (none is saved without one) counts as the oldest; between two at the same time, the newer plan's.
  const when = (p: EarlierPlan) => p.document.sketchHabitsSaidAt ?? "";
  const details = carriedDetails(earlier);
  const said = earlier.filter((p) => p.document.sketchHabits !== undefined).reduce<EarlierPlan | null>((best, p) => (!best || when(p) > when(best) ? p : best), null);
  return {
    codes: checked ? { entries: checked.document.codes.map((c) => ({ ...c })), from: checked.name } : null,
    // Only what the plan has: a plan made before the line thickness (stage 304) leaves a new plan's 0.13 mm as it is.
    settings: latest ? { values: Object.fromEntries(CARRIED_SETTINGS.filter((k) => latest.document.settings[k] !== undefined).map((k) => [k, latest.document.settings[k]])) as CarriedSettings, from: latest.name } : null,
    grammar: newest && words && words !== "farbaek" ? { id: words, from: newest.name } : null,
    habits: said ? { entries: said.document.sketchHabits!.map((h) => ({ ...h })), from: said.name, saidAt: said.document.sketchHabitsSaidAt ?? null } : null,
    ...(details.planNumber || details.region ? { details } : {}),
  };
}

/** A new plan's document with the defaults applied: the carried list waiting for its one check, the carried settings over the defaults. */
export function withDefaults(doc: SurveyDocument, d: StartingDefaults): SurveyDocument {
  return withCarriedDetails({
    ...doc,
    ...(d.codes ? { codes: d.codes.entries.map((c) => ({ ...c })), provenance: { ...doc.provenance, codes: { source: "engine" as const, reviewed: false } } } : {}),
    ...(d.settings ? { settings: { ...doc.settings, ...d.settings.values } } : {}),
    ...(d.grammar ? { grammar: d.grammar.id } : {}),
    ...(d.habits ? { sketchHabits: d.habits.entries.map((h) => ({ ...h })), ...(d.habits.saidAt ? { sketchHabitsSaidAt: d.habits.saidAt } : {}) } : {}),
  }, d.details);
}
