/**
 * The block-out plan (stage 193, UDA regulation 8): one lot's division drawn
 * as a classic sheet, to submit or show before the new corners are pegged.
 *
 * The server works the division out again from the saved version and the
 * surveyor's choices, so no figure from the browser reaches the sheet. The
 * new corners become drawing-only points named as the division names them
 * (P1, P2…): they are never saved or imported, and the sheet says the plan
 * isn't surveyed yet. A division that can't be made as asked (a share in
 * pieces, an area it can't be given, a minimum it misses) gets no sheet.
 */
import { z } from "zod";
import { lotName, planRulesSchema, type DrawingFeature, type Lot, type SurveyDocument } from "./document";
import { pointSegmentDistance, segmentsIntersect, type Point } from "./geometry";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { partitionLot, type PartitionResult } from "./partition";
import { ruleSetFrom } from "./rules";
import { composeSheet, type ComposeInput, type ComposedSheet } from "./sheet/compose";

/** The surveyor's choices on the divide panel, in metres and square metres. */
export const divisionSchema = z.object({
  lot: z.string().min(1).max(40),
  leg: z.number().int().min(0).max(499),
  lines: z.enum(["square", "parallel", "through"]),
  corner: z.number().int().min(0).max(499),
  from: z.enum(["start", "end"]),
  by: z.enum(["area", "width"]),
  shares: z.array(z.number().positive().max(1e9).nullable()).min(2).max(50),
  rules: planRulesSchema.nullable(),
});
export type Division = z.infer<typeof divisionSchema>;

/** A division from its URL parameter (JSON), or null when it isn't one. */
export function readDivision(raw: string | null): Division | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const r = divisionSchema.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

type Made = Extract<PartitionResult, { ok: true }>;

/** The division worked out from this version's lot and points, or why there's no block-out plan for it. */
export function divide(doc: SurveyDocument, points: readonly SurveyPoint[], d: Division): { ok: true; lot: Lot; result: Made } | { ok: false; error: string } {
  const lot = doc.lots.find((l) => l.id === d.lot);
  if (!lot) return { ok: false, error: "That lot isn't in this version of the plan." };
  const byId = new Map(points.map((p) => [p.id, p]));
  if (!lot.points.every((id) => byId.has(id))) return { ok: false, error: "That lot uses points that are no longer in the project." };
  const ring = lot.points.map((id) => byId.get(id)!);
  const result = partitionLot({ ring, leg: d.leg, lines: d.lines, corner: d.corner, from: d.from, by: d.by, shares: d.shares, rules: ruleSetFrom(d.rules) });
  if (!result.ok) return { ok: false, error: result.error };
  if (!result.feasible) {
    const why = result.shares.flatMap((s, i) => s.problems.map((p) => `- Share ${i + 1}: ${p}`));
    return { ok: false, error: `Not every share can be made as asked, so there's no block-out plan for it:\n${[...new Set(why)].join("\n")}` };
  }
  return { ok: true, lot, result };
}

/** Drawing-only points for the new corners: a fixed id pattern no imported point has. */
const NEW_CORNER_ID = (i: number) => `b10c0000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`;


/** Whether a point lies inside a ring or on its boundary (within a millimetre). */
function within(p: Point, ring: readonly Point[]): boolean {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (pointSegmentDistance(p, a, b) <= 0.001) return true;
    if (a.n > p.n !== b.n > p.n && p.e < ((b.e - a.e) * (p.n - a.n)) / (b.n - a.n) + a.e) c = !c;
  }
  return c;
}

/**
 * The block-out drawing: the divided lot's shares as lots (B¹, B², B³ for lot B; 1, 2, 3 for a lot that already has a raised part,
 * such as B¹), the roads and the features on it, point numbers and leg dimensions on the face for setting out, the title as a sub
 * division of that lot, no survey dates, and a note naming the new corners as not yet pegged.
 */
