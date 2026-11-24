/**
 * Proposals from the sketch, put on the plan as items the surveyor confirms one by one (stage 241, ADR 0249). Each is marked as read
 * from a photo (`ai_photo`, not reviewed), so the plan's checks hold approval until it's confirmed, corrected or removed, like
 * anything else the AI filled. Nothing already on the plan is replaced: a line the plan already draws through the same points isn't
 * added again, and the sketch's lot is added only to a plan without lots. Positions all come from the survey's points.
 */
import type { SurveyDocument } from "../document";
import type { Proposal, SketchInterpretation } from "./interpret";

/**
 * The id of what a proposal puts on the plan: from what it is (its kind and surveyed points, `itemId`), never from where the reader
 * listed it, so a later read can't take an earlier item's id, and the plan's checks find its evidence again.
 */
export const sketchItemId = (p: Proposal) => p.id;

/** Whether the sheet can print a text: its fonts hold no Indic letters (Sinhala, Tamil, U+0900 to U+0DFF) yet. */
export const printable = (text: string) => ![...text].some((ch) => ch.codePointAt(0)! >= 0x900 && ch.codePointAt(0)! <= 0xdff);

/** A text cut to a length, never through the middle of a character written as two halves. */
const cut = (text: string, max: number) => {
  const c = text.slice(0, max);
  const last = c.charCodeAt(c.length - 1);
  return last >= 0xd800 && last <= 0xdbff ? c.slice(0, -1) : c;
};

/** The plan's symbols at most, as its schema holds them. */
const MAX_SYMBOLS = 200;

export interface Applied {
  document: SurveyDocument;
  added: { key: string; kind: Proposal["kind"] }[];
  skipped: string[];
}

/** The same points in the same order, either way round: how a line already on the plan is recognised. */
export const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && (a.every((x, i) => x === b[i]) || a.every((x, i) => x === b[b.length - 1 - i]));

