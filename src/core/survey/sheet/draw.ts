/**
 * Drawing the survey on a sheet, shared by the classic and panel layouts:
 * lots, features, roads, adjoining-land labels, marks, north arrows, the
 * scale bar and the check line. Labels are placed automatically: each label
 * tries a few positions and takes the first that covers no other label, line
 * or point. Geometry is never moved to make room (survey skill, rule 7);
 * whatever still overlaps is reported by `overlappingLabels`.
 */
import { formatDms, toDms } from "../angles";
import { codeOf, lookupCode } from "../codes";
import type { Adjoining, LayerId, Road, SurveyDocument } from "../document";
import { roadWidthText } from "../formats";
import type { Point } from "../geometry";
import type { PlanLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { roadCentreline, roadWidth } from "../roads";
import { STANDARD_SCALES, legIndex } from "../document";
import { fmt, roundTo } from "../units";
import { advanceWidth, textWidth, toPage, wrap, type SceneColor, type SceneItem, type SceneLayer, type SceneText, type Viewport } from "./scene";

export interface DrawSizes {
  label: number;
  small: number;
  lotLabel: number;
  body: number;
  heading: number;
}
export interface DrawLines {
  boundary: number;
  feature: number;
  thin: number;
}

type Quad = [number, number][];

/** Everything already on the page that a new label must not cover. */
export class Placer {
  private readonly quads: Quad[] = [];
  add(q: Quad): void {
    this.quads.push(q);
  }
  segment(a: [number, number], b: [number, number]): void {
    this.quads.push([a, b]);
  }
  free(q: Quad): boolean {
    return !this.quads.some((o) => quadsOverlap(q, o));
  }
}

export interface DrawCtx {
  out: SceneItem[];
  v: Viewport;
  doc: SurveyDocument;
  byId: Map<string, SurveyPoint>;
  sizes: DrawSizes;
  lines: DrawLines;
  /** Degrees of lean for slanted lettering, or 0. */
  slant: number;
  placer: Placer;
  /** Where drawing text may go on the page (x0, y0, x1, y1): inside the frame and clear of the title block. */
  bounds: [number, number, number, number] | null;
  /** Lots whose label is bigger than the lot at this scale (still written inside it), for the checks. */
  cramped: string[];
  /** Texts that found no place inside the bounds, for the checks. */
  outside: string[];
}

export const visible = (doc: SurveyDocument, l: LayerId) => doc.layers[l]?.visible !== false;

/** A text angle (degrees, clockwise) turned to read left to right, and up the page (bottom to top) within 10° of upright, as plans letter them. */
export function readable(angle: number): number {
  let a = angle;
  while (a > 80) a -= 180;
  while (a <= -100) a += 180;
  return a;
}

/** Whether a box lies inside the context's bounds (always, when there are none). */
export const inBounds = (ctx: DrawCtx, q: Quad) => !ctx.bounds || q.every(([x, y]) => x >= ctx.bounds![0] && x <= ctx.bounds![2] && y >= ctx.bounds![1] && y <= ctx.bounds![3]);
export const atPage = (ctx: DrawCtx, p: Point) => toPage(ctx.v, p.e, p.n);

/** A text item, nudged by the surveyor's saved offset for its entity. */
export function text(ctx: DrawCtx, layer: SceneLayer, entity: string, x: number, y: number, value: string, size: number, opts: Partial<{ rotate: number; weight: "regular" | "bold"; anchor: "start" | "middle" | "end"; color: SceneColor; slant: number }> = {}): SceneText {
  const o = ctx.doc.labelOffsets[entity];
  const item: SceneText = {
    kind: "text",
    x: x + (o?.dx ?? 0),
    y: y + (o?.dy ?? 0),
    text: value,
    size,
    rotate: opts.rotate ?? 0,
    weight: opts.weight ?? "regular",
    anchor: opts.anchor ?? "middle",
    font: "sans",
    color: opts.color ?? "ink",
    layer,
    entity,
    ...(opts.slant ?? ctx.slant ? { slant: opts.slant ?? ctx.slant } : {}),
  };
  ctx.out.push(item);
  return item;
}

/** A label raised suffix: "B" then a smaller "1" above the line, centred together on (x, y). */
export function supLabel(ctx: DrawCtx, layer: SceneLayer, entity: string, x: number, y: number, base: string, sup: string, size: number, weight: "regular" | "bold" = "regular"): void {
  const ss = size * 0.62;
  const w1 = advanceWidth(base, size);
  const w2 = sup ? advanceWidth(sup, ss) : 0;
  const x0 = x - (w1 + w2) / 2;
  text(ctx, layer, entity, x0, y, base, size, { anchor: "start", weight });
  if (sup) text(ctx, layer, entity, x0 + w1 + size * 0.04, y - size * 0.42, sup, ss, { anchor: "start", weight });
}

const dashFor = (style: string | undefined): number[] | undefined => (style === "dashed" ? [1.6, 0.8] : style === "ticked" ? [0.4, 0.6] : undefined);

/** Lines and outlines through points: walls, fences, drains, buildings. Codes are written beside them. */
export function drawFeatures(ctx: DrawCtx, inside: [number, number] | null): void {
  const { doc } = ctx;
  for (const f of doc.features) {
    if (!visible(doc, f.layer)) continue;
    const pts = f.points.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    if (pts.length < 2) continue;
    const entry = lookupCode(doc.codes, f.code);
    const page = pts.map((p) => atPage(ctx, p));
    ctx.out.push({ kind: "path", points: page, closed: f.closed, width: ctx.lines.feature, color: "ink", dash: dashFor(entry?.line), layer: f.layer, entity: `feature:${f.id}` });
    for (let i = 0; i + 1 < page.length; i++) ctx.placer.segment(page[i]!, page[i + 1]!);
    if (!f.code.trim()) continue;
    const size = ctx.sizes.label;
    if (f.closed && page.length >= 3) {
      const mx = page.reduce((s, p) => s + p[0], 0) / page.length;
      const my = page.reduce((s, p) => s + p[1], 0) / page.length;
      const t = text(ctx, f.layer, `feature:${f.id}`, mx, my + size * 0.35, f.code, size);
      ctx.placer.add(textQuad(t));
    } else {
      let k = 0;
      for (let i = 1; i < page.length - 1; i++) if (Math.hypot(page[i + 1]![0] - page[i]![0], page[i + 1]![1] - page[i]![1]) > Math.hypot(page[k + 1]![0] - page[k]![0], page[k + 1]![1] - page[k]![1])) k = i;
      const [x1, y1] = page[k]!;
      const [x2, y2] = page[k + 1]!;
      const side: [number, number] = inside ? [inside[0] - (x1 + x2) / 2, inside[1] - (y1 + y2) / 2] : [0, -1];
      const p = besideSegment(x1, y1, x2, y2, side, size);
      const t = text(ctx, f.layer, `feature:${f.id}`, p.x, p.y, f.code, size, { rotate: p.theta });
      ctx.placer.add(textQuad(t));
    }
  }
}

/** Signed page-space area of a ring: positive means the inside is to the left of each leg in page coordinates. */
export function pageArea(ring: [number, number][]): number {
  return ring.reduce((s, [x, y], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length]!;
    return s + (x - ring[0]![0]) * (y2 - ring[0]![1]) - (x2 - ring[0]![0]) * (y - ring[0]![1]);
  }, 0);
}