export function blockOutDocument(doc: SurveyDocument, points: readonly SurveyPoint[], lot: Lot, result: Made): { ok: true; document: SurveyDocument; points: SurveyPoint[] } | { ok: false; error: string } {
  const fresh = result.corners.filter((c) => !c.existing);
  const extra: SurveyPoint[] = fresh.map((c, i) => ({ id: NEW_CORNER_ID(i), pointId: c.name, e: c.e, n: c.n, z: null, code: null }));
  const lots: Lot[] = [];
  for (const [i, share] of result.shares.entries()) {
    const ids: string[] = [];
    for (const c of share.corners) {
      const pool = c.proposed ? extra.filter((p) => p.pointId === c.name) : points.filter((p) => p.pointId === c.name);
      const best = pool.reduce<SurveyPoint | null>((b, p) => (!b || Math.hypot(p.e - c.e, p.n - c.n) < Math.hypot(b.e - c.e, b.n - c.n) ? p : b), null);
      if (!best || Math.hypot(best.e - c.e, best.n - c.n) > 0.001) return { ok: false, error: `Share ${i + 1}'s corner ${c.name} couldn't be placed on the sheet.` };
      if (ids[ids.length - 1] !== best.id) ids.push(best.id);
    }
    lots.push({ id: `blockout-${i + 1}`, label: lot.sup ? String(i + 1) : lot.label, sup: lot.sup ? "" : String(i + 1), note: "", points: ids });
  }
  const all = [...points, ...extra];
  const byId = new Map(all.map((p) => [p.id, p]));
  const ring = lot.points.map((id) => byId.get(id)!);
  const names = fresh.map((c) => c.name);
  const corners = names.length === 0 ? "The dividing lines run between surveyed corners" : names.length === 1 ? `Corner ${names[0]} is worked out from the surveyed corners and` : `Corners ${names[0]} to ${names[names.length - 1]} are worked out from the surveyed corners and`;
  const note = `Sub division of lot ${lotName(lot) || "without a label"} planned by Farbaek Survey Studio (${result.engine}). ${names.length === 0 ? `${corners}.` : `${corners} not yet pegged.`}`;
  const document: SurveyDocument = {
    ...doc,
    lots,
    roads: doc.roads.filter((r) => [...r.edgeA, ...r.edgeB].every((id) => byId.has(id))),
    adjoining: [],
    features: doc.features.filter((f) => f.points.length > 0 && f.points.every((id) => byId.has(id) && within(byId.get(id)!, ring))),
    notes: [note.slice(0, 300)],
    labelOffsets: {},
    sheet: { ...doc.sheet, planNumber: "", planDate: "", surveyDate: "", partitionDate: "", operation: "subdivision", parentLots: lotName(lot), customClause: "", extractOf: "", statement: "Planned sub division, not yet surveyed on the ground.", statedExtent: "", remarks: "" },
    settings: { ...doc.settings, template: "classic", scale: null, faceDimensions: true },
    provenance: {},
    kept: [],
    rules: null,
  };
  return { ok: true, document, points: all };
}

/** The dividing lines (by their cut) that run through a building outline drawn on the plan: the surveyor's to weigh, never moved. */
export function linesThroughBuildings(features: readonly DrawingFeature[], points: readonly SurveyPoint[], segments: readonly { cut: number; a: Point; b: Point }[]): number[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  const outlines = features
    .filter((f) => f.layer === "BUILDINGS" && f.closed && f.points.length >= 3 && f.points.every((id) => byId.has(id)))
    .map((f) => f.points.map((id) => byId.get(id)!));
  const cuts = new Set<number>();
  for (const s of segments) {
    for (const o of outlines) {
      const crosses = o.some((p, i) => segmentsIntersect(s.a, s.b, p, o[(i + 1) % o.length]!, 0));
      if (crosses || within({ e: (s.a.e + s.b.e) / 2, n: (s.a.n + s.b.n) / 2 }, o)) cuts.add(s.cut);
    }
  }
  return [...cuts].sort((x, y) => x - y);
}

/**
 * The block-out sheet. At 1:1000 or larger where it fits (UDA regulation 8): when the automatic scale comes out smaller, the sheet is
 * tried again at 1:1000 on the paper that holds it, and kept at the automatic scale only if 1:1000 doesn't fit.
 */
export function blockOutSheet(base: Omit<ComposeInput, "document" | "points" | "lots" | "approval" | "blockOut">, doc: SurveyDocument, points: readonly SurveyPoint[], d: Division): { ok: true; sheet: ComposedSheet; lot: Lot; result: Made } | { ok: false; error: string } {
  const div = divide(doc, points, d);
  if (!div.ok) return div;
  const drawn = blockOutDocument(doc, points, div.lot, div.result);
  if (!drawn.ok) return drawn;
  const compose = (document: SurveyDocument) => composeSheet({ ...base, document, points: drawn.points, lots: computeLots(drawn.points, document.lots), approval: null, blockOut: { engine: div.result.engine } });
  let sheet = compose(drawn.document);
  if (sheet.scale !== null && sheet.scale > 1000) {
    const at1000 = compose({ ...drawn.document, settings: { ...drawn.document.settings, scale: 1000 } });
    if (!at1000.findings.some((f) => f.blocks.includes("export"))) sheet = at1000;
  }
  return { ok: true, sheet, lot: div.lot, result: div.result };
}
