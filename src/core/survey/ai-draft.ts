/**
 * The AI drafting assistant's contract (stage 191, ADR 0202). The model reads
 * the surveyor's own words (a brief) or an old plan's photo into structured
 * instructions; it never computes. This module holds:
 *
 * - the output schema the model must fill: lots as corner point numbers,
 *   roads as edge point numbers, adjoining lands, the title fields, and
 *   questions for anything it can't find. There is no field for an area, a
 *   distance, a bearing, a scale or an extent: the engine computes those.
 * - `acceptDraft`, which checks every item before it can enter a plan:
 *   point numbers must exist; lots must close into simple rings; adjoining
 *   labels must sit on a leg of a drafted lot; and, for a brief, every text
 *   must quote the brief (its "evidence"), so nothing the surveyor didn't
 *   write can slip in. What passes is marked with its provenance and stays
 *   unreviewed until the surveyor accepts it.
 *
 * Model output is untrusted (src/server/ai): this runs on the server before
 * anything is shown, and again on save through the document schema.
 */
import { z } from "zod";
import { emptySheetFields, OPERATIONS, type Adjoining, type Lot, type ProvenanceSource, type Road, type SurveyDocument } from "./document";
import { computeParcel, type SurveyPoint } from "./parcel";

const str = (max: number) => z.string().max(max);

/** The title fields the assistant may fill, by name. Values are text as written; dates as written or yyyy-mm-dd. */
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

export const DraftOutputSchema = z.object({
  lots: z
    .array(
      z.object({
        label: str(12).describe("The lot's letter or number as the brief writes it, without its raised part, e.g. B"),
        sup: str(6).describe("The raised part, e.g. 1 for B1, or empty"),
        note: str(80).describe("A reservation note such as Res. for Access, 10ft. wide, or empty"),
        corners: z.array(str(32)).max(200).describe("The lot's corner point numbers in order round it, exactly as the brief gives them"),
        evidence: str(300).describe("The words of the brief this lot comes from, quoted exactly"),
      }),
    )
    .max(60),
  roads: z
    .array(
      z.object({
        name: str(80),
        edgeA: z.array(str(32)).max(100).describe("Point numbers along one edge, in order"),
        edgeB: z.array(str(32)).max(100).describe("Point numbers along the other edge, in order, or empty"),
        start: str(60).describe("A direction text at the first end such as From Main Road, or empty"),
        end: str(60).describe("A direction text at the last end such as To Houses, or empty"),
        evidence: str(300),
      }),
    )
    .max(20),
  adjoining: z
    .array(
      z.object({
        text: str(200).describe("What adjoins, as written, e.g. Land claimed by A. Perera"),
        lot: str(20).describe("The drafted lot it lies beside, label and raised part together, e.g. B2"),
        from: str(32).describe("The point number at one end of that lot's leg"),
        to: str(32).describe("The point number at the other end of that leg"),
        evidence: str(300),
      }),
    )
    .max(80),
  fields: z
    .array(
      z.object({
        field: z.enum(DRAFT_FIELDS),
        value: str(800),
        evidence: str(300),
      }),
    )
    .max(40),
  notes: z.array(z.object({ text: str(300), evidence: str(300) })).max(10),
  questions: z.array(str(300)).max(12).describe("What the brief doesn't say that the plan needs, as short questions to the surveyor"),
});
export type DraftOutput = z.infer<typeof DraftOutputSchema>;

