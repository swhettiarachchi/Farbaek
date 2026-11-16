/**
 * The drawing document: what a surveyor decides about a plan, saved as an
 * append-only version (ADR 0198). It references imported points by id and
 * never holds a coordinate of its own, so editing the drawing can't change a
 * measurement (survey skill, rule 6).
 *
 * Schema 2 (stage 191, ADR 0203) holds several lots, roads, adjoining-land
 * labels, the code library and the structured title of a Sri Lankan plan.
 * Text comes from the surveyor or, marked in `provenance`, from the AI
 * reading the surveyor's own words or an old plan's photo (ADR 0202); a
 * marked item counts only once the surveyor has reviewed it. Schema 1
 * documents are upgraded when read (`parseSurveyDocument`).
 */
import { z } from "zod";
import { codeEntrySchema, commonCodes, type CodeEntry } from "./codes";

export const LAYER_IDS = [
  "BOUNDARY",
  "POINTS",
  "POINT_NUMBERS",
  "DIMENSIONS",
  "LOT_TEXT",
  "BOUNDARY_MARKS",
  "BUILDINGS",
  "WALLS",
  "FENCES",
  "DRAINS",
  "ROADS",
  "UTILITIES",
  "ADJOINING",
  "TEXT",
  "TITLE",
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** Layers a feature (a line or outline through points) can go on. */
export const FEATURE_LAYERS = ["BUILDINGS", "WALLS", "FENCES", "DRAINS", "ROADS", "UTILITIES"] as const satisfies readonly LayerId[];

const text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));
const pointRef = z.string().uuid();
const entityId = z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/);

export const PAPER_SIZES = { A4: [210, 297], A3: [297, 420], A2: [420, 594] } as const;
export type PaperSize = keyof typeof PAPER_SIZES;

/** Standard drawing scales offered, as the denominator of 1:N. */
export const STANDARD_SCALES = [100, 200, 250, 500, 1000, 1250, 2000, 2500, 4000, 5000, 10000] as const;

export const featureSchema = z.object({
  id: entityId,
  layer: z.enum(FEATURE_LAYERS),
  /** The code it carries, such as "MW", or empty. */
  code: text(12),
  /** Closed outline (a building) or open line (a wall, a drain). */
  closed: z.boolean(),
  points: z.array(pointRef).min(2).max(500),
});
export type DrawingFeature = z.infer<typeof featureSchema>;

/** A lot: its label as written on the plan ("B" with a raised "1"), its corners in order, and a note such as "Res. for Access, 10ft. wide". */
export const lotSchema = z.object({
  id: entityId,
  /** Up to 40 characters, as written; empty until the surveyor gives one (the checks stop the export until then). */
  label: text(40),
  /** The raised part of the label (B¹, 4ᴬ), or empty. */
  sup: text(6),
  points: z.array(pointRef).max(500),
  note: text(80),
});
export type Lot = z.infer<typeof lotSchema>;

/** A road drawn from its two surveyed edges. The width written beside the name is computed from the edges, never typed. */
export const roadSchema = z.object({
  id: entityId,
  name: text(80),
  edgeA: z.array(pointRef).min(2).max(200),
  edgeB: z.array(pointRef).max(200),
  /** How the computed width is written: in feet as on most Sri Lankan plans, in metres, or not at all. */
  width: z.enum(["feet", "metres", "none"]),
  /** Direction texts at the road's ends, such as "To Houses". */
  start: text(60),
  end: text(60),
});
export type Road = z.infer<typeof roadSchema>;

/** A label for adjoining land, outside one leg of a lot, with an arrow to it. */
export const adjoiningSchema = z.object({
  id: entityId,
  text: text(200).pipe(z.string().min(1)),
  lot: entityId,
  /** The leg it lies beside, by its two corners (either way round), so changing the lot's other corners never moves it to another side. */
  from: pointRef,
  to: pointRef,
});
export type Adjoining = z.infer<typeof adjoiningSchema>;

