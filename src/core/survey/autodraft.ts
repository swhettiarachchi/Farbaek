/**
 * The automatic draft (stage 194, ADR 0209): a plan drawn from the imported
 * points alone, so a surveyor who uploads the field data sees a plan straight
 * away and only has to check it. Tested rules, never AI, and every inference
 * is marked "drawn from the field data, check" until the surveyor says it's
 * right; approval waits for that. Nothing is moved and no point is changed.
 *
 * What it draws:
 * - The lot: through the boundary marks (marks in the code library that
 *   aren't utility posts, culverts, trees or wells), in the order they were
 *   observed, or failing that around their centre when that gives an outline
 *   close to their convex hull. Anything else gets no lot, with the reason.
 * - Lines and buildings from the field codes, by the field-to-finish rules
 *   (ADR 0204): the same lines the surveyor could accept one by one.
 * - A road from two road-edge strings (codes RD1 and RD2, or RDL and RDR),
 *   with its computed width.
 * - The survey date when the file states one, and the importing surveyor.
 *
 * It only draws onto a plan without lots, so it never replaces the
 * surveyor's own work. The title, the location and the bounds are left for
 * the surveyor (or the Draft step) and the checks list them.
 */
import { codeOf, lookupCode, type CodeEntry } from "./codes";
import type { DrawingFeature, Lot, Road, SurveyDocument } from "./document";
import { suggestFeatures } from "./fieldToFinish";
import { area, selfIntersections, type Point } from "./geometry";
import type { SurveyPoint } from "./parcel";

export const AUTODRAFT_ENGINE = "autodraft/1.0.0";

/** Marks that are never on a boundary: utility posts, culverts, trees, wells, lamps. */
const NOT_BOUNDARY = /electric|telephone|power|lamp|light|culvert|tree|well|hydrant|valve|manhole/i;

/** Whether a library code is a boundary mark (a post, stake, peg or mark set on a boundary). */
export function isBoundaryMark(entry: CodeEntry | null): boolean {
  return Boolean(entry && entry.kind === "mark" && !NOT_BOUNDARY.test(entry.meaning));
}

/** Road-edge codes the field crew can use: RD with a string number or side (RD1, RD2, RDL, RDR), or ROAD. Not in the code library: they draw roads, not lines. */
const ROAD_EDGE = /^(?:RD|ROAD|RE)(1|2|L|R|A|B)?$/i;

export interface AutoDraftInput {
  /** Every point of the project, in the order observed (import order). */
  points: readonly SurveyPoint[];
  document: SurveyDocument;
  /** The survey date the file states, as yyyy-mm-dd, if any. */
  surveyDate?: string | null;
  /** The importing member, when they have a surveyor profile here. */
  surveyorUserId?: string | null;
}

export interface AutoDraftResult {
  document: SurveyDocument;
  /** What was drawn, in plain sentences for the summary. */
  drawn: string[];
  /** What wasn't, and why. */
  notDrawn: string[];
  engine: string;
}

