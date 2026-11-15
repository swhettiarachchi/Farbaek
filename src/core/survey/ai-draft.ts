/**
 * The AI drafting assistant's contract (stage 191, ADR 0202). The model reads
 * the surveyor's own words (a brief) or an old plan's photo into structured
 * instructions; it never computes. This module holds:
 *
 * - the output schema the model fills: lots as corner point numbers, roads as
 *   edge point numbers, adjoining lands, the title fields, notes, and
 *   questions for anything it can't find. There is no field for an area, a
 *   distance, a bearing, a scale or an extent: the engine computes those.
 * - `acceptDraft`, which checks every item before it can enter a plan. For a
 *   brief, an item's quote must be in the brief word for word, its values
 *   must be phrases of its quote, and its point numbers must be written in
 *   the quote in the same order. Points must exist, lots must close into
 *   simple rings, adjoining lands must lie on a real leg. What passes is
 *   marked with its provenance and stays unreviewed until the surveyor
 *   accepts it.
 * - `applyReview`, the draft as the surveyor has checked it: items taken out
 *   go back to what the plan had, with its own marks.
 *
 * Model output is untrusted (src/server/ai): this runs on the server before
 * anything is shown, and the document is validated again on save.
 */
import { z } from "zod";
import { emptySheetFields, legIndex, pruneProvenance, type Adjoining, type Lot, type ProvenanceSource, type Road, type SurveyDocument } from "./document";
import { computeParcel, type SurveyPoint } from "./parcel";

/** The title fields the assistant may fill, by name. Values are text as written. */
export const DRAFT_FIELDS = [
  "planNumber",
  "landName",
  "alias",
  "nowKnownAs",
  "operation",
  "parentLots",
  "previousPlanNumber",
  "previousPlanDate",
  "previousPlanBy",
  "previousPlanMine",
  "previousPlanFiling",
  "village",
  "pattu",
  "korale",
  "district",
  "province",
  "gnDivision",
  "boundaryNorth",
  "boundaryEast",
  "boundarySouth",
  "boundaryWest",
  "statedExtent",
  "surveyDate",
  "partitionDate",
] as const;
export type DraftField = (typeof DRAFT_FIELDS)[number];

/*
 * Strings and lists carry no length limits here on purpose: the model's
 * answer is checked against this schema after it arrives, and one long quote
 * would fail the whole draft. Limits are applied item by item in acceptDraft,
 * so an item that's too long is left out with a reason.
 */
