/**
 * Corners a field sketch draws square that nobody surveyed (stage 262, ADR 0270): a building's or a well box's corner the surveyor drew
 * between two surveyed points, as plans draw it. The plan keeps the corner's recipe, never a coordinate: the two surveyed points it lies
 * between, and the surveyed line it's squared to. Tested code works the corner out from the surveyed points every time the plan is
 * built, so it moves with them, and the checks say it wasn't surveyed. A lot's corner is never constructed: lots are surveyed.
 */
import { z } from "zod";
import type { Point } from "./geometry";
import type { SurveyPoint } from "./parcel";

const uuid = z.string().uuid();

/**
 * A square corner between two surveyed points. The leg from `from` runs straight across the reference line (from one of its points to
 * the other); the leg into `to` runs along it. So the corner lies level with `to` along the line, and square off it from `from`.
 */
export const constructedPointSchema = z.object({
  id: uuid,
  kind: z.literal("square"),
  from: uuid,
  to: uuid,
  ref: z.tuple([uuid, uuid]),
});
export type ConstructedPoint = z.infer<typeof constructedPointSchema>;

/** The most a plan keeps: far more than a sketch draws. */
export const CONSTRUCTED_MAX = 200;

/** The shortest leg a constructed corner may have: nearer than this, the corner is the surveyed point itself, and nothing is made. */
export const SQUARE_MIN_LEG_M = 0.02;

/** How near the reference line a corner's surveyed point may lie to be squared to it: a 225 mm wall's thickness, and a little over. */
export const SQUARE_REF_M = 0.25;

/**
 * The square corner: from `from`, straight across the line r0 to r1 until level with `to`. Null when the line has no length, or when
 * either leg would be shorter than SQUARE_MIN_LEG_M (the corner would be a surveyed point, and a zero leg has no direction).
 */
export function squareCorner(from: Point, to: Point, r0: Point, r1: Point): Point | null {
  const [dx, dy] = [r1.e - r0.e, r1.n - r0.n];
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const [ux, uy] = [dx / len, dy / len];
  const [px, py] = [-uy, ux];
  const across = (to.e - from.e) * px + (to.n - from.n) * py;
  const along = (to.e - from.e) * ux + (to.n - from.n) * uy;
  if (Math.abs(across) < SQUARE_MIN_LEG_M || Math.abs(along) < SQUARE_MIN_LEG_M) return null;
  return { e: from.e + across * px, n: from.n + across * py };
}

/** How a constructed corner is named where points are listed: by the two surveyed points it lies between. */
export const cornerName = (from: Pick<SurveyPoint, "pointId">, to: Pick<SurveyPoint, "pointId">) => `corner ${from.pointId}-${to.pointId}`;

/**
 * The surveyed points with the plan's constructed corners added, worked out from them. A corner whose points are missing, or whose legs
 * would be too short, is left out (and a line through it then misses a point, which the checks stop); one never replaces a surveyed
 * point that has its id.
 */
export function withConstructed(points: readonly SurveyPoint[], doc: { constructed?: readonly ConstructedPoint[] }): SurveyPoint[] {
  const list = doc.constructed ?? [];
  if (list.length === 0) return points as SurveyPoint[];
  const byId = new Map(points.map((p) => [p.id, p]));
  const out = [...points];
  const seen = new Set<string>();
  for (const c of list) {
    // The first recipe for an id only, as the approval counts it (a document never holds two: its schema refuses them).
    if (byId.has(c.id) || seen.has(c.id)) continue;
    seen.add(c.id);
    const [a, b, r0, r1] = [c.from, c.to, c.ref[0], c.ref[1]].map((id) => byId.get(id));
    if (!a || !b || !r0 || !r1) continue;
    const at = squareCorner(a, b, r0, r1);
    if (!at) continue;
    out.push({ id: c.id, pointId: cornerName(a, b), e: at.e, n: at.n, z: null, code: null });
  }
  return out;
}

/** The ids of the plan's constructed corners. */
export const constructedIds = (doc: { constructed?: readonly ConstructedPoint[] }) => new Set((doc.constructed ?? []).map((c) => c.id));

