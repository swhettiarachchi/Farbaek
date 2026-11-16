/**
 * The drafting assistant's one closed set of operations (stage 195, ADR 0210).
 *
 * `AssistOutput` is what the model returns, and what the local command reader
 * returns too, so one checker serves both. It carries no measured value: every
 * number, point number and name is a quote of the surveyor's own words, which
 * code reads (spoken.ts). There are no optional fields ("" means none) and no
 * numeric limits, so the schema stays inside what structured outputs accept;
 * limits are code's job (check.ts).
 *
 * `PlanOp` is what code makes of an operation once checked: typed values,
 * real ids, ready to apply (apply.ts). Its tier says how it's confirmed.
 */
import { z } from "zod";
import { DRAFT_FIELDS, FIELD_KEY } from "../ai-draft";
import { FEATURE_LAYERS, LAYER_IDS, type Adjoining, type DrawingFeature, type LayerId, type Lot, type Road, type SurveyDocument } from "../document";

/** The title fields the assistant may fill: the drafter's, and the plan's date, divisional secretariat, statement and remarks. */
export const ASSIST_FIELDS = [...DRAFT_FIELDS, "planDate", "dsDivision", "statement", "remarks"] as const;
export type AssistField = (typeof ASSIST_FIELDS)[number];
export const ASSIST_FIELD_KEY: Record<AssistField, string> = { ...FIELD_KEY, planDate: "sheet.planDate", dsDivision: "sheet.dsDivision", statement: "sheet.statement", remarks: "sheet.remarks" };

/** Points named in the words ("points 1 to 5"), picked on the sheet ("these points"), or none. */
const PointQuote = z.object({ from: z.enum(["words", "selection", "none"]), quote: z.string() });
const Side = z.enum(["north", "east", "south", "west", ""]);

export const ASSIST_OPS = [
  "view",
  "history",
  "set_layer",
  "move_label",
  "set_sheet",
  "set_number",
  "add_lot",
  "edit_lot",
  "add_road",
  "add_adjoining",
  "add_feature",
  "set_field",
  "add_note",
  "remove",
  "answer",
  "divide",
  "enter_measurements",
  "ask",
  "cannot",
] as const;

export const AssistOpSchema = z.discriminatedUnion("op", [
  z.object({ op: z.literal("view"), action: z.enum(["zoom_in", "zoom_out", "whole_sheet", "focus", "select", "clear_selection"]), target: z.string(), points: PointQuote, quote: z.string() }),
  z.object({ op: z.literal("history"), action: z.enum(["undo", "redo"]), quote: z.string() }),
  z.object({ op: z.literal("set_layer"), layer: z.enum(LAYER_IDS as unknown as [LayerId, ...LayerId[]]), visible: z.enum(["on", "off", "keep"]), locked: z.enum(["on", "off", "keep"]), quote: z.string() }),
  z.object({ op: z.literal("move_label"), target: z.string(), direction: z.enum(["left", "right", "up", "down", "back"]), amount: z.enum(["slight", "some", "far"]), quote: z.string() }),
  z.object({ op: z.literal("set_sheet"), setting: z.enum(["paper", "orientation", "template", "overleaf", "faceDimensions", "slant", "permitBox"]), value: z.string(), quote: z.string() }),
  z.object({ op: z.literal("set_number"), setting: z.enum(["scale", "perchDecimals", "secondDecimals", "distanceDecimals"]), quote: z.string() }),
  z.object({ op: z.literal("add_lot"), label: z.string(), corners: PointQuote, note: z.string(), quote: z.string() }),
  z.object({ op: z.literal("edit_lot"), target: z.string(), change: z.enum(["label", "note", "corners"]), label: z.string(), note: z.string(), corners: PointQuote, quote: z.string() }),
  z.object({ op: z.literal("add_road"), name: z.string(), edgeA: PointQuote, edgeB: PointQuote, width: z.enum(["feet", "metres", "none"]), start: z.string(), end: z.string(), quote: z.string() }),
  z.object({ op: z.literal("add_adjoining"), text: z.string(), lot: z.string(), side: Side, leg: PointQuote, quote: z.string() }),
  z.object({ op: z.literal("add_feature"), layer: z.enum(FEATURE_LAYERS as unknown as [DrawingFeature["layer"], ...DrawingFeature["layer"][]]), code: z.string(), closed: z.boolean(), points: PointQuote, quote: z.string() }),
  z.object({ op: z.literal("set_field"), field: z.enum(ASSIST_FIELDS), value: z.string(), quote: z.string() }),
  z.object({ op: z.literal("add_note"), text: z.string(), quote: z.string() }),
  z.object({ op: z.literal("remove"), target: z.string(), quote: z.string() }),
  z.object({ op: z.literal("answer"), topic: z.enum(["total_area", "lot_area", "perimeter", "checks", "missing", "always_printed", "scale"]), target: z.string() }),
  z.object({ op: z.literal("divide"), lot: z.string(), by: z.enum(["area", "width"]), count: z.string(), values: z.string(), unit: z.enum(["perch", "m2", "m", "ft", ""]), lines: z.enum(["square", "parallel", "through", ""]), side: Side, quote: z.string() }),
  z.object({ op: z.literal("enter_measurements"), mode: z.enum(["bearings", "coordinates"]), quote: z.string() }),
  z.object({ op: z.literal("ask"), question: z.string(), choices: z.array(z.string()) }),
  z.object({ op: z.literal("cannot"), reason: z.enum(["points", "crs", "approval", "surveyor", "export", "unsupported", "unclear"]) }),
]);
export type AssistOp = z.infer<typeof AssistOpSchema>;