/** Where the leg between two corners sits in a lot's ring (leg i runs from corner i to corner i + 1), either way round, or -1 when the lot has no such leg. */
export function legIndex(lot: Pick<Lot, "points">, from: string, to: string): number {
  const n = lot.points.length;
  if (n < 2) return -1;
  return lot.points.findIndex((id, k) => (id === from && lot.points[(k + 1) % n] === to) || (id === to && lot.points[(k + 1) % n] === from));
}

export const OPERATIONS = ["resurvey", "subdivision", "amalgamation", "custom"] as const;
export type Operation = (typeof OPERATIONS)[number];

export const previousPlanSchema = z.object({
  number: text(40),
  date: text(20),
  by: text(80),
  byDesignation: text(60),
  /** The same surveyor's own earlier plan: written "my Plan No. …", without "made by". */
  mine: z.boolean(),
  /** Where it was filed of record, such as a court and case number. */
  filing: text(160),
});
export type PreviousPlan = z.infer<typeof previousPlanSchema>;

export const sheetFieldsSchema = z.object({
  planNumber: text(40),
  /** The date the surveyor signs under, as typed or yyyy-mm-dd. */
  planDate: text(20),
  /** "called …" */
  landName: text(120),
  /** "alias …", several separated by " and " as the surveyor writes them. */
  alias: text(160),
  /** "(Now called & known as …)" */
  nowKnownAs: text(120),
  operation: z.enum(OPERATIONS),
  /** The lot or lots the operation acts on: "B" for a sub division of lot B, "3 & 5" for an amalgamation. */
  parentLots: text(60),
  previousPlan: previousPlanSchema,
  /** For plans the standard sentence can't express: the surveyor's own wording after "being". */
  customClause: text(800),
  village: text(60),
  pattu: text(60),
  korale: text(60),
  gnDivision: text(60),
  dsDivision: text(60),
  district: text(60),
  province: text(60),
  /** Earlier plans in the surveyor's own words, for the panel layout. */
  previousPlans: text(400),
  boundaries: z.object({ north: text(200), east: text(200), south: text(200), west: text(200) }),
  /** The extent stated on a deed or earlier plan, kept apart from the computed area (rule 5). */
  statedExtent: text(80),
  surveyDate: text(20),
  partitionDate: text(20),
  /** How the boundaries were found, printed bottom left. */
  statement: text(200),
  remarks: text(600),
  /** A lot id to draw this sheet as an extract of that one lot, or empty. */
  extractOf: text(40),
});
export type SheetFields = z.infer<typeof sheetFieldsSchema>;

export const TEMPLATES = ["classic", "panel"] as const;
export type TemplateId = (typeof TEMPLATES)[number];

export const settingsSchema = z.object({
  /** classic: the Sri Lankan layout seen on practising surveyors' plans; panel: the stage 190 layout with a side panel. */
  template: z.enum(TEMPLATES),
  /** "auto" picks the smallest A-size the drawing fits at the scale. */
  paper: z.enum(["auto", "A4", "A3", "A2"]),
  orientation: z.enum(["landscape", "portrait"]),
  /** The chosen scale denominator, or null to use the suggested one. */
  scale: z.number().int().min(50).max(100_000).nullable(),
  perchDecimals: z.number().int().min(0).max(4),
  secondDecimals: z.number().int().min(0).max(2),
  distanceDecimals: z.number().int().min(2).max(4),
  /** Overleaf boundaries schedule: legs, coordinates and areas. */
  overleaf: z.boolean(),
  /** UDA regulation 9's 75 mm × 50 mm development permit box on the front page (docs/survey/STANDARDS_RESEARCH.md). */
  permitBox: z.boolean(),
  /** Slanted CAD lettering, as on hand-drafted and CAD plans alike. */
  slant: z.boolean(),
  /** Bearings and distances beside each leg on the face. The classic layout keeps them overleaf. */
  faceDimensions: z.boolean(),
});
export type DrawingSettings = z.infer<typeof settingsSchema>;

/**
 * ai_brief and ai_photo: read by the AI from the surveyor's words or a photo. engine: suggested by tested code and accepted by the
 * surveyor. auto: drawn by tested code from the field data on import (an inference, such as which marks make the lot), waiting for the
 * surveyor's check like an AI item. ai_assist: made by the drafting assistant from the surveyor's spoken or typed instruction and
 * applied by them after seeing it (stage 195), so it counts as checked.
 */
