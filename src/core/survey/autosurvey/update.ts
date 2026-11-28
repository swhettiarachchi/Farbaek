/**
 * New points on a plan already drawn (stage 306, ADR 0311). A surveyor comes back with more: a corner missed, the far edge of the road, a
 * wall shot the next day. The plan is updated where the new points change it, and nowhere else:
 *
 * - **Lines from the field codes.** A line the codes now draw differently (a wall that gains points) is redrawn while it still waits for
 *   the surveyor; one they confirmed or edited stays as it is, and is named. A line the new points add is drawn. A line the surveyor took
 *   off isn't drawn again: only what the codes draw now and didn't before is added.
 * - **The lot and the road** drawn from the boundary marks and road edges: redrawn from the new marks while they wait and haven't been
 *   edited; named when confirmed. A plan with no lot gets one when the marks now make one.
 * - **What the sketch draws**, worked out again with the new points (a number on the sketch that now has its point): only what that
 *   changes is redrawn, as a correction is (`redrawFromCorrection`).
 * - **The survey date** a new file states, when the plan has none.
 *
 * Nothing here moves a point or changes anything the surveyor confirmed: those are said, for the surveyor to redraw if they want.
 */
import { inwardCorners, isBoundaryMark, outlineFrom, roadEdges } from "../autodraft";
import { entryFor, lookupCode } from "../codes";
import { legIndex, type DrawingFeature, type Lot, type SurveyDocument } from "../document";
import { suggestFeatures, type SuggestedFeature } from "../fieldToFinish";
import { GRAMMAR } from "../grammar";
import type { SurveyPoint } from "../parcel";
import { roadWidth } from "../roads";
import { redrawFromCorrection } from "../sketchintel/correct";
import type { FileRead } from "./start";
import { interpretDocument } from "../sketchintel/findings";

/** What a plan holds at most, as the automatic draft draws it (autodraft.ts). */
const LIMITS = { featurePoints: 500, features: 300, lotPoints: 500, roadPoints: 200 } as const;

export interface PlanUpdate {
  document: SurveyDocument;
  /** Provenance keys of what was drawn. */
  added: string[];
  /** Provenance keys of what was taken off to be redrawn. */
  removed: string[];
  /** What the new points bear on that the surveyor confirmed or edited, in words: left as it is. */
  kept: string[];
  /** What was done, in words, for the summary. */
  said: string[];
}

const listed = (ids: readonly string[]) => (ids.length <= 1 ? (ids[0] ?? "") : ids.length <= 6 ? `${ids.slice(0, -1).join(", ")} and ${ids.at(-1)}` : `${ids.slice(0, 5).join(", ")} and ${ids.length - 5} more`);
const waiting = (doc: SurveyDocument, key: string) => doc.provenance[key]?.source === "auto" && doc.provenance[key]?.reviewed === false;
const lineKey = (f: Pick<DrawingFeature, "code" | "points">) => `${f.code}|${f.points.join(",")}`;

/**
 * The plan updated for points added to it: `before` the points it was drawn with, `after` those and the new ones. Only what the new
 * points change is redrawn; anything the surveyor confirmed or edited stays, and is said.
 */