export const AssistOutputSchema = z.object({ say: z.string(), ops: z.array(AssistOpSchema) });
export type AssistOutput = z.infer<typeof AssistOutputSchema>;

/** How an operation is confirmed: views and history at once; layers, labels and paper at once with undo; anything with a value after a look; removals with care. */
export type Tier = "view" | "now" | "confirm" | "caution" | "answer" | "handoff";

export type AnswerTopic = Extract<AssistOp, { op: "answer" }>["topic"];

/** What code makes of an operation: values read, ids real, ready to apply. `quote` is the words it came from, for the screen. */
export type PlanOp = { quote: string } & (
  | { kind: "view"; action: "zoom_in" | "zoom_out" | "whole_sheet" | "focus" | "select" | "clear_selection"; entities: string[] }
  | { kind: "history"; action: "undo" | "redo" }
  | { kind: "layer"; layer: LayerId; visible: boolean | null; locked: boolean | null }
  | { kind: "label"; entity: string; dx: number; dy: number }
  | { kind: "label_back"; entity: string }
  | { kind: "sheet"; setting: "paper"; value: SurveyDocument["settings"]["paper"] }
  | { kind: "sheet"; setting: "orientation"; value: SurveyDocument["settings"]["orientation"] }
  | { kind: "sheet"; setting: "template"; value: SurveyDocument["settings"]["template"] }
  | { kind: "sheet"; setting: "overleaf" | "faceDimensions" | "slant" | "permitBox"; value: boolean }
  | { kind: "number"; setting: "scale"; value: number | null }
  | { kind: "number"; setting: "perchDecimals" | "secondDecimals" | "distanceDecimals"; value: number }
  | { kind: "lot_add"; lot: Lot }
  | { kind: "lot_edit"; id: string; label?: string; sup?: string; note?: string; points?: string[] }
  | { kind: "road_add"; road: Road }
  | { kind: "adjoining_add"; adjoining: Adjoining }
  | { kind: "feature_add"; feature: DrawingFeature }
  | { kind: "field"; field: AssistField; value: string | boolean }
  | { kind: "note_add"; text: string }
  | { kind: "remove"; target: "lot" | "road" | "adjoining" | "feature"; id: string }
  | { kind: "remove"; target: "note"; index: number }
  | { kind: "answer"; topic: AnswerTopic; lotId: string | null }
  | { kind: "divide"; lotId: string; by: "area" | "width"; count: number | null; values: number[]; unit: "perch" | "m2" | "m" | "ft"; lines: "square" | "parallel" | "through" | null; leg: number | null }
  | { kind: "measure"; mode: "bearings"; rows: { from: string; to: string; bearing: string; distance: string; code: string }[] }
  | { kind: "measure"; mode: "coordinates"; rows: { point: string; n: string; e: string; z: string; code: string }[] }
);

export function tierOf(op: PlanOp): Tier {
  switch (op.kind) {
    case "view":
    case "history":
      return "view";
    case "layer":
    case "label":
    case "label_back":
    case "sheet":
      return "now";
    case "remove":
      return "caution";
    case "answer":
      return "answer";
    case "divide":
    case "measure":
      return "handoff";
    default:
      return "confirm";
  }
}

/** An instruction from an earlier visit, as the project's record keeps it (survey_assistant_turns, v96): for the drawer's history. */
export interface EarlierTurn {
  id: string;
  words: string;
  outcome: "suggested" | "applied" | "discarded" | "failed" | "reverted";
  inputMethod: "voice" | "typed";
  /** When it was given, ISO 8601. */
  at: string;
  /** Read by the local rules rather than the model. */
  local: boolean;
}

/** A question to the surveyor, with choices to tap; choices are words, never figures. */
export interface AssistQuestion {
  text: string;
  choices: string[];
}

/** One turn's outcome once checked: what to do, what was left out and why, and what to ask. */
export interface CheckedTurn {
  say: string;
  ops: PlanOp[];
  dropped: { what: string; why: string }[];
  question: AssistQuestion | null;
  cannot: Extract<AssistOp, { op: "cannot" }>["reason"] | null;
}
