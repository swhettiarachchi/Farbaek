/**
 * Checking a turn (stage 195, ADR 0210): what the model (or the local reader)
 * returned, turned into typed changes, item by item. It runs in the browser
 * for the preview and again on the server.
 *
 * The rules:
 * - Every value comes from the surveyor's own words: its quote must be in the
 *   instruction, word for word, and code reads the value from it.
 * - Point numbers must be the project's; lots, roads and other items must be
 *   on the plan; the picked points are taken in the order picked.
 * - The model's own words carry no figures: a reply with a digit or a number
 *   word is replaced, so every number on screen came from the surveyor or the
 *   engine.
 * - At most 12 steps for a spoken instruction, 30 for a typed one.
 * - Nothing here can touch points, coordinates, the coordinate system, the
 *   approval, who the surveyor is, or the export.
 * Anything that can't be done is left out with the reason, or asked.
 */
import { fold, hasPhrase } from "../ai-draft";
import { legIndex, lotName, type LayerId, type Lot, type SurveyDocument } from "../document";
import type { SurveyPoint } from "../parcel";
import type { RefMap } from "./context";
import { scriptOf } from "./languages";
import { readCoordinateRows, readLegs } from "./measure";
import { type AssistField, type AssistOp, type AssistOutput, type CheckedTurn, type PlanOp } from "./ops";
import { legFacing } from "./sides";
import { numbersExactly, readCount, readDate, readLotName, readNumber, readPointList, readScale, saysNumber } from "./spoken";

export const OP_LIMIT = { voice: 12, typed: 30 } as const;

/** The document's own limits, so a checked change always saves. */
const MAX = { lots: 60, roads: 20, adjoining: 80, features: 300, notes: 10, note: 300, lotNote: 80, roadName: 80, direction: 60, adjoiningText: 200, code: 12 } as const;
const FIELD_MAX: Partial<Record<AssistField, number>> = {
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
  dsDivision: 60,
  boundaryNorth: 200,
  boundaryEast: 200,
  boundarySouth: 200,
  boundaryWest: 200,
  statedExtent: 80,
  statement: 200,
  remarks: 600,
};
const DATE_FIELDS = new Set<AssistField>(["previousPlanDate", "surveyDate", "partitionDate", "planDate"]);
const WHAT: Record<AssistOp["op"], string> = {
  view: "Showing it",
  history: "Undo or redo",
  set_layer: "A layer",
  move_label: "Moving the label",
  set_sheet: "The sheet",
  set_number: "A setting with a number",
  add_lot: "A new lot",
  edit_lot: "Changing a lot",
  add_road: "A road",
  add_adjoining: "An adjoining land",
  add_feature: "A line",
  set_field: "A title field",
  add_note: "A note",
  remove: "Removing it",
  answer: "An answer",
  divide: "Dividing a lot",
  enter_measurements: "Measurements",
  ask: "A question",
  cannot: "Something it can't do",
};
const LABEL_STEP_MM = { slight: 1, some: 3, far: 8 } as const;

export interface CheckInput {
  /** The instruction exactly as sent, digits shown as the surveyor saw them. */
  instruction: string;
  output: AssistOutput;
  doc: SurveyDocument;
  points: readonly SurveyPoint[];
  /** Entity ids picked on the sheet, in order. */
  selection: readonly string[];
  refs: RefMap;
  inputMethod: "voice" | "typed";
}

/** Number words the digit readers don't read: fractions, ordinals and Sinhala numbers, as whole words. */
const FIGURE_WORDS = new Set([
  "half", "halves", "quarter", "quarters", "third", "thirds", "dozen", "dozens", "score", "first", "second", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth", "tenth", "twice", "thrice", "once", "single", "double", "triple", "pair",
  "බින්දුව", "එක", "එකයි", "එකක්", "දෙක", "දෙකයි", "දෙකක්", "තුන", "තුනයි", "තුනක්", "හතර", "හතරයි", "හතරක්", "පහ", "පහයි", "පහක්", "හය", "හයයි", "හයක්", "හත", "හතයි", "හතක්", "අට", "අටයි", "අටක්", "නවය", "නමය", "නවයයි", "දහය", "දහයයි", "දහයක්", "විස්ස", "තිහ", "හතළිහ", "පනහ", "සියය", "සියයක්", "දහස", "දහසක්", "ලක්ෂය", "දශම", "භාගය", "බාගය", "පළමු", "දෙවන", "තුන්වන",
]);

