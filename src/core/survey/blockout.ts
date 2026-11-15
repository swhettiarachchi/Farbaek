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
import { defaultLayers, lotName, planRulesSchema, type DrawingFeature, type Lot, type SurveyDocument } from "./document";
import { andList, dotDate } from "./formats";
import { bounds, orient, pointSegmentDistance, segmentDistance, type Point } from "./geometry";
import { computeLots } from "./lots";
import type { SurveyPoint } from "./parcel";
import { partitionLot, type PartitionResult } from "./partition";
import { ruleSetFrom } from "./rules";
import { composeSheet, type ComposeInput, type ComposedSheet } from "./sheet/compose";

/** The surveyor's choices on the divide panel, in metres and square metres. */
export const divisionSchema = z.object({
  lot: z.string().min(1).max(40).regex(/^[A-Za-z0-9_-]+$/),
  leg: z.number().int().min(0).max(499),
  lines: z.enum(["square", "parallel", "through"]),
  corner: z.number().int().min(0).max(499),
  from: z.enum(["start", "end"]),
  by: z.enum(["area", "width"]),
  shares: z.array(z.number().positive().max(1e9).nullable()).min(2).max(50),
  rules: planRulesSchema.nullable(),
});
export type Division = z.infer<typeof divisionSchema>;

/** Text with half a character pair (a lone surrogate): JSON accepts it, the database's JSON type doesn't. */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
const wellFormed = (v: unknown): boolean => (typeof v === "string" ? !LONE_SURROGATE.test(v) : Array.isArray(v) ? v.every(wellFormed) : v && typeof v === "object" ? Object.values(v).every(wellFormed) : true);

/** A division from its URL parameter (JSON), or null when it isn't one. */
export function readDivision(raw: string | null): Division | null {
  if (!raw || raw.length > 4000) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!wellFormed(parsed)) return null;
    const r = divisionSchema.safeParse(parsed);
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** The most shares times lot corners one block-out sheet draws: past it, composing takes seconds of server time. */
export const BLOCKOUT_WORK_LIMIT = 4000;

type Made = Extract<PartitionResult, { ok: true }>;

/** The division worked out from this version's lot and points, or why there's no block-out plan for it. */
export function divide(doc: SurveyDocument, points: readonly SurveyPoint[], d: Division): { ok: true; lot: Lot; result: Made } | { ok: false; error: string } {
  const lot = doc.lots.find((l) => l.id === d.lot);
  if (!lot) return { ok: false, error: "That lot isn't in this version of the plan." };
  const byId = new Map(points.map((p) => [p.id, p]));
  if (!lot.points.every((id) => byId.has(id))) return { ok: false, error: "That lot uses points that are no longer in the project." };
  const ring = lot.points.map((id) => byId.get(id)!);
  if (ring.length * d.shares.length > BLOCKOUT_WORK_LIMIT) return { ok: false, error: `A lot of ${ring.length} corners in ${d.shares.length} shares is too much for one block-out sheet. Divide it in fewer shares, or in steps.` };
  const result = partitionLot({ ring, leg: d.leg, lines: d.lines, corner: d.corner, from: d.from, by: d.by, shares: d.shares, rules: ruleSetFrom(d.rules), avoid: points.map((p) => p.pointId) });
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
  const all0 = [...points];
  const byId0 = new Map(all0.map((p) => [p.id, p]));
  const ring = lot.points.map((id) => byId0.get(id)!);
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
  const names = fresh.map((c) => c.name);
  const named = names.length <= 8 ? andList(names) : `${names[0]} to ${names[names.length - 1]} (${names.length} in all)`;
  const corners = names.length === 0 ? "The dividing lines run between surveyed corners" : names.length === 1 ? `Corner ${named} is worked out from the surveyed corners and` : `Corners ${named} are worked out from the surveyed corners and`;
  const note = `Sub division of lot ${lotName(lot) || "without a label"} planned by Farbaek Survey Studio (${result.engine}). ${names.length === 0 ? `${corners}.` : `${corners} not yet pegged.`}`;
  // The title: a planned sub division of this plan's lot, depicted in this plan (the parent's own earlier plan is a different one).
  const s = doc.sheet;
  const here = s.planNumber.trim() ? ` depicted in my Plan No.${s.planNumber.trim()}${s.planDate.trim() ? ` dated ${dotDate(s.planDate)}` : ""}` : "";
  const clause = `a planned sub division of lot ${lotName(lot) || "without a label"}${here}`;
  // Roads beside the lot, not every road on the plan: a far one would shrink the scale.
  const near = (r: SurveyDocument["roads"][number]) => {
    const segs = [r.edgeA, r.edgeB].flatMap((edge) => edge.slice(1).map((id, k) => [byId.get(edge[k]!)!, byId.get(id)!] as const));
    return segs.some(([p, q]) => ring.some((v, k) => segmentDistance(p, q, v, ring[(k + 1) % ring.length]!) <= ROAD_NEAR_M));
  };
  const all = [...points, ...extra];
  const byId = new Map(all.map((p) => [p.id, p]));
  const document: SurveyDocument = {
    ...doc,
    lots,
    roads: doc.roads.filter((r) => [...r.edgeA, ...r.edgeB].every((id) => byId.has(id)) && near(r)),
    adjoining: [],
    features: doc.features.filter((f) => f.points.length > 0 && f.points.every((id) => byId.has(id) && within(byId.get(id)!, ring))),
    notes: [note.slice(0, 300)],
    labelOffsets: {},
    // Every layer shown, whatever the plan hides: the block-out is for setting out.
    layers: defaultLayers(),
    sheet: {
      ...s,
      planNumber: "",
      planDate: "",
      surveyDate: "",
      partitionDate: "",
      operation: "custom",
      customClause: clause.slice(0, 800),
      parentLots: lotName(lot),
      previousPlan: { number: "", date: "", by: "", byDesignation: "", mine: false, filing: "" },
      // The whole land's bounds describe the land, not this lot: left for the surveyor to write.
      boundaries: { north: "", east: "", south: "", west: "" },
      extractOf: "",
      statement: "Planned sub division, not yet surveyed on the ground.",
      statedExtent: "",
      remarks: "",
    },
    settings: { ...doc.settings, template: "classic", scale: null, faceDimensions: true },
    // The surveyor's check of the code list carries over; nothing else the AI filled is on this sheet.
    provenance: doc.provenance["codes"] ? { codes: doc.provenance["codes"] } : {},
    kept: [],
    rules: null,
  };
  return { ok: true, document, points: all };
}

