/**
 * Learning from corrections (stage 270, ADR 0277). What a surveyor corrects on plan after plan started from an office profile becomes a
 * suggestion for that profile, never a change: the drafting choices their recent plans from it all end with (walls lettered small with
 * a tick, corners without circles, and the like), and the codes all their checked lists from it share that the profile's list lacks or
 * means differently, one code at a time. A suggestion is applied only when the surveyor presses Add, as a new version of the profile,
 * and one they turn down isn't offered again. Nothing about a piece of land is learned, and nothing is learned from a model, a sketch or
 * a page: only from the surveyor's own plans, and only those started from the profile (a plan records which, since this stage).
 */
import type { EarlierPlan } from "./autosurvey/defaults";
import { codesAreCommonList, codesAreDsrList, type CodeEntry } from "./codes";
import type { DrawingSettings } from "./document";
import type { OfficeProfileBody } from "./profile";

/** The drafting choices a surveyor makes on the Sheet tab plan by plan (stages 240 to 268), which a profile can carry. */
export const DRAFTING_SETTINGS = ["wallTicks", "thinBoundary", "noCornerCircles", "noLotLetters", "deedExtentOnFace", "crowdedLegsToSchedule"] as const satisfies readonly (keyof DrawingSettings)[];
export type DraftingSetting = (typeof DRAFTING_SETTINGS)[number];

/** Each as the profile form and its summary name it. */
export const DRAFTING_LABELS: Record<DraftingSetting, string> = {
  wallTicks: "Walls' codes lettered small, with a tick across the wall",
  thinBoundary: "Lot boundaries at the weight of the other lines",
  noCornerCircles: "Corners drawn without their circles",
  noLotLetters: "Lots' letters left off the drawing",
  deedExtentOnFace: "The deed's extent on the face",
  crowdedLegsToSchedule: "Legs too crowded to letter left to the schedule",
};

const DRAFTING_WORDS: Record<DraftingSetting, string> = {
  wallTicks: "letter walls' codes small, with a tick across the wall",
  thinBoundary: "draw lot boundaries at the weight of the other lines",
  noCornerCircles: "draw corners without their circles",
  noLotLetters: "leave the lots' letters off the drawing",
  deedExtentOnFace: "give the deed's extent on the face",
  crowdedLegsToSchedule: "leave legs too crowded to letter to the schedule",
};

/** How many of the surveyor's most recent plans from the profile a suggestion is judged on, and how many at least must agree. */
export const LEARN_FROM = 3;
export const LEARN_AT_LEAST = 2;
/** The most codes a profile keeps (ADR 0256): none is suggested past it. */
const CODES_MAX = 500;

export interface Suggestion {
  /** Stable for what it suggests, so it can be accepted or turned down by name, and recognised when it's offered again. */
  key: string;
  /** What it would change, in a sentence. */
  sentence: string;
  /** The plans it was learned from. */
  from: string[];
}

/** A profile as learning sees it: which it is, and what it holds. */
export interface ProfileForLearning {
  id: string;
  body: OfficeProfileBody;
}

/** A plan's code list, when the surveyor checked it and it's their own office list (not the common or the Survey Department's). */
const checkedCodes = (p: EarlierPlan): CodeEntry[] | null => {
  const d = p.document;
  return d.provenance["codes"]?.reviewed === true && d.codes.length > 0 && !codesAreCommonList(d.codes) && !codesAreDsrList(d.codes) ? d.codes : null;
};

const count = (n: number) => (n === 2 ? "two" : n === 3 ? "three" : String(n));
// Keys carry codes and meanings encoded, so any character in them (a "|", a "=", a ":") can't be read as part of the key.
const enc = encodeURIComponent;

/** The surveyor's plans started from this profile, newest first: only these say anything about it. */
const plansFrom = (profile: ProfileForLearning, recent: readonly EarlierPlan[]) => recent.filter((p) => p.document.fromProfile?.id === profile.id).slice(0, LEARN_FROM);

/**
 * What the surveyor's recent plans from a profile suggest for it, and none it has turned down. Drafting choices only for a profile that
 * keeps a sheet; codes only for one that keeps a list, one code each.
 */