/** Whether model text carries a figure: a digit in any script, a number word, a fraction or ordinal, or a Sinhala number word. */
export function hasFigure(text: string): boolean {
  if (/\p{N}/u.test(text) || saysNumber(text)) return true;
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{M}]+/u)
    .some((w) => FIGURE_WORDS.has(w));
}

/** Text as written, for matching quotes that carry values: case, runs of spaces and quotation marks aside. Punctuation stays, since "1-5" and "1, 5" read differently. */
function asWritten(s: string): string {
  return s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/ ([,;])/g, "$1")
    .trim();
}

/** Whether the quote is in the instruction as written, at word edges (a closing full stop or comma on the quote aside). */
export function writtenIn(instruction: string, quote: string): boolean {
  const q = asWritten(quote).replace(/[.,;!?]+$/, "");
  if (fold(q).length < 2) return false;
  const t = asWritten(instruction);
  const edge = (c: string | undefined) => c === undefined || !/[\p{L}\p{N}]/u.test(c);
  for (let at = t.indexOf(q); at >= 0; at = t.indexOf(q, at + 1)) if (edge(t[at - 1]) && edge(t[at + q.length])) return true;
  return false;
}

/** The words that name each layer, so a layer change needs its layer in the words. */
const LAYER_WORDS: Record<LayerId, RegExp> = {
  BOUNDARY: /\bboundar/i,
  POINTS: /\bpoints?\b|\bcorners?\b/i,
  POINT_NUMBERS: /\bnumbers?\b/i,
  DIMENSIONS: /\bdimensions?\b|\bbearings?\b|\bdistances?\b/i,
  LOT_TEXT: /\blabels?\b|\bnames?\b|\blot text\b/i,
  BOUNDARY_MARKS: /\bmarks?\b|\bsymbols?\b/i,
  BUILDINGS: /\bbuildings?\b|\bhouses?\b/i,
  WALLS: /\bwalls?\b/i,
  FENCES: /\bfences?\b/i,
  DRAINS: /\bdrains?\b/i,
  ROADS: /\broads?\b/i,
  UTILITIES: /\butilit|\bposts?\b/i,
  ADJOINING: /\badjoin|\bneighbou?rs?\b/i,
  TEXT: /\btext\b|\bnotes?\b/i,
  TITLE: /\btitle\b|\bnorth\b|\bscale bar\b/i,
};
/** The words for each sheet switch. */
const SWITCH_WORDS: Record<"overleaf" | "faceDimensions" | "slant" | "permitBox", RegExp> = {
  overleaf: /\boverleaf\b|\bschedule\b/i,
  faceDimensions: /\bdimensions?\b|\bbearings?\b|\bdistances?\b/i,
  slant: /\bslant|\bangle|\bitalic|\bstraight\b|\bupright\b/i,
  permitBox: /\bpermit\b|\bbox\b/i,
};

const SIDE_WORDS: Record<"north" | "east" | "south" | "west", RegExp> = {
  north: /\bnorth(?:ern)?\b|උතුර/i,
  east: /\beast(?:ern)?\b|නැගෙනහිර/i,
  south: /\bsouth(?:ern)?\b|දකුණ/i,
  west: /\bwest(?:ern)?\b|බටහිර/i,
};

/** The unit a length or area is said in, from the words, or null when none is. */
function unitSaid(text: string): "perch" | "m2" | "m" | "ft" | null {
  const t = text.toLowerCase();
  if (/\b(feet|foot|ft)\b/.test(t)) return "ft";
  if (/\b(perch|perches|p)\b/.test(t)) return "perch";
  if (/\b(square met(?:re|er)s?|sq ?m|m2|m²)/.test(t)) return "m2";
  if (/\b(met(?:re|er)s?|m)\b/.test(t)) return "m";
  return null;
}

