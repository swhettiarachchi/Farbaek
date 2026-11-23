/**
 * A returning surveyor sets nothing twice (stage 226, ADR 0237): a new plan starts from what this surveyor already decided on their
 * own recent plans in this workspace, and never from anything else.
 *
 * - The code library: from their newest plan whose list was checked (its "codes" mark reviewed), carried over unchanged; nothing
 *   when that list is still the common or Survey Department list, which the new plan starts from anyway. It waits for one press on
 *   the new plan: the mark records no reviewer, and a list can change after its check, so a carried list is never taken as checked.
 * - The sheet's presentation: layout, paper, orientation, decimals, overleaf, permit box, lettering and face dimensions from their
 *   latest plan. The scale isn't carried: it belongs to each land.
 * Nothing about the land itself (title, lots, owners, extents) is ever carried: a past plan is never a source of legal truth.
 * An office code library uploaded with the files wins over a carried list (codelib.ts).
 */
import { codesAreCommonList, codesAreDsrList, type CodeEntry } from "../codes";
import type { SurveyDocument } from "../document";

export interface EarlierPlan {
  name: string;
  /** The plan's latest version. */
  document: SurveyDocument;
}

export const CARRIED_SETTINGS = ["template", "paper", "orientation", "perchDecimals", "secondDecimals", "distanceDecimals", "overleaf", "permitBox", "slant", "faceDimensions"] as const;
export type CarriedSettings = Pick<SurveyDocument["settings"], (typeof CARRIED_SETTINGS)[number]>;

export interface StartingDefaults {
  codes: { entries: CodeEntry[]; from: string } | null;
  settings: { values: CarriedSettings; from: string } | null;
}

/** What a new plan takes from the surveyor's recent plans, newest first. */
export function defaultsFrom(earlier: readonly EarlierPlan[]): StartingDefaults {
  // The newest decision stands: a newer plan checked on the common list means the office list isn't carried.
  const newest = earlier.find((p) => p.document.provenance["codes"]?.reviewed === true && p.document.codes.length > 0);
  const checked = newest && !codesAreCommonList(newest.document.codes) && !codesAreDsrList(newest.document.codes) ? newest : null;
  const latest = earlier[0];
  return {
    codes: checked ? { entries: checked.document.codes.map((c) => ({ ...c })), from: checked.name } : null,
    settings: latest ? { values: Object.fromEntries(CARRIED_SETTINGS.map((k) => [k, latest.document.settings[k]])) as CarriedSettings, from: latest.name } : null,
  };
}

/** A new plan's document with the defaults applied: the carried list waiting for its one check, the carried settings over the defaults. */
export function withDefaults(doc: SurveyDocument, d: StartingDefaults): SurveyDocument {
  return {
    ...doc,
    ...(d.codes ? { codes: d.codes.entries.map((c) => ({ ...c })), provenance: { ...doc.provenance, codes: { source: "engine" as const, reviewed: false } } } : {}),
    ...(d.settings ? { settings: { ...doc.settings, ...d.settings.values } } : {}),
  };
}