export function suggestionsFor(profile: ProfileForLearning, recent: readonly EarlierPlan[]): Suggestion[] {
  const body = profile.body;
  const plans = plansFrom(profile, recent);
  const declined = new Set(body.declined ?? []);
  const out: Suggestion[] = [];
  const from = plans.map((p) => p.name);
  if (plans.length >= LEARN_AT_LEAST && body.sheet) {
    for (const k of DRAFTING_SETTINGS) {
      const on = plans.every((p) => p.document.settings[k] === true);
      const off = plans.every((p) => p.document.settings[k] !== true);
      const has = body.sheet[k] === true;
      if (on && !has) out.push({ key: `setting:${k}=on`, sentence: `Your last ${count(plans.length)} plans from this profile all ${DRAFTING_WORDS[k]}. Start new plans from it that way.`, from });
      if (off && has) out.push({ key: `setting:${k}=off`, sentence: `This profile starts plans to ${DRAFTING_WORDS[k]}, and your last ${count(plans.length)} plans from it don't. Stop starting them that way.`, from });
    }
  }
  if (body.codes) {
    const lists = plans.map((p) => ({ p, codes: checkedCodes(p) })).filter((x): x is { p: EarlierPlan; codes: CodeEntry[] } => x.codes !== null);
    if (lists.length >= LEARN_AT_LEAST) {
      const own = new Map(body.codes.entries.map((e) => [e.code, e]));
      const listFrom = lists.map((l) => l.p.name);
      const n = count(lists.length);
      // A code every checked list has, with the same meaning and kind: one suggestion each, so each is taken or turned down on its own.
      const agreed = lists[0]!.codes.filter((e) => lists.every((l) => l.codes.some((c) => c.code === e.code && c.meaning === e.meaning && c.kind === e.kind)));
      const room = body.codes.entries.length < CODES_MAX;
      for (const e of agreed) {
        const mine = own.get(e.code);
        if (!mine && room) out.push({ key: `codes:add:${enc(e.code)}`, sentence: `Your last ${n} plans from this profile all have ${e.code} (${e.meaning}) in their checked codes, and this profile's list doesn't. Add it.`, from: listFrom });
        if (mine && mine.meaning !== e.meaning) out.push({ key: `codes:mean:${enc(e.code)}:${enc(e.meaning)}`, sentence: `This profile's list says ${e.code} is "${mine.meaning}", and your last ${n} plans from it all say "${e.meaning}". Use "${e.meaning}".`, from: listFrom });
      }
    }
  }
  return out.filter((s) => !declined.has(s.key));
}

/** The profile's body with one suggestion applied, worked out again from the plans (never taken from the browser); null when it no longer applies. */
export function applySuggestion(profile: ProfileForLearning, recent: readonly EarlierPlan[], key: string): OfficeProfileBody | null {
  const body = profile.body;
  if (!suggestionsFor(profile, recent).some((x) => x.key === key)) return null;
  const setting = /^setting:(\w+)=(on|off)$/.exec(key);
  if (setting && body.sheet && (DRAFTING_SETTINGS as readonly string[]).includes(setting[1]!)) {
    const sheet = { ...body.sheet } as Record<string, unknown>;
    if (setting[2] === "on") sheet[setting[1]!] = true;
    else delete sheet[setting[1]!];
    return { ...body, sheet: sheet as NonNullable<OfficeProfileBody["sheet"]> };
  }
  if (!body.codes) return null;
  const newest = plansFrom(profile, recent).map(checkedCodes).find((c): c is CodeEntry[] => c !== null);
  const add = /^codes:add:([^:]+)$/.exec(key);
  if (add && newest && body.codes.entries.length < CODES_MAX) {
    const e = newest.find((x) => x.code === decodeURIComponent(add[1]!));
    return e ? { ...body, codes: { ...body.codes, entries: [...body.codes.entries, { ...e }] } } : null;
  }
  const mean = /^codes:mean:([^:]+):([^:]*)$/.exec(key);
  if (mean) {
    const [code, meaning] = [decodeURIComponent(mean[1]!), decodeURIComponent(mean[2]!)];
    return { ...body, codes: { ...body.codes, entries: body.codes.entries.map((e) => (e.code === code ? { ...e, meaning } : e)) } };
  }
  return null;
}

/** The profile's body with a suggestion turned down: it isn't offered again. */
export function declineSuggestion(profile: ProfileForLearning, recent: readonly EarlierPlan[], key: string): OfficeProfileBody | null {
  if (!suggestionsFor(profile, recent).some((s) => s.key === key)) return null;
  return { ...profile.body, declined: [...(profile.body.declined ?? []), key].slice(-100) };
}