export function checkTurn(input: CheckInput): CheckedTurn {
  const { instruction, doc, points } = input;
  const out: PlanOp[] = [];
  const dropped: { what: string; why: string }[] = [];
  let question: CheckedTurn["question"] = null;
  let cannot: CheckedTurn["cannot"] = null;
  const byNumber = new Map(points.map((p) => [p.pointId, p]));
  const byId = new Map(points.map((p) => [p.id, p]));
  const known = new Set(byNumber.keys());
  // Quotes are matched as written, punctuation included, so a quote can't read differently from the words it came from.
  const said = (q: string) => q.trim() !== "" && writtenIn(instruction, q);
  // A value with a figure in it must be written as said too; plain words (a name, a note) match whole words, folded.
  const from = (value: string, quote: string) =>
    value.trim() !== "" && said(quote) && (/\p{N}/u.test(value) ? writtenIn(quote, value) || writtenIn(instruction, value) : hasPhrase(quote, value) || hasPhrase(instruction, value));
  /** A lot's name from the words. A one-letter name needs the word "lot" with it, so "add a lot" never names lot A. */
  const lotNameSaid = (label: string, quote: string) => {
    if (!from(label, quote)) return null;
    const name = readLotName(label);
    if (!name) return null;
    if (fold(label).length < 2 && !hasPhrase(instruction, `lot ${label}`) && !hasPhrase(instruction, `allotment ${label}`)) return null;
    return name;
  };
  /**
   * Whether the surveyor's words name this lot, or it's picked on the sheet and the words say "this". The whole instruction counts,
   * since the model may quote only part of it. Words in other scripts are left to the card.
   */
  const namesLot = (lot: Lot) => {
    const words = instruction;
    if (scriptOf(words) !== "en") return true;
    if (input.selection.includes(`lot:${lot.id}`) && /\b(this|that|it|selected|picked)\b/i.test(words)) return true;
    return [...words.matchAll(/\b(?:lot|allotment)s?\s+([a-z0-9]+(?:\s+(?:superscript\s+|sup\s+)?[a-z0-9]+)?)/gi)].some((m) => {
      for (const words of [m[1]!, m[1]!.split(/\s+/)[0]!]) {
        const n = readLotName(words);
        if (n && n.label === lot.label.toUpperCase() && n.sup === lot.sup.toUpperCase()) return true;
      }
      return false;
    });
  };
  const usedIds = new Set([...doc.lots, ...doc.roads, ...doc.adjoining, ...doc.features].map((x) => x.id));
  const newId = (prefix: string) => {
    let n = 1;
    while (usedIds.has(`${prefix}-a${n}`)) n++;
    const id = `${prefix}-a${n}`;
    usedIds.add(id);
    return id;
  };
  const drop = (what: string, why: string) => dropped.push({ what, why });

  /** An entity id from a ref ("L1", "P:12", "selection") or a lot's name ("B1", "lot B1"). */
  const entityOf = (ref: string): string | null => {
    const r = ref.trim();
    if (!r) return null;
    if (r === "selection") return input.selection[0] ?? null;
    if (input.refs[r]) return input.refs[r]!;
    const name = readLotName(r);
    const lot = name ? doc.lots.find((l) => l.label.toUpperCase() === name.label && l.sup.toUpperCase() === name.sup) : null;
    return lot ? `lot:${lot.id}` : null;
  };
  const lotOf = (ref: string): Lot | null => {
    const e = entityOf(ref);
    const id = e?.startsWith("lot:") ? e.slice(4) : e?.startsWith("leg:") ? e.split(":")[1] : null;
    return id ? (doc.lots.find((l) => l.id === id) ?? null) : null;
  };
  /** Point ids from the words or from the points picked on the sheet, in order. */
  const pointsOf = (pq: { from: "words" | "selection" | "none"; quote: string }, what: string, min: number): string[] | null => {
    if (pq.from === "none") {
      drop(what, "No points were said or picked.");
      return null;
    }
    if (pq.from === "selection") {
      const ids = input.selection.filter((e) => e.startsWith("pt:") || e.startsWith("mark:")).map((e) => e.slice(e.indexOf(":") + 1));
      if (ids.length < min) {
        drop(what, min === 1 ? "No point is picked on the sheet. Tap the points first, then say it again." : `It needs at least ${min} points picked on the sheet, in order. Tap them, then say it again.`);
        return null;
      }
      return ids.filter((id) => byId.has(id));
    }
    if (!said(pq.quote)) {
      drop(what, "The points it names aren't in what you said.");
      return null;
    }
    const list = readPointList(pq.quote, known);
    if (!list) {
      drop(what, `"${pq.quote}" doesn't read as a list of point numbers. Say them one by one, or "1 to 5".`);
      return null;
    }
    if (list.unknown.length > 0) {
      drop(what, `${list.unknown.length === 1 ? "Point" : "Points"} ${list.unknown.slice(0, 6).join(", ")} ${list.unknown.length === 1 ? "isn't" : "aren't"} in this project.`);
      return null;
    }
    if (list.ids.length < min) {
      drop(what, `It needs at least ${min} points; ${list.ids.length} ${list.ids.length === 1 ? "was" : "were"} said.`);
      return null;
    }
    return list.ids.map((n) => byNumber.get(n)!.id);
  };

  const limit = OP_LIMIT[input.inputMethod];
  const ops = input.output.ops.slice(0, limit);
  if (input.output.ops.length > limit) drop("The rest of the instruction", `One ${input.inputMethod === "voice" ? "spoken" : "typed"} instruction does at most ${limit} things. Say the rest next.`);
  // Counts as the turn goes, so limits hold across several additions.
  const count = { lots: doc.lots.length, roads: doc.roads.length, adjoining: doc.adjoining.length, features: doc.features.length, notes: doc.notes.length };
  // Lot names as the turn goes, so two new lots can't share one, and a rename can't take another lot's.
  const lotNames = new Set(doc.lots.map((l) => `${l.label.toUpperCase()}|${l.sup.toUpperCase()}`));

  for (const op of ops) {
    const r = checkOne(op);
    if (r) out.push(r);
  }

  function checkOne(op: AssistOp): PlanOp | null {
    // Every change needs its own words in the instruction: a change the surveyor didn't ask for never gets through on another's words.
    if ("quote" in op && !said(op.quote)) {
      drop(WHAT[op.op], "Its words aren't in what you said.");
      return null;
    }
    switch (op.op) {
      case "view": {
        const entities: string[] = [];
        if (op.points.from !== "none") {
          const ids = pointsOf(op.points, "Showing the points", 1);
          if (!ids) return null;
          entities.push(...ids.map((id) => `pt:${id}`));
        } else if (op.target) {
          const e = entityOf(op.target);
          if (!e) {
            drop("Showing it", "That isn't on the plan.");
            return null;
          }
          entities.push(e);
        }
        if ((op.action === "focus" || op.action === "select") && entities.length === 0) {
          drop("Showing it", "Say which lot, road or point, or pick it on the sheet.");
          return null;
        }
        return { kind: "view", action: op.action, entities, quote: op.quote };
      }
      case "history":
        if (scriptOf(op.quote) === "en" && !(op.action === "undo" ? /\b(undo|take (?:it|that|this) back|go back|reverse)\b/i : /\b(redo|again|put (?:it|that) back)\b/i).test(op.quote)) {
          drop(op.action === "undo" ? "Undo" : "Redo", `The words don't say to ${op.action} it.`);
          return null;
        }
        return { kind: "history", action: op.action, quote: op.quote };
      case "set_layer": {
        if (op.layer === "TITLE") {
          drop("The north point and title", "The north point, scale bar and title always print, so they can't be hidden.");
          return null;
        }
        const visible = op.visible === "keep" ? null : op.visible === "on";
        const locked = op.locked === "keep" ? null : op.locked === "on";
        if (visible === null && locked === null) return null;
        if (scriptOf(op.quote) === "en" && !LAYER_WORDS[op.layer].test(op.quote)) return dropped.push({ what: "A layer", why: "The words don't name that layer." }), null;
        return { kind: "layer", layer: op.layer, visible, locked, quote: op.quote };
      }
      case "move_label": {
        const e = entityOf(op.target);
        if (!e) {
          drop("Moving the label", "Pick the label on the sheet first, or say whose label it is.");
          return null;
        }
        if (scriptOf(op.quote) === "en" && !new RegExp(`\\b${op.direction}\\b`, "i").test(op.quote) && !(op.direction === "back" && /\b(reset|put back|restore)\b/i.test(op.quote)))
          return dropped.push({ what: "Moving the label", why: `The words don't say ${op.direction}.` }), null;
        if (op.direction === "back") return { kind: "label_back", entity: e, quote: op.quote };
        const mm = LABEL_STEP_MM[op.amount];
        const [dx, dy] = op.direction === "left" ? [-mm, 0] : op.direction === "right" ? [mm, 0] : op.direction === "up" ? [0, -mm] : [0, mm];
        return { kind: "label", entity: e, dx, dy, quote: op.quote };
      }
      case "set_sheet": {
        const v = op.value.trim().toLowerCase();
        if (op.setting === "paper") {
          const paper = v === "auto" || v === "automatic" ? "auto" : (["A4", "A3", "A2"] as const).find((p) => p.toLowerCase() === v);
          if (!paper) return dropped.push({ what: "The paper", why: "Farbaek prints on A4, A3 or A2, or picks the paper itself." }), null;
          // The paper's name must be in the words: "zoom in" never changes it.
          if (paper === "auto" ? !/\b(auto|automatic|automatically|best)\b/i.test(op.quote) : !new RegExp(`(?<![\\p{L}\\p{N}])${paper}(?![\\p{N}])`, "iu").test(op.quote))
            return dropped.push({ what: "The paper", why: `The words don't name ${paper === "auto" ? "automatic paper" : paper}.` }), null;
          return { kind: "sheet", setting: "paper", value: paper, quote: op.quote };
        }
        if (op.setting === "orientation") {
          if (v !== "portrait" && v !== "landscape") return dropped.push({ what: "The orientation", why: "Say portrait or landscape." }), null;
          if (scriptOf(op.quote) === "en" && !new RegExp(`\\b${v}\\b`, "i").test(op.quote)) return dropped.push({ what: "The orientation", why: `The words don't say ${v}.` }), null;
          return { kind: "sheet", setting: "orientation", value: v, quote: op.quote };
        }
        if (op.setting === "template") {
          if (v !== "classic" && v !== "panel") return dropped.push({ what: "The layout", why: "The layouts are classic and panel." }), null;
          return { kind: "sheet", setting: "template", value: v, quote: op.quote };
        }
        const on = ["on", "yes", "true", "show"].includes(v) ? true : ["off", "no", "false", "hide"].includes(v) ? false : null;
        if (on === null) return null;
        if (scriptOf(op.quote) === "en" && !SWITCH_WORDS[op.setting].test(op.quote)) return dropped.push({ what: "The sheet", why: "The words don't name that part of the sheet." }), null;
        return { kind: "sheet", setting: op.setting, value: on, quote: op.quote };
      }
      case "set_number": {
        if (!said(op.quote)) {
          drop("A setting with a number", "The number isn't in what you said.");
          return null;
        }
        if (op.setting === "scale") {
          // A scale is said as one: the word scale or a written ratio. "points 1 to 500" is never a scale.
          if (scriptOf(op.quote) === "en" && !/\bscale\b|(?<![\p{L}\p{N}.])1\s*[:/]\s*\d/iu.test(op.quote)) {
            drop("The scale", "Say the scale as a scale, such as \"scale 1:500\".");
            return null;
          }
          const s = readScale(op.quote);
          if (!s) {
            drop("The scale", `"${op.quote}" doesn't read as a scale between 1:50 and 1:100,000.`);
            return null;
          }
          return { kind: "number", setting: "scale", value: s.scale, quote: op.quote };
        }
        // Which decimals: the words must say so (perches, seconds or distances), so one setting's number never lands on another.
        const which = op.setting === "perchDecimals" ? /\bperch/i : op.setting === "secondDecimals" ? /\bsecond/i : /\b(distance|length|metre|meter)/i;
        if (scriptOf(op.quote) === "en" && !(/\b(decimal|place|digit)/i.test(op.quote) && which.test(op.quote))) {
          drop("The decimals", "Say which decimals, such as \"two decimals for distances\".");
          return null;
        }
        const n = readNumber(op.quote.replace(/\b(perch(?:es)?|seconds?|distances?|lengths?|met(?:re|er)s?)\b/gi, " "));
        const range = op.setting === "perchDecimals" ? [0, 4] : op.setting === "secondDecimals" ? [0, 2] : [2, 4];
        if (!n || !Number.isInteger(n.value) || n.value < range[0]! || n.value > range[1]!) {
          drop("The decimals", `Say a whole number from ${range[0]} to ${range[1]}.`);
          return null;
        }
        return { kind: "number", setting: op.setting, value: n.value, quote: op.quote };
      }
      case "add_lot": {
        const name = lotNameSaid(op.label, op.quote);
        if (!name) {
          drop("A new lot", "Its name (such as lot B1) isn't clear in what you said.");
          return null;
        }
        const label = `Lot ${name.label}${name.sup}`;
        if (lotNames.has(`${name.label}|${name.sup}`)) {
          drop(label, `${label} is already on the plan. Say "change ${label.toLowerCase()}" to change it.`);
          return null;
        }
        if (count.lots >= MAX.lots) return dropped.push({ what: label, why: `A plan holds ${MAX.lots} lots.` }), null;
        const ids = pointsOf(op.corners, label, 3);
        if (!ids) return null;
        const note = op.note && from(op.note, op.quote) ? op.note.trim().slice(0, MAX.lotNote) : "";
        count.lots++;
        lotNames.add(`${name.label}|${name.sup}`);
        return { kind: "lot_add", lot: { id: newId("lot"), label: name.label, sup: name.sup, points: ids, note }, quote: op.quote };
      }
      case "edit_lot": {
        const lot = lotOf(op.target);
        if (!lot) {
          drop("Changing a lot", "That lot isn't on the plan.");
          return null;
        }
        const what = `Lot ${lotName(lot)}`;
        if (!namesLot(lot)) return dropped.push({ what, why: `The words don't name lot ${lotName(lot)}.` }), null;
        if (op.change === "label") {
          const name = lotNameSaid(op.label, op.quote);
          if (!name) return dropped.push({ what, why: "The new name isn't clear in what you said." }), null;
          const key = `${name.label}|${name.sup}`;
          if (lotNames.has(key) && key !== `${lot.label.toUpperCase()}|${lot.sup.toUpperCase()}`) return dropped.push({ what, why: `Lot ${name.label}${name.sup} is already on the plan.` }), null;
          lotNames.delete(`${lot.label.toUpperCase()}|${lot.sup.toUpperCase()}`);
          lotNames.add(key);
          return { kind: "lot_edit", id: lot.id, label: name.label, sup: name.sup, quote: op.quote };
        }
        if (op.change === "note") {
          if (!from(op.note, op.quote)) return dropped.push({ what, why: "The note isn't in what you said." }), null;
          return { kind: "lot_edit", id: lot.id, note: op.note.trim().slice(0, MAX.lotNote), quote: op.quote };
        }
        const ids = pointsOf(op.corners, what, 3);
        if (!ids) return null;
        return { kind: "lot_edit", id: lot.id, points: ids, quote: op.quote };
      }
      case "add_road": {
        if (count.roads >= MAX.roads) return dropped.push({ what: "A road", why: `A plan holds ${MAX.roads} roads.` }), null;
        const name = op.name && from(op.name, op.quote) ? op.name.trim().slice(0, MAX.roadName) : "";
        const what = name ? `The road ${name}` : "A road";
        const a = pointsOf(op.edgeA, `${what}, one edge`, 2);
        if (!a) return null;
        const b = pointsOf(op.edgeB, `${what}, the other edge`, 2);
        if (!b) return null;
        const text = (t: string) => (t && from(t, op.quote) ? t.trim().slice(0, MAX.direction) : "");
        count.roads++;
        return { kind: "road_add", road: { id: newId("road"), name, edgeA: a, edgeB: b, width: op.width, start: text(op.start), end: text(op.end) }, quote: op.quote };
      }
      case "add_adjoining": {
        if (!from(op.text, op.quote)) {
          drop("An adjoining land", "What it says isn't in what you said.");
          return null;
        }
        const text = op.text.trim().slice(0, MAX.adjoiningText);
        const named = op.lot ? lotOf(op.lot) : null;
        const lot = named && namesLot(named) ? named : doc.lots.length === 1 ? doc.lots[0]! : null;
        if (!lot) return dropped.push({ what: `"${text}"`, why: "Say which lot it adjoins." }), null;
        if (op.side && op.leg.from === "none" && !SIDE_WORDS[op.side].test(op.quote)) return dropped.push({ what: `"${text}"`, why: `The words don't say it's on the ${op.side}.` }), null;
        if (count.adjoining >= MAX.adjoining) return dropped.push({ what: `"${text}"`, why: `A plan holds ${MAX.adjoining} adjoining lands.` }), null;
        let leg: [string, string] | null = null;
        if (op.leg.from !== "none") {
          const ids = pointsOf(op.leg, `"${text}"`, 2);
          if (!ids) return null;
          if (ids.length !== 2 || legIndex(lot, ids[0]!, ids[1]!) < 0) return dropped.push({ what: `"${text}"`, why: `Those two points aren't one leg of lot ${lotName(lot)}.` }), null;
          leg = [ids[0]!, ids[1]!];
        } else if (op.side) {
          const ring = lot.points.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
          const f = ring.length === lot.points.length ? legFacing(ring, op.side) : null;
          if (!f) return dropped.push({ what: `"${text}"`, why: `No leg of lot ${lotName(lot)} faces ${op.side}.` }), null;
          if ("candidates" in f) {
            const name = (i: number) => `from ${ring[i]!.pointId} to ${ring[(i + 1) % ring.length]!.pointId}`;
            question = { text: `Two legs of lot ${lotName(lot)} face ${op.side} about equally. Which one does "${text}" adjoin?`, choices: f.candidates.slice(0, 4).map(name) };
            return null;
          }
          leg = [lot.points[f.leg]!, lot.points[(f.leg + 1) % lot.points.length]!];
        } else return dropped.push({ what: `"${text}"`, why: "Say which side it's on (north, east, south or west), or the two points of its leg." }), null;
        count.adjoining++;
        return { kind: "adjoining_add", adjoining: { id: newId("adj"), text, lot: lot.id, from: leg[0], to: leg[1] }, quote: op.quote };
      }
      case "add_feature": {
        if (count.features >= MAX.features) return dropped.push({ what: "A line", why: `A plan holds ${MAX.features} lines.` }), null;
        const ids = pointsOf(op.points, "A line", op.closed ? 3 : 2);
        if (!ids) return null;
        const code = op.code && from(op.code, op.quote) ? op.code.trim().slice(0, MAX.code) : "";
        count.features++;
        return { kind: "feature_add", feature: { id: newId("f"), layer: op.layer, code, closed: op.closed && ids.length >= 3, points: ids }, quote: op.quote };
      }
      case "set_field": {
        const what = `The title's ${op.field}`;
        if (op.field === "previousPlanMine") {
          if (!said(op.quote) || !/\b(my own|mine|i made|i surveyed|by me)\b/i.test(op.quote)) return dropped.push({ what, why: "Say that the earlier plan is your own." }), null;
          return { kind: "field", field: op.field, value: !/\b(?:not|never|no|neither|nor)\b|n['’]t\b/i.test(op.quote), quote: op.quote };
        }
        if (op.field === "operation") {
          const v = op.quote.toLowerCase();
          const kind = /\bsub ?divi/.test(v) ? "subdivision" : /\bamalgamat/.test(v) ? "amalgamation" : /\bre ?survey/.test(v) ? "resurvey" : null;
          if (!kind || !said(op.quote)) return dropped.push({ what: "The kind of survey", why: "Say resurvey, subdivision or amalgamation." }), null;
          return { kind: "field", field: op.field, value: kind, quote: op.quote };
        }
        if (!from(op.value, op.quote)) {
          drop(what, "That value isn't in what you said, so it wasn't filled in.");
          return null;
        }
        if (DATE_FIELDS.has(op.field)) {
          const iso = readDate(op.value);
          if (!iso) return dropped.push({ what, why: `"${op.value}" isn't a whole date with day, month and year.` }), null;
          return { kind: "field", field: op.field, value: iso, quote: op.quote };
        }
        const max = FIELD_MAX[op.field] ?? 80;
        if (op.value.trim().length > max) return dropped.push({ what, why: `It's longer than ${max} characters.` }), null;
        return { kind: "field", field: op.field, value: op.value.trim(), quote: op.quote };
      }
      case "add_note": {
        if (!from(op.text, op.quote)) return dropped.push({ what: "A note", why: "Its words aren't in what you said." }), null;
        if (count.notes >= MAX.notes) return dropped.push({ what: "A note", why: `A plan holds ${MAX.notes} notes.` }), null;
        count.notes++;
        return { kind: "note_add", text: op.text.trim().slice(0, MAX.note), quote: op.quote };
      }
      case "remove": {
        const e = entityOf(op.target);
        const [kind, ...rest] = (e ?? "").split(":");
        const id = rest.join(":");
        const lot = kind === "lot" ? doc.lots.find((l) => l.id === id) : undefined;
        if (lot) return namesLot(lot) ? { kind: "remove", target: "lot", id, quote: op.quote } : (dropped.push({ what: `Removing lot ${lotName(lot)}`, why: `The words don't name lot ${lotName(lot)}.` }), null);
        const road = kind === "road" ? doc.roads.find((r) => r.id === id) : undefined;
        if (road) {
          const named = scriptOf(op.quote) !== "en" || /\b(road|lane|path|street|way|access)\b/i.test(op.quote) || (road.name.trim() !== "" && hasPhrase(op.quote, road.name));
          return named ? { kind: "remove", target: "road", id, quote: op.quote } : (dropped.push({ what: "Removing a road", why: "The words don't name the road." }), null);
        }
        if (kind === "adjoining" && doc.adjoining.some((a) => a.id === id)) return { kind: "remove", target: "adjoining", id, quote: op.quote };
        if (kind === "feature" && doc.features.some((f) => f.id === id)) return { kind: "remove", target: "feature", id, quote: op.quote };
        if (kind === "note" && Number(id) < doc.notes.length) return { kind: "remove", target: "note", index: Number(id), quote: op.quote };
        if (kind === "pt") return dropped.push({ what: "Removing a point", why: "Surveyed points can't be removed: they're the record of the survey." }), null;
        return dropped.push({ what: "Removing it", why: "That isn't on the plan, or can't be removed." }), null;
      }
      case "answer": {
        const lot = op.target ? lotOf(op.target) : null;
        return { kind: "answer", topic: op.topic, lotId: lot?.id ?? null, quote: "" };
      }
      case "divide": {
        const named = op.lot ? lotOf(op.lot) : null;
        const lot = named && namesLot(named) ? named : doc.lots.length === 1 ? doc.lots[0]! : null;
        if (!lot) return dropped.push({ what: "Dividing a lot", why: "Say which lot to divide." }), null;
        const parts = op.count && from(op.count, op.quote) ? readCount(op.count) : null;
        // The values must read whole: one that reads two ways stops the division rather than go missing.
        const read = op.values && from(op.values, op.quote) ? numbersExactly(op.values) : [];
        if (read === null) return dropped.push({ what: `Dividing lot ${lotName(lot)}`, why: `"${op.values}" doesn't read one way only. Say each value on its own.` }), null;
        const values = read.map((n) => n.value).filter((v) => v > 0);
        // "2 lots of 20": a number before "lots" is how many, not a size.
        const counted = [...op.values.matchAll(/(\S+)\s+(?:equal\s+)?(?:lots|parts|shares|plots|blocks)\b/gi)].some((m) => readNumber(m[1]!) !== null);
        if ((parts !== null || counted) && values.length > 0) {
          question = { text: `Should lot ${lotName(lot)} be divided into equal lots, or into lots of the sizes you said?`, choices: ["Equal lots", "The sizes I said"] };
          return null;
        }
        if (op.by === "width" && values.length === 0) {
          question = { text: `How wide should the strip along lot ${lotName(lot)} be? Say it in feet or metres.`, choices: [] };
          return null;
        }
        if (op.by === "area" && parts === null && values.length === 0) {
          question = { text: `Into how many lots should lot ${lotName(lot)} be divided, or what areas?`, choices: [] };
          return null;
        }
        // The unit comes from the words, never from the model alone, and must fit what's divided: a width in feet or metres, an area
        // in perches or square metres.
        const fits = (u: string | null): u is "perch" | "m2" | "m" | "ft" => (op.by === "width" ? u === "m" || u === "ft" : u === "perch" || u === "m2");
        const spoken = unitSaid(op.values) ?? unitSaid(op.quote);
        if (values.length > 0 && !fits(spoken)) {
          question = op.by === "width" ? { text: `Is the width in feet or metres?`, choices: ["feet", "metres"] } : { text: `Are the areas in perches or square metres?`, choices: ["perches", "square metres"] };
          return null;
        }
        const unit = fits(spoken) ? spoken : op.by === "width" ? "m" : "perch";
        let leg: number | null = null;
        if (op.side) {
          const ring = lot.points.map((id) => byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
          const f = ring.length === lot.points.length ? legFacing(ring, op.side) : null;
          if (f && "leg" in f) leg = f.leg;
          else if (f && "candidates" in f) leg = f.candidates[0]!;
        }
        return { kind: "divide", lotId: lot.id, by: op.by, count: parts, values, unit, lines: op.lines || null, leg, quote: op.quote };
      }
      case "enter_measurements": {
        if (!said(op.quote)) return dropped.push({ what: "Measurements", why: "They aren't in what you said." }), null;
        if (op.mode === "bearings") {
          const r = readLegs(op.quote);
          r.problems.forEach((p) => drop("A leg", p));
          return r.rows.length ? { kind: "measure", mode: "bearings", rows: r.rows, quote: op.quote } : null;
        }
        const r = readCoordinateRows(op.quote);
        r.problems.forEach((p) => drop("A point", p));
        return r.rows.length ? { kind: "measure", mode: "coordinates", rows: r.rows, quote: op.quote } : null;
      }
      case "ask":
        if (!question && op.question.trim() && !hasFigure(op.question)) question = { text: op.question.trim().slice(0, 300), choices: op.choices.filter((c) => c.trim() && !hasFigure(c)).slice(0, 4).map((c) => c.trim().slice(0, 80)) };
        return null;
      case "cannot":
        cannot = op.reason;
        return null;
    }
  }

  const say = input.output.say.trim();
  return { say: say && !hasFigure(say) ? say.slice(0, 300) : "", ops: out, dropped, question, cannot };
}
