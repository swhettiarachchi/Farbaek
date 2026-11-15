/**
 * The title sentence under "PLAN", composed from the structured fields the
 * way Sri Lankan plans word it (docs/survey/REFERENCE_PLANS_ANALYSIS.md,
 * "Title sentence grammar"). The software never writes this freehand: every
 * word comes from a field the surveyor filled (or reviewed), a fixed phrase,
 * or a count of the lots drawn. A missing field leaves a dotted blank to fill,
 * never a guess.
 *
 * The result is a list of runs, so the sheet can set land names in capitals
 * and lot suffixes raised.
 */
import type { Lot, SheetFields } from "./document";
import { countPhrase, dotDate } from "./formats";

export interface Run {
  text: string;
  style: "plain" | "name" | "sup";
}

const BLANK = "..........";
const plain = (text: string): Run => ({ text, style: "plain" });
const name = (text: string): Run => ({ text: text.trim() ? text.trim().toUpperCase() : BLANK, style: "name" });
const orBlank = (s: string) => (s.trim() ? s.trim() : BLANK);

/** "B¹" as runs: the label, then its raised part. */
export function lotRuns(lot: Pick<Lot, "label" | "sup" | "note">, withNote = true): Run[] {
  const runs: Run[] = [plain(lot.label.trim() || BLANK)];
  if (lot.sup) runs.push({ text: lot.sup, style: "sup" });
  if (withNote && lot.note.trim()) runs.push(plain(`(${lot.note.trim()})`));
  return runs;
}

/** "lots B¹, B² & B³" as runs. */
function lotListRuns(lots: readonly Lot[]): Run[] {
  const labels = lots.map((l) => lotRuns(l));
  const out: Run[] = [];
  labels.forEach((runs, i) => {
    if (i > 0) out.push(plain(i === labels.length - 1 ? " & " : ", "));
    out.push(...runs);
  });
  return out;
}

/** "of three (03) allotments of land marked lots …", or for one lot "of an allotment of land marked lot …". */
function opening(lots: readonly Lot[], extract: Lot | null): Run[] {
  const n = lots.length;
  if (extract && n > 1) {
    return [plain("of Lot "), ...lotRuns(extract, false), plain(` out of ${countPhrase(n)} allotments of land marked lots `), ...lotListRuns(lots)];
  }
  if (n <= 1) return [plain("of an allotment of land marked lot "), ...(lots[0] ? lotRuns(lots[0]) : [plain(BLANK)])];
  return [plain(`of ${countPhrase(n)} allotments of land marked lots `), ...lotListRuns(lots)];
}

/** "depicted in Plan No.12 dated 01.02.2003 made by …, Licensed Surveyor (Filed of record in …)", or "depicted in my Plan No. …". */
function depicted(s: SheetFields): string {
  const p = s.previousPlan;
  if (!p.number.trim()) return "";
  const when = p.date.trim() ? ` dated ${dotDate(p.date)}` : "";
  const by = p.mine ? "" : ` made by ${orBlank(p.by)}, ${p.byDesignation.trim() || "Licensed Surveyor"}`;
  const filing = p.filing.trim() ? ` (Filed of record in ${p.filing.trim()})` : "";
  return ` depicted in ${p.mine ? "my " : ""}Plan No.${p.number.trim()}${when}${by}${filing}`;
}

/** The clause after "being": what the survey did. */
function operationClause(s: SheetFields): string {
  if (s.operation === "custom") return orBlank(s.customClause);
  const parent = s.parentLots.trim();
  const lotWord = /[,&]|\band\b/.test(parent) ? "lots" : "lot";
  const where = depicted(s);
  if (s.operation === "subdivision") return `resurvey of the existing boundaries & sub division of ${lotWord} ${orBlank(parent)}${where}`;
  if (s.operation === "amalgamation") return `resurvey of the existing boundaries & amalgamation of ${lotWord} ${orBlank(parent)}${where}`;
  return `resurvey of the existing boundaries${parent ? ` of ${lotWord} ${parent}` : ""}${where}`;
}

/** "situated at <village> Village in <pattu> of <korale>", leaving out what isn't filled. */
function situated(s: SheetFields): string {
  const village = s.village.trim();
  const v = village ? (/village$/i.test(village) ? village : `${village} Village`) : BLANK;
  const parts = [s.pattu.trim(), s.korale.trim()].filter(Boolean);
  return `situated at ${v}${parts.length ? ` in ${parts.join(" of ")}` : ""}`;
}

/**
 * The whole sentence. `lots` are the plan's lots in order; `extract` is the
 * one lot an extract sheet shows, or null.
 */
export function titleSentence(s: SheetFields, lots: readonly Lot[], extract: Lot | null = null): Run[] {
  const runs: Run[] = [...opening(lots, extract), plain(" called "), name(s.landName)];
  if (s.alias.trim()) runs.push(plain(" alias "), ...s.alias.split(/\s+and\s+/i).flatMap((a, i) => (i ? [plain(" and "), name(a)] : [name(a)])));
  if (s.nowKnownAs.trim()) runs.push(plain(" (Now called & known as "), name(s.nowKnownAs), plain(")"));
  runs.push(plain(` being ${operationClause(s)} ${situated(s)}`));
  return merge(runs);
}

/** "<DISTRICT> DISTRICT", "<PROVINCE> PROVINCE": as plans print them, without doubling the word. */
export function regionLine(value: string, word: "DISTRICT" | "PROVINCE"): string {
  const v = value.trim().toUpperCase();
  if (!v) return `${BLANK} ${word}`;
  return v.endsWith(word) ? v : `${v} ${word}`;
}

/** Adjacent runs of the same style joined, so the sheet wraps words, not fragments. */
function merge(runs: Run[]): Run[] {
  const out: Run[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && last.style === r.style && r.style !== "sup") last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** The sentence as plain text (lot suffixes inline), for the editor and tests. */
export const runsText = (runs: readonly Run[]) => runs.map((r) => r.text).join("");
