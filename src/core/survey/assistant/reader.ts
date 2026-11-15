/**
 * The drafting assistant's local reader (stage 195): frequent, unambiguous
 * instructions read by fixed rules, at once, free, offline and in the demo.
 * It returns the same shape as the model, so the same checks apply; or a
 * conversation control (apply, discard, stop listening...). Anything it
 * doesn't recognise goes to the model.
 *
 * English, and a first set of Sinhala command words. The Sinhala words are
 * common ones (විශාල කරන්න "make larger", සුරකින්න "save") and wait for a
 * review by surveyors who work in Sinhala (docs/survey/ASSISTANT.md).
 */
import type { LayerId } from "../document";
import type { AssistOp, AssistOutput } from "./ops";

export type Control = "apply" | "discard" | "stop" | "save" | "readback" | "goto";
export const STEP_IDS = ["import", "points", "draft", "boundary", "plan", "check", "export", "history", "settings"] as const;
export type StepId = (typeof STEP_IDS)[number];

export type ReadResult = { kind: "control"; control: Control; step?: StepId } | { kind: "output"; output: AssistOutput } | null;

const LAYERS: [RegExp, LayerId][] = [
  [/^(?:the )?(?:point numbers|numbers)$/, "POINT_NUMBERS"],
  [/^(?:the )?(?:corner points|points)$/, "POINTS"],
  [/^(?:the )?(?:dimensions|bearings and distances|bearings|distances)$/, "DIMENSIONS"],
  [/^(?:the )?(?:lot labels|lot names|lot text)$/, "LOT_TEXT"],
  [/^(?:the )?(?:boundary marks|marks)$/, "BOUNDARY_MARKS"],
  [/^(?:the )?(?:boundary|boundaries|boundary lines)$/, "BOUNDARY"],
  [/^(?:the )?(?:buildings|houses)$/, "BUILDINGS"],
  [/^(?:the )?walls$/, "WALLS"],
  [/^(?:the )?fences$/, "FENCES"],
  [/^(?:the )?drains$/, "DRAINS"],
  [/^(?:the )?roads$/, "ROADS"],
  [/^(?:the )?(?:utilities|posts)$/, "UTILITIES"],
  [/^(?:the )?(?:adjoining lands|adjoining|neighbours|neighbors)$/, "ADJOINING"],
  [/^(?:the )?text$/, "TEXT"],
];

const STEP_WORDS: Record<string, StepId> = { import: "import", points: "points", draft: "draft", lots: "boundary", boundary: "boundary", plan: "plan", sheet: "plan", check: "check", checks: "check", export: "export", history: "history", settings: "settings" };

/** Lower case, punctuation and polite openings gone, single spaces: "Please, zoom in!" is "zoom in". */
export function plainCommand(text: string): string {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[.!?,;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^(?:(?:please|ok|okay|now|so|and|hey|could you|can you|would you|will you|i want to|i'd like to|let's|lets)\s+)+/, "")
    .replace(/\s+(?:please|now|for me)$/, "")
    .trim();
}

const out = (ops: AssistOp[], say = ""): ReadResult => ({ kind: "output", output: { say, ops } });
const none = { from: "none" as const, quote: "" };

/** Sinhala command words, matched on the whole instruction (after trimming). */
const SINHALA: [RegExp, () => ReadResult][] = [
  [/^(?:හරි|ඔව්|යොදන්න|යොදන්න හරි)$/, () => ({ kind: "control", control: "apply" })],
  [/^(?:එපා|නැහැ|අවලංගු කරන්න)$/, () => ({ kind: "control", control: "discard" })],
  [/^(?:නවත්වන්න|ඇති)$/, () => ({ kind: "control", control: "stop" })],
  [/^(?:සුරකින්න)$/, () => ({ kind: "control", control: "save" })],
  [/^(?:ආපසු(?: හරවන්න)?)$/, () => out([{ op: "history", action: "undo", quote: "" }])],
  [/^(?:විශාල කරන්න)$/, () => out([{ op: "view", action: "zoom_in", target: "", points: none, quote: "" }])],
  [/^(?:කුඩා කරන්න)$/, () => out([{ op: "view", action: "zoom_out", target: "", points: none, quote: "" }])],
  [/^(?:මුළු පිටුවම?|සම්පූර්ණ පිටුව)$/, () => out([{ op: "view", action: "whole_sheet", target: "", points: none, quote: "" }])],
  [/^(?:මුළු )?(?:වර්ගඵලය|ප්‍රමාණය)(?: කීයද)?$/, () => out([{ op: "answer", topic: "total_area", target: "" }])],
];

