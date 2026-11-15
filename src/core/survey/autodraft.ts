/**
 * The automatic draft (stage 194, ADR 0209): a plan drawn from the imported
 * points alone, so a surveyor who uploads the field data sees a plan straight
 * away and only has to check it. Tested rules, never AI, and every inference
 * is marked "drawn from the field data, check" until the surveyor says it's
 * right; approval waits for that. Nothing is moved and no point is changed.
 *
 * What it draws:
 * - The lot: through the boundary marks (marks in the code library that
 *   aren't utility posts, culverts, trees, wells or stations), in the order
 *   they were observed; failing that, around their centre, but only when
 *   every mark lies on their outer boundary (a convex land). Anything else
 *   gets no lot, with the reason. An inward corner in the observed order is
 *   named for the surveyor to check: it may be a corner of the land, or a
 *   mark inside it.
 * - Lines and buildings from the field codes, by the field-to-finish rules
 *   (ADR 0204), skipping any already on the plan.
 * - A road from two road-edge strings (codes RD1 and RD2, or RDL and RDR)
 *   that make a plausible road (1 to 60 m wide), when the plan has none.
 * - The survey date when the file states one, and the importing surveyor.
 *
 * It only draws a lot onto a plan without lots, so it never replaces the
 * surveyor's own work, and it keeps within what a drawing can hold, saying
 * what it left out. The title, the location and the bounds are left for the
 * surveyor (or the Draft step) and the checks list them.
 */
import { codeOf, entryFor, lookupCode, type CodeEntry } from "./codes";
import type { DrawingFeature, Lot, Road, SurveyDocument } from "./document";
import { suggestFeatures } from "./fieldToFinish";
import { area, distance, orient, pointSegmentDistance, segmentsIntersect, signedArea, type Point } from "./geometry";
import type { SurveyPoint } from "./parcel";
import { roadWidth } from "./roads";

export const AUTODRAFT_ENGINE = "autodraft/1.1.0";

/** What a drawing can hold (document.ts): corners in a lot, points in a line, points in a road edge, lines in all. */
const LIMITS = { lotPoints: 500, featurePoints: 500, roadPoints: 200, features: 300 } as const;

/**
 * Marks taken as off the boundary: utility posts, culverts, trees, wells and lamps (often beside a land rather than on its corner), and
 * instrument stations and control points (DSR Chapter XXII's "stn" codes). Whole words, so "Street" isn't a tree. A post that is a
 * corner is added on the Lots step.
 */
const NOT_BOUNDARY = /\b(?:electric|telephone|power|lamp|light|culvert|tree|well|hydrant|valve|manhole|station|control|geodetic|benchmark|bench mark|monument|kilometre)\b/i;

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
  /** How many shapes (a lot, lines, a road) it drew: a draft without any isn't worth a version. */
  shapes: number;
  engine: string;
}

/** The convex hull (Andrew's monotone chain), in local coordinates. */
function hull(pts: readonly Point[]): Point[] {
  const s = [...pts].sort((a, b) => a.e - b.e || a.n - b.n);
  if (s.length < 3) return s;
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
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Whether any two legs of a ring cross or touch, stopping at the first (the full list grows with the square of the corners). */
function crosses(ring: readonly Point[]): boolean {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsIntersect(a, b, ring[j]!, ring[(j + 1) % n]!)) return true;
    }
    // A leg running straight back over the one before it.
    const c = ring[(i + 2) % n]!;
    if (distance(a, b) > 0.0005 && distance(b, c) > 0.0005 && (pointSegmentDistance(c, a, b) <= 0.0005 || pointSegmentDistance(a, b, c) <= 0.0005)) return true;
  }
  return false;
}

/** A ring usable as a lot: three or more corners, an area, no leg crossing another. */
function usable(local: readonly Point[]): boolean {
  return local.length >= 3 && area(local) > 0.01 && !crosses(local);
}

/**
 * The lot's corners: the boundary marks in the order observed, when that's a clean outline; otherwise in order around their centre,
 * when every mark lies on their convex hull. A mark observed again (the same number, or the same place within half a millimetre) counts
 * once, at its first observation. `inward` lists the marks where the observed outline turns inward, for the surveyor to check.
 */