export const PROVENANCE_SOURCES = ["ai_brief", "ai_photo", "engine", "auto", "ai_assist"] as const;
export type ProvenanceSource = (typeof PROVENANCE_SOURCES)[number];

/** Who filled an item, when it wasn't the surveyor, and whether they've reviewed it. Keys name the item: "lot:<id>", "road:<id>", "adjoining:<id>", "feature:<id>", "sheet.<field>". */
export const provenanceSchema = z.record(z.string().min(1).max(80), z.object({ source: z.enum(PROVENANCE_SOURCES), reviewed: z.boolean() }));
export type Provenance = z.infer<typeof provenanceSchema>;

/** The planning rules the plan's lots are checked against (rules.ts, ADR 0207). The surveyor's own minimums carry their source in their words. */
export const planRulesSchema = z.discriminatedUnion("id", [
  z.object({ id: z.literal("uda-2020") }),
  z.object({ id: z.literal("own"), areaM2: z.number().min(0).max(10_000_000), frontageM: z.number().min(0).max(10_000), depthM: z.number().min(0).max(10_000), source: text(200) }),
]);

export const surveyDocumentSchema = z.object({
  schema: z.literal(2),
  lots: z.array(lotSchema).max(60),
  roads: z.array(roadSchema).max(20),
  adjoining: z.array(adjoiningSchema).max(80),
  features: z.array(featureSchema).max(300),
  /** Notes printed as "Note:- …" under the legend. */
  notes: z.array(text(300).pipe(z.string().min(1))).max(10),
  codes: z.array(codeEntrySchema).max(80),
  /** Presentation only: label nudges on paper, millimetres, by entity id. */
  labelOffsets: z.record(z.string().max(80), z.object({ dx: z.number().min(-200).max(200), dy: z.number().min(-200).max(200) })),
  layers: z.record(z.enum(LAYER_IDS), z.object({ visible: z.boolean(), locked: z.boolean() })),
  sheet: sheetFieldsSchema,
  settings: settingsSchema,
  provenance: provenanceSchema,
  /** Near misses the surveyor answered "keep as surveyed" (keys from `nearKey` in lots.ts). Part of the version, so the approval covers the answer. */
  kept: z.array(z.string().min(1).max(120)).max(200).default([]),
  /** The planning rules the lots are checked against, or null. Left out of the approval hash while null, so earlier approvals stand. */
  rules: planRulesSchema.nullable().default(null),
  /** Which member's surveyor profile fills the surveyor block. */
  surveyorUserId: z.string().uuid().nullable(),
});
export type SurveyDocument = z.infer<typeof surveyDocumentSchema>;

export const DEFAULT_STATEMENT = "The boundaries were surveyed as pointed out by the land owner";

export function emptySheetFields(): SheetFields {
  return {
    planNumber: "",
    planDate: "",
    landName: "",
    alias: "",
    nowKnownAs: "",
    operation: "resurvey",
    parentLots: "",
    previousPlan: { number: "", date: "", by: "", byDesignation: "Licensed Surveyor", mine: false, filing: "" },
    customClause: "",
    village: "",
    pattu: "",
    korale: "",
    gnDivision: "",
    dsDivision: "",
    district: "",
    province: "",
    previousPlans: "",
    boundaries: { north: "", east: "", south: "", west: "" },
    statedExtent: "",
    surveyDate: "",
    partitionDate: "",
    statement: DEFAULT_STATEMENT,
    remarks: "",
    extractOf: "",
  };
}

export function defaultLayers(): SurveyDocument["layers"] {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, { visible: true, locked: false }])) as SurveyDocument["layers"];
}

export function defaultSettings(): DrawingSettings {
  return { template: "classic", paper: "auto", orientation: "portrait", scale: null, perchDecimals: 2, secondDecimals: 0, distanceDecimals: 2, overleaf: true, permitBox: false, slant: true, faceDimensions: false };
}