export interface AcceptedItem {
  /** The provenance key: "lot:<id>", "road:<id>", "adjoining:<id>", "sheet.<field>". */
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

/** Lower case, punctuation and quotes to spaces, runs of space to one: so a quote matches however it was typed. */
export function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[‘’“”"'`]/g, " ")
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

/** Whether a quote appears in the brief, folded. Empty quotes never match. */
export function quotes(brief: string, evidence: string): boolean {
  const e = fold(evidence);
  return e.length >= 2 && fold(brief).includes(e);
}

/** Whether a short token (a point number, a lot label) is written in the quote as a word of its own. */
export function mentions(quote: string, token: string): boolean {
  const t = fold(token);
  return t.length > 0 && ` ${fold(quote)} `.includes(` ${t} `);
}

/** Whether a value is supported by its quote: the value's own words appear in the quote (a model may tidy capitals or spacing, not invent). */
function supports(quote: string, value: string): boolean {
  const v = fold(value);
  if (!v) return false;
  const e = ` ${fold(quote)} `;
  return v.split(" ").every((w) => e.includes(` ${w} `));
}

/** dd.mm.yyyy, dd/mm/yyyy or yyyy-mm-dd as yyyy-mm-dd; anything else as written. */
export function isoDateOf(value: string): string {
  const v = value.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(v);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(v);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return v;
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

/** The provenance key a field fills, matching the editor's keys. */
const FIELD_KEY: Record<DraftField, string> = {
  planNumber: "sheet.planNumber",
  landName: "sheet.landName",
  alias: "sheet.alias",
  nowKnownAs: "sheet.nowKnownAs",
  operation: "sheet.operation",
  parentLots: "sheet.parentLots",
  previousPlanNumber: "sheet.previousPlan",
  previousPlanDate: "sheet.previousPlan",
  previousPlanBy: "sheet.previousPlan",
  previousPlanMine: "sheet.previousPlan",
  previousPlanFiling: "sheet.previousPlan",
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

/** Fields about the new survey: an earlier plan's photo can't fill them (its own number and date are the "previous plan"). */
const NEW_SURVEY_ONLY = new Set<DraftField>(["planNumber", "surveyDate", "partitionDate"]);

const LIMITS: Partial<Record<DraftField, number>> = { planNumber: 40, landName: 120, alias: 160, nowKnownAs: 120, parentLots: 60, previousPlanNumber: 40, previousPlanDate: 20, previousPlanBy: 80, previousPlanFiling: 160, village: 60, pattu: 60, korale: 60, district: 60, province: 60, gnDivision: 60, statedExtent: 80, surveyDate: 20, partitionDate: 20 };

/**
 * Checks a model's draft against the project's points and, for a brief, the
 * brief's own words, and applies what passes to a copy of the document.
 * Drafted lots, roads and adjoining labels replace the document's when the
 * draft has any; fields are set one by one. Nothing is computed here.
 */
export function acceptDraft(output: DraftOutput, input: { document: SurveyDocument; points: readonly SurveyPoint[]; source: Extract<ProvenanceSource, "ai_brief" | "ai_photo">; brief: string }): DraftResult {
  const doc: SurveyDocument = structuredClone(input.document);
  const accepted: AcceptedItem[] = [];
  const dropped: { what: string; why: string }[] = [];
  const byNumber = new Map(input.points.map((p) => [p.pointId.trim(), p]));
  const fromBrief = input.source === "ai_brief";
  const evident = (evidence: string) => !fromBrief || quotes(input.brief, evidence);
  const mark = (key: string, label: string) => {
    doc.provenance[key] = { source: input.source, reviewed: false };
    accepted.push({ key, label });
  };
  const ids = (numbers: string[], what: string): string[] | null => {
    const missing = numbers.filter((n) => !byNumber.has(n.trim()));
    if (missing.length > 0) {
      dropped.push({ what, why: `Point ${missing.slice(0, 5).join(", ")} isn't in this project.` });
      return null;
    }
    return numbers.map((n) => byNumber.get(n.trim())!.id);
  };
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, "").slice(0, 20) || "x";
  /** For a brief, every point number the item uses is written in its quote: the model may not pick points the surveyor didn't name. */
  const named = (evidence: string, numbers: readonly string[]) => !fromBrief || numbers.every((n) => mentions(evidence, n));
  // An old plan's point numbers aren't this survey's: a photo fills the title, never the geometry.
  if (!fromBrief && output.lots.length + output.roads.length + output.adjoining.length > 0) {
    dropped.push({ what: "Lots, roads and adjoining lands", why: "An old plan's point numbers aren't this survey's, so draw them from your own points." });
  }
  const geometry = fromBrief ? output : { lots: [], roads: [], adjoining: [] };

  // Lots: each must quote the brief, use known points it names, and close into a simple ring.
  const lots: Lot[] = [];
  for (const [i, l] of geometry.lots.entries()) {
    const name = `Lot ${l.label}${l.sup}`;
    if (!l.label.trim()) {
      dropped.push({ what: `Lot ${i + 1}`, why: "It has no label." });
      continue;
    }
    if (!evident(l.evidence) || !named(l.evidence, l.corners) || (fromBrief && !mentions(l.evidence, l.label + l.sup) && !mentions(l.evidence, l.label))) {
      dropped.push({ what: name, why: "It and its corners aren't in your description's words." });
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
    const id = `lot-${slug(l.label + l.sup)}-${i}`;
    lots.push({ id, label: l.label.trim(), sup: l.sup.trim(), points: pts, note: l.note.trim() });
  }
  const labels = lots.map((l) => `${l.label}${l.sup}`);
  const seen = new Set<string>();
  const uniqueLots = lots.filter((l, i) => {
    const k = labels[i]!;
    if (seen.has(k)) {
      dropped.push({ what: `Lot ${k}`, why: "The draft named it twice; the first is kept." });
      return false;
    }
    seen.add(k);
    return true;
  });
  if (uniqueLots.length > 0) {
    doc.lots = uniqueLots;
    for (const l of uniqueLots) mark(`lot:${l.id}`, `Lot ${l.label}${l.sup}, corners ${l.points.map((id) => input.points.find((p) => p.id === id)!.pointId).join(" ")}`);
  }

  // Roads.
  const roads: Road[] = [];
  for (const [i, r] of geometry.roads.entries()) {
    const name = r.name.trim() || `Road ${i + 1}`;
    const words = [r.name, r.start, r.end].filter((t) => t.trim());
    if (!evident(r.evidence) || !named(r.evidence, [...r.edgeA, ...r.edgeB]) || (fromBrief && !words.every((t) => supports(r.evidence, t)))) {
      dropped.push({ what: name, why: "It and its points aren't in your description's words." });
      continue;
    }
    const a = ids(r.edgeA, name);
    const b = ids(r.edgeB, name);
    if (!a || !b) continue;
    if (a.length < 2) {
      dropped.push({ what: name, why: "It needs at least two points along one edge." });
      continue;
    }
    roads.push({ id: `road-${slug(name)}-${i}`, name: r.name.trim().slice(0, 80), edgeA: a, edgeB: b.length >= 2 ? b : [], width: "feet", start: r.start.trim().slice(0, 60), end: r.end.trim().slice(0, 60) });
  }
  if (roads.length > 0) {
    doc.roads = roads;
    for (const r of roads) mark(`road:${r.id}`, `${r.name || "A road"}, along ${[r.edgeA, r.edgeB].filter((e) => e.length > 0).map((e) => e.map((id) => input.points.find((p) => p.id === id)!.pointId).join(" ")).join(" and ")}`);
  }

  // Adjoining lands: beside a leg of a drafted (or existing) lot.
  const adjoining: Adjoining[] = [];
  for (const [i, a] of geometry.adjoining.entries()) {
    const what = `"${a.text.slice(0, 40)}"`;
    if (!a.text.trim() || !evident(a.evidence) || !named(a.evidence, [a.from, a.to]) || (fromBrief && !supports(a.evidence, a.text))) {
      dropped.push({ what, why: "It and the points it lies between aren't in your description's words." });
      continue;
    }
    const lot = doc.lots.find((l) => `${l.label}${l.sup}`.toLowerCase() === a.lot.trim().toLowerCase());
    const from = byNumber.get(a.from.trim());
    const to = byNumber.get(a.to.trim());
    if (!lot || !from || !to) {
      dropped.push({ what, why: "Its lot or leg isn't in the draft." });
      continue;
    }
    const n = lot.points.length;
    const leg = lot.points.findIndex((id, k) => (id === from.id && lot.points[(k + 1) % n] === to.id) || (id === to.id && lot.points[(k + 1) % n] === from.id));
    if (leg < 0) {
      dropped.push({ what, why: `Points ${a.from} and ${a.to} aren't neighbouring corners of lot ${a.lot}.` });
      continue;
    }
    adjoining.push({ id: `adj-${i}`, text: a.text.trim().slice(0, 200), lot: lot.id, leg });
  }
  if (adjoining.length > 0) {
    doc.adjoining = adjoining;
    for (const a of adjoining) {
      const lot = doc.lots.find((l) => l.id === a.lot)!;
      const at = (k: number) => input.points.find((p) => p.id === lot.points[k % lot.points.length])!.pointId;
      mark(`adjoining:${a.id}`, `${a.text}, beside lot ${lot.label}${lot.sup} between ${at(a.leg)} and ${at(a.leg + 1)}`);
    }
  }

  // Title fields: the value must come from its quote (for a brief), and fit.
  const s = doc.sheet;
  const fresh = emptySheetFields();
  for (const f of output.fields) {
    const label = FIELD_LABELS[f.field];
    const value = f.value.trim();
    if (!value) continue;
    if (!fromBrief && NEW_SURVEY_ONLY.has(f.field)) {
      dropped.push({ what: label, why: "It belongs to the new survey, not the earlier plan in the photo." });
      continue;
    }
    if (fromBrief && (!quotes(input.brief, f.evidence) || (f.field !== "operation" && f.field !== "previousPlanMine" && !supports(f.evidence, value)))) {
      dropped.push({ what: label, why: "It isn't in your description's words." });
      continue;
    }
    const max = LIMITS[f.field];
    if (max && value.length > max) {
      dropped.push({ what: label, why: `It's longer than ${max} characters.` });
      continue;
    }
    switch (f.field) {
      case "operation": {
        const op = value.toLowerCase();
        const known = (OPERATIONS as readonly string[]).includes(op) ? (op as SurveyDocument["sheet"]["operation"]) : /amalgam/.test(op) ? "amalgamation" : /sub\s*-?\s*divi/.test(op) ? "subdivision" : /resurvey|re-survey/.test(op) ? "resurvey" : null;
        if (!known) {
          dropped.push({ what: label, why: "It isn't one of the kinds of survey Farbaek writes." });
          continue;
        }
        s.operation = known;
        break;
      }
      case "previousPlanNumber":
        s.previousPlan.number = value;
        break;
      case "previousPlanDate":
        s.previousPlan.date = isoDateOf(value);
        break;
      case "previousPlanBy":
        s.previousPlan.by = value;
        if (!s.previousPlan.byDesignation) s.previousPlan.byDesignation = fresh.previousPlan.byDesignation;
        break;
      case "previousPlanMine":
        s.previousPlan.mine = /^(yes|true|mine|my)$/i.test(value);
        break;
      case "previousPlanFiling":
        s.previousPlan.filing = value;
        break;
      case "boundaryNorth":
        s.boundaries.north = value;
        break;
      case "boundaryEast":
        s.boundaries.east = value;
        break;
      case "boundarySouth":
        s.boundaries.south = value;
        break;
      case "boundaryWest":
        s.boundaries.west = value;
        break;
      case "surveyDate":
      case "partitionDate":
        s[f.field] = isoDateOf(value);
        break;
      default:
        s[f.field] = value;
    }
    mark(FIELD_KEY[f.field], `${label}: ${value}`);
  }

  for (const n of output.notes) {
    if (!n.text.trim() || !evident(n.evidence) || (fromBrief && !supports(n.evidence, n.text))) {
      dropped.push({ what: "A note", why: "It isn't in your description's words." });
      continue;
    }
    if (doc.notes.length < 10 && !doc.notes.includes(n.text.trim())) {
      doc.notes.push(n.text.trim().slice(0, 300));
      accepted.push({ key: "notes", label: n.text.trim() });
      doc.provenance["notes"] = { source: input.source, reviewed: false };
    }
  }

  // Adjoining labels left pointing at lots the draft replaced are dropped, not guessed onto new legs.
  if (uniqueLots.length > 0 && adjoining.length === 0) doc.adjoining = doc.adjoining.filter((a) => doc.lots.some((l) => l.id === a.lot));
  if (uniqueLots.length > 0 && doc.sheet.extractOf && !doc.lots.some((l) => l.id === doc.sheet.extractOf)) doc.sheet.extractOf = "";
  // Provenance for items the draft replaced goes with them.
  const live = new Set([...doc.lots.map((l) => `lot:${l.id}`), ...doc.roads.map((r) => `road:${r.id}`), ...doc.adjoining.map((a) => `adjoining:${a.id}`)]);
  for (const key of Object.keys(doc.provenance)) {
    if (/^(lot|road|adjoining):/.test(key) && !live.has(key)) delete doc.provenance[key];
  }
  // Accepted items keep a de-duplicated list (several fields can share one key).
  const unique = accepted.filter((a, i) => accepted.findIndex((b) => b.key === a.key && b.label === a.label) === i);
  return { document: doc, accepted: unique, dropped, questions: output.questions.map((q) => q.trim()).filter(Boolean).slice(0, 12) };
}