/**
 * The lots' legs (a leg two lots share is drawn once) and, when asked, the
 * bearing and distance of each leg outside its lot. `highlight` draws one
 * lot heavier, as an extract does. Labels come later (`drawLotLabels`).
 */
export function drawLots(ctx: DrawCtx, lots: PlanLots, opts: { legLabels: boolean; highlight: string | null; secondDecimals: number; distanceDecimals: number }): void {
  const { doc } = ctx;
  const drawn = new Set<string>();
  for (const r of lots.lots) {
    const p = r.parcel;
    if (!p || p.vertices.length < 2) continue;
    const ring = p.vertices.map((v) => atPage(ctx, v));
    const heavy = !opts.highlight || opts.highlight === r.lot.id;
    if (visible(doc, "BOUNDARY")) {
      for (let i = 0; i < p.vertices.length; i++) {
        if (p.vertices.length < 3 && i === p.vertices.length - 1) break;
        const a = p.vertices[i]!;
        const b = p.vertices[(i + 1) % p.vertices.length]!;
        const k = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (drawn.has(k) && !heavy) continue;
        drawn.add(k);
        ctx.out.push({ kind: "path", points: [ring[i]!, ring[(i + 1) % ring.length]!], closed: false, width: heavy ? ctx.lines.boundary : ctx.lines.thin, color: heavy ? "ink" : "muted", layer: "BOUNDARY", entity: `lot:${r.lot.id}` });
        ctx.placer.segment(ring[i]!, ring[(i + 1) % ring.length]!);
      }
    }
    if (opts.legLabels && visible(doc, "DIMENSIONS") && heavy) {
      const area = pageArea(ring);
      const [cx, cy] = atPage(ctx, p.labelAt);
      p.legs.forEach((leg, i) => {
        if (leg.bearing === null) return;
        const [x1, y1] = atPage(ctx, leg.from);
        const [x2, y2] = atPage(ctx, leg.to);
        const outside: [number, number] = area > 0 ? [y2 - y1, -(x2 - x1)] : area < 0 ? [-(y2 - y1), x2 - x1] : [(x1 + x2) / 2 - cx, (y1 + y2) / 2 - cy];
        const b = besideSegment(x1, y1, x2, y2, outside, ctx.sizes.label);
        const value = `${formatDms(toDms(leg.bearing, opts.secondDecimals))}  ${fmt(leg.distance, opts.distanceDecimals)}`;
        const t = text(ctx, "DIMENSIONS", `leg:${r.lot.id}:${i}`, b.x, b.y, value, ctx.sizes.label, { rotate: b.theta });
        ctx.placer.add(textQuad(t));
      });
    }
  }
}