/** A road is drawn on the block-out when it passes within this distance of the divided lot (metres). */
const ROAD_NEAR_M = 10;

/**
 * The dividing lines (by their cut) that run through a building outline drawn on the plan: the surveyor's to weigh, never moved. A line
 * counts when it crosses a wall outright or runs through the inside; one lying along a wall doesn't.
 */
export function linesThroughBuildings(features: readonly DrawingFeature[], points: readonly SurveyPoint[], segments: readonly { cut: number; a: Point; b: Point }[]): number[] {
  const byId = new Map(points.map((p) => [p.id, p]));
  const outlines = features
    .filter((f) => f.layer === "BUILDINGS" && f.closed && f.points.length >= 3 && f.points.every((id) => byId.has(id)))
    .map((f) => f.points.map((id) => byId.get(id)!));
  const strictlyInside = (p: Point, o: readonly Point[]) => within(p, o) && o.every((v, i) => pointSegmentDistance(p, v, o[(i + 1) % o.length]!) > 0.001);
  const cuts = new Set<number>();
  for (const s of segments) {
    for (const o of outlines) {
      // A proper crossing: each segment's ends on opposite sides of the other (by more than a millimetre).
      const len = Math.hypot(s.b.e - s.a.e, s.b.n - s.a.n) || 1;
      const crosses = o.some((p, i) => {
        const q = o[(i + 1) % o.length]!;
        const wall = Math.hypot(q.e - p.e, q.n - p.n) || 1;
        const s1 = orient(s.a, s.b, p) / len;
        const s2 = orient(s.a, s.b, q) / len;
        const s3 = orient(p, q, s.a) / wall;
        const s4 = orient(p, q, s.b) / wall;
        return ((s1 > 0.001 && s2 < -0.001) || (s1 < -0.001 && s2 > 0.001)) && ((s3 > 0.001 && s4 < -0.001) || (s3 < -0.001 && s4 > 0.001));
      });
      const samples = Array.from({ length: 39 }, (_, k) => (k + 1) / 40);
      if (crosses || samples.some((t) => strictlyInside({ e: s.a.e + t * (s.b.e - s.a.e), n: s.a.n + t * (s.b.n - s.a.n) }, o))) cuts.add(s.cut);
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
  // Only when the drawing could fit A2 (594 by 420 mm) at 1:1000: otherwise the second sheet is work thrown away.
  const box = bounds(drawn.document.lots.flatMap((l) => l.points).map((id) => drawn.points.find((p) => p.id === id)!).filter(Boolean));
  const fitsA2 = box !== null && Math.max(box.maxE - box.minE, box.maxN - box.minN) <= 594 * 0.8 && Math.min(box.maxE - box.minE, box.maxN - box.minN) <= 420 * 0.8;
  if (sheet.scale !== null && sheet.scale > 1000 && fitsA2) {
    const at1000 = compose({ ...drawn.document, settings: { ...drawn.document.settings, scale: 1000 } });
    if (!at1000.findings.some((f) => f.blocks.includes("export"))) sheet = at1000;
  }
  return { ok: true, sheet, lot: div.lot, result: div.result };
}