/** The convex hull's area (Andrew's monotone chain), for judging an outline drawn around the centre. */
function hullArea(pts: readonly Point[]): number {
  const s = [...pts].sort((a, b) => a.e - b.e || a.n - b.n);
  if (s.length < 3) return 0;
  const cross = (o: Point, a: Point, b: Point) => (a.e - o.e) * (b.n - o.n) - (a.n - o.n) * (b.e - o.e);
  const lower: Point[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Point[] = [];
  for (const p of [...s].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return area([...lower.slice(0, -1), ...upper.slice(0, -1)]);
}

/** A ring usable as a lot: three or more distinct corners, an area, and no leg crossing another. */
function usable(ring: readonly SurveyPoint[]): boolean {
  if (ring.length < 3) return false;
  const o = ring[0]!;
  const local = ring.map((p) => ({ e: p.e - o.e, n: p.n - o.n }));
  return area(local) > 0.01 && selfIntersections(local).length === 0;
}

/**
 * The lot's corners: the boundary marks in the order observed, when that's a clean outline; otherwise in order around their centre,
 * when that outline covers at least 85% of their convex hull (an outline with marks deep inside it, as on a sub division, does not).
 */
export function outlineFrom(marks: readonly SurveyPoint[]): { ring: SurveyPoint[]; how: "observed" | "around" } | null {
  // The same mark observed twice (a check shot) counts once, at its first observation.
  const seen = new Set<string>();
  const unique = marks.filter((p) => !seen.has(p.pointId) && seen.add(p.pointId));
  if (unique.length < 3) return null;
  if (usable(unique)) return { ring: unique, how: "observed" };
  const o = unique[0]!;
  const c = { e: unique.reduce((s, p) => s + p.e - o.e, 0) / unique.length, n: unique.reduce((s, p) => s + p.n - o.n, 0) / unique.length };
  const around = [...unique].sort((a, b) => Math.atan2(a.n - o.n - c.n, a.e - o.e - c.e) - Math.atan2(b.n - o.n - c.n, b.e - o.e - c.e));
  if (!usable(around)) return null;
  const local = (r: readonly SurveyPoint[]) => r.map((p) => ({ e: p.e - o.e, n: p.n - o.n }));
  return area(local(around)) >= 0.85 * hullArea(local(unique)) ? { ring: around, how: "around" } : null;
}

/** Road edges from RD-coded points: one string per side, in the order observed. */
function roadEdges(points: readonly SurveyPoint[]): [SurveyPoint[], SurveyPoint[]] | null {
  const strings = new Map<string, SurveyPoint[]>();
  for (const p of points) {
    const m = ROAD_EDGE.exec(codeOf(p.code));
    if (!m) continue;
    const side = (m[1] ?? "").toUpperCase();
    const key = side === "1" || side === "L" || side === "A" ? "a" : side === "2" || side === "R" || side === "B" ? "b" : "?";
    strings.set(key, [...(strings.get(key) ?? []), p]);
  }
  const a = strings.get("a");
  const b = strings.get("b");
  return a && b && a.length >= 2 && b.length >= 2 && !strings.has("?") ? [a, b] : null;
}

export function autoDraft(input: AutoDraftInput): AutoDraftResult {
  const doc = input.document;
  const drawn: string[] = [];
  const notDrawn: string[] = [];
  if (doc.lots.length > 0) {
    return { document: doc, drawn, notDrawn: ["The plan already has lots, so nothing was drawn over them. Add the new points to the plan on the Lots step."], engine: AUTODRAFT_ENGINE };
  }
  const next: SurveyDocument = structuredClone(doc);
  const codes = doc.codes;

  // The lot, through the boundary marks.
  const marks = input.points.filter((p) => isBoundaryMark(lookupCode(codes, codeOf(p.code))));
  const outline = outlineFrom(marks);
  if (outline) {
    const lot: Lot = { id: "lot-1", label: "1", sup: "", note: "", points: outline.ring.map((p) => p.id) };
    next.lots = [lot];
    next.provenance[`lot:${lot.id}`] = { source: "auto", reviewed: false };
    drawn.push(`Lot 1 through ${outline.ring.length} boundary marks (${outline.ring.map((p) => p.pointId).join(", ")}), ${outline.how === "observed" ? "in the order they were observed" : "in order around their centre"}.`);
  } else if (marks.length < 3) {
    notDrawn.push(marks.length === 0 ? "No lot: no point carries a boundary-mark code (such as CP, St, OSt or M) from the code library." : `No lot: only ${marks.length} ${marks.length === 1 ? "point carries" : "points carry"} a boundary-mark code, and a lot needs three.`);
  } else {
    notDrawn.push(`No lot: the ${marks.length} boundary marks don't make one clear outline, in the order observed or around their centre (marks inside the land, as on a sub division, do this). Give each lot's corners on the Lots step, or describe the lots on the Draft step.`);
  }

  // Lines and buildings from the field codes.
  const lines = suggestFeatures(input.points, codes);
  const features: DrawingFeature[] = lines.map((s, i) => ({ id: `f-auto-${i + 1}`, layer: s.layer, code: s.code, closed: s.closed, points: s.points }));
  if (features.length > 0) {
    next.features = [...next.features, ...features].slice(0, 300);
    const counts = new Map<string, number>();
    for (const s of lines) counts.set(s.meaning, (counts.get(s.meaning) ?? 0) + 1);
    drawn.push(`${features.length} ${features.length === 1 ? "line" : "lines"} from the field codes: ${[...counts].map(([m, n]) => `${n} ${m.toLowerCase()}`).join(", ")}.`);
  }

  // A road from two road-edge strings.
  const edges = roadEdges(input.points);
  if (edges) {
    const road: Road = { id: "road-1", name: "", edgeA: edges[0].map((p) => p.id), edgeB: edges[1].map((p) => p.id), width: "feet", start: "", end: "" };
    next.roads = [road];
    next.provenance[`road:${road.id}`] = { source: "auto", reviewed: false };
    drawn.push(`A road between its two surveyed edges (${edges[0].length} and ${edges[1].length} points), with its width worked out from them.`);
  }

  // The survey date the file states, and the surveyor importing it.
  if (input.surveyDate && !next.sheet.surveyDate.trim()) {
    next.sheet.surveyDate = input.surveyDate;
    next.provenance["sheet.surveyDate"] = { source: "auto", reviewed: false };
    drawn.push(`The survey date, ${input.surveyDate}, as the file states it.`);
  }
  if (input.surveyorUserId && !next.surveyorUserId) {
    next.surveyorUserId = input.surveyorUserId;
    drawn.push("Your surveyor details in the surveyor block.");
  }
  return { document: next, drawn, notDrawn, engine: AUTODRAFT_ENGINE };
}