/**
 * Lot labels, drawn after the lines, features and symbols inside the lots so
 * they can avoid them: each tries its lot's inner point first, then points
 * on rings around it that stay inside the lot, and takes the first that
 * covers nothing.
 */
export function drawLotLabels(ctx: DrawCtx, lots: PlanLots, opts: { extentUnder: ((areaM2: number) => string) | null; highlight: string | null }): void {
  if (!visible(ctx.doc, "LOT_TEXT")) return;
  for (const r of lots.lots) {
    const p = r.parcel;
    if (!p || p.vertices.length < 3 || p.crossings.length > 0) continue;
    const ring = p.vertices.map((v) => atPage(ctx, v));
    const minor = Boolean(opts.highlight && opts.highlight !== r.lot.id);
    const base = minor ? `Lot ${r.lot.label}` : r.lot.label;
    const size = minor ? ctx.sizes.label : ctx.sizes.lotLabel;
    const extent = !minor && opts.extentUnder ? opts.extentUnder(p.areaM2) : null;
    const w = Math.max(textWidth(base, size) + (r.lot.sup ? textWidth(r.lot.sup, size * 0.62) : 0), extent ? textWidth(extent, ctx.sizes.body) : 0);
    const h = size * 1.1 + (extent ? ctx.sizes.body * 1.4 : 0);
    if (!r.lot.label.trim()) continue;
    const [cx0, cy0] = atPage(ctx, p.labelAt);
    // Positions to try: round the centre of gravity, then points across the whole lot, deepest inside first.
    const candidates: [number, number][] = [[cx0, cy0]];
    for (const rad of [3, 6, 9, 13, 18]) for (let k = 0; k < 8; k++) candidates.push([cx0 + Math.cos((k * Math.PI) / 4) * rad, cy0 + Math.sin((k * Math.PI) / 4) * rad]);
    const deep = interiorSamples(ring);
    candidates.push(...deep);
    const box = (x: number, y: number): Quad => [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
    const within = (x: number, y: number) => box(x, y).every(([qx, qy]) => insidePage(qx, qy, ring));
    const fits = candidates.find(([x, y]) => within(x, y) && ctx.placer.free(box(x, y))) ?? candidates.find(([x, y]) => within(x, y));
    // A label never sits outside its own lot: if it can't fit, it goes at the point deepest inside, and the checks say so.
    const fallback = insidePage(cx0, cy0, ring) ? ([cx0, cy0] as [number, number]) : (deep[0] ?? ([cx0, cy0] as [number, number]));
    if (!fits) ctx.cramped.push(`${r.lot.label}${r.lot.sup}`);
    const [cx, cy] = fits ?? fallback;
    const top = cy - h / 2;
    supLabel(ctx, "LOT_TEXT", `lot:${r.lot.id}`, cx, top + size * 0.95, base, r.lot.sup, size, "regular");
    if (extent) text(ctx, "LOT_TEXT", `lot-extent:${r.lot.id}`, cx, top + size * 1.1 + ctx.sizes.body * 1.15, extent, ctx.sizes.body);
    ctx.placer.add(box(cx, cy));
  }
}

/**
 * Points inside a ring, the farthest from its legs first: where a label has
 * the most room. Taken as the middles of the spans that horizontal and
 * vertical lines cut through the ring, so even a narrow strip (an access
 * reservation) gets points, which a grid can step over.
 */
function interiorSamples(ring: [number, number][]): [number, number][] {
  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const out: { p: [number, number]; d: number }[] = [];
  const spans = (axis: 0 | 1, at: number): [number, number][] => {
    const cuts: number[] = [];
    for (let k = 0; k < ring.length; k++) {
      const a = ring[k]!;
      const b = ring[(k + 1) % ring.length]!;
      const [ua, va, ub, vb] = axis === 0 ? [a[0], a[1], b[0], b[1]] : [a[1], a[0], b[1], b[0]];
      if (va > at !== vb > at) cuts.push(ua + ((at - va) * (ub - ua)) / (vb - va));
    }
    cuts.sort((p, q) => p - q);
    const mids: [number, number][] = [];
    for (let k = 0; k + 1 < cuts.length; k += 2) {
      const m = (cuts[k]! + cuts[k + 1]!) / 2;
      mids.push(axis === 0 ? [m, at] : [at, m]);
    }
    return mids;
  };
  const n = 40;
  const points: [number, number][] = [];
  for (let i = 1; i < n; i++) {
    points.push(...spans(0, y0 + ((y1 - y0) * i) / n), ...spans(1, x0 + ((x1 - x0) * i) / n));
  }
  for (const [x, y] of points) {
    {
      let d = Infinity;
      for (let k = 0; k < ring.length; k++) {
        const [ax, ay] = ring[k]!;
        const [bx, by] = ring[(k + 1) % ring.length]!;
        const L = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
        const t = Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / L));
        d = Math.min(d, Math.hypot(x - (ax + t * (bx - ax)), y - (ay + t * (by - ay))));
      }
      out.push({ p: [x, y], d });
    }
  }
  return out.sort((a, b) => b.d - a.d).map((o) => o.p);
}