export function outlineFrom(marks: readonly SurveyPoint[]): { ring: SurveyPoint[]; how: "observed" | "around"; inward: string[] } | null {
  const unique: SurveyPoint[] = [];
  for (const p of marks) {
    if (unique.some((q) => q.pointId === p.pointId || Math.hypot(q.e - p.e, q.n - p.n) <= 0.0005)) continue;
    unique.push(p);
  }
  if (unique.length < 3 || unique.length > LIMITS.lotPoints) return null;
  const o = unique[0]!;
  const local = (r: readonly SurveyPoint[]) => r.map((p) => ({ e: p.e - o.e, n: p.n - o.n }));
  const observed = local(unique);
  if (usable(observed)) {
    // Inward corners: those that turn against the ring's own direction.
    const sign = Math.sign(signedArea(observed));
    const inward = unique.filter((_, i) => {
      const prev = observed[(i - 1 + observed.length) % observed.length]!;
      const next = observed[(i + 1) % observed.length]!;
      const turn = orient(prev, observed[i]!, next);
      return Math.sign(turn) === -sign && Math.abs(turn) > 1e-6;
    });
    return { ring: unique, how: "observed", inward: inward.map((p) => p.pointId) };
  }
  // Around the centre only for a convex land: every mark on the hull (within a millimetre), so the order can't be wrong.
  const h = hull(observed);
  const onHull = observed.every((p) => h.some((a, i) => pointSegmentDistance(p, a, h[(i + 1) % h.length]!) <= 0.001));
  if (!onHull) return null;
  const c = { e: observed.reduce((s, p) => s + p.e, 0) / observed.length, n: observed.reduce((s, p) => s + p.n, 0) / observed.length };
  const around = [...unique].sort((a, b) => Math.atan2(a.n - o.n - c.n, a.e - o.e - c.e) - Math.atan2(b.n - o.n - c.n, b.e - o.e - c.e));
  return usable(local(around)) ? { ring: around, how: "around", inward: [] } : null;
}

/** Whether a field code marks a road edge (RD1, RD2, RDL, RDR, ROAD…). */
export function isRoadEdgeCode(code: string): boolean {
  return ROAD_EDGE.test(code);
}

