/**
 * Learning from corrections (stage 270, ADR 0277). What a surveyor corrects on plan after plan becomes a suggestion for their office
 * profile, never a change: their drafting choices (walls lettered small with a tick, corners without circles, and the like) when their
 * recent plans all agree, and the codes they've checked on more than one plan that the profile's list lacks or means differently. A
 * suggestion is applied only when the surveyor presses Add, as a new version of the profile, and one they turn down isn't offered again.
 * Nothing about a piece of land is learned, and nothing is learned from a model, a sketch or a page: only from the surveyor's own plans.
 */
import type { EarlierPlan } from "./autosurvey/defaults";
import { codesAreCommonList, codesAreDsrList, type CodeEntry } from "./codes";
import type { DrawingSettings } from "./document";
import type { OfficeProfileBody } from "./profile";

/** The drafting choices a surveyor makes on the Sheet tab plan by plan (stages 240 to 268), which a profile can carry. */
export const DRAFTING_SETTINGS = ["wallTicks", "thinBoundary", "noCornerCircles", "noLotLetters", "deedExtentOnFace", "crowdedLegsToSchedule"] as const satisfies readonly (keyof DrawingSettings)[];
export type DraftingSetting = (typeof DRAFTING_SETTINGS)[number];

const DRAFTING_WORDS: Record<DraftingSetting, string> = {
  wallTicks: "letter walls' codes small, with a tick across the wall",
  thinBoundary: "draw lot boundaries at the weight of the other lines",
  noCornerCircles: "draw corners without their circles",
  noLotLetters: "leave the lots' letters off the drawing",
  deedExtentOnFace: "give the deed's extent on the face",
  crowdedLegsToSchedule: "leave legs too crowded to letter to the schedule",
};

/** How many of the surveyor's most recent plans a suggestion is judged on, and how many at least must agree. */
export const LEARN_FROM = 3;
export const LEARN_AT_LEAST = 2;

export interface Suggestion {
  /** Stable for what it suggests, so it can be accepted or turned down by name, and recognised when it's offered again. */
  key: string;
  /** What it would change, in a sentence. */
  sentence: string;
  /** The plans it was learned from. */
  from: string[];
}

/** A plan's code list, when the surveyor checked it and it's their own office list (not the common or the Survey Department's). */
const checkedCodes = (p: EarlierPlan): CodeEntry[] | null => {
  const d = p.document;
  return d.provenance["codes"]?.reviewed === true && d.codes.length > 0 && !codesAreCommonList(d.codes) && !codesAreDsrList(d.codes) ? d.codes : null;
};