/** Ray-casting point-in-polygon on page coordinates. */
function insidePage(x: number, y: number, ring: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * Corner points and their codes. The code (its first word) is written beside
 * the corner at the first of eight positions, outward first, that covers
 * nothing; point numbers too when asked (the classic face leaves them to the
 * schedule overleaf).
 */
export function drawCorners(ctx: DrawCtx, lots: PlanLots, opts: { numbers: boolean; circles: boolean }): void {
  const { doc } = ctx;
  const seen = new Map<string, { p: SurveyPoint; centres: [number, number][] }>();
  for (const r of lots.lots) {
    const p = r.parcel;
    if (!p) continue;
    const c = atPage(ctx, p.labelAt);
    for (const v of p.vertices) {
      const s = seen.get(v.id) ?? { p: v, centres: [] };
      s.centres.push(c);
      seen.set(v.id, s);
    }
  }
  const corners = [...seen.values()];
  if (opts.circles && visible(doc, "POINTS")) {
    for (const { p } of corners) {
      const [x, y] = atPage(ctx, p);
      ctx.out.push({ kind: "circle", cx: x, cy: y, r: 0.55, width: ctx.lines.thin, color: "ink", fill: "paper", layer: "POINTS", entity: `pt:${p.id}` });
      ctx.placer.add([[x - 0.6, y - 0.6], [x + 0.6, y - 0.6], [x + 0.6, y + 0.6], [x - 0.6, y + 0.6]]);
    }
  }
  for (const { p, centres } of corners) {
    const [x, y] = atPage(ctx, p);
    // Away from the lots this corner belongs to.
    let dx = centres.reduce((s, c) => s + (x - c[0]), 0);
    let dy = centres.reduce((s, c) => s + (y - c[1]), 0);
    const d = Math.hypot(dx, dy);
    [dx, dy] = d > 0 ? [dx / d, dy / d] : [0, -1];
    const lines: { value: string; size: number; layer: SceneLayer; entity: string; weight: "regular" | "bold"; color: SceneColor }[] = [];
    if (opts.numbers && visible(doc, "POINT_NUMBERS")) lines.push({ value: p.pointId, size: ctx.sizes.label, layer: "POINT_NUMBERS", entity: `pt:${p.id}`, weight: "bold", color: "ink" });
    const code = codeOf(p.code);
    if (code && visible(doc, "BOUNDARY_MARKS")) lines.push({ value: code, size: ctx.sizes.small, layer: "BOUNDARY_MARKS", entity: `mark:${p.id}`, weight: "regular", color: opts.numbers ? "muted" : "ink" });
    if (lines.length === 0) continue;
    const blockH = lines.reduce((s, l) => s + l.size * 1.15, 0);
    const blockW = Math.max(...lines.map((l) => textWidth(l.value, l.size)));
    const r = 1.6 + Math.max(blockW, blockH) / 2;
    const base = Math.atan2(dy, dx);
    const tries = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => base + (k * Math.PI) / 4);
    let chosen: [number, number] = [x + dx * r, y + dy * r];
    for (const a of tries) {
      const cxy: [number, number] = [x + Math.cos(a) * r, y + Math.sin(a) * r];
      const q: Quad = [[cxy[0] - blockW / 2, cxy[1] - blockH / 2], [cxy[0] + blockW / 2, cxy[1] - blockH / 2], [cxy[0] + blockW / 2, cxy[1] + blockH / 2], [cxy[0] - blockW / 2, cxy[1] + blockH / 2]];
      if (ctx.placer.free(q)) {
        chosen = cxy;
        break;
      }
    }
    let ty = chosen[1] - blockH / 2;
    for (const l of lines) {
      ty += l.size * 1.15;
      const t = text(ctx, l.layer, l.entity, chosen[0], ty - l.size * 0.2, l.value, l.size, { weight: l.weight, color: l.color });
      ctx.placer.add(textQuad(t));
    }
  }
}

/**
 * Points that aren't lot corners but carry a mark or symbol code: an electric
 * post, a culvert, a well. Marks get a small circle and their code; a well
 * gets its symbol (a circle with a cross) and its name, as plans write it.
 */