/** A new project's first document: no lots yet, the common codes, the classic layout. */
export function emptyDocument(): SurveyDocument {
  return {
    schema: 2,
    lots: [],
    roads: [],
    adjoining: [],
    features: [],
    notes: [],
    codes: commonCodes(),
    labelOffsets: {},
    layers: defaultLayers(),
    sheet: emptySheetFields(),
    settings: defaultSettings(),
    provenance: {},
    kept: [],
    rules: null,
    surveyorUserId: null,
  };
}

/** Every point a document uses, by id. */
export function usedPointIds(doc: SurveyDocument): Set<string> {
  return new Set([...doc.lots.flatMap((l) => l.points), ...doc.roads.flatMap((r) => [...r.edgeA, ...r.edgeB]), ...doc.adjoining.flatMap((a) => [a.from, a.to]), ...doc.features.flatMap((f) => f.points)]);
}

/** A lot's label as plain text, "B1" for B with a raised 1. */
export const lotName = (lot: Pick<Lot, "label" | "sup">) => `${lot.label}${lot.sup}`;

/** Whether the item a provenance key names is still in the document (a removed lot's mark is just left over). */
export function provenanceLive(doc: SurveyDocument, key: string): boolean {
  const has = (prefix: string, ids: { id: string }[]) => ids.some((x) => `${prefix}${x.id}` === key);
  if (key.startsWith("lot:")) return has("lot:", doc.lots);
  if (key.startsWith("road:")) return has("road:", doc.roads);
  if (key.startsWith("adjoining:")) return has("adjoining:", doc.adjoining);
  if (key.startsWith("feature:")) return has("feature:", doc.features);
  return true;
}

/** The document without marks for items it no longer has. */
export function pruneProvenance(doc: SurveyDocument): SurveyDocument {
  return { ...doc, provenance: Object.fromEntries(Object.entries(doc.provenance).filter(([k]) => provenanceLive(doc, k))) };
}

/** Items the AI filled that the surveyor hasn't reviewed yet, of those still on the plan. */
export function unreviewed(doc: SurveyDocument): string[] {
  return Object.entries(doc.provenance)
    .filter(([k, p]) => p.source !== "engine" && !p.reviewed && provenanceLive(doc, k))
    .map(([k]) => k);
}

// ---------------------------------------------------------------------------
// Schema 1 (stage 190), read and upgraded.

const legacyLegendSchema = z.object({ code: text(12).pipe(z.string().min(1)), meaning: text(60).pipe(z.string().min(1)) });
const legacySchema = z.object({
  schema: z.literal(1),
  boundary: z.array(pointRef).max(500),
  features: z.array(featureSchema).max(200),
  labelOffsets: z.record(z.string().max(80), z.object({ dx: z.number().min(-200).max(200), dy: z.number().min(-200).max(200) })),
  layers: z.record(z.enum(LAYER_IDS.filter((l) => l !== "ADJOINING") as [LayerId, ...LayerId[]]), z.object({ visible: z.boolean(), locked: z.boolean() })),
  sheet: z.object({
    planNumber: text(40),
    planDate: text(20),
    lot: text(40),
    landName: text(120),
    village: text(60),
    gnDivision: text(60),
    dsDivision: text(60),
    district: text(60),
    province: text(60),
    previousPlans: text(400),
    boundaries: z.object({ north: text(160), east: text(160), south: text(160), west: text(160) }),
    statedExtent: text(80),
    surveyDate: text(20),
    remarks: text(600),
    legend: z.array(legacyLegendSchema).max(30),
  }),
  settings: z.object({
    paper: z.enum(["A4", "A3", "A2"]),
    orientation: z.enum(["landscape", "portrait"]),
    scale: z.number().int().min(50).max(100_000).nullable(),
    perchDecimals: z.number().int().min(0).max(4),
    secondDecimals: z.number().int().min(0).max(2),
    distanceDecimals: z.number().int().min(2).max(4),
    overleaf: z.boolean(),
    permitBox: z.boolean(),
  }),
  surveyorUserId: z.string().uuid().nullable(),
});