/** Road edges from RD-coded points: one string per side, in the order observed. */
export function roadEdges(points: readonly SurveyPoint[]): [SurveyPoint[], SurveyPoint[]] | null {
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

/** Point numbers for a sentence: all of them when few, else the first and last few. */
const listed = (ids: readonly string[]) => (ids.length <= 12 ? ids.join(", ") : `${ids.slice(0, 6).join(", ")} … ${ids.slice(-3).join(", ")}`);

export function autoDraft(input: AutoDraftInput): AutoDraftResult {
  const doc = input.document;
  const drawn: string[] = [];
  const notDrawn: string[] = [];
  let shapes = 0;
  const next: SurveyDocument = structuredClone(doc);
  const codes = doc.codes;

  // The lot, through the boundary marks, only onto a plan without lots.
  if (doc.lots.length > 0) {
    notDrawn.push("No lot: the plan already has lots, so none was drawn over them. Add the new points to them on the Lots step.");
  } else {
    const marks = input.points.filter((p) => isBoundaryMark(entryFor(codes, p.code)));
    const outline = marks.length > LIMITS.lotPoints ? null : outlineFrom(marks);
    if (outline) {
      const lot: Lot = { id: "lot-1", label: "1", sup: "", note: "", points: outline.ring.map((p) => p.id) };
      next.lots = [lot];
      next.provenance[`lot:${lot.id}`] = { source: "auto", reviewed: false };
      shapes++;
      const inward = outline.inward.length > 0 ? ` Check the inward ${outline.inward.length === 1 ? "corner" : "corners"} at ${listed(outline.inward)}: a corner of the land, or a mark inside it?` : "";
      drawn.push(`Lot 1 through ${outline.ring.length} boundary marks (${listed(outline.ring.map((p) => p.pointId))}), ${outline.how === "observed" ? "in the order they were observed" : "in order around their centre"}.${inward}`);
    } else if (marks.length > LIMITS.lotPoints) {
      notDrawn.push(`No lot: ${marks.length} points carry boundary-mark codes, more than a lot's ${LIMITS.lotPoints} corners. Give each lot's corners on the Lots step.`);
    } else if (marks.length < 3) {
      notDrawn.push(marks.length === 0 ? "No lot: no point carries a boundary-mark code (such as CP, St, OSt or M) from the code library." : `No lot: only ${marks.length} ${marks.length === 1 ? "point carries" : "points carry"} a boundary-mark code, and a lot needs three.`);
    } else {
      notDrawn.push(`No lot: the ${marks.length} boundary marks don't make one clear outline, in the order observed or around their centre (marks inside the land, as on a sub division, do this). Give each lot's corners on the Lots step, or describe the lots on the Draft step.`);
    }
  }

  // Lines and buildings from the field codes, skipping any the plan already has, within what a drawing holds.
  const have = new Set(doc.features.map((f) => `${f.code}|${f.points.join(",")}`));
  const ids = new Set(doc.features.map((f) => f.id));
  let n = 0;
  const fresh: DrawingFeature[] = [];
  let tooLong = 0;
  for (const s of suggestFeatures(input.points, codes)) {
    if (have.has(`${s.code}|${s.points.join(",")}`)) continue;
    if (s.points.length > LIMITS.featurePoints) {
      tooLong++;
      continue;
    }
    let id: string;
    do id = `f-auto-${++n}`;
    while (ids.has(id));
    ids.add(id);
    fresh.push({ id, layer: s.layer, code: s.code, closed: s.closed, points: s.points });
  }
  const room = Math.max(0, LIMITS.features - doc.features.length);
  const kept = fresh.slice(0, room);
  if (kept.length > 0) {
    next.features = [...doc.features, ...kept];
    shapes++;
    const counts = new Map<string, number>();
    for (const f of kept) {
      const meaning = lookupCode(codes, f.code)?.meaning ?? f.code;
      counts.set(meaning, (counts.get(meaning) ?? 0) + 1);
    }
    drawn.push(`${kept.length} ${kept.length === 1 ? "line" : "lines"} from the field codes: ${[...counts].map(([m, k]) => `${k} ${m.toLowerCase()}`).join(", ")}.`);
  }
  if (fresh.length > kept.length) notDrawn.push(`${fresh.length - kept.length} more ${fresh.length - kept.length === 1 ? "line" : "lines"} from the codes weren't drawn: a plan holds ${LIMITS.features} lines.`);
  if (tooLong > 0) notDrawn.push(`${tooLong} ${tooLong === 1 ? "line has" : "lines have"} more than ${LIMITS.featurePoints} points and ${tooLong === 1 ? "wasn't" : "weren't"} drawn: split the string with a numbered code (MW1, MW2).`);

  // A road from two road-edge strings, when the plan has none and they make a plausible road.
  const edges = roadEdges(input.points);
  if (edges && doc.roads.length === 0) {
    const width = roadWidth(edges[0], edges[1]);
    if (edges[0].length > LIMITS.roadPoints || edges[1].length > LIMITS.roadPoints) {
      notDrawn.push(`No road: a road edge holds at most ${LIMITS.roadPoints} points, and these have ${edges[0].length} and ${edges[1].length}.`);
    } else if (!width || width.minM < 1 || width.maxM > 60) {
      notDrawn.push("No road: the RD1 and RD2 edges don't make one road between 1 and 60 m wide. Check their codes, or give the road on the Lots step.");
    } else {
      const road: Road = { id: "road-1", name: "", edgeA: edges[0].map((p) => p.id), edgeB: edges[1].map((p) => p.id), width: "feet", start: "", end: "" };
      next.roads = [road];
      next.provenance[`road:${road.id}`] = { source: "auto", reviewed: false };
      shapes++;
      drawn.push(`A road between its two surveyed edges (${edges[0].length} and ${edges[1].length} points), ${width.minM.toFixed(2)} to ${width.maxM.toFixed(2)} m wide.`);
    }
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
  return { document: next, drawn, notDrawn, shapes, engine: AUTODRAFT_ENGINE };
}