export function updateForNewPoints(doc: SurveyDocument, before: readonly SurveyPoint[], after: readonly SurveyPoint[], surveyDate: string | null = null): PlanUpdate {
  let next: SurveyDocument = structuredClone(doc);
  const added: string[] = [];
  const removed: string[] = [];
  const kept: string[] = [];
  const said: string[] = [];
  const known = new Set(before.map((p) => p.id));
  const fresh = after.filter((p) => !known.has(p.id));
  if (fresh.length === 0) return { document: next, added, removed, kept, said };

  // Lines from the field codes: what the codes drew before and draw now.
  const grammar = GRAMMAR[doc.grammar ?? "farbaek"];
  const was = new Map(suggestFeatures(before, doc.codes, grammar).map((s) => [lineKey(s), s] as const));
  const now = new Map(suggestFeatures(after, doc.codes, grammar).map((s) => [lineKey(s), s] as const));
  const meaningOf = (s: Pick<SuggestedFeature, "code">) => (lookupCode(doc.codes, s.code)?.meaning ?? s.code).toLowerCase();
  // A line the surveyor confirmed, edited or took off that the codes now draw longer stays as it is, and its longer line isn't drawn.
  const held: SuggestedFeature[] = [];
  for (const [key, s] of was) {
    if (now.has(key)) continue;
    const f = next.features.find((x) => lineKey(x) === key);
    if (!f) {
      // Taken off or edited by the surveyor (stage 306 review): never drawn again, longer or not.
      held.push(s);
      continue;
    }
    const k = `feature:${f.id}`;
    if (waiting(next, k)) {
      next.features = next.features.filter((x) => x.id !== f.id);
      delete next.provenance[k];
      removed.push(k);
    } else {
      held.push(s);
      kept.push(`The ${meaningOf(s)} line through ${listed(s.pointNumbers)} runs on with the new points, but you confirmed or changed it, so it stays as it is. Redraw it on the Lots step if it should take them in.`);
    }
  }
  const grows = (s: SuggestedFeature) => held.some((h) => h.code === s.code && h.points.every((p) => s.points.includes(p)));
  const have = new Set(next.features.map(lineKey));
  const ids = new Set(next.features.map((f) => f.id));
  let n = 0;
  const drawnLines: SuggestedFeature[] = [];
  for (const [key, s] of now) {
    if (was.has(key) || have.has(key) || grows(s) || s.points.length > LIMITS.featurePoints || next.features.length >= LIMITS.features) continue;
    let id: string;
    do id = `f-auto-${++n}`;
    while (ids.has(id));
    ids.add(id);
    next.features.push({ id, layer: s.layer, code: s.code, closed: s.closed, points: s.points, ...(s.arcs ? { arcs: s.arcs } : {}) });
    next.provenance[`feature:${id}`] = { source: "auto", reviewed: false };
    added.push(`feature:${id}`);
    drawnLines.push(s);
  }
  if (drawnLines.length > 0) said.push(`${drawnLines.length} ${drawnLines.length === 1 ? "line" : "lines"} from the field codes drawn: ${drawnLines.map((s) => `the ${meaningOf(s)} through ${listed(s.pointNumbers)}`).join("; ")}.`);

  // The lot through the boundary marks.
  const marks = (pts: readonly SurveyPoint[]) => pts.filter((p) => isBoundaryMark(entryFor(doc.codes, p.code)));
  const newMarks = fresh.filter((p) => isBoundaryMark(entryFor(doc.codes, p.code)));
  if (newMarks.length > 0) {
    const old = marks(before).length > LIMITS.lotPoints ? null : outlineFrom(marks(before));
    const outline = marks(after).length > LIMITS.lotPoints ? null : outlineFrom(marks(after));
    const lot = next.lots.find((l) => l.id === "lot-1");
    const ring = outline?.ring.map((p) => p.id) ?? [];
    // A lot the surveyor took off isn't drawn again: only when the marks first make one (stage 306 review).
    const losesSide = (ids: readonly string[]) => next.adjoining.some((a) => a.lot === "lot-1" && legIndex({ points: ids as string[] }, a.from, a.to) < 0);
    if (next.lots.length === 0 && outline && !old) {
      const made: Lot = { id: "lot-1", label: "1", sup: "", note: "", points: ring };
      next.lots = [made];
      next.provenance["lot:lot-1"] = { source: "auto", reviewed: false };
      added.push("lot:lot-1");
      said.push(`Lot 1 drawn through ${ring.length} boundary marks (${listed(outline.ring.map((p) => p.pointId))}).${inwardSaid(outline.ring)}`);
    } else if (lot && outline && old && lot.points.join() === old.ring.map((p) => p.id).join() && ring.join() !== lot.points.join() && waiting(next, "lot:lot-1") && losesSide(ring)) {
      kept.push(`Lot ${lot.label || "1"} would take the new boundary ${newMarks.length === 1 ? "mark" : "marks"} ${listed(newMarks.map((p) => p.pointId))}, but a neighbour you named lies beside a side that would go, so it stays as it is. Redraw it on the Lots step.`);
    } else if (lot && outline && old && lot.points.join() === old.ring.map((p) => p.id).join() && ring.join() !== lot.points.join() && waiting(next, "lot:lot-1")) {
      lot.points = ring;
      added.push("lot:lot-1");
      said.push(`Lot ${lot.label || "1"} redrawn through the new boundary ${newMarks.length === 1 ? "mark" : "marks"} ${listed(newMarks.map((p) => p.pointId))}: now ${ring.length} corners.${inwardSaid(outline.ring)}`);
    } else {
      const outside = newMarks.filter((p) => !next.lots.some((l) => l.points.includes(p.id)));
      if (outside.length > 0 && next.lots.length > 0) kept.push(`New boundary ${outside.length === 1 ? "mark" : "marks"} ${listed(outside.map((p) => p.pointId))} ${outside.length === 1 ? "isn't" : "aren't"} on any lot. The lots were confirmed, changed or drawn otherwise, so they stay: add ${outside.length === 1 ? "it" : "them"} on the Lots step if ${outside.length === 1 ? "it's a corner" : "they're corners"}.`);
    }
  }

  // The road between the road edges.
  const edges = roadEdges(after);
  const oldEdges = roadEdges(before);
  const road = next.roads.find((r) => r.id === "road-1");
  const freshEdge = edges && [...edges[0], ...edges[1]].some((p) => !known.has(p.id));
  if (edges && freshEdge && edges[0].length <= LIMITS.roadPoints && edges[1].length <= LIMITS.roadPoints) {
    const width = roadWidth(edges[0], edges[1]);
    const plausible = width && width.minM >= 1 && width.maxM <= 60;
    const same = (ids: readonly string[], pts: readonly SurveyPoint[] | undefined) => !!pts && ids.join() === pts.map((p) => p.id).join();
    if (!road && next.roads.length === 0 && plausible && !oldEdges) {
      next.roads = [{ id: "road-1", name: "", edgeA: edges[0].map((p) => p.id), edgeB: edges[1].map((p) => p.id), width: "feet", start: "", end: "" }];
      next.provenance["road:road-1"] = { source: "auto", reviewed: false };
      added.push("road:road-1");
      said.push(`A road drawn between its surveyed edges, ${width.minM.toFixed(2)} to ${width.maxM.toFixed(2)} m wide.`);
    } else if (road && plausible && waiting(next, "road:road-1") && same(road.edgeA, oldEdges?.[0]) && same(road.edgeB, oldEdges?.[1])) {
      road.edgeA = edges[0].map((p) => p.id);
      road.edgeB = edges[1].map((p) => p.id);
      added.push("road:road-1");
      said.push(`The road redrawn with its new edge points: ${width.minM.toFixed(2)} to ${width.maxM.toFixed(2)} m wide.`);
    } else if (road) kept.push("New road-edge points were added, but the road was confirmed or changed, so it stays as it is. Redraw it on the Lots step if it should change.");
  }

  // What the sketch draws, with the new points: only what that changes.
  if (next.sketch) {
    const r = redrawFromCorrection(next, interpretDocument(next, before), interpretDocument(next, after));
    next = r.document;
    if (r.added.length + r.removed.length > 0) said.push(`From the sketch, with the new points: ${r.added.length} ${r.added.length === 1 ? "item" : "items"} drawn, ${r.removed.length} taken off to be redrawn, each waiting for you.`);
    added.push(...r.added);
    removed.push(...r.removed);
    if (r.kept.length > 0) kept.push(`${r.kept.length} ${r.kept.length === 1 ? "item" : "items"} you confirmed would be drawn differently from the sketch with the new points, and ${r.kept.length === 1 ? "stays" : "stay"} as ${r.kept.length === 1 ? "it is" : "they are"}.`);
  }

  if (surveyDate && !next.sheet.surveyDate.trim()) {
    next.sheet.surveyDate = surveyDate;
    next.provenance["sheet.surveyDate"] = { source: "auto", reviewed: false };
    added.push("sheet.surveyDate");
    said.push(`The survey date, ${surveyDate}, as the new file states it.`);
  }
  return { document: next, added, removed, kept, said };
}