/** How far p lies from the segment a-b's line, when it falls between a and b (a centimetre either way); else null. */
function offLeg(p: Point, a: Point, b: Point): number | null {
  const len2 = (b.e - a.e) ** 2 + (b.n - a.n) ** 2;
  if (len2 === 0) return null;
  const len = Math.sqrt(len2);
  const t = ((p.e - a.e) * (b.e - a.e) + (p.n - a.n) * (b.n - a.n)) / len2;
  if (t * len < -0.01 || (t - 1) * len > 0.01) return null;
  return Math.abs((b.e - a.e) * (p.n - a.n) - (b.n - a.n) * (p.e - a.e)) / len;
}

/**
 * Which surveyed line a corner between two points is squared to, as a surveyor squares an outline off the wall it stands against: of
 * the legs of the plan's other lines that start or end at either point, or pass within SQUARE_REF_M of it, the longest (a long surveyed
 * line gives the truest direction). The point it was found at is the corner's `from`: the outline leaves that line square. The leg
 * between the two points themselves is never a reference. Null when no line qualifies, or the corner would have a leg too short.
 */
export function squareReference(a: SurveyPoint, b: SurveyPoint, lines: readonly (readonly SurveyPoint[])[]): Omit<ConstructedPoint, "id" | "kind"> | null {
  let best: { from: SurveyPoint; to: SurveyPoint; ref: [SurveyPoint, SurveyPoint]; len: number } | null = null;
  for (const line of lines)
    for (let i = 0; i + 1 < line.length; i++) {
      const [p, q] = [line[i]!, line[i + 1]!];
      if (p.id === q.id) continue;
      const ends = new Set([p.id, q.id]);
      if (ends.has(a.id) && ends.has(b.id)) continue;
      const len = Math.hypot(q.e - p.e, q.n - p.n);
      if (best && len <= best.len) continue;
      for (const [x, y] of [
        [a, b],
        [b, a],
      ] as const) {
        const on = ends.has(x.id) || (offLeg(x, p, q) ?? Infinity) <= SQUARE_REF_M;
        if (!on || !squareCorner(x, y, p, q)) continue;
        best = { from: x, to: y, ref: [p, q], len };
        break;
      }
    }
  return best ? { from: best.from.id, to: best.to.id, ref: [best.ref[0].id, best.ref[1].id] } : null;
}

/**
 * An id for a constructed corner that's the same every time the same sketch corner is read (so reading again doesn't make a new one):
 * a version 8 UUID from a 128-bit hash of the two points' ids.
 */
