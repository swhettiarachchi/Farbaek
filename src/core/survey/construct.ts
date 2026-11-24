/**
 * Points of a plan's lines that nobody surveyed, worked out from surveyed ones (stages 262 and 264, ADRs 0270 and 0272):
 * - a corner a field sketch draws square between two surveyed points (a building's or a well box's corner);
 * - where two surveyed lines meet, each carried on as far as it needs (a house's side run on to the wall it stands against);
 * - a tape offset off a surveyed line, as a surveyor books one: so far along it, then so far square off it.
 * The plan keeps each one's recipe, never a coordinate. Tested code works the point out from the surveyed points every time the plan is
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
export const squareCornerSchema = z.object({
  id: uuid,
  kind: z.literal("square"),
  from: uuid,
  to: uuid,
  ref: z.tuple([uuid, uuid]),
});
export type SquareCorner = z.infer<typeof squareCornerSchema>;

/** The name a surveyor gives a point worked out by hand, typed among the line's numbers: letters, digits, and ' / - after the first. */
const pointName = z.string().trim().min(1).max(12).regex(/^[A-Za-z0-9][A-Za-z0-9'/-]*$/);

/** Where the line through a[0] and a[1] meets the line through b[0] and b[1], each carried on as far as it needs (stage 264). */
export const meetPointSchema = z.object({ id: uuid, kind: z.literal("meet"), name: pointName, a: z.tuple([uuid, uuid]), b: z.tuple([uuid, uuid]) });
export type MeetPoint = z.infer<typeof meetPointSchema>;

/**
 * A tape offset (stage 264): `along` metres from `from` towards `toward` (negative: back past `from`), then `out` metres square off
 * that line, to its left looking from `from` to `toward` (negative: to its right). Typed by the surveyor from the field book.
 */
export const offsetPointSchema = z.object({ id: uuid, kind: z.literal("offset"), name: pointName, from: uuid, toward: uuid, along: z.number().min(-500).max(500), out: z.number().min(-500).max(500) });
export type OffsetPoint = z.infer<typeof offsetPointSchema>;

export const constructedPointSchema = z.discriminatedUnion("kind", [squareCornerSchema, meetPointSchema, offsetPointSchema]);
export type ConstructedPoint = z.infer<typeof constructedPointSchema>;

/** The surveyed points a constructed point is worked out from: what the approval covers for it. */
export function recipeInputs(c: ConstructedPoint): string[] {
  if (c.kind === "square") return [c.from, c.to, ...c.ref];
  if (c.kind === "meet") return [...c.a, ...c.b];
  return [c.from, c.toward];
}

/** The smallest angle two lines may meet at to be met (stage 264): flatter, a small error in either moves the point far along them. */
export const MEET_MIN_DEG = 5;
/** How far from the nearest of its four surveyed points a meeting may lie: farther, it's not a corner of this plan's lines. */
export const MEET_MAX_M = 50;

/** Where the line a0 to a1 meets the line b0 to b1. Null when either has no length, they meet flatter than MEET_MIN_DEG, or too far off. */
export function meetPoint(a0: Point, a1: Point, b0: Point, b1: Point): Point | null {
  const [dx, dy] = [a1.e - a0.e, a1.n - a0.n];
  const [sx, sy] = [b1.e - b0.e, b1.n - b0.n];
  const [la, lb] = [Math.hypot(dx, dy), Math.hypot(sx, sy)];
  if (la < 0.01 || lb < 0.01) return null;
  const den = dx * sy - dy * sx;
  if (Math.abs(den) / (la * lb) < Math.sin((MEET_MIN_DEG * Math.PI) / 180)) return null;
  const t = ((b0.e - a0.e) * sy - (b0.n - a0.n) * sx) / den;
  const at = { e: a0.e + dx * t, n: a0.n + dy * t };
  const near = Math.min(...[a0, a1, b0, b1].map((p) => Math.hypot(p.e - at.e, p.n - at.n)));
  return near <= MEET_MAX_M ? at : null;
}

/** A tape offset: `along` from `from` towards `toward`, then `out` to the left of that direction. Null when the line has no length. */
export function offsetPoint(from: Point, toward: Point, along: number, out: number): Point | null {
  const [dx, dy] = [toward.e - from.e, toward.n - from.n];
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return null;
  const [ux, uy] = [dx / len, dy / len];
  return { e: from.e + ux * along - uy * out, n: from.n + uy * along + ux * out };
}

/** The shortest line a meeting or an offset is worked from (stage 264): shorter, a few millimetres' error in its points swings it far. */
export const WORKED_LINE_MIN_M = 0.5;
/** How far a meeting or an offset may reach from its line, as times the line's length. */
export const WORKED_REACH_MAX = 20;

/**
 * Where a constructed point is, from the surveyed points by id; null when one is missing or it can't be worked out. A meeting or an
 * offset is also refused when it's worked from a line shorter than WORKED_LINE_MIN_M, reaches more than WORKED_REACH_MAX times that
 * line's length from it, or lands on one of its own surveyed points (it would be that point).
 */
export function constructAt(c: ConstructedPoint, byId: ReadonlyMap<string, Point>): Point | null {
  const ins = recipeInputs(c).map((id) => byId.get(id));
  if (ins.some((p) => !p)) return null;
  const p = ins as Point[];
  if (c.kind === "square") return squareCorner(p[0]!, p[1]!, p[2]!, p[3]!);
  const dist = (x: Point, y: Point) => Math.hypot(y.e - x.e, y.n - x.n);
  const at = c.kind === "meet" ? meetPoint(p[0]!, p[1]!, p[2]!, p[3]!) : offsetPoint(p[0]!, p[1]!, c.along, c.out);
  if (!at) return null;
  const lines: [Point, Point][] = c.kind === "meet" ? [[p[0]!, p[1]!], [p[2]!, p[3]!]] : [[p[0]!, p[1]!]];
  for (const [x, y] of lines) {
    const len = dist(x, y);
    if (len < WORKED_LINE_MIN_M || Math.min(dist(x, at), dist(y, at)) > WORKED_REACH_MAX * len) return null;
  }
  if (p.some((q) => dist(q, at) < SQUARE_MIN_LEG_M)) return null;
  return at;
}

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
    const at = constructAt(c, byId);
    if (!at) continue;
    const name = c.kind === "square" ? cornerName(byId.get(c.from)!, byId.get(c.to)!) : c.name;
    out.push({ id: c.id, pointId: name, e: at.e, n: at.n, z: null, code: null });
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
export function squareReference(a: SurveyPoint, b: SurveyPoint, lines: readonly (readonly SurveyPoint[])[]): Omit<SquareCorner, "id" | "kind"> | null {
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
export const cornerFits = (c: SquareCorner, between: readonly [string, string] | null) => between !== null && ((between[0] === c.from && between[1] === c.to) || (between[0] === c.to && between[1] === c.from));

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
export function cornerBetween(plan: CornerPlan, surveyed: readonly SurveyPoint[], a: string, b: string): SquareCorner | null {
  const id = cornerId(a, b);
  const have = (plan.constructed ?? []).find((c): c is SquareCorner => c.kind === "square" && cornerFits(c, [a, b]));
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
      // A meeting or an offset is a point of its own, wherever the line puts it: only a square corner must stand between its two.
      if (!c || c.kind !== "square") continue;
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

/** What a surveyor types to add a point worked out by hand (stage 264): point numbers as written, metres as typed. */
export type PointSpec =
  | { kind: "meet"; name: string; a: [string, string]; b: [string, string] }
  | { kind: "offset"; name: string; from: string; toward: string; along: number; out: number };

/**
 * A meeting or a tape offset from what the surveyor typed, checked: its name is free (not a surveyed number, not another point's name,
 * not the word corner), each number is one surveyed point, and the point can be worked out. Otherwise, why not, in words.
 */
export function pointFromSpec(spec: PointSpec, surveyed: readonly SurveyPoint[], plan: { constructed?: readonly ConstructedPoint[] }, id: string): { point: MeetPoint | OffsetPoint } | { problem: string } {
  const name = spec.name.trim();
  if (!pointName.safeParse(name).success) return { problem: "Give the point a short name: letters and digits, such as 3a, up to 12 characters." };
  const lower = name.toLowerCase();
  if (lower === "corner") return { problem: "The word corner is kept for square corners: give the point another name." };
  if (surveyed.some((p) => p.pointId.toLowerCase() === lower)) return { problem: `${name} is a surveyed point's number: give the point another name.` };
  if ((plan.constructed ?? []).some((c) => c.kind !== "square" && c.name.toLowerCase() === lower)) return { problem: `Another point is already called ${name}.` };
  const one = (n: string): string | { problem: string } => {
    const hits = surveyed.filter((p) => p.pointId === n.trim());
    if (hits.length === 0) return { problem: `There's no point ${n.trim() || "(empty)"} in the survey.` };
    if (hits.length > 1) return { problem: `More than one surveyed point is numbered ${n.trim()}, so the number alone can't say which.` };
    return hits[0]!.id;
  };
  const byId = new Map(surveyed.map((p) => [p.id, p]));
  if (spec.kind === "meet") {
    const ids = [...spec.a, ...spec.b].map(one);
    const bad = ids.find((x): x is { problem: string } => typeof x !== "string");
    if (bad) return bad;
    const [a0, a1, b0, b1] = ids as string[];
    if (a0 === a1 || b0 === b1) return { problem: "Each line needs two different points." };
    const point: MeetPoint = { id, kind: "meet", name, a: [a0!, a1!], b: [b0!, b1!] };
    return constructAt(point, byId)
      ? { point }
      : { problem: `The lines ${spec.a.join(" to ")} and ${spec.b.join(" to ")} can't be met: they're too nearly parallel, one is shorter than ${WORKED_LINE_MIN_M} m, they meet too far off, or they meet at one of their own points.` };
  }
  if (!Number.isFinite(spec.along) || !Number.isFinite(spec.out) || Math.abs(spec.along) > 500 || Math.abs(spec.out) > 500) return { problem: "Give the distances in metres, each within 500 m." };
  const ids = [spec.from, spec.toward].map(one);
  const bad = ids.find((x): x is { problem: string } => typeof x !== "string");
  if (bad) return bad;
  const [from, toward] = ids as string[];
  if (from === toward) return { problem: "The line needs two different points." };
  const point: OffsetPoint = { id, kind: "offset", name, from: from!, toward: toward!, along: spec.along, out: spec.out };
  return constructAt(point, byId) ? { point } : { problem: `That offset can't be worked out: the line from ${spec.from} to ${spec.toward} is shorter than ${WORKED_LINE_MIN_M} m, the offset reaches more than ${WORKED_REACH_MAX} times its length, or it lands on one of its points.` };
}