const list = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`);
const plansWord = (n: number) => (n === 2 ? "Your last two plans" : n === 3 ? "Your last three plans" : `Your last ${n} plans`);

/**
 * What the surveyor's recent plans (newest first) suggest for a profile, and none it has turned down. Drafting choices only for a profile
 * that keeps a sheet; codes only for one that keeps a code list.
 */
export function suggestionsFor(body: OfficeProfileBody, recent: readonly EarlierPlan[]): Suggestion[] {
  const plans = recent.slice(0, LEARN_FROM);
  const declined = new Set(body.declined ?? []);
  const out: Suggestion[] = [];
  if (plans.length >= LEARN_AT_LEAST && body.sheet) {
    for (const k of DRAFTING_SETTINGS) {
      const on = plans.every((p) => p.document.settings[k] === true);
      const off = plans.every((p) => p.document.settings[k] !== true);
      const has = body.sheet[k] === true;
      if (on && !has) out.push({ key: `setting:${k}=on`, sentence: `${plansWord(plans.length)} all ${DRAFTING_WORDS[k]}. Start new plans from this profile that way.`, from: plans.map((p) => p.name) });
      if (off && has) out.push({ key: `setting:${k}=off`, sentence: `This profile starts plans to ${DRAFTING_WORDS[k]}, and ${plansWord(plans.length).toLowerCase()} all turned it off. Stop starting them that way.`, from: plans.map((p) => p.name) });
    }
  }
  if (body.codes) {
    const lists = recent.slice(0, LEARN_FROM).map((p) => ({ p, codes: checkedCodes(p) })).filter((x): x is { p: EarlierPlan; codes: CodeEntry[] } => x.codes !== null);
    if (lists.length >= LEARN_AT_LEAST) {
      const own = new Map(body.codes.entries.map((e) => [e.code, e]));
      // A code every checked plan has, with the same meaning, that the profile lacks or means otherwise.
      const first = lists[0]!.codes;
      const agreed = first.filter((e) => lists.every((l) => l.codes.some((c) => c.code === e.code && c.meaning === e.meaning && c.kind === e.kind)));
      const missing = agreed.filter((e) => !own.has(e.code));
      const changed = agreed.filter((e) => own.has(e.code) && own.get(e.code)!.meaning !== e.meaning);
      const from = lists.map((l) => l.p.name);
      if (missing.length > 0) {
        const names = missing.map((e) => `${e.code} (${e.meaning || "no meaning yet"})`);
        out.push({ key: `codes:add:${missing.map((e) => e.code).join("|")}`, sentence: `${plansWord(lists.length)} with checked codes all have ${list(names.slice(0, 6))}${names.length > 6 ? `, and ${names.length - 6} more` : ""}, which this profile's list lacks. Add ${missing.length === 1 ? "it" : "them"}.`, from });
      }
      for (const e of changed) {
        out.push({ key: `codes:mean:${e.code}=${e.meaning}`, sentence: `This profile's list says ${e.code} is "${own.get(e.code)!.meaning}", and ${plansWord(lists.length).toLowerCase()} with checked codes all say "${e.meaning}". Use "${e.meaning}".`, from });
      }
    }
  }
  return out.filter((s) => !declined.has(s.key));
}

/** The profile's body with one suggestion applied, worked out again from the plans (never taken from the browser); null when it no longer applies. */
export function applySuggestion(body: OfficeProfileBody, recent: readonly EarlierPlan[], key: string): OfficeProfileBody | null {
  const s = suggestionsFor(body, recent).find((x) => x.key === key);
  if (!s) return null;
  const setting = /^setting:(\w+)=(on|off)$/.exec(key);
  if (setting && body.sheet) {
    const k = setting[1] as DraftingSetting;
    const sheet = { ...body.sheet } as Record<string, unknown>;
    if (setting[2] === "on") sheet[k] = true;
    else delete sheet[k];
    return { ...body, sheet: sheet as NonNullable<OfficeProfileBody["sheet"]> };
  }
  if (key.startsWith("codes:") && body.codes) {
    const lists = recent.slice(0, LEARN_FROM).map(checkedCodes).filter((c): c is CodeEntry[] => c !== null);
    const newest = lists[0]!;
    if (key.startsWith("codes:add:")) {
      const codes = key.slice("codes:add:".length).split("|");
      const add = codes.map((c) => newest.find((e) => e.code === c)).filter((e): e is CodeEntry => Boolean(e));
      return { ...body, codes: { ...body.codes, entries: [...body.codes.entries, ...add.map((e) => ({ ...e }))].slice(0, 500) } };
    }
    const mean = /^codes:mean:([^=]+)=(.*)$/s.exec(key);
    if (mean) return { ...body, codes: { ...body.codes, entries: body.codes.entries.map((e) => (e.code === mean[1] ? { ...e, meaning: mean[2]! } : e)) } };
  }
  return null;
}

/** The profile's body with a suggestion turned down: it isn't offered again. */
export function declineSuggestion(body: OfficeProfileBody, recent: readonly EarlierPlan[], key: string): OfficeProfileBody | null {
  if (!suggestionsFor(body, recent).some((s) => s.key === key)) return null;
  return { ...body, declined: [...(body.declined ?? []), key].slice(-100) };
}