export function cornerId(a: string, b: string): string {
  const [x, y] = a < b ? [a, b] : [b, a];
  const s = `square|${x}|${y}`;
  // Four 32-bit FNV-1a lanes with different seeds.
  const lane = (seed: number) => {
    let h = seed >>> 0;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, "0");
  };
  const hex = [0x811c9dc5, 0x050c5d1f, 0x2b5ad5c3, 0x6f4f2a1d].map(lane).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${((parseInt(hex[16]!, 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** The plan's parts the corners need: its lines and lots by point id, and the corners themselves. */
interface CornerPlan {
  features: readonly { points: readonly string[]; closed: boolean }[];
  lots: readonly { points: readonly string[] }[];
  constructed?: readonly ConstructedPoint[];
}

/** The two points a line's point at `k` lies between (a closed line wraps round); null at an open line's ends. */
export function neighbours(points: readonly string[], closed: boolean, k: number): [string, string] | null {
  const n = points.length;
  if (!closed && (k === 0 || k === n - 1)) return null;
  return [points[(k - 1 + n) % n]!, points[(k + 1) % n]!];
}

/** Whether a constructed corner stands between the two points it's worked out from, as every one must. */
export const cornerFits = (c: ConstructedPoint, between: readonly [string, string] | null) => between !== null && ((between[0] === c.from && between[1] === c.to) || (between[0] === c.to && between[1] === c.from));

/**
 * The plan's lines and lots as runs of surveyed points, for choosing what a corner is squared to. Constructed corners are left out (the
 * run joins straight past them), so a corner is never squared to a line drawn through itself or another corner.
 */
export function cornerLines(plan: CornerPlan, surveyed: readonly SurveyPoint[]): SurveyPoint[][] {
  const all = new Map(surveyed.map((p) => [p.id, p]));
  const run = (ids: readonly string[], closed: boolean) => {
    const ps = ids.map((id) => all.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    return closed && ps.length > 2 ? [...ps, ps[0]!] : ps;
  };
  return [...plan.features.map((f) => run(f.points, f.closed)), ...plan.lots.map((l) => run(l.points, true))];
}

/**
 * A square corner between two surveyed points, as the plan has it or newly worked out: the plan's own when it already has one between
 * them, else squared to the longest surveyed line at either point. Null when nothing says which way it's square.
 */
export function cornerBetween(plan: CornerPlan, surveyed: readonly SurveyPoint[], a: string, b: string): ConstructedPoint | null {
  const id = cornerId(a, b);
  const have = (plan.constructed ?? []).find((c) => cornerFits(c, [a, b]));
  if (have) return have;
  const byId = new Map(surveyed.map((p) => [p.id, p]));
  const [pa, pb] = [byId.get(a), byId.get(b)];
  if (!pa || !pb) return null;
  const ref = squareReference(pa, pb, cornerLines(plan, surveyed));
  return ref ? { id, kind: "square", ...ref } : null;
}

/**
 * The plan's lines after their points changed (a point dragged, numbers typed): each constructed corner that no longer stands between
 * the points it's worked out from is worked out again between its new neighbours, or taken out (the line runs straight there) when
 * nothing says which way it's square. Corners no line uses are dropped. Returns what was taken out, by its neighbours' ids.
 */
export function refreshCorners<T extends CornerPlan & { features: { points: string[]; closed: boolean }[] }>(plan: T, surveyed: readonly SurveyPoint[]): { plan: T; removed: [string, string][] } {
  const made = new Map((plan.constructed ?? []).map((c) => [c.id, c]));
  const next: ConstructedPoint[] = [...made.values()];
  const removed: [string, string][] = [];
  const features = plan.features.map((f) => {
    let points = [...f.points];
    for (let k = 0; k < points.length; k++) {
      const c = made.get(points[k]!) ?? next.find((x) => x.id === points[k]);
      if (!c) continue;
      const between = neighbours(points, f.closed, k);
      if (cornerFits(c, between)) continue;
      // A constructed corner next to another, or at an open line's end, can't be worked out: it goes.
      const ok = between && !made.has(between[0]) && !made.has(between[1]) && !next.some((x) => x.id === between[0] || x.id === between[1]);
      const again = ok ? cornerBetween({ ...plan, constructed: next }, surveyed, between[0], between[1]) : null;
      if (again && !points.includes(again.id)) {
        if (!next.some((x) => x.id === again.id)) next.push(again);
        points[k] = again.id;
      } else {
        if (between) removed.push(between);
        points = points.filter((_, j) => j !== k);
        k--;
      }
    }
    return points.length === f.points.length && points.every((p, i) => p === f.points[i]) ? f : { ...f, points };
  });
  const used = new Set(features.flatMap((f) => f.points));
  const kept = next.filter((c) => used.has(c.id));
  const { constructed: _, ...rest } = plan;
  void _;
  return { plan: { ...rest, features, ...(kept.length > 0 ? { constructed: kept } : {}) } as T, removed };
}

/** A line's points with a constructed corner put between `a` and `b` wherever they're next to each other (a closed line's last leg too). */
export function insertCorner(points: readonly string[], closed: boolean, a: string, b: string, corner: string): string[] {
  const out: string[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i]!;
    out.push(p);
    const q = i + 1 < n ? points[i + 1] : closed ? points[0] : undefined;
    if (q !== undefined && ((p === a && q === b) || (p === b && q === a))) out.push(corner);
  }
  return out;
}