export const DraftOutputSchema = z.object({
  lots: z.array(
    z.object({
      label: z.string().describe("The lot's letter or number as the brief writes it, without its raised part, e.g. B"),
      sup: z.string().describe("The raised part, e.g. 1 for B1, or empty"),
      note: z.string().describe("A reservation note written for the lot, such as Res. for Access, or empty"),
      corners: z.array(z.string()).describe("The lot's corner point numbers exactly as the brief lists them, in the brief's order"),
      evidence: z.string().describe("The words of the brief this lot comes from, copied exactly"),
    }),
  ),
  roads: z.array(
    z.object({
      name: z.string(),
      edgeA: z.array(z.string()).describe("Point numbers along one edge, in the brief's order"),
      edgeB: z.array(z.string()).describe("Point numbers along the other edge, in the brief's order, or empty"),
      start: z.string().describe("A direction text at the first end such as From Main Road, or empty"),
      end: z.string().describe("A direction text at the last end such as To Houses, or empty"),
      evidence: z.string(),
    }),
  ),
  adjoining: z.array(
    z.object({
      text: z.string().describe("What adjoins, as written, e.g. Land claimed by A. Perera"),
      lot: z.string().describe("The drafted lot it lies beside, label and raised part together, e.g. B2"),
      from: z.string().describe("The point number at one end of that lot's leg"),
      to: z.string().describe("The point number at the other end of that leg"),
      evidence: z.string(),
    }),
  ),
  fields: z.array(z.object({ field: z.enum(DRAFT_FIELDS), value: z.string(), evidence: z.string() })),
  notes: z.array(z.object({ text: z.string(), evidence: z.string() })),
  questions: z.array(z.string()).describe("What the brief doesn't say that the plan needs, as short questions to the surveyor"),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export interface AcceptedItem {
  /** The provenance key: "lot:<id>", "road:<id>", "adjoining:<id>", "sheet.<field>", "notes". */
  key: string;
  /** What it is, in words, for the review list. */
  label: string;
}

export interface DraftResult {
  document: SurveyDocument;
  accepted: AcceptedItem[];
  dropped: { what: string; why: string }[];
  questions: string[];
}

/** Lower case, Unicode-normalised, quotes and punctuation as spaces, runs of space as one: so a quote matches however it was typed. */
export function fold(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’“”"'`]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/** Whether `phrase` is in `text` as whole words, both folded: "lot b1" is in "Lot B1 is…", "1234" is not in "Plan No. 12345". */
export function hasPhrase(text: string, phrase: string): boolean {
  const p = fold(phrase);
  return p.length > 0 && ` ${fold(text)} `.includes(` ${p} `);
}

/** Whether a quote is in the brief, word for word (folded). Quotes of one character never match. */
export function quotes(brief: string, quote: string): boolean {
  return fold(quote).length >= 2 && hasPhrase(brief, quote);
}

/** A short token (a lot label) written in the quote as a word of its own. */
export const mentions = hasPhrase;

/** The quote's words as written: split at spaces, commas and semicolons, with brackets and closing full stops trimmed. Point numbers are matched on these, so "BM-1" never counts as point 1. */
export function rawTokens(s: string): string[] {
  return s
    .normalize("NFKC")
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^[([{"'‘“]+|[)\]}"'’”.:!?]+$/g, ""))
    .filter(Boolean);
}

/** A whole calendar date written dd.mm.yyyy, dd/mm/yyyy, dd-mm-yyyy or yyyy-mm-dd, as yyyy-mm-dd; null for anything else ("January 2020", "31.02.2020"). */
export function isoDateOf(value: string): string | null {
  const v = value.trim();
  let y: number, mo: number, d: number;
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  else if ((m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v))) [y, mo, d] = [Number(m[3]), Number(m[2]), Number(m[1])];
  else return null;
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d || y < 1800 || y > 2200) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

const FIELD_LABELS: Record<DraftField, string> = {
  planNumber: "Plan number",
  landName: "Land called",
  alias: "Alias",
  nowKnownAs: "Now called and known as",
  operation: "The survey",
  parentLots: "Of lot",
  previousPlanNumber: "Depicted in Plan No.",
  previousPlanDate: "Its date",
  previousPlanBy: "Made by",
  previousPlanMine: "My own earlier plan",
  previousPlanFiling: "Filed of record in",
  village: "Village",
  pattu: "Pattu",
  korale: "Korale",
  district: "District",
  province: "Province",
  gnDivision: "GN division",
  boundaryNorth: "North by",
  boundaryEast: "East by",
  boundarySouth: "South by",
  boundaryWest: "West by",
  statedExtent: "Stated extent",
  surveyDate: "Surveyed on",
  partitionDate: "Partitioned on",
};

/** The provenance key each field fills: one key per value, so checking one never checks another. */
export const FIELD_KEY: Record<DraftField, string> = {
  planNumber: "sheet.planNumber",
  landName: "sheet.landName",
  alias: "sheet.alias",
  nowKnownAs: "sheet.nowKnownAs",
  operation: "sheet.operation",
  parentLots: "sheet.parentLots",
  previousPlanNumber: "sheet.previousPlan.number",
  previousPlanDate: "sheet.previousPlan.date",
  previousPlanBy: "sheet.previousPlan.by",
  previousPlanMine: "sheet.previousPlan.mine",
  previousPlanFiling: "sheet.previousPlan.filing",
  village: "sheet.village",
  pattu: "sheet.pattu",
  korale: "sheet.korale",
  district: "sheet.district",
  province: "sheet.province",
  gnDivision: "sheet.gnDivision",
  boundaryNorth: "sheet.boundaries.north",
  boundaryEast: "sheet.boundaries.east",
  boundarySouth: "sheet.boundaries.south",
  boundaryWest: "sheet.boundaries.west",
  statedExtent: "sheet.statedExtent",
  surveyDate: "sheet.surveyDate",
  partitionDate: "sheet.partitionDate",
};

/** The same limits as the document schema, so an accepted draft always saves. */
const LIMITS: Partial<Record<DraftField, number>> = {
  planNumber: 40,
  landName: 120,
  alias: 160,
  nowKnownAs: 120,
  parentLots: 60,
  previousPlanNumber: 40,
  previousPlanBy: 80,
  previousPlanFiling: 160,
  village: 60,
  pattu: 60,
  korale: 60,
  district: 60,
  province: 60,
  gnDivision: 60,
  boundaryNorth: 200,
  boundaryEast: 200,
  boundarySouth: 200,
  boundaryWest: 200,
  statedExtent: 80,
};
const DATE_FIELDS = new Set<DraftField>(["previousPlanDate", "surveyDate", "partitionDate"]);
/** Fields about the new survey: an earlier plan's photo can't fill them (its own number and date are the "previous plan"). */
const NEW_SURVEY_ONLY = new Set<DraftField>(["planNumber", "surveyDate", "partitionDate"]);
const MAX = { lots: 60, roads: 20, adjoining: 80, fields: 40, notes: 10, questions: 12, label: 40, sup: 6, note: 80, roadName: 80, direction: 60, adjoiningText: 200, corners: 500, edge: 200, noteText: 300, question: 300 } as const;

/** The words that name each kind of survey; a draft's "operation" stands only if its quote says one. */
const OPERATION_WORDS: Record<Exclude<SurveyDocument["sheet"]["operation"], "custom">, RegExp> = {
  subdivision: /\bsub ?divi/,
  amalgamation: /\bamalgamat/,
  resurvey: /\bre ?survey/,
};

/** A dotted key's value in a document: "sheet.boundaries.north", "notes". */
export function getPath(doc: SurveyDocument, key: string): unknown {
  return key.split(".").reduce<unknown>((o, k) => (o && typeof o === "object" ? (o as Record<string, unknown>)[k] : undefined), doc);
}

function setPath(doc: SurveyDocument, key: string, value: unknown) {
  const parts = key.split(".");
  const last = parts.pop()!;
  const target = parts.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, doc as unknown as Record<string, unknown>);
  target[last] = structuredClone(value);
}

/** Whether `seq` is written in `run` as one stretch: in the same order, starting at any corner for a ring, or either way for a line. */
function writtenInOrder(seq: readonly string[], run: readonly string[], kind: "ring" | "line"): boolean {
  const s = seq.map((x) => x.toLowerCase());
  const n = s.length;
  if (n === 0 || n > run.length) return false;
  const eq = (a: readonly string[], b: readonly string[]) => a.every((x, i) => x === b[i]);
  for (let i = 0; i + n <= run.length; i++) {
    const w = run.slice(i, i + n).map((x) => x.toLowerCase());
    if (kind === "line" ? eq(w, s) || eq(w, [...s].reverse()) : s.some((_, r) => eq(w, [...s.slice(r), ...s.slice(0, r)]))) return true;
  }
  return false;
}

/**
 * Checks a model's draft against the project's points and, for a brief, the
 * brief's own words, and applies what passes to a copy of the document.
 * Drafted lots, roads and adjoining lands replace the document's when the
 * draft has any, under new ids; fields are set one by one. Nothing is computed here.
 */
export function acceptDraft(output: DraftOutput, input: { document: SurveyDocument; points: readonly SurveyPoint[]; source: Extract<ProvenanceSource, "ai_brief" | "ai_photo">; brief: string }): DraftResult {
  const doc: SurveyDocument = structuredClone(input.document);
  const accepted: AcceptedItem[] = [];
  const dropped: { what: string; why: string }[] = [];
  const questions: string[] = [];
  const byNumber = new Map(input.points.map((p) => [p.pointId.trim().toLowerCase(), p]));
  const numberOf = (id: string) => input.points.find((p) => p.id === id)?.pointId ?? "?";
  const fromBrief = input.source === "ai_brief";
  const NOT_WRITTEN = "It isn't in your description's words.";
  const mark = (key: string, label: string) => {
    doc.provenance[key] = { source: input.source, reviewed: false };
    accepted.push({ key, label });
  };
  /** The project's point numbers written in a quote, in order. */
  const runOf = (quote: string) => rawTokens(quote).filter((t) => byNumber.has(t.toLowerCase()));
  const ids = (numbers: string[], what: string): string[] | null => {
    const missing = numbers.filter((n) => !byNumber.has(n.trim().toLowerCase()));
    if (missing.length > 0) {
      dropped.push({ what, why: `Point ${missing.slice(0, 5).join(", ")} isn't in this project.` });
      return null;
    }
    return numbers.map((n) => byNumber.get(n.trim().toLowerCase())!.id);
  };
  const taken = new Set([...doc.lots.map((l) => l.id), ...doc.roads.map((r) => r.id), ...doc.adjoining.map((a) => a.id)]);
  /** A fresh id, never one an earlier lot, road or label used, so nothing left over can attach to a drafted item. */
  const freshId = (prefix: string, name: string) => {
    const base = `${prefix}-${name.replace(/[^A-Za-z0-9]+/g, "").slice(0, 16) || "x"}`;
    let id = base;
    for (let k = 2; taken.has(id); k++) id = `${base}-${k}`;
    taken.add(id);
    return id;
  };
  const capped = <T>(list: T[], max: number, what: string): T[] => {
    if (list.length > max) dropped.push({ what, why: `Only the first ${max} are taken.` });
    return list.slice(0, max);
  };

  // An old plan's point numbers aren't this survey's: a photo fills the title, never the geometry or notes.
  if (!fromBrief && output.lots.length + output.roads.length + output.adjoining.length > 0) {
    dropped.push({ what: "Lots, roads and adjoining lands", why: "An old plan's point numbers aren't this survey's, so draw them from your own points." });
  }
  if (!fromBrief && output.notes.length > 0) dropped.push({ what: "Notes", why: "Notes on the new plan come from you, not from an earlier plan." });
  const geometry = fromBrief ? output : { lots: [], roads: [], adjoining: [] };

  // Lots: each quotes the brief, names its label and corners there in order, and closes into a simple ring.
  const lots: Lot[] = [];
  let orphaned = 0;
  for (const [i, l] of capped(geometry.lots, MAX.lots, "Lots").entries()) {
    const label = l.label.trim();
    const sup = l.sup.trim();
    const name = `Lot ${label}${sup}`;
    if (!label) {
      dropped.push({ what: `Lot ${i + 1}`, why: "It has no label." });
      continue;
    }
    if (label.length > MAX.label || sup.length > MAX.sup || l.corners.length > MAX.corners) {
      dropped.push({ what: name, why: "Its label or its list of corners is too long." });
      continue;
    }
    if (!quotes(input.brief, l.evidence) || !(hasPhrase(l.evidence, `${label}${sup}`) || (sup !== "" && hasPhrase(l.evidence, `${label} ${sup}`)))) {
      dropped.push({ what: name, why: NOT_WRITTEN });
      continue;
    }
    if (!writtenInOrder(l.corners, runOf(l.evidence), "ring")) {
      dropped.push({ what: name, why: "Its corners aren't the points your description lists for it, in that order." });
      continue;
    }
    const pts = ids(l.corners, name);
    if (!pts) continue;
    const parcel = computeParcel(input.points, pts);
    if (!parcel.ok || parcel.parcel.vertices.length < 3) {
      dropped.push({ what: name, why: "It needs at least three corners." });
      continue;
    }
    if (parcel.parcel.repeatedPoints.length > 0) {
      dropped.push({ what: name, why: `It names point ${parcel.parcel.repeatedPoints[0]} twice.` });
      continue;
    }
    if (parcel.parcel.crossings.length > 0) {
      dropped.push({ what: name, why: "Its corners in this order make the boundary cross itself." });
      continue;
    }
    if (lots.some((x) => `${x.label}${x.sup}`.toLowerCase() === `${label}${sup}`.toLowerCase())) {
      dropped.push({ what: name, why: "The draft named it twice; the first is kept." });
      continue;
    }
    let note = l.note.trim();
    if (note && (note.length > MAX.note || !hasPhrase(l.evidence, note))) {
      dropped.push({ what: `${name}'s note`, why: NOT_WRITTEN });
      note = "";
    }
    lots.push({ id: freshId("lot", label + sup), label, sup, points: pts, note });
  }
  if (lots.length > 0) {
    const replaced = doc.lots.length;
    doc.lots = lots;
    for (const l of lots) mark(`lot:${l.id}`, `Lot ${l.label}${l.sup}, corners ${l.points.map(numberOf).join(" ")}${l.note ? ` (${l.note})` : ""}`);
    if (doc.sheet.extractOf) doc.sheet.extractOf = "";
    orphaned = replaced > 0 ? doc.adjoining.length : 0;
    doc.adjoining = [];
  }

  // Roads.
  const roads: Road[] = [];
  for (const [i, r] of capped(geometry.roads, MAX.roads, "Roads").entries()) {
    const name = r.name.trim() || `Road ${i + 1}`;
    const texts = [r.name, r.start, r.end].map((t) => t.trim()).filter(Boolean);
    if (r.name.trim().length > MAX.roadName || r.start.trim().length > MAX.direction || r.end.trim().length > MAX.direction || r.edgeA.length > MAX.edge || r.edgeB.length > MAX.edge) {
      dropped.push({ what: name, why: "Its name, direction texts or edges are too long." });
      continue;
    }
    if (!quotes(input.brief, r.evidence) || !texts.every((t) => hasPhrase(r.evidence, t))) {
      dropped.push({ what: name, why: NOT_WRITTEN });
      continue;
    }
    const run = runOf(r.evidence);
    if (!writtenInOrder(r.edgeA, run, "line") || (r.edgeB.length > 0 && !writtenInOrder(r.edgeB, run, "line"))) {
      dropped.push({ what: name, why: "Its edge points aren't the ones your description lists for it, in that order." });
      continue;
    }
    const a = ids(r.edgeA, name);
    const b = ids(r.edgeB, name);
    if (!a || !b) continue;
    if (a.length < 2) {
      dropped.push({ what: name, why: "It needs at least two points along one edge." });
      continue;
    }
    roads.push({ id: freshId("road", name), name: r.name.trim(), edgeA: a, edgeB: b.length >= 2 ? b : [], width: "feet", start: r.start.trim(), end: r.end.trim() });
  }
  if (roads.length > 0) {
    doc.roads = roads;
    for (const r of roads) mark(`road:${r.id}`, `${r.name || "A road"}, along ${[r.edgeA, r.edgeB].filter((e) => e.length > 0).map((e) => e.map(numberOf).join(" ")).join(" and ")}`);
  }

  // Adjoining lands: beside a leg of a lot on the plan, both its points written in the quote.
  const adjoining: Adjoining[] = [];
  for (const a of capped(geometry.adjoining, MAX.adjoining, "Adjoining lands")) {
    const text = a.text.trim();
    const what = `"${text.slice(0, 40)}"`;
    const run = runOf(a.evidence).map((t) => t.toLowerCase());
    if (!text || text.length > MAX.adjoiningText || !quotes(input.brief, a.evidence) || !hasPhrase(a.evidence, text) || !run.includes(a.from.trim().toLowerCase()) || !run.includes(a.to.trim().toLowerCase())) {
      dropped.push({ what, why: "It and the points it lies between aren't in your description's words." });
      continue;
    }
    const lot = doc.lots.find((l) => `${l.label}${l.sup}`.toLowerCase() === a.lot.replace(/\s+/g, "").toLowerCase());
    const from = byNumber.get(a.from.trim().toLowerCase());
    const to = byNumber.get(a.to.trim().toLowerCase());
    if (!lot || !from || !to) {
      dropped.push({ what, why: "Its lot or leg isn't on the plan." });
      continue;
    }
    if (legIndex(lot, from.id, to.id) < 0) {
      dropped.push({ what, why: `Points ${from.pointId} and ${to.pointId} aren't neighbouring corners of lot ${lot.label}${lot.sup}.` });
      continue;
    }
    adjoining.push({ id: freshId("adj", text), text, lot: lot.id, from: from.id, to: to.id });
  }
  if (orphaned > 0 && adjoining.length === 0) {
    dropped.push({ what: `${orphaned} adjoining ${orphaned === 1 ? "land" : "lands"} on the lots the draft replaces`, why: "Add them again beside the new lots on the Lots step." });
  }
  if (adjoining.length > 0) {
    doc.adjoining = adjoining;
    for (const a of adjoining) {
      const lot = doc.lots.find((l) => l.id === a.lot)!;
      mark(`adjoining:${a.id}`, `${a.text}, beside lot ${lot.label}${lot.sup} between ${numberOf(a.from)} and ${numberOf(a.to)}`);
    }
  }

  // Title fields.
  const s = doc.sheet;
  const fresh = emptySheetFields();
  for (const f of capped(output.fields, MAX.fields, "Title fields")) {
    const label = FIELD_LABELS[f.field];
    const value = f.value.trim();
    if (!value) continue;
    if (!fromBrief && NEW_SURVEY_ONLY.has(f.field)) {
      dropped.push({ what: label, why: "It belongs to the new survey, not the earlier plan in the photo." });
      continue;
    }
    if (fromBrief && !quotes(input.brief, f.evidence)) {
      dropped.push({ what: label, why: NOT_WRITTEN });
      continue;
    }
    if (f.field === "operation") {
      const op = (Object.keys(OPERATION_WORDS) as (keyof typeof OPERATION_WORDS)[]).find((k) => OPERATION_WORDS[k].test(fold(value)) || fold(value) === k);
      if (!op || (fromBrief && !OPERATION_WORDS[op].test(fold(f.evidence)))) {
        dropped.push({ what: label, why: op ? NOT_WRITTEN : "It isn't one of the kinds of survey Farbaek writes." });
        continue;
      }
      s.operation = op;
      mark(FIELD_KEY.operation, `${label}: ${op === "subdivision" ? "resurvey and sub division" : op === "amalgamation" ? "resurvey and amalgamation" : "resurvey"}`);
      continue;
    }
    if (f.field === "previousPlanMine") {
      // Only "it's my own plan" changes anything; it must be said in the words.
      if (!/^(yes|true|mine|my own)$/i.test(value)) continue;
      if (fromBrief && !/\bmy\b(?: \w+){0,2} plan\b/.test(fold(f.evidence))) {
        dropped.push({ what: label, why: NOT_WRITTEN });
        continue;
      }
      s.previousPlan.mine = true;
      mark(FIELD_KEY.previousPlanMine, `${label}: yes`);
      continue;
    }
    if (fromBrief && !hasPhrase(f.evidence, value)) {
      dropped.push({ what: label, why: NOT_WRITTEN });
      continue;
    }
    let v = value;
    if (DATE_FIELDS.has(f.field)) {
      const iso = isoDateOf(value);
      if (!iso) {
        dropped.push({ what: label, why: "It isn't a whole date with day, month and year." });
        questions.push(`What is the full date for "${label}"? It was given as ${value.slice(0, 40)}.`);
        continue;
      }
      v = iso;
    } else if (v.length > (LIMITS[f.field] ?? 80)) {
      dropped.push({ what: label, why: `It's longer than ${LIMITS[f.field] ?? 80} characters.` });
      continue;
    }
    switch (f.field) {
      case "previousPlanNumber":
        s.previousPlan.number = v;
        break;
      case "previousPlanDate":
        s.previousPlan.date = v;
        break;
      case "previousPlanBy":
        s.previousPlan.by = v;
        if (!s.previousPlan.byDesignation) s.previousPlan.byDesignation = fresh.previousPlan.byDesignation;
        break;
      case "previousPlanFiling":
        s.previousPlan.filing = v;
        break;
      case "boundaryNorth":
        s.boundaries.north = v;
        break;
      case "boundaryEast":
        s.boundaries.east = v;
        break;
      case "boundarySouth":
        s.boundaries.south = v;
        break;
      case "boundaryWest":
        s.boundaries.west = v;
        break;
      default:
        s[f.field] = v;
    }
    mark(FIELD_KEY[f.field], `${label}: ${v}`);
  }

  // Notes, from the brief only, as one item: the notes field is one list the surveyor checks together.
  const notes: string[] = [];
  for (const n of fromBrief ? capped(output.notes, MAX.notes, "Notes") : []) {
    const t = n.text.trim();
    if (!t) continue;
    if (t.length > MAX.noteText || !quotes(input.brief, n.evidence) || !hasPhrase(n.evidence, t)) {
      dropped.push({ what: "A note", why: NOT_WRITTEN });
      continue;
    }
    if (doc.notes.length < MAX.notes && !doc.notes.includes(t)) {
      doc.notes.push(t);
      notes.push(t);
    }
  }
  if (notes.length > 0) mark("notes", `Notes: ${notes.join("; ")}`);

  for (const q of output.questions) {
    const t = q.trim().slice(0, MAX.question);
    if (t && questions.length < MAX.questions && !questions.includes(t)) questions.push(t);
  }
  return { document: pruneProvenance(doc), accepted, dropped, questions };
}

export interface ReviewState {
  /** Item keys the surveyor took out. */
  removed: ReadonlySet<string>;
  /** Item keys the surveyor marked as right. */
  confirmed: ReadonlySet<string>;
}

/**
 * The draft as the surveyor has reviewed it, built afresh from the plan as it
 * was, the checked draft and the surveyor's choices:
 * - a lot, road or adjoining land taken out goes; when every drafted one of a
 *   kind is taken out, the plan's own come back, with their marks;
 * - adjoining lands go with their lot;
 * - a field taken out goes back to what the plan had, with its mark;
 * - an item marked right counts as checked.
 */
export function applyReview(base: SurveyDocument, draft: DraftResult, review: ReviewState): SurveyDocument {
  const doc = structuredClone(draft.document);
  const draftedKeys = new Set(draft.accepted.map((a) => a.key));
  const restoreMark = (k: string) => {
    if (base.provenance[k]) doc.provenance[k] = structuredClone(base.provenance[k]);
    else delete doc.provenance[k];
  };
  const out = (k: string) => review.removed.has(k);

  if ([...draftedKeys].some((k) => k.startsWith("lot:"))) {
    const kept = doc.lots.filter((l) => !out(`lot:${l.id}`));
    if (kept.length === 0) {
      doc.lots = structuredClone(base.lots);
      doc.sheet.extractOf = base.sheet.extractOf;
      for (const l of base.lots) restoreMark(`lot:${l.id}`);
    } else doc.lots = kept;
  }
  if ([...draftedKeys].some((k) => k.startsWith("road:"))) {
    const kept = doc.roads.filter((r) => !out(`road:${r.id}`));
    if (kept.length === 0) {
      doc.roads = structuredClone(base.roads);
      for (const r of base.roads) restoreMark(`road:${r.id}`);
    } else doc.roads = kept;
  }
  const onPlan = (a: Adjoining) => doc.lots.some((l) => l.id === a.lot && legIndex(l, a.from, a.to) >= 0);
  const adj = doc.adjoining.filter((a) => !out(`adjoining:${a.id}`) && onPlan(a));
  if (adj.length > 0) doc.adjoining = adj;
  else {
    doc.adjoining = structuredClone(base.adjoining).filter(onPlan);
    for (const a of doc.adjoining) restoreMark(`adjoining:${a.id}`);
  }

  for (const k of review.removed) {
    if (k.startsWith("sheet.") || k === "notes") {
      setPath(doc, k, getPath(base, k));
      restoreMark(k);
    }
  }
  for (const k of review.confirmed) {
    const p = doc.provenance[k];
    if (p && !out(k) && draftedKeys.has(k)) doc.provenance[k] = { ...p, reviewed: true };
  }
  return pruneProvenance(doc);
}

/** The drafted items still on the reviewed plan, in the order they were drafted: what the review list shows. */
export function itemsInReview(draft: DraftResult, reviewed: SurveyDocument, review: ReviewState): AcceptedItem[] {
  return draft.accepted.filter((a) => !review.removed.has(a.key) && reviewed.provenance[a.key] !== undefined && reviewed.provenance[a.key]!.source === draft.document.provenance[a.key]?.source);
}