export function drawLoosePoints(ctx: DrawCtx, points: readonly SurveyPoint[], lots: PlanLots): void {
  const { doc } = ctx;
  if (!visible(doc, "BOUNDARY_MARKS")) return;
  const corners = new Set(lots.lots.flatMap((r) => r.parcel?.vertices.map((v) => v.id) ?? []));
  for (const p of points) {
    if (corners.has(p.id)) continue;
    const entry = lookupCode(doc.codes, codeOf(p.code));
    if (!entry || (entry.kind !== "mark" && entry.kind !== "symbol")) continue;
    const [x, y] = atPage(ctx, p);
    if (x < ctx.v.x - 5 || x > ctx.v.x + ctx.v.w + 5 || y < ctx.v.y - 5 || y > ctx.v.y + ctx.v.h + 5) continue;
    const symbol = entry.kind === "symbol";
    const r = symbol ? 1.3 : 0.5;
    ctx.out.push({ kind: "circle", cx: x, cy: y, r, width: ctx.lines.thin, color: "ink", fill: "paper", layer: "BOUNDARY_MARKS", entity: `pt:${p.id}` });
    if (symbol) {
      ctx.out.push({ kind: "path", points: [[x - r * 0.7, y], [x + r * 0.7, y]], closed: false, width: ctx.lines.thin, color: "ink", layer: "BOUNDARY_MARKS", entity: `pt:${p.id}` });
      ctx.out.push({ kind: "path", points: [[x, y - r * 0.7], [x, y + r * 0.7]], closed: false, width: ctx.lines.thin, color: "ink", layer: "BOUNDARY_MARKS", entity: `pt:${p.id}` });
    }
    ctx.placer.add([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]);
    const value = symbol ? entry.meaning : entry.code;
    const size = ctx.sizes.small;
    const w = textWidth(value, size);
    for (const [dx, dy] of [[r + 1 + w / 2, size * 0.35], [-(r + 1 + w / 2), size * 0.35], [0, -(r + 1)], [0, r + 1 + size]] as const) {
      const t: SceneText = { kind: "text", x: x + dx, y: y + dy, text: value, size, rotate: 0, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "BOUNDARY_MARKS", entity: `mark:${p.id}`, ...(ctx.slant ? { slant: ctx.slant } : {}) };
      if (ctx.placer.free(textQuad(t)) || (dx === 0 && dy > 0)) {
        text(ctx, "BOUNDARY_MARKS", `mark:${p.id}`, t.x, t.y, value, size);
        ctx.placer.add(textQuad(t));
        break;
      }
    }
  }
}