/** Reads an instruction by the fixed rules; null when it isn't one of them. `original` is the instruction as sent, for quotes. */
export function readCommand(original: string): ReadResult {
  const t = plainCommand(original);
  if (!t) return null;
  for (const [re, make] of SINHALA) if (re.test(t)) return make();

  // Conversation controls.
  if (/^(?:apply|apply (?:it|that|them|this|the changes?|all)|yes(?: apply)?|confirm|go ahead|do it|looks (?:good|right)|that's right|correct)$/.test(t)) return { kind: "control", control: "apply" };
  if (/^(?:discard|discard (?:it|that|this)|cancel|no|never ?mind|scrap that|forget it)$/.test(t)) return { kind: "control", control: "discard" };
  if (/^(?:stop listening|stop|that's all|that is all|we're done|done for now|goodbye|bye)$/.test(t)) return { kind: "control", control: "stop" };
  if (/^(?:save|save (?:it|this|the plan|a version|the version|version))$/.test(t)) return { kind: "control", control: "save" };
  if (/^(?:read (?:it|that|them) back|repeat(?: that)?|say (?:it|that) again)$/.test(t)) return { kind: "control", control: "readback" };
  const go = /^(?:go to|open|show me) (?:the )?(\w+)(?: step| page)?$/.exec(t);
  if (go && STEP_WORDS[go[1]!] && !["plan", "sheet"].includes(go[1]!)) return { kind: "control", control: "goto", step: STEP_WORDS[go[1]!] };

  // History and the view.
  if (/^(?:undo|undo (?:it|that|the last (?:change|step))|take (?:it|that) back)$/.test(t)) return out([{ op: "history", action: "undo", quote: original }]);
  if (/^(?:redo|redo (?:it|that))$/.test(t)) return out([{ op: "history", action: "redo", quote: original }]);
  if (/^(?:zoom in|closer|enlarge|bigger|zoom closer)$/.test(t)) return out([{ op: "view", action: "zoom_in", target: "", points: none, quote: original }]);
  if (/^(?:zoom out|further out|smaller|zoom further)$/.test(t)) return out([{ op: "view", action: "zoom_out", target: "", points: none, quote: original }]);
  if (/^(?:(?:show )?(?:the )?whole (?:sheet|plan|page)|fit|zoom to fit|fit (?:the )?(?:sheet|plan)|show everything|zoom all)$/.test(t)) return out([{ op: "view", action: "whole_sheet", target: "", points: none, quote: original }]);
  if (/^(?:clear (?:the )?selection|deselect(?: all)?|select nothing|unselect(?: all)?)$/.test(t)) return out([{ op: "view", action: "clear_selection", target: "", points: none, quote: original }]);
  const focus = /^(?:zoom to|zoom in on|show me|focus on|go to|find) (lot .+|points? .+)$/.exec(t);
  if (focus) {
    const what = focus[1]!;
    return /^points? /.test(what) ? out([{ op: "view", action: "focus", target: "", points: { from: "words", quote: what }, quote: what }]) : out([{ op: "view", action: "focus", target: what, points: none, quote: what }]);
  }
  const select = /^select (lot .+|points? .+)$/.exec(t);
  if (select) {
    const what = select[1]!;
    return /^points? /.test(what) ? out([{ op: "view", action: "select", target: "", points: { from: "words", quote: what }, quote: what }]) : out([{ op: "view", action: "select", target: what, points: none, quote: what }]);
  }

  // Layers.
  const layer = /^(hide|show|lock|unlock|turn off|turn on|switch off|switch on) (.+?)(?: layer)?$/.exec(t);
  if (layer) {
    const which = LAYERS.find(([re]) => re.test(layer[2]!))?.[1];
    // "Show the dimensions" means on the sheet's face too.
    if (which === "DIMENSIONS" && /^(show|turn on|switch on)$/.test(layer[1]!)) return out([{ op: "set_sheet", setting: "faceDimensions", value: "on", quote: original }]);
    if (which) {
      const verb = layer[1]!;
      const visible = /^(show|turn on|switch on)$/.test(verb) ? "on" : /^(hide|turn off|switch off)$/.test(verb) ? "off" : "keep";
      const locked = verb === "lock" ? "on" : verb === "unlock" ? "off" : "keep";
      return out([{ op: "set_layer", layer: which, visible, locked, quote: original }]);
    }
  }
  if (/^show (?:the )?dimensions (?:of|on) (?:every|each|all(?: the)?) (?:boundary )?(?:lines?|legs?)$/.test(t)) return out([{ op: "set_sheet", setting: "faceDimensions", value: "on", quote: original }]);

  // The sheet.
  const paper = /^(?:(?:prepare|set up|set|make|get|ready) (?:it|this|the plan|the sheet|this plan)? ?(?:up )?for |print on |use |)(a[234])(?: paper| printing| sheet| size)?(?: (portrait|landscape))?$/.exec(t);
  if (paper) {
    const ops: AssistOp[] = [{ op: "set_sheet", setting: "paper", value: paper[1]!.toUpperCase(), quote: original }];
    if (paper[2]) ops.push({ op: "set_sheet", setting: "orientation", value: paper[2], quote: original });
    return out(ops);
  }
  const orient = /^(?:make it |turn it |set it to |)(portrait|landscape)$/.exec(t);
  if (orient) return out([{ op: "set_sheet", setting: "orientation", value: orient[1]!, quote: original }]);
  const scale = /\bscale (?:to |of |at )?(.+)$/.exec(t);
  if (scale && /^(?:set (?:the )?|change (?:the )?|make (?:the )?|use (?:a )?|)scale\b/.test(t)) return out([{ op: "set_number", setting: "scale", quote: t.slice(t.indexOf("scale")) }]);
  const template = /^(?:use (?:the )?|switch to (?:the )?|)(classic|panel) (?:layout|template|sheet)$/.exec(t);
  if (template) return out([{ op: "set_sheet", setting: "template", value: template[1]!, quote: original }]);

  // Labels: the picked item's.
  const nudge = /^move (?:this|the|that) (?:label|text) (?:(slightly|a little|a bit|a touch|a lot|far|well|more) )?(?:to the |)(left|right|up|down)(?: (slightly|a little|a bit|a lot))?$/.exec(t);
  if (nudge) {
    const how = nudge[1] ?? nudge[3] ?? "";
    const amount = /a lot|far|well/.test(how) ? "far" : /more/.test(how) ? "some" : how ? "slight" : "some";
    return out([{ op: "move_label", target: "selection", direction: nudge[2] as "left", amount, quote: original }]);
  }
  if (/^(?:put (?:the|this|that) (?:label|text) back|reset (?:the |this )?(?:label|text)|move (?:the|this) label back)$/.test(t)) return out([{ op: "move_label", target: "selection", direction: "back", amount: "some", quote: original }]);

  // Questions the engine answers.
  if (/^(?:what(?:'s| is) (?:the )?(?:total )?(?:land )?area|calculate (?:the )?(?:total )?(?:land )?area|how big is (?:the|this) land|(?:the )?total area|area)$/.test(t)) return out([{ op: "answer", topic: "total_area", target: "" }]);
  const lotArea = /^(?:what(?:'s| is) )?(?:the )?area of (lot .+)$/.exec(t);
  if (lotArea) return out([{ op: "answer", topic: "lot_area", target: lotArea[1]! }]);
  if (/^(?:what(?:'s| are) )?(?:the )?(?:lot areas|areas of (?:the|each|every) lots?)$/.test(t)) return out([{ op: "answer", topic: "lot_area", target: "" }]);
  if (/^(?:what(?:'s| is) )?(?:the )?perimeter$/.test(t)) return out([{ op: "answer", topic: "perimeter", target: "" }]);
  if (/^(?:what(?:'s| is) (?:missing|left|still needed)|what else (?:is needed|do i need)|is (?:it|the plan) (?:finished|complete|ready))$/.test(t)) return out([{ op: "answer", topic: "missing", target: "" }]);
  if (/^(?:what (?:stops|blocks) (?:approval|export|it)|any problems|what do the checks say|(?:run|show) (?:the )?checks)$/.test(t)) return out([{ op: "answer", topic: "checks", target: "" }]);
  if (/^(?:add|show|put in|draw) (?:the |a )?north (?:arrow|point)$/.test(t)) return out([{ op: "answer", topic: "always_printed", target: "" }]);
  if (/^(?:what(?:'s| is) the scale|which scale)$/.test(t)) return out([{ op: "answer", topic: "scale", target: "" }]);
  return null;
}