/** `lotReplaces`: the sketch's own lot was just taken off by a correction (ADR 0257), so its corrected lot goes on beside any other. */
export function applySketch(doc: SurveyDocument, interpretation: SketchInterpretation, opts: { lotReplaces?: boolean } = {}): Applied {
  const next: SurveyDocument = structuredClone(doc);
  const added: Applied["added"] = [];
  const skipped: string[] = [];
  const mark = (key: string, kind: Proposal["kind"]) => {
    next.provenance[key] = { source: "ai_photo", reviewed: false };
    added.push({ key, kind });
  };
  // Any item already on the plan under the same id is the same thing (the id comes from what it is): never added twice.
  const taken = new Set([...next.lots.map((l) => l.id), ...next.features.map((f) => f.id), ...(next.symbols ?? []).map((x) => x.id), ...next.roads.map((r) => r.id)]);
  for (const p of interpretation.proposals) {
    const id = sketchItemId(p);
    if (taken.has(id)) {
      skipped.push(p.kind === "symbol" ? `The ${p.meaning.toLowerCase()} at point ${p.point.pointId} is already on the plan.` : p.kind === "lot" ? "The sketch's lot is already on the plan." : p.kind === "road" ? "The sketch's road is already on the plan." : `The line through ${p.points.map((x) => x.pointId).join(", ")} is already on the plan.`);
      continue;
    }
    taken.add(id);
    if (p.kind === "lot") {
      if (next.lots.length > 0 && !opts.lotReplaces) {
        skipped.push("The sketch's lot wasn't added: the plan already has lots.");
        continue;
      }
      next.lots.push({ id, label: p.label, sup: "", points: p.corners.map((c) => c.id), note: "" });
      mark(`lot:${id}`, "lot");
    } else if (p.kind === "line" || p.kind === "building") {
      const pts = p.points.map((x) => x.id);
      if (next.features.some((f) => f.id === id || (f.code === p.code && same(f.points, pts)))) {
        skipped.push(`The line through ${p.points.map((x) => x.pointId).join(", ")} is already on the plan.`);
        continue;
      }
      if (next.features.length >= 200) {
        skipped.push("The plan holds 200 lines, its most.");
        continue;
      }
      next.features.push({
        id,
        layer: p.kind === "building" ? "BUILDINGS" : p.layer,
        code: p.code,
        closed: p.kind === "building" ? true : p.closed,
        points: pts,
        ...(p.kind === "line" && p.arcs.length > 0 ? { arcs: p.arcs } : {}),
        ...(p.kind === "line" && p.dashed ? { dashed: true } : {}),
      });
      mark(`feature:${id}`, p.kind);
    } else if (p.kind === "road") {
      const sides = new Set([...p.edgeA, ...p.edgeB].map((x) => x.id));
      if (next.roads.some((r) => [...r.edgeA, ...r.edgeB].filter((x) => sides.has(x)).length >= 2)) {
        skipped.push("The sketch's road is already on the plan, along the same sides.");
        continue;
      }
      // A road between two surveyed sides (stage 243): its width is worked out from them and written in feet, as on most Sri Lankan plans.
      if (next.roads.length >= 20) {
        skipped.push("The plan holds 20 roads, its most.");
        continue;
      }
      next.roads.push({ id, name: printable(p.name) ? cut(p.name, 80) : "", edgeA: p.edgeA.map((x) => x.id), edgeB: p.edgeB.map((x) => x.id), width: "feet", start: "", end: "" });
      mark(`road:${id}`, "road");
    } else {
      const symbols = next.symbols ?? [];
      if (symbols.some((s) => s.point === p.point.id && s.code === p.code)) {
        skipped.push(`The ${p.meaning.toLowerCase()} at point ${p.point.pointId} is already on the plan.`);
        continue;
      }
      if (symbols.length >= MAX_SYMBOLS) {
        skipped.push(`The plan holds ${MAX_SYMBOLS} symbols, its most.`);
        continue;
      }
      next.symbols = [...symbols, { id, code: p.code, point: p.point.id }];
      mark(`symbol:${id}`, "symbol");
    }
  }
  return { document: next, added, skipped };
}

/**
 * The plan without what an earlier sketch read drew that nobody has confirmed or changed since (stage 256): what a new read replaces.
 * Anything the surveyor confirmed, edited or drew is theirs and stays; so do the lots, lines and symbols that never came from a sketch.
 * The labels moved by hand for what goes go with it.
 */
export function withoutWaitingSketchItems(doc: SurveyDocument): SurveyDocument {
  const next: SurveyDocument = structuredClone(doc);
  const waiting = (key: string) => next.provenance[key]?.source === "ai_photo" && next.provenance[key]?.reviewed === false;
  const gone: string[] = [];
  const keep = <T extends { id: string }>(xs: readonly T[], prefix: string, touched: (x: T) => boolean = () => false) =>
    xs.filter((x) => {
      const key = `${prefix}:${x.id}`;
      if (!waiting(key) || touched(x)) return true;
      gone.push(key);
      return false;
    });
  // A lot the surveyor has named, noted or given its neighbours is theirs, though they haven't yet pressed that it looks right.
  next.lots = keep(next.lots, "lot", (l) => Boolean(l.label.trim() || l.note.trim()) || next.adjoining.some((a) => a.lot === l.id));
  next.features = keep(next.features, "feature");
  next.roads = keep(next.roads, "road");
  if (next.symbols) {
    const symbols = keep(next.symbols, "symbol");
    if (symbols.length > 0) next.symbols = symbols;
    else delete next.symbols;
  }
  const lots = new Set(next.lots.map((l) => l.id));
  if (next.sheet.extractOf && !lots.has(next.sheet.extractOf)) next.sheet.extractOf = "";
  for (const key of gone) {
    delete next.provenance[key];
    const id = key.slice(key.indexOf(":") + 1);
    for (const label of Object.keys(next.labelOffsets)) if (label.endsWith(`:${id}`)) delete next.labelOffsets[label];
  }
  return next;
}