/** Roads: both edges, the name along the middle and the computed width under it, and direction texts at the ends. */
export function drawRoads(ctx: DrawCtx, roads: readonly Road[]): void {
  const { doc } = ctx;
  if (!visible(doc, "ROADS")) return;
  for (const road of roads) {
    const a = road.edgeA.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    const b = road.edgeB.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    for (const edge of [a, b]) {
      if (edge.length < 2) continue;
      const page = edge.map((p) => atPage(ctx, p));
      ctx.out.push({ kind: "path", points: page, closed: false, width: ctx.lines.feature, color: "ink", layer: "ROADS", entity: `road:${road.id}` });
      for (let i = 0; i + 1 < page.length; i++) ctx.placer.segment(page[i]!, page[i + 1]!);
    }
    const centre = roadCentreline(a, b).map((p) => atPage(ctx, p));
    if (centre.length < 2) continue;
    let k = 0;
    for (let i = 1; i + 1 < centre.length; i++) if (Math.hypot(centre[i + 1]![0] - centre[i]![0], centre[i + 1]![1] - centre[i]![1]) > Math.hypot(centre[k + 1]![0] - centre[k]![0], centre[k + 1]![1] - centre[k]![1])) k = i;
    const [x1, y1] = centre[k]!;
    const [x2, y2] = centre[k + 1]!;
    const theta = readable((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const width = road.width !== "none" && b.length >= 2 ? roadWidth(a, b) : null;
    const rad = (theta * Math.PI) / 180;
    // Name a little above the centreline, width a little below, both along the road.
    const up: [number, number] = [Math.sin(rad), -Math.cos(rad)];
    const lines = [road.name.trim(), width ? roadWidthText(width.minM, width.maxM, road.width === "metres" ? "metres" : "feet") : ""].filter(Boolean);
    lines.forEach((value, i) => {
      const size = i === 0 ? ctx.sizes.label : ctx.sizes.small;
      const off = lines.length === 2 ? (i === 0 ? 0.3 : -0.3 - size * 0.9) * -1 : -size * 0.35;
      const t = text(ctx, "ROADS", `road${i ? "-width" : ""}:${road.id}`, mx - up[0] * off, my - up[1] * off, value, size, { rotate: theta });
      ctx.placer.add(textQuad(t));
    });
    // Direction texts at the ends of the first edge.
    const ends: [string, SurveyPoint | undefined, SurveyPoint | undefined][] = [
      [road.start, a[0], a[1]],
      [road.end, a[a.length - 1], a[a.length - 2]],
    ];
    ends.forEach(([value, end, next], i) => {
      if (!value.trim() || !end || !next) return;
      const [ex, ey] = atPage(ctx, end);
      const [nx, ny] = atPage(ctx, next);
      const len = Math.hypot(ex - nx, ey - ny) || 1;
      const ux = (ex - nx) / len;
      const uy = (ey - ny) / len;
      const tx = ex + ux * 6;
      const ty = ey + uy * 6;
      const th = readable((Math.atan2(uy, ux) * 180) / Math.PI);
      const t = text(ctx, "ROADS", `road-dir-${i}:${road.id}`, tx, ty, value.trim(), ctx.sizes.small, { rotate: th });
      ctx.placer.add(textQuad(t));
    });
  }
}

/**
 * Adjoining-land labels: horizontal text outside the lot's leg, wrapped to a
 * few lines, at the first offset that covers nothing, with an arrow leader
 * back to the leg when it sits away from it.
 */
export function drawAdjoining(ctx: DrawCtx, adjoining: readonly Adjoining[], lots: PlanLots): void {
  const { doc } = ctx;
  if (!visible(doc, "ADJOINING")) return;
  for (const adj of adjoining) {
    const r = lots.lots.find((l) => l.lot.id === adj.lot);
    const p = r?.parcel;
    if (!p || p.vertices.length < 3) continue;
    // A label whose leg the lot no longer has isn't drawn anywhere: the checks say so and stop the export.
    const k = legIndex(r.lot, adj.from, adj.to);
    if (k < 0) continue;
    const a = p.vertices[k]!;
    const b = p.vertices[(k + 1) % p.vertices.length]!;
    const [x1, y1] = atPage(ctx, a);
    const [x2, y2] = atPage(ctx, b);
    const ring = p.vertices.map((v) => atPage(ctx, v));
    const area = pageArea(ring);
    const len = Math.hypot(x2 - x1, y2 - y1) || 1;
    let [nx, ny] = area > 0 ? [(y2 - y1) / len, -(x2 - x1) / len] : [-(y2 - y1) / len, (x2 - x1) / len];
    if (area === 0) [nx, ny] = [0, -1];
    const size = ctx.sizes.small;
    const lines = wrap(adj.text, size, 46);
    const w = Math.max(...lines.map((l) => textWidth(l, size)));
    const h = lines.length * size * 1.25;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    let chosen: [number, number] | null = null;
    let firstInBounds: [number, number] | null = null;
    for (const dist of [3, 6, 10, 15, 21]) {
      for (const shift of [0, 0.25, -0.25]) {
        // The block's centre, far enough out that its nearest side clears the leg.
        const reach = dist + Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2);
        const cx = mx + ux * shift * len + nx * reach;
        const cy = my + uy * shift * len + ny * reach;
        const q: Quad = [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
        if (!inBounds(ctx, q)) continue;
        firstInBounds ??= [cx, cy];
        if (ctx.placer.free(q)) {
          chosen = [cx, cy];
          break;
        }
      }
      if (chosen) break;
    }
    // No room for a block beside the leg: write it along the leg, outside the lot, as surveyors do on side legs.
    if (!chosen) {
      const along = alongLeg(ctx, adj.text, size, [x1, y1], [x2, y2], [nx, ny]);
      if (along) {
        for (const t of along) {
          text(ctx, "ADJOINING", `adjoining:${adj.id}`, t.x, t.y, t.text, size, { rotate: t.rotate });
          ctx.placer.add(textQuad(t));
        }
        continue;
      }
    }
    const fallback: [number, number] = [mx + nx * (6 + w / 2), my + ny * (6 + h / 2)];
    if (!chosen && !firstInBounds) ctx.outside.push(adj.text);
    const [cx, cy] = chosen ?? firstInBounds ?? fallback;
    let ty = cy - h / 2;
    for (const line of lines) {
      ty += size * 1.25;
      const t = text(ctx, "ADJOINING", `adjoining:${adj.id}`, cx, ty - size * 0.25, line, size);
      ctx.placer.add(textQuad(t));
    }
    // Leader from the block's nearest edge to the leg's middle, with an arrowhead at the leg.
    const sx = cx - nx * (Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + 0.8);
    const sy = cy - ny * (Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2) + 0.8);
    const lx = mx + ux * 0;
    const ly = my + uy * 0;
    if (Math.hypot(sx - lx, sy - ly) > 2.5) {
      const ex = lx + nx * 0.4;
      const ey = ly + ny * 0.4;
      ctx.out.push({ kind: "path", points: [[sx, sy], [ex, ey]], closed: false, width: ctx.lines.thin, color: "ink", layer: "ADJOINING", entity: `adjoining:${adj.id}` });
      const al = Math.hypot(sx - ex, sy - ey) || 1;
      const ax = (sx - ex) / al;
      const ay = (sy - ey) / al;
      ctx.out.push({ kind: "path", points: [[ex, ey], [ex + ax * 1.6 - ay * 0.5, ey + ay * 1.6 + ax * 0.5], [ex + ax * 1.6 + ay * 0.5, ey + ay * 1.6 - ax * 0.5]], closed: true, width: ctx.lines.thin, color: "ink", fill: "ink", layer: "ADJOINING", entity: `adjoining:${adj.id}` });
    }
  }
}

/**
 * An adjoining-land label written along its leg, just outside the lot, read
 * left to right (or bottom to top), wrapped to the leg's length. Null when no
 * offset keeps it inside the bounds and clear of what's drawn.
 */
function alongLeg(ctx: DrawCtx, value: string, size: number, [x1, y1]: [number, number], [x2, y2]: [number, number], [nx, ny]: [number, number]): SceneText[] | null {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < size * 4) return null;
  const angle = readable((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
  const rad = (angle * Math.PI) / 180;
  const [c, s] = [Math.cos(rad), Math.sin(rad)];
  const lines = wrap(value, size, len * 0.95);
  // The text's "up" is (s, -c) on the page; when the outside of the lot is up, the first line goes farthest out.
  const outIsUp = nx * s - ny * c > 0;
  const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
  for (const dist of [1.2, 2.5, 4, 6]) {
    const items: SceneText[] = lines.map((line, k) => {
      const row = outIsUp ? lines.length - 1 - k : k;
      const off = dist + size * 0.46 + row * size * 1.25;
      const [cx, cy] = [mx + nx * off, my + ny * off];
      // A line's visual middle sits 0.26 of its size above its baseline.
      return { kind: "text", x: cx - 0.26 * size * s, y: cy + 0.26 * size * c, text: line, size, rotate: angle, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "ADJOINING" };
    });
    const quads = items.map(textQuad);
    if (quads.every((q) => inBounds(ctx, q) && ctx.placer.free(q))) return items;
  }
  return null;
}

/** The tall needle north arrow seen on Sri Lankan plans: a thin arrow with its head filled on one side and an N worked across the shaft. */
export function drawNeedleNorth(ctx: DrawCtx, x: number, top: number, height: number): void {
  const w = height * 0.055;
  const head = height * 0.32;
  const ink = (points: [number, number][], closed: boolean, fill?: "ink") => ctx.out.push({ kind: "path", points, closed, width: ctx.lines.thin, color: "ink", ...(fill ? { fill } : {}), layer: "TITLE", entity: "north" });
  // The head: left half filled, right half outlined.
  ink([[x, top], [x - w, top + head], [x, top + head * 0.82]], true, "ink");
  ink([[x, top], [x + w, top + head], [x, top + head * 0.82]], true);
  // The shaft.
  ink([[x, top + head * 0.82], [x, top + height]], false);
  // An N across the lower shaft.
  const ny = top + height * 0.62;
  const nh = height * 0.16;
  const nw = height * 0.07;
  ink([[x - nw, ny + nh], [x - nw, ny], [x + nw, ny + nh], [x + nw, ny]], false);
}

/** The simple north point of the panel layout, with "Grid north" under it. */
export function drawSimpleNorth(ctx: DrawCtx, x: number, y: number, local: boolean): void {
  ctx.out.push({ kind: "path", points: [[x, y - 8], [x + 3.2, y + 4], [x, y + 1.6], [x - 3.2, y + 4]], closed: true, width: ctx.lines.thin, color: "ink", fill: "ink", layer: "TITLE", entity: "north" });
  ctx.out.push({ kind: "text", x, y: y - 9.5, text: "N", size: ctx.sizes.heading * 1.2, weight: "bold", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "TITLE", entity: "north" });
  ctx.out.push({ kind: "text", x, y: y + 8, text: local ? "Site grid north" : "Grid north", size: ctx.sizes.small, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "muted", layer: "TITLE", entity: "north" });
}

/** A round scale-bar length in metres, between 40 and 100 mm on paper where possible. */
export function scaleBarMetres(scale: number): number {
  const target = (50 * scale) / 1000;
  const pow = 10 ** Math.floor(Math.log10(target));
  return [1, 2, 5, 10].map((m) => m * pow).filter((m) => m <= target * 1.6).pop() ?? pow;
}

export function drawScaleBar(ctx: DrawCtx, sx: number, sy: number, caption: boolean): void {
  const { v } = ctx;
  const metres = scaleBarMetres(v.scale);
  const seg = (metres * 1000) / v.scale / 4;
  for (let i = 0; i < 4; i++) {
    ctx.out.push({ kind: "path", points: [[sx + i * seg, sy], [sx + (i + 1) * seg, sy], [sx + (i + 1) * seg, sy + 1.6], [sx + i * seg, sy + 1.6]], closed: true, width: ctx.lines.thin, color: "ink", fill: i % 2 === 0 ? "ink" : "paper", layer: "TITLE", entity: "scalebar" });
  }
  const tick = (x: number, s: string) => ctx.out.push({ kind: "text", x, y: sy - 1.2, text: s, size: ctx.sizes.small, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "TITLE", entity: "scalebar" });
  tick(sx, "0");
  // Half of 5 m is 2.5 m, never "3": the tick shows as many decimals as the half needs.
  const half = metres / 2;
  tick(sx + 2 * seg, fmt(half, Number.isInteger(half) ? 0 : Number.isInteger(roundTo(half * 10, 6)) ? 1 : 2));
  tick(sx + 4 * seg, `${fmt(metres, 0)} m`);
  if (caption) ctx.out.push({ kind: "text", x: sx, y: sy + 5.6, text: `Scale 1:${fmt(v.scale, 0)}`, size: ctx.sizes.body, weight: "bold", font: "sans", anchor: "start", rotate: 0, color: "ink", layer: "TITLE", entity: "scalebar" });
}

/** A 100 mm line: a ruler on the printed sheet shows at once whether the printer kept the scale. */
export function drawCheckLine(ctx: DrawCtx, x: number, y: number): void {
  ctx.out.push({ kind: "path", points: [[x, y], [x + 100, y]], closed: false, width: ctx.lines.thin, color: "ink", layer: "TITLE", entity: "checkline" });
  for (const cx of [x, x + 100]) ctx.out.push({ kind: "path", points: [[cx, y - 1.2], [cx, y + 1.2]], closed: false, width: ctx.lines.thin, color: "ink", layer: "TITLE", entity: "checkline" });
  ctx.out.push({ kind: "text", x: x + 50, y: y - 1.5, text: "100 mm when printed at actual size", size: ctx.sizes.small * 0.9, weight: "regular", font: "sans", anchor: "middle", rotate: 0, color: "muted", layer: "TITLE", entity: "checkline" });
}

/** The largest standard scale (smallest denominator) at which the extent fits the viewport with room for labels. */
export function suggestScale(extentE: number, extentN: number, viewportW: number, viewportH: number): number | null {
  const need = Math.max((Math.max(extentE, 0.001) * 1000) / (viewportW * 0.8), (Math.max(extentN, 0.001) * 1000) / (viewportH * 0.8));
  return STANDARD_SCALES.find((s) => s >= need) ?? null;
}

/**
 * Where a label parallel to a segment goes: at its middle, turned to read
 * upright, on the side `side` points to, with its nearer edge 1.1 mm clear of
 * the line whichever way up the text is.
 */
export function besideSegment(x1: number, y1: number, x2: number, y2: number, side: [number, number], size: number): { x: number; y: number; theta: number } {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const theta = readable((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
  let nx = -(y2 - y1) / len;
  let ny = (x2 - x1) / len;
  if (nx * side[0] + ny * side[1] < 0) {
    nx = -nx;
    ny = -ny;
  }
  const rad = (theta * Math.PI) / 180;
  const outIsUp = nx * Math.sin(rad) - ny * Math.cos(rad) > 0;
  const gap = outIsUp ? 1.1 : 1.1 + size * 0.72;
  return { x: (x1 + x2) / 2 + nx * gap, y: (y1 + y2) / 2 + ny * gap, theta };
}

/** A text's outline on the page: its estimated width, cap height and descent, turned with it. */
export function textQuad(t: SceneText): Quad {
  const w = textWidth(t.text, t.size, t.font);
  const u0 = t.anchor === "middle" ? -w / 2 : t.anchor === "end" ? -w : 0;
  const rad = (t.rotate * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const inset = 0.15;
  const corners: [number, number][] = [
    [u0 + inset, -t.size * 0.72 + inset],
    [u0 + w - inset, -t.size * 0.72 + inset],
    [u0 + w - inset, t.size * 0.2 - inset],
    [u0 + inset, t.size * 0.2 - inset],
  ];
  return corners.map(([u, v]) => [t.x + u * c - v * s, t.y + u * s + v * c]);
}

/** Separating axis test for two convex shapes (a segment counts as a two-corner shape). */
export function quadsOverlap(a: Quad, b: Quad): boolean {
  for (const q of [a, b]) {
    for (let i = 0; i < q.length; i++) {
      const [x1, y1] = q[i]!;
      const [x2, y2] = q[(i + 1) % q.length]!;
      const ax = -(y2 - y1);
      const ay = x2 - x1;
      if (ax === 0 && ay === 0) continue;
      const pa = a.map(([x, y]) => x * ax + y * ay);
      const pb = b.map(([x, y]) => x * ax + y * ay);
      if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
    }
  }
  // Two segments (or a segment and a box) can pass every edge-normal test yet be apart along the segment's own direction.
  for (const q of [a, b]) {
    if (q.length !== 2) continue;
    const [[x1, y1], [x2, y2]] = q as [[number, number], [number, number]];
    const ax = x2 - x1;
    const ay = y2 - y1;
    const pa = a.map(([x, y]) => x * ax + y * ay);
    const pb = b.map(([x, y]) => x * ax + y * ay);
    if (Math.max(...pa) <= Math.min(...pb) || Math.max(...pb) <= Math.min(...pa)) return false;
  }
  return true;
}

/**
 * Pairs of drawing labels that cover each other, or cover a boundary point,
 * by their estimated outlines. Only reported: a person moves labels, the
 * composer never does (the survey skill's rule 7).
 */
export function overlappingLabels(items: SceneItem[]): [string, string][] {
  const texts = items.filter((i): i is SceneText => i.kind === "text" && i.layer !== "TITLE" && i.layer !== "SHEET");
  const shapes: { name: string; quad: Quad; entity?: string }[] = texts.map((t) => ({ name: t.text, quad: textQuad(t), entity: t.entity }));
  for (const c of items) {
    if (c.kind !== "circle" || c.layer !== "POINTS") continue;
    const r = c.r;
    shapes.push({ name: "a point", quad: [[c.cx - r, c.cy - r], [c.cx + r, c.cy - r], [c.cx + r, c.cy + r], [c.cx - r, c.cy + r]] });
  }
  const out: [string, string][] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      // A label and its own raised suffix touch by design.
      if (j < texts.length && shapes[i]!.entity && shapes[i]!.entity === shapes[j]!.entity && shapes[i]!.entity!.startsWith("lot:")) continue;
      if (quadsOverlap(shapes[i]!.quad, shapes[j]!.quad)) out.push([shapes[i]!.name, shapes[j]!.name]);
    }
  }
  return out;
}
