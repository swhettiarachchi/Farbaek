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

/** The plan's symbols at most, as its schema holds them. */
const MAX_SYMBOLS = 200;

export interface Applied {
  document: SurveyDocument;
  added: { key: string; kind: Proposal["kind"] }[];
  skipped: string[];
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && (a.every((x, i) => x === b[i]) || a.every((x, i) => x === b[b.length - 1 - i]));

export function applySketch(doc: SurveyDocument, interpretation: SketchInterpretation): Applied {
  const next: SurveyDocument = structuredClone(doc);
  const added: Applied["added"] = [];
  const skipped: string[] = [];
  const mark = (key: string, kind: Proposal["kind"]) => {
    next.provenance[key] = { source: "ai_photo", reviewed: false };
    added.push({ key, kind });
  };
  // Any item already on the plan under the same id is the same thing (the id comes from what it is): never added twice.
  const taken = new Set([...next.lots.map((l) => l.id), ...next.features.map((f) => f.id), ...(next.symbols ?? []).map((x) => x.id)]);
  for (const p of interpretation.proposals) {
    const id = sketchItemId(p);
    if (taken.has(id)) {
      skipped.push(p.kind === "symbol" ? `The ${p.meaning.toLowerCase()} at point ${p.point.pointId} is already on the plan.` : p.kind === "lot" ? "The sketch's lot is already on the plan." : `The line through ${p.points.map((x) => x.pointId).join(", ")} is already on the plan.`);
      continue;
    }
    taken.add(id);
    if (p.kind === "lot") {
      if (next.lots.length > 0) {
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
      });
      mark(`feature:${id}`, p.kind);
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
