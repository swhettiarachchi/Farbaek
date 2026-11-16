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
import type { AssistField, AssistOp, AssistOutput } from "./ops";

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

/**
 * A piece of the plain form as the original wrote it, punctuation and case kept ("points 1 2 and 3" is "points 1, 2 and 3"), since
 * quotes are checked as written. The piece is returned unchanged when it can't be found, and the check then leaves it out.
 */
function asSaid(original: string, piece: string): string {
  const words = piece
    .split(" ")
    .filter(Boolean)
    // Only the characters with a meaning in a pattern are escaped: with the u flag, escaping anything else (such as a hyphen) is an error.
    .map((w) => w.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&"));
  if (words.length === 0) return piece;
  const m = new RegExp(`(?<![\\p{L}\\p{N}])${words.join("[\\s.!?,;]+")}(?![\\p{L}\\p{N}])`, "iu").exec(original.normalize("NFKC"));
  return m ? m[0] : piece;
}
const none = { from: "none" as const, quote: "" };

/** Sinhala command words, matched on the whole instruction (after trimming). */
const SINHALA: [RegExp, (quote: string) => ReadResult][] = [
  [/^(?:හරි|ඔව්|යොදන්න|යොදන්න හරි)$/, () => ({ kind: "control", control: "apply" })],
  [/^(?:එපා|නැහැ|අවලංගු කරන්න)$/, () => ({ kind: "control", control: "discard" })],
  [/^(?:නවත්වන්න|ඇති)$/, () => ({ kind: "control", control: "stop" })],
  [/^(?:සුරකින්න)$/, () => ({ kind: "control", control: "save" })],
  [/^(?:ආපසු(?: හරවන්න)?)$/, (q) => out([{ op: "history", action: "undo", quote: q }])],
  [/^(?:විශාල කරන්න)$/, (q) => out([{ op: "view", action: "zoom_in", target: "", points: none, quote: q }])],
  [/^(?:කුඩා කරන්න)$/, (q) => out([{ op: "view", action: "zoom_out", target: "", points: none, quote: q }])],
  [/^(?:මුළු පිටුවම?|සම්පූර්ණ පිටුව)$/, (q) => out([{ op: "view", action: "whole_sheet", target: "", points: none, quote: q }])],
  [/^(?:මුළු )?(?:වර්ගඵලය|ප්‍රමාණය)(?: කීයද)?$/, () => out([{ op: "answer", topic: "total_area", target: "" }])],
];

/** Reads an instruction by the fixed rules; null when it isn't one of them. `original` is the instruction as sent, for quotes. */
export function readCommand(original: string): ReadResult {
  const t = plainCommand(original);
  if (!t) return null;
  // Dictated measurements first: their commas and "then"s belong to the field book, not to separate instructions.
  const measured = readMeasurements(original, t);
  if (measured) return measured;
  return readClauses(original) ?? readOne(original);
}

/**
 * Several instructions in one ("village Udugampola, district Gampaha"; "A3 landscape and hide the point numbers"): read only when
 * every part reads by the rules on its own, so "north by land of A and B" or "points 1, 2 and 3" stay whole.
 */
function readClauses(original: string): ReadResult {
  const kept = original.normalize("NFKC").toLowerCase().replace(/[.!?]+/g, " ").replace(/\s+/g, " ").trim();
  // "Then" and ";" part instructions first, so "add lot B4 from points 1, 2, 3 and 8, then hide the point numbers" keeps its
  // point list whole; each part may itself be several ("village X, district Y").
  const strong = split(kept, /\s*,?\s*(?:;|\band then\b|\bthen\b)\s*/);
  if (strong.length >= 2) {
    const ops: AssistOp[] = [];
    for (const p of strong) {
      const said = asSaid(original, p);
      const r = readClauses(said) ?? readOne(said);
      if (r?.kind !== "output" || r.output.ops.some((o) => o.op === "ask")) return null;
      ops.push(...r.output.ops);
    }
    return out(ops);
  }
  const parts = split(kept, /\s*(?:,|\band\b|&)\s*/);
  if (parts.length < 2) return null;
  const ops: AssistOp[] = [];
  for (const p of parts) {
    const r = readOne(asSaid(original, p));
    if (r?.kind !== "output" || r.output.ops.some((o) => o.op === "ask")) return null;
    ops.push(...r.output.ops);
  }
  return out(ops);
}

/** Parts of an instruction, between the separators; none when there are more than eight. */
function split(text: string, by: RegExp): string[] {
  const parts = text
    .split(by)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length > 8 ? [] : parts;
}

/** Legs ("from 101 to 102 bearing … distance …, then to 103 …") or coordinates ("point 215 northing … easting …"), read by code. */
function readMeasurements(original: string, t: string): ReadResult {
  if (/^(?:from|to|leg|legs|traverse)\b/.test(t) && /\bbearing\b/.test(t) && /\bdistance\b/.test(t)) return out([{ op: "enter_measurements", mode: "bearings", quote: original }]);
  if (/^(?:point|points|station|pt)\b/.test(t) && /\bnorthing\b/.test(t) && /\beasting\b/.test(t)) return out([{ op: "enter_measurements", mode: "coordinates", quote: original }]);
  return null;
}

/** The title fields a surveyor fills in by saying them, as "village Udugampola" or "the plan number is 1234". */
const FIELD_RULES: [RegExp, AssistField][] = [
  [/^(?:(?:set|change|put) )?(?:the )?(?:land(?:'s)? name|name of the land)(?: (?:is|to|as))? (.+)$/, "landName"],
  [/^(?:the )?land is (?:called|named) (.+)$/, "landName"],
  [/^(?:call|name) the land (.+)$/, "landName"],
  [/^(?:(?:set|change|put) )?(?:the )?(?:previous|earlier|old) plan (?:number|no|num)(?: (?:is|to|as))? (.+)$/, "previousPlanNumber"],
  [/^(?:(?:set|change|put) )?(?:the )?plan (?:number|no|num)(?: (?:is|to|as))? (.+)$/, "planNumber"],
  [/^(?:(?:set|change|put) )?(?:the )?village(?: name)?(?: (?:is|to|as))? (.+)$/, "village"],
  [/^(?:(?:set|change|put) )?(?:the )?district(?: (?:is|to|as))? (.+)$/, "district"],
  [/^(?:(?:set|change|put) )?(?:the )?province(?: (?:is|to|as))? (.+)$/, "province"],
  [/^(?:(?:set|change|put) )?(?:the )?pattu(?: (?:is|to|as))? (.+)$/, "pattu"],
  [/^(?:(?:set|change|put) )?(?:the )?korale(?: (?:is|to|as))? (.+)$/, "korale"],
  [/^(?:(?:set|change|put) )?(?:the )?(?:gn|g n|grama niladhari|grama niladari) division(?: (?:is|to|as))? (.+)$/, "gnDivision"],
  [/^(?:(?:set|change|put) )?(?:the )?(?:ds|d s|divisional secretariat|divisional secretary(?:'s)?) division(?: (?:is|to|as))? (.+)$/, "dsDivision"],
  [/^(?:(?:set|change|put) )?(?:the )?(?:survey(?:ed)? date|date of (?:the )?survey)(?: (?:is|to|as))? (.+)$/, "surveyDate"],
  [/^surveyed on (.+)$/, "surveyDate"],
  [/^(?:(?:set|change|put) )?(?:the )?plan date(?: (?:is|to|as))? (.+)$/, "planDate"],
  [/^(?:(?:set|change|put) )?(?:the )?(?:stated extent|deed extent|extent in the deed|extent (?:in|on) the title)(?: (?:is|to|as))? (.+)$/, "statedExtent"],
  [/^(?:the land is )?(?:also called|also known as|alias) (.+)$/, "alias"],
  [/^(?:the land is )?now known as (.+)$/, "nowKnownAs"],
];

/** The instruction read as one, by the rules. */
function readOne(original: string): ReadResult {
  const t = plainCommand(original);
  if (!t) return null;
  for (const [re, make] of SINHALA) if (re.test(t)) return make(original);

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
  const focus = /^(?:zoom to|zoom in on|show me|focus on|go to|find|where is|where are|locate) (lot .+|points? .+)$/.exec(t);
  if (focus) {
    const what = asSaid(original, focus[1]!);
    return /^points? /.test(what) ? out([{ op: "view", action: "focus", target: "", points: { from: "words", quote: what }, quote: what }]) : out([{ op: "view", action: "focus", target: what, points: none, quote: what }]);
  }
  const select = /^select (lot .+|points? .+)$/.exec(t);
  if (select) {
    const what = asSaid(original, select[1]!);
    return /^points? /.test(what) ? out([{ op: "view", action: "select", target: "", points: { from: "words", quote: what }, quote: what }]) : out([{ op: "view", action: "select", target: what, points: none, quote: what }]);
  }

  // Bearings and distances on the face of the plan.
  if (/^(?:show|put|write) (?:the )?(?:dimensions|bearings and distances|bearings|distances)(?: (?:of|on|along) (?:every|each|all(?: the)?|the) (?:boundary )?(?:lines?|legs?|boundaries|plan|sheet))?$/.test(t)) return out([{ op: "set_sheet", setting: "faceDimensions", value: "on", quote: original }]);
  // Layers, one or several ("hide the walls and fences").
  const layer = /^(hide|show|lock|unlock|turn off|turn on|switch off|switch on) (.+?)(?: layers?)?$/.exec(t);
  if (layer) {
    const names = layer[2]!.split(/,? and |, | & /).map((n) => n.trim());
    const which = names.map((n) => LAYERS.find(([re]) => re.test(n))?.[1]);
    if (which.every((w): w is LayerId => Boolean(w))) {
      const verb = layer[1]!;
      const visible = /^(show|turn on|switch on)$/.test(verb) ? "on" : /^(hide|turn off|switch off)$/.test(verb) ? "off" : "keep";
      const locked = verb === "lock" ? "on" : verb === "unlock" ? "off" : "keep";
      return out(which.map((w): AssistOp => ({ op: "set_layer", layer: w, visible, locked, quote: original })));
    }
  }
  // "Show lot B1": after the layers, so "show lot labels" stays a layer.
  const showLot = /^show (lot [a-z0-9]+(?: [a-z0-9]+)?)$/.exec(t);
  if (showLot) return out([{ op: "view", action: "focus", target: asSaid(original, showLot[1]!), points: none, quote: asSaid(original, showLot[1]!) }]);
  // The schedule of boundaries on the back of the sheet.
  const overleaf = /^(show|turn on|include|add|hide|turn off|remove|drop) (?:the )?(?:overleaf|overleaf schedule|boundary schedule|schedule of boundaries|schedule)(?: overleaf| on the back)?$/.exec(t);
  if (overleaf) return out([{ op: "set_sheet", setting: "overleaf", value: /^(show|turn on|include|add)$/.test(overleaf[1]!) ? "on" : "off", quote: original }]);

  // The sheet.
  // Paper sizes as written or as a recogniser writes them said aloud ("a three" for A3).
  const paper = /^(?:(?:prepare|set up|set|make|get|ready) (?:it|this|the plan|the sheet|this plan)? ?(?:up )?for |print (?:it )?on |use |)(a[234]|a (?:two|three|four))(?: paper| printing| sheet| size)?(?: (portrait|landscape))?(?: (?:at|at a scale of|at scale|scale) (1 ?: ?\d[\d,]*|one (?:is )?to .+))?$/.exec(t);
  if (paper) {
    const size = ({ "a two": "A2", "a three": "A3", "a four": "A4" } as Record<string, string>)[paper[1]!] ?? paper[1]!.toUpperCase();
    const ops: AssistOp[] = [{ op: "set_sheet", setting: "paper", value: size, quote: original }];
    if (paper[2]) ops.push({ op: "set_sheet", setting: "orientation", value: paper[2], quote: original });
    if (paper[3]) ops.push({ op: "set_number", setting: "scale", quote: asSaid(original, paper[3]) });
    return out(ops);
  }
  const orient = /^(?:make it |turn it |set it to |turn the sheet |make the sheet |)(portrait|landscape)$/.exec(t);
  if (orient) return out([{ op: "set_sheet", setting: "orientation", value: orient[1]!, quote: original }]);
  if (/^(?:(?:use (?:an? )?|set (?:the )?scale to )?(?:automatic|auto) scale|let (?:farbaek|it) (?:choose|pick) the scale|(?:set (?:the )?)?scale (?:to )?(?:automatic|auto))$/.test(t)) return out([{ op: "set_number", setting: "scale", quote: original }]);
  const scale = /\bscale (?:to |of |at )?(.+)$/.exec(t);
  if (scale && /^(?:set (?:the )?|change (?:the )?|make (?:the )?|use (?:a )?|)scale\b/.test(t)) return out([{ op: "set_number", setting: "scale", quote: asSaid(original, t.slice(t.indexOf("scale"))) }]);
  const template = /^(?:use (?:the )?|switch to (?:the )?|)(classic|panel) (?:layout|template|sheet)$/.exec(t);
  if (template) return out([{ op: "set_sheet", setting: "template", value: template[1]!, quote: original }]);

  // Labels: the picked item's.
  const nudge = /^(?:move|nudge|shift|push) (?:(?:this|the|that) (?:label|text)|it|this|that) (?:(slightly|a little|a bit|a touch|a lot|far|well|more) )?(?:to the |)(left|right|up|down)(?: (slightly|a little|a bit|a touch|a lot|more))?$/.exec(t);
  if (nudge) {
    const how = nudge[1] ?? nudge[3] ?? "";
    const amount = /a lot|far|well/.test(how) ? "far" : /more/.test(how) ? "some" : how ? "slight" : "some";
    return out([{ op: "move_label", target: "selection", direction: nudge[2] as "left", amount, quote: original }]);
  }
  if (/^(?:put (?:the|this|that|it) (?:label |text )?back|reset (?:the |this )?(?:label|text)|move (?:the|this) label back|move it back)$/.test(t)) return out([{ op: "move_label", target: "selection", direction: "back", amount: "some", quote: original }]);

  // Lots: renamed, removed, or given a note. Removing is named in full in its card before anything goes.
  const rename = /^(?:rename|relabel|call|change) (lot [a-z0-9]+(?: [a-z0-9]+)?) (?:to|as|into) (?:lot )?([a-z0-9]+(?: [a-z0-9]+)?)$/.exec(t);
  if (rename) return out([{ op: "edit_lot", target: asSaid(original, rename[1]!), change: "label", label: asSaid(original, rename[2]!), note: "", corners: none, quote: original }]);
  const removeLot = /^(?:delete|remove|erase|take out|get rid of) (lot [a-z0-9]+(?: [a-z0-9]+)?)$/.exec(t);
  if (removeLot) return out([{ op: "remove", target: asSaid(original, removeLot[1]!), quote: original }]);
  // The word before the note ("saying", ":") ends the lot's name, so "lot B1 saying garden" is lot B1, and "lot B one saying" B¹.
  const lotNote = /^(?:add a note to|note on|put a note on|add the note|add note to) (lot [a-z0-9]+(?: [a-z0-9]+)??)(?: saying| that says| reading|:) ?(.+)$/.exec(t);
  if (lotNote) return out([{ op: "edit_lot", target: asSaid(original, lotNote[1]!), change: "note", label: "", note: asSaid(original, lotNote[2]!), corners: none, quote: original }]);

  // Lots from points: said, or picked on the sheet. A lot's name is never made up: without one, the reader asks.
  const picked = /^(?:create|make|add|draw|form) (?:(lot [a-z0-9]+(?: [a-z0-9]+)?)|(?:the |a |an )?(?:new )?(?:boundary|lot|outline|land|parcel)(?: (?:of |for )?(lot [a-z0-9]+(?: [a-z0-9]+)?))?) (?:using|from|through|with|by|joining) (?:these|those|the selected|the picked|the chosen|selected|picked) (?:survey |boundary )?(?:points|marks|corners)(?: (?:as |called |named |call it |name it )?(lot [a-z0-9]+(?: [a-z0-9]+)?))?$/.exec(t);
  if (picked) {
    const name = picked[1] ?? picked[2] ?? picked[3];
    if (!name) return out([{ op: "ask", question: "What should the new lot be called? Say its name, such as lot B.", choices: [] }]);
    return out([{ op: "add_lot", label: asSaid(original, name), corners: { from: "selection", quote: "" }, note: "", quote: original }]);
  }
  const named = /^(?:(?:create|make|add|draw|form) )?(?:a |the )?(?:new )?(lot [a-z0-9]+(?: [a-z0-9]+)?) (?:using|from|through|with|by|joining|on|is) ((?:survey |boundary )?(?:points?|marks|corners) .+|\d[\d ,]*(?:(?:and|to|through) \d+)?)$/.exec(t);
  if (named) return out([{ op: "add_lot", label: asSaid(original, named[1]!), corners: { from: "words", quote: asSaid(original, named[2]!) }, note: "", quote: original }]);

  // An earlier plan with its date: "previous plan number 567 dated 01.02.2019" fills both.
  const earlier = /^(?:the )?(?:previous|earlier|old) plan (?:number |no |num )?(?:is )?(.+?) dated (.+)$/.exec(t);
  if (earlier)
    return out([
      { op: "set_field", field: "previousPlanNumber", value: asSaid(original, earlier[1]!), quote: original },
      { op: "set_field", field: "previousPlanDate", value: asSaid(original, earlier[2]!), quote: original },
    ]);
  // A lot's corners corrected: "change lot B1's corners to 1 2 3 8 7", "the corners of lot B1 are 1, 2, 3, 8 and 7".
  const corners = /^(?:(?:change|set|make|correct) )?(?:the )?(?:corners (?:of|for) (lot [a-z0-9]+(?: [a-z0-9]+)??)|(lot [a-z0-9]+(?: [a-z0-9]+)??)(?:'s)? corners)(?: to| as| are|:) ((?:points? )?\d.+)$/.exec(t);
  if (corners) return out([{ op: "edit_lot", target: asSaid(original, corners[1] ?? corners[2]!), change: "corners", label: "", note: "", corners: { from: "words", quote: asSaid(original, corners[3]!) }, quote: original }]);
  // Lines through points: walls, fences, drains, buildings. "Through", "along" or "joining" a list, or "between" two points; never
  // "from 4 to 6", which in a list of points means 4, 5 and 6.
  const line = /^(?:add|draw|put|show) (?:a |an |the )?(wall|fence|drain|building|house|road edge|road line|line)(?: outline)? (?:through|along|joining|on|around|between) ((?:points? )?\d.+)$/.exec(t);
  if (line && !/\bto\b/.test(line[2]!)) {
    const kind = line[1]!;
    const layer = kind === "wall" ? "WALLS" : kind === "fence" ? "FENCES" : kind === "drain" ? "DRAINS" : kind === "building" || kind === "house" ? "BUILDINGS" : "ROADS";
    return out([{ op: "add_feature", layer, code: "", closed: layer === "BUILDINGS", points: { from: "words", quote: asSaid(original, line[2]!) }, quote: original }]);
  }
  // The title block: "village Udugampola", "plan number 1234", "survey date 12.11.2026". The value is the surveyor's own words.
  for (const [re, field] of FIELD_RULES) {
    const m = re.exec(t);
    if (m) return out([{ op: "set_field", field, value: asSaid(original, m[1]!), quote: original }]);
  }
  // The boundaries in the title: "north by Lot 4 in Plan 1234", "the eastern boundary is a road".
  const bounded = /^(?:the )?(?:bounded )?(?:on the )?(north|east|south|west)(?:ern)?(?:(?: boundary| side)? (?:is )?by|(?: boundary| side) is) (.+)$/.exec(t);
  if (bounded) {
    const field = `boundary${bounded[1]![0]!.toUpperCase()}${bounded[1]!.slice(1)}` as AssistField;
    return out([{ op: "set_field", field, value: asSaid(original, bounded[2]!), quote: original }]);
  }
  // A land beside one lot, written along the leg facing that side: "the land on the north of lot B1 is Lot 4 in Plan 1234",
  // "lot B1 is bounded on the east by a road". The leg is chosen by code from the side.
  // An answer to "which leg?" follows as "between 3 and 8", and names the leg itself.
  const beside =
    /^(?:the )?(?:land|adjoining land|neighbour|neighbor|neighbouring land|neighboring land)(?: on the| to the)? (north|east|south|west) of (lot [a-z0-9]+(?: [a-z0-9]+)??) is (.+?)(?: between (?:points? )?([a-z0-9]+) and ([a-z0-9]+))?$/.exec(t) ??
    null;
  const besideLot = /^(lot [a-z0-9]+(?: [a-z0-9]+)??) is bounded on the (north|east|south|west) by (.+?)(?: between (?:points? )?([a-z0-9]+) and ([a-z0-9]+))?$/.exec(t);
  if (beside || besideLot) {
    const [side, lot, text, a, b] = beside ? [beside[1]!, beside[2]!, beside[3]!, beside[4], beside[5]] : [besideLot![2]!, besideLot![1]!, besideLot![3]!, besideLot![4], besideLot![5]];
    const leg = a && b ? { from: "words" as const, quote: asSaid(original, `between ${a} and ${b}`) } : none;
    return out([{ op: "add_adjoining", text: asSaid(original, text), lot: asSaid(original, lot), side: leg === none ? (side as "north") : "", leg, quote: original }]);
  }
  // A note on the plan: "add a note saying …", "note: …".
  const planNote = /^(?:add (?:a |the )?note|note|put (?:a )?note)(?: on the plan)?(?: saying| that says| reading|:)? (.+)$/.exec(t);
  if (planNote) return out([{ op: "add_note", text: asSaid(original, planNote[1]!), quote: original }]);

  // Dividing: equal lots, or an access strip along one side. The divide panel shows the lines before anything is kept.
  const divide = /^(?:divide|subdivide|split|cut) (lot [a-z0-9]+(?: [a-z0-9]+)?|[a-z]{1,2}\d{1,3}|the land|this land|it|the lot|this lot) (?:into|in) (\S+(?: \S+)??)(?: (?:equal )?(?:lots|parts|shares|plots|blocks|pieces))?$/.exec(t);
  if (divide && divide[2] !== "lots") {
    const lot = /^lot /.test(divide[1]!) ? divide[1]! : /^[a-z]{1,2}\d/.test(divide[1]!) ? divide[1]! : "";
    return out([{ op: "divide", lot: lot ? asSaid(original, lot) : "", by: "area", count: asSaid(original, divide[2]!), values: "", unit: "", lines: "", side: "", quote: original }]);
  }
  // Commas matter here: in "of lot B one, ten feet wide" the comma ends the lot's name. Without one, only a name written with
  // its figure (B3) is taken before a width, so "lot B one ten feet wide" is never read as lot B and a width of "one ten".
  const tc = original.normalize("NFKC").toLowerCase().replace(/[.!?;]+/g, " ").replace(/\s*,\s*/g, ", ").replace(/\s+/g, " ").trim().replace(/,$/, "");
  // The width may come first ("a 10 ft access road along …"), after the road ("a road 3 m wide along …") or last (", ten feet wide").
  const access =
    /^(?:add|make|leave|reserve|provide|keep|give|create|put) (?:an? )?(?:((?:\d[\d.]*|[a-z]+(?: [a-z]+)?) ?(?:ft|feet|foot|m|metres?|meters?)) (?:wide )?)?(?:access )?(?:road|strip|reservation|lane|path|way)(?: ([^,]+?) wide)?,? (?:along|on|by|beside) the (north|east|south|west)(?:ern)?(?: (?:boundary|side|edge))?(?: of (?:(lot [a-z0-9]+(?: [a-z0-9]+)?)(?=,|$)|(lot [a-z]*\d[a-z0-9]*)(?= [^,]+ wide$)))?(?:,? (?!of |boundary\b|side\b|edge\b)([^,]+?) wide)?(?: (?:in )?(feet|foot|ft|metres?|meters?))?$/.exec(
      tc,
    );
  if (access) {
    // The unit is read from the words by the check; an answer to "feet or metres?" may follow the width.
    const width = access[1] ?? access[2] ?? access[6] ?? "";
    const lot = access[4] ?? access[5] ?? "";
    return out([{ op: "divide", lot: lot ? asSaid(original, lot) : "", by: "width", count: "", values: width ? asSaid(original, width) : "", unit: "", lines: "parallel", side: access[3] as "east", quote: original }]);
  }

  // Questions the engine answers.
  // What the assistant never does, said at once with where it's done: approving and signing (the surveyor's alone), exports, the
  // coordinate system, and surveyed points.
  if (/^(?:approve|sign|certify|stamp)(?: it| this| the plan| this plan| the sheet)?(?: for me)?$/.test(t)) return out([{ op: "cannot", reason: "approval" }]);
  if (/^(?:export|download|make|create|save)(?: it| the plan| this plan)?(?: (?:as|to) )?(?: ?(?:a |the )?(?:pdf|dxf|cad file|geojson))$|^export(?: it| the plan)?$/.test(t)) return out([{ op: "cannot", reason: "export" }]);
  if (/^(?:change|set|switch|use) (?:the )?(?:coordinate system|crs|grid|datum)\b/.test(t)) return out([{ op: "cannot", reason: "crs" }]);
  if (/^(?:move|shift|change|edit|delete|remove) (?:the )?(?:coordinates? of )?points? [a-z0-9]+/.test(t) && !/label/.test(t)) return out([{ op: "cannot", reason: "points" }]);
  // "Extent" is what Sri Lankan plans call the area; the answer gives hectares, acres, roods and perches, and square metres.
  if (
    /^(?:what(?:'s| is) (?:the )?(?:total )?(?:land )?(?:area|extent)(?: of (?:the|this) land)?(?: in (?:perches|acres|roods|hectares|square met(?:re|er)s))?|calculate (?:the )?(?:total )?(?:land )?(?:area|extent)|how big is (?:the|this) land|how many (?:perches|acres) (?:is it|is the land)|(?:the )?total (?:area|extent)|area|extent)$/.test(t)
  )
    return out([{ op: "answer", topic: "total_area", target: "" }]);
  const lotArea = /^(?:what(?:'s| is) )?(?:the )?(?:area|extent) of (lot .+)$/.exec(t);
  if (lotArea) return out([{ op: "answer", topic: "lot_area", target: lotArea[1]! }]);
  if (/^(?:what(?:'s| are) )?(?:the )?(?:lot areas|lot extents|(?:areas|extents) of (?:the|each|every) lots?)$/.test(t)) return out([{ op: "answer", topic: "lot_area", target: "" }]);
  if (/^(?:what(?:'s| is) )?(?:the )?perimeter$/.test(t)) return out([{ op: "answer", topic: "perimeter", target: "" }]);
  if (/^(?:what(?:'s| is) (?:missing|left|still needed)|what else (?:is needed|do i need)|is (?:it|the plan) (?:finished|complete|ready)(?: for approval| to approve)?|can i approve (?:it|the plan|this)|ready for approval)$/.test(t)) return out([{ op: "answer", topic: "missing", target: "" }]);
  if (/^(?:what (?:stops|blocks) (?:approval|export|it)|any (?:problems|errors|issues)|are there any (?:problems|errors|issues)|what do the checks say|(?:run|show) (?:the )?checks|check (?:the plan|it|this))$/.test(t)) return out([{ op: "answer", topic: "checks", target: "" }]);
  if (/^(?:(?:add|show|put in|draw|insert|where is) )?(?:the |a )?north (?:arrow|point)$/.test(t)) return out([{ op: "answer", topic: "always_printed", target: "" }]);
  if (/^(?:what(?:'s| is) the scale(?: of (?:the|this) (?:plan|sheet))?|which scale(?: is it)?|what scale is (?:it|the plan|this|the sheet))$/.test(t)) return out([{ op: "answer", topic: "scale", target: "" }]);
  return null;
}