const inwardSaid = (ring: readonly SurveyPoint[]) => {
  const inward = inwardCorners(ring);
  return inward.length > 0 ? ` Check the inward ${inward.length === 1 ? "corner" : "corners"} at ${listed(inward)}: a corner of the land, or a mark inside it?` : "";
};

/** A point number already in the plan that a new file gives somewhere else, or with another height or code. */
export interface PointConflict {
  pointId: string;
  /** How far apart the two places are, on the grid. */
  metres: number;
  /** What else differs. */
  differs: ("height" | "code")[];
}

type PlanPoint = Pick<SurveyPoint, "pointId" | "e" | "n" | "z" | "code">;

/**
 * The points a new file gives that the plan already has under the same number somewhere else, or with another height or code: points are
 * never changed once imported, so each is said, and the file isn't added. Read as the start screen reads files together (stage 252):
 * within half a millimetre is the same place, and a file without heights or codes (every height 0, no codes) says nothing about them.
 * Anything else the plan has under that number is a repeat, imported as the plan has it (`asThePlanHasThem`).
 */
export function pointConflicts(have: readonly PlanPoint[], read: Pick<FileRead, "points">): PointConflict[] {
  const byNumber = new Map(have.map((p) => [p.pointId, p]));
  const heights = read.points.some((p) => p.z !== null && p.z !== 0);
  const codes = read.points.some((p) => (p.code ?? "").trim() !== "");
  const out = new Map<string, PointConflict>();
  for (const q of read.points) {
    const p = byNumber.get(q.pointId);
    if (!p || out.has(q.pointId)) continue;
    const differs: PointConflict["differs"] = [];
    if (heights && q.z !== null && p.z !== null && Math.abs(p.z - q.z) >= SAME_PLACE_M) differs.push("height");
    if (codes && (q.code ?? "").trim() !== "" && (p.code ?? "").trim() !== "" && (q.code ?? "").trim() !== (p.code ?? "").trim()) differs.push("code");
    const metres = Math.hypot(p.e - q.e, p.n - q.n);
    if (Math.abs(p.e - q.e) >= SAME_PLACE_M || Math.abs(p.n - q.n) >= SAME_PLACE_M || differs.length > 0) out.set(q.pointId, { pointId: q.pointId, metres, differs });
  }
  return [...out.values()];
}

/** A file's points to import: those the plan already has exactly as it has them, so the database keeps each once and changes none. */
export function asThePlanHasThem<P extends { pointId: string; e: number; n: number; z: number | null; code?: string | null }>(have: readonly PlanPoint[], points: readonly P[]): P[] {
  const byNumber = new Map(have.map((p) => [p.pointId, p]));
  return points.map((q) => {
    const p = byNumber.get(q.pointId);
    return p ? { ...q, e: p.e, n: p.n, z: p.z, code: p.code } : q;
  });
}

/** Where two files put the same point number within half a millimetre: the same place (start.ts). */
const SAME_PLACE_M = 0.0005;

/** A conflict in words, with what to do. */
export function conflictSaid(c: PointConflict): string {
  const where = c.metres >= 0.0005 ? `${c.metres.toFixed(3)} m from where the plan has it` : "at the same place";
  const what = c.differs.length > 0 ? `, with ${c.differs.map((d) => (d === "height" ? "another height" : "another code")).join(" and ")}` : "";
  return `Point ${c.pointId} is already in this plan; this file gives it ${where}${what}.`;
}
