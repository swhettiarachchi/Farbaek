/**
 * The drawing document: what a surveyor decides about a plan, saved as an
 * append-only version (ADR 0198). It references imported points by id and
 * never holds a coordinate of its own, so editing the drawing can't change a
 * measurement (survey skill, rule 6). Every text field is typed by a person:
 * nothing here is filled in by Farbaek from a guess (rule 2).
 */
import { z } from "zod";

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
  "TEXT",
  "TITLE",
] as const;
export type LayerId = (typeof LAYER_IDS)[number];

/** Layers a feature (a line or outline through points) can go on. */
export const FEATURE_LAYERS = ["BUILDINGS", "WALLS", "FENCES", "DRAINS", "ROADS", "UTILITIES"] as const satisfies readonly LayerId[];

const text = (max: number) => z.string().max(max).transform((s) => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ""));
const pointRef = z.string().uuid();

export const PAPER_SIZES = { A4: [210, 297], A3: [297, 420], A2: [420, 594] } as const;
export type PaperSize = keyof typeof PAPER_SIZES;

/** Standard drawing scales offered, as the denominator of 1:N. */
export const STANDARD_SCALES = [100, 200, 250, 500, 1000, 1250, 2000, 2500, 4000, 5000, 10000] as const;

export const featureSchema = z.object({
  id: z.string().min(1).max(40),
  layer: z.enum(FEATURE_LAYERS),
  /** The legend code it carries, such as "MW", or empty. */
  code: text(12),
  /** Closed outline (a building) or open line (a wall, a drain). */
  closed: z.boolean(),
  points: z.array(pointRef).min(2).max(500),
});
export type DrawingFeature = z.infer<typeof featureSchema>;

export const legendEntrySchema = z.object({ code: text(12).pipe(z.string().min(1)), meaning: text(60).pipe(z.string().min(1)) });

export const sheetFieldsSchema = z.object({
  planNumber: text(40),
  planDate: text(20),
  lot: text(40),
  /** "Plan of the land called …" */
  landName: text(120),
  village: text(60),
  gnDivision: text(60),
  dsDivision: text(60),
  district: text(60),
  province: text(60),
  /** Earlier plans of this land, as the surveyor cites them; or how the boundaries were found when there are none. */
  previousPlans: text(400),
  boundaries: z.object({ north: text(160), east: text(160), south: text(160), west: text(160) }),
  /** The extent stated on a deed or earlier plan, kept apart from the computed area (rule 5). */
  statedExtent: text(80),
  surveyDate: text(20),
  remarks: text(600),
  legend: z.array(legendEntrySchema).max(30),
});
export type SheetFields = z.infer<typeof sheetFieldsSchema>;

export const settingsSchema = z.object({
  paper: z.enum(["A4", "A3", "A2"]),
  orientation: z.enum(["landscape", "portrait"]),
  /** The chosen scale denominator, or null to use the suggested one. */
  scale: z.number().int().min(50).max(100_000).nullable(),
  perchDecimals: z.number().int().min(0).max(4),
  secondDecimals: z.number().int().min(0).max(2),
  distanceDecimals: z.number().int().min(2).max(4),
  /** Overleaf schedule of coordinates, legs and the area computation. */
  overleaf: z.boolean(),
  /** UDA regulation 9's 75 mm × 50 mm development permit box on the front page (docs/survey/SURVEY_STANDARDS_RESEARCH.md). */
  permitBox: z.boolean(),
});
export type DrawingSettings = z.infer<typeof settingsSchema>;

export const surveyDocumentSchema = z.object({
  schema: z.literal(1),
  /** The boundary's point ids, in the order the surveyor gave. Closes back to the first. */
  boundary: z.array(pointRef).max(500),
  features: z.array(featureSchema).max(200),
  /** Presentation only: label nudges on paper, millimetres, by entity id. */
  labelOffsets: z.record(z.string().max(80), z.object({ dx: z.number().min(-200).max(200), dy: z.number().min(-200).max(200) })),
  layers: z.record(z.enum(LAYER_IDS), z.object({ visible: z.boolean(), locked: z.boolean() })),
  sheet: sheetFieldsSchema,
  settings: settingsSchema,
  /** Which member's surveyor profile fills the surveyor block. */
  surveyorUserId: z.string().uuid().nullable(),
});
export type SurveyDocument = z.infer<typeof surveyDocumentSchema>;

/**
 * Legend codes a surveyor can start from: the examples in the owner's brief.
 * They are not an official list (docs/survey/SURVEY_STANDARDS_RESEARCH.md), and
 * the sheet says so until the surveyor edits them.
 */
export const BRIEF_LEGEND_EXAMPLES: SheetFields["legend"] = [
  { code: "MW", meaning: "Masonry wall" },
  { code: "MDn", meaning: "Masonry drain" },
  { code: "CP", meaning: "Concrete post" },
  { code: "EP", meaning: "Electric post" },
  { code: "TP", meaning: "Telephone post" },
  { code: "St", meaning: "Stake" },
  { code: "M", meaning: "Mark" },
  { code: "P", meaning: "Permanent building" },
  { code: "NF", meaning: "Net fence" },
  { code: "RW", meaning: "Retaining wall" },
];

export function emptySheetFields(): SheetFields {
  return {
    planNumber: "",
    planDate: "",
    lot: "",
    landName: "",
    village: "",
    gnDivision: "",
    dsDivision: "",
    district: "",
    province: "",
    previousPlans: "",
    boundaries: { north: "", east: "", south: "", west: "" },
    statedExtent: "",
    surveyDate: "",
    remarks: "",
    legend: BRIEF_LEGEND_EXAMPLES.map((e) => ({ ...e })),
  };
}

export function defaultLayers(): SurveyDocument["layers"] {
  return Object.fromEntries(LAYER_IDS.map((id) => [id, { visible: true, locked: false }])) as SurveyDocument["layers"];
}

/** A new project's first document: no boundary, the brief's legend examples, A3 landscape. */
export function emptyDocument(): SurveyDocument {
  return {
    schema: 1,
    boundary: [],
    features: [],
    labelOffsets: {},
    layers: defaultLayers(),
    sheet: emptySheetFields(),
    settings: { paper: "A3", orientation: "landscape", scale: null, perchDecimals: 2, secondDecimals: 0, distanceDecimals: 2, overleaf: true, permitBox: false },
    surveyorUserId: null,
  };
}

/** True when the legend is still exactly the brief's examples, so the sheet can say they aren't an official list. */
export function legendIsBriefExamples(legend: SheetFields["legend"]): boolean {
  return legend.length === BRIEF_LEGEND_EXAMPLES.length && legend.every((e, i) => e.code === BRIEF_LEGEND_EXAMPLES[i]!.code && e.meaning === BRIEF_LEGEND_EXAMPLES[i]!.meaning);
}