/** Stage 190's starting legend, codes and meanings, which new projects got before anyone checked it. */
const STAGE_190_EXAMPLES: [string, string][] = [
  ["MW", "Masonry wall"],
  ["MDn", "Masonry drain"],
  ["CP", "Concrete post"],
  ["EP", "Electric post"],
  ["TP", "Telephone post"],
  ["St", "Stake"],
  ["M", "Mark"],
  ["P", "Permanent building"],
  ["NF", "Net fence"],
  ["RW", "Retaining wall"],
];

/**
 * Codes from a schema 1 legend: the common entry's drawing kind where the code
 * matches, its own meaning kept. A legend still exactly stage 190's starting
 * examples was never checked, so it becomes the common list, which the checks
 * hold until the surveyor marks it checked.
 */
function codesFromLegend(legend: { code: string; meaning: string }[]): CodeEntry[] {
  const common = commonCodes();
  // Only an untouched list: a surveyor who rewrote a meaning keeps their words.
  if (legend.length === STAGE_190_EXAMPLES.length && legend.every((e, i) => e.code === STAGE_190_EXAMPLES[i]![0] && e.meaning === STAGE_190_EXAMPLES[i]![1])) return common;
  const out = legend.map((e) => {
    const known = common.find((c) => c.code === e.code);
    return known ? { ...known, meaning: e.meaning } : { code: e.code, meaning: e.meaning, kind: "mark" as const, line: "solid" as const, legend: true };
  });
  for (const c of common) if (!out.some((o) => o.code === c.code)) out.push(c);
  return out;
}

/**
 * Early schema 2 documents (saved while stage 191 was being built) named an
 * adjoining land's leg by its number; it's now the leg's two corners. A
 * label whose lot is gone is dropped, as the checks would have reported it.
 */
function legsAsCorners(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || (raw as { schema?: unknown }).schema !== 2) return raw;
  const doc = raw as { lots?: unknown; adjoining?: unknown };
  if (!Array.isArray(doc.adjoining) || !Array.isArray(doc.lots)) return raw;
  const lots = doc.lots as { id?: unknown; points?: unknown }[];
  const adjoining = (doc.adjoining as Record<string, unknown>[]).flatMap((a) => {
    if (typeof a.leg !== "number" || "from" in a) return [a];
    const lot = lots.find((l) => l.id === a.lot);
    const pts = Array.isArray(lot?.points) ? (lot!.points as unknown[]) : [];
    if (pts.length < 2) return [];
    const { leg, ...rest } = a;
    const k = (leg as number) % pts.length;
    return [{ ...rest, from: pts[k], to: pts[(k + 1) % pts.length] }];
  });
  return { ...doc, adjoining };
}

/**
 * Reads a stored document of either schema: schema 2 as it is, schema 1
 * upgraded (its boundary becomes the first lot, its legend the code library,
 * in the panel layout it was drawn with). Null when it matches neither.
 */
export function parseSurveyDocument(raw: unknown): SurveyDocument | null {
  const v2 = surveyDocumentSchema.safeParse(legsAsCorners(raw));
  if (v2.success) return v2.data;
  const v1 = legacySchema.safeParse(raw);
  if (!v1.success) return null;
  const d = v1.data;
  const { lot, legend, ...sheet } = d.sheet;
  return {
    schema: 2,
    // An empty lot stays empty: the checks ask for a label rather than inventing one.
    lots: d.boundary.length > 0 ? [{ id: "lot-1", label: lot.trim(), sup: "", points: d.boundary, note: "" }] : [],
    roads: [],
    adjoining: [],
    features: d.features,
    notes: [],
    codes: codesFromLegend(legend),
    labelOffsets: Object.fromEntries(Object.entries(d.labelOffsets).map(([k, v]) => [k === "lot" ? "lot:lot-1" : k === "lot-extent" ? "lot-extent:lot-1" : k, v])),
    layers: { ...defaultLayers(), ...d.layers },
    sheet: { ...emptySheetFields(), ...sheet, statement: "" },
    settings: { ...defaultSettings(), ...d.settings, template: "panel", slant: false, faceDimensions: true },
    provenance: {},
    kept: [],
    rules: null,
    surveyorUserId: d.surveyorUserId,
  };
}
