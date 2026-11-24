/**
 * Drawing the survey on a sheet, shared by the classic and panel layouts:
 * lots, features, roads, adjoining-land labels, marks, north arrows, the
 * scale bar and the check line. Each movable label offers its candidate
 * positions in order of preference, and the sheet's labels are placed
 * together (labels.ts, ADR 0242). Geometry is never moved to make room
 * (survey skill, rule 7); whatever still overlaps is reported by
 * `overlappingLabels`.
 */
import { formatDms, toDms } from "../angles";
import { curveOfLeg, densifyCurve } from "../lotcurves";
import { densify } from "../arcs";
import { codeOf, lookupCode } from "../codes";
import type { Adjoining, LayerId, Road, SurveyDocument } from "../document";
import { roadWidthText } from "../formats";
import type { Point } from "../geometry";
import type { PlanLots } from "../lots";
import type { SurveyPoint } from "../parcel";
import { roadCentreline, roadWidth } from "../roads";
import { STANDARD_SCALES, legIndex } from "../document";
import { fmt, roundTo } from "../units";
import { Placer, quadsOverlap, type Quad } from "./labels";
import { advanceWidth, textWidth, toPage, wrap, type SceneColor, type SceneItem, type SceneLayer, type SceneText, type Viewport } from "./scene";

export { Placer, quadsOverlap };

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
  /** Lines drawn as the lot boundary they run along (stage 261), for the checks: what, and how far its points lie from the boundary. */
  joined?: { what: string; offM: number }[];
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
/** Shapes moved by the surveyor's saved offset for an entity, as `text` draws it. */
const nudged = (ctx: DrawCtx, entity: string, q: Quad): Quad => {
  const o = ctx.doc.labelOffsets[entity];
  return o ? q.map(([x, y]) => [x + o.dx, y + o.dy] as [number, number]) : q;
};

/**
 * How a label the surveyor moved by hand is placed (ADR 0242), given the entities its shapes are drawn as, in order: it's pinned; it
 * stays at the place its offset was measured from (older offsets have none, and take their first free place as before); and each of
 * its shapes is shifted by its own entity's offset, which is what other labels must avoid. Nothing for a label nobody moved.
 */
export function moved(ctx: DrawCtx, entities: readonly string[]): { pinned: boolean; slot: number | null; shift?: (q: Quad, k: number) => Quad } {
  const offsets = entities.map((e) => ctx.doc.labelOffsets[e]);
  if (!offsets.some(Boolean)) return { pinned: false, slot: null };
  return { pinned: true, slot: offsets.find((o) => o?.slot !== undefined)?.slot ?? null, shift: (q, k) => nudged(ctx, entities[Math.min(k, entities.length - 1)]!, q) };
}

/** A text item, nudged by the surveyor's saved offset for its entity. */
export function text(ctx: DrawCtx, layer: SceneLayer, entity: string, x: number, y: number, value: string, size: number, opts: Partial<{ rotate: number; weight: "regular" | "bold"; anchor: "start" | "middle" | "end"; color: SceneColor; slant: number; slot: number }> = {}): SceneText {
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
    ...(opts.slot !== undefined ? { slot: opts.slot } : {}),
  };
  ctx.out.push(item);
  return item;
}

/** A label raised suffix: "B" then a smaller "1" above the line, centred together on (x, y). */
export function supLabel(ctx: DrawCtx, layer: SceneLayer, entity: string, x: number, y: number, base: string, sup: string, size: number, weight: "regular" | "bold" = "regular", slot?: number): void {
  const ss = size * 0.62;
  const w1 = advanceWidth(base, size);
  const w2 = sup ? advanceWidth(sup, ss) : 0;
  const x0 = x - (w1 + w2) / 2;
  const at = slot !== undefined ? { slot } : {};
  text(ctx, layer, entity, x0, y, base, size, { anchor: "start", weight, ...at });
  if (sup) text(ctx, layer, entity, x0 + w1 + size * 0.04, y - size * 0.42, sup, ss, { anchor: "start", weight, ...at });
}

const dashFor = (style: string | undefined): number[] | undefined => (style === "dashed" ? [1.6, 0.8] : style === "ticked" ? [0.4, 0.6] : undefined);

/** Lines and outlines through points: walls, fences, drains, buildings. Codes are written beside them. */
export function drawFeatures(ctx: DrawCtx, inside: [number, number] | null): void {
  const { doc } = ctx;
  const quiet = carriedOn(ctx);
  for (const f of doc.features) {
    if (!visible(doc, f.layer)) continue;
    const pts = f.points.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
    if (pts.length < 2) continue;
    const entry = lookupCode(doc.codes, f.code);
    // Curves (ADR 0247) as chords no more than 0.02 mm of paper from the curve, at the plan's scale.
    // A line missing a point draws no curve: its indexes would point at the wrong points (and the checks stop the plan anyway).
    const page = densify(pts, pts.length === f.points.length ? f.arcs : undefined, (0.02 / 1000) * ctx.v.scale).map((p) => atPage(ctx, p));
    const dash = dashFor(f.dashed ? "dashed" : entry?.line);
    // A wall, fence or building side that runs along a lot's side is that side (stage 261, ADR 0269): the side is drawn once, by the
    // boundary, and the line only where it leaves it, carried on to the boundary, so two strokes a few centimetres apart never print as
    // one blurred line. Its code is still written, the drawing keeps every point, and the checks list what was drawn this way.
    // Only walls, fences and buildings drawn solid: a dashed roof's edge, a drain or a ticked line keeps its own look beside the boundary.
    const boundaryLike = (f.layer === "WALLS" || f.layer === "FENCES" || f.layer === "BUILDINGS") && !dash;
    const onLot = boundaryLike && !f.arcs && pts.length === f.points.length && visible(doc, "BOUNDARY") ? alongBoundary(ctx, pts, f.closed) : null;
    // A leg along the boundary, as the page draws its side: what its code, tick and stub are placed against.
    const sideOnPage = (i: number): [[number, number], [number, number]] | null => {
      const s = onLot?.sides[i];
      return s ? [atPage(ctx, s[0]), atPage(ctx, s[1])] : null;
    };
    if (!onLot) ctx.out.push({ kind: "path", points: page, closed: f.closed, width: ctx.lines.feature, color: "ink", dash, layer: f.layer, entity: `feature:${f.id}` });
    else {
      for (const r of onLot.runs) ctx.out.push({ kind: "path", points: r.map((p) => atPage(ctx, p)), closed: false, width: ctx.lines.feature, color: "ink", dash, layer: f.layer, entity: `feature:${f.id}` });
      (ctx.joined ??= []).push({ what: featureName(f, pts), offM: onLot.offM });
    }
    for (let i = 0; i + 1 < page.length; i++) ctx.placer.segment(page[i]!, page[i + 1]!);
    // Carrying on past an end (stage 261, ADR 0269): a stub along the end leg's direction, a fixed length of paper, never a surveyed one.
    if (!f.closed && f.runsOn && page.length >= 2) {
      const stub = (from: [number, number], to: [number, number]) => {
        const len = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1;
        const end: [number, number] = [to[0] + ((to[0] - from[0]) / len) * RUN_ON_MM, to[1] + ((to[1] - from[1]) / len) * RUN_ON_MM];
        ctx.out.push({ kind: "path", points: [to, end], closed: false, width: ctx.lines.feature, color: "ink", dash, layer: f.layer, entity: `feature:${f.id}` });
        ctx.placer.segment(to, end);
      };
      // An end whose leg is drawn as the boundary carries on from the boundary, along it.
      const s0 = sideOnPage(0);
      const sN = sideOnPage(page.length - 2);
      if (f.runsOn === "start" || f.runsOn === "both") stub(s0 ? footOnPage(page[1]!, s0) : page[1]!, s0 ? footOnPage(page[0]!, s0) : page[0]!);
      if (f.runsOn === "end" || f.runsOn === "both") stub(sN ? footOnPage(page.at(-2)!, sN) : page.at(-2)!, sN ? footOnPage(page.at(-1)!, sN) : page.at(-1)!);
    }
    if (!f.code.trim() || quiet.has(f.id)) continue;
    // The practice of lettering a wall's code small, with a tick across the wall beside it (ADR 0269), when the sheet asks for it.
    const ticked = doc.settings.wallTicks === true;
    // Measured on a practising surveyor's plan (ADR 0269): wall codes about 0.6 of the small lettering, beside a tick.
    // A building's code (P) stays at the small lettering; only a line's code shrinks beside its tick.
    const size = ticked ? (f.closed ? ctx.sizes.small : ctx.sizes.small * 0.6) : ctx.sizes.label;
    if (f.closed && page.length >= 3) {
      const mx = page.reduce((s, p) => s + p[0], 0) / page.length;
      const my = page.reduce((s, p) => s + p[1], 0) / page.length;
      const t = text(ctx, f.layer, `feature:${f.id}`, mx, my + size * 0.35, f.code, size);
      ctx.placer.add(textQuad(t));
    } else {
      // Where the code can go (stage 258, ADR 0266): along the three longest legs, at the middle and a third of the way from each end, on
      // the lot's side and then the other. The first is where it always went, so a plan whose codes were already clear is unchanged.
      const legs = page
        .slice(1)
        .map((q, i) => ({ i, len: Math.hypot(q[0] - page[i]![0], q[1] - page[i]![1]) }))
        .sort((a, b) => b.len - a.len)
        .slice(0, 3);
      const tries: { x: number; y: number; theta: number }[] = [];
      const at: { i: number; along: number }[] = [];
      // The places keep their numbers (a dragged code's saved place counts in them); which is preferred is said apart.
      const order: number[] = [];
      for (const { i } of legs) {
        const [x1, y1] = page[i]!;
        const [x2, y2] = page[i + 1]!;
        const toward: [number, number] = inside ? [inside[0] - (x1 + x2) / 2, inside[1] - (y1 + y2) / 2] : [0, -1];
        const base = tries.length;
        for (const side of [toward, [-toward[0], -toward[1]] as [number, number]])
          for (const along of [0.5, 0.3, 0.7]) {
            tries.push(besideSegment(x1, y1, x2, y2, side, size, along));
            at.push({ i, along });
          }
        // Along a lot's boundary the code goes outside the lot first (stage 261), as plans letter a boundary wall's code; elsewhere on
        // the lot label's side first, as before. Outside is found from the boundary's own line and the lots' outlines, not the lot
        // label's place, which an L-shaped lot puts on either side of an arm.
        const s = sideOnPage(i);
        const out = s ? outsideOf(ctx, x1, y1, x2, y2, s) : null;
        const [nx, ny] = [-(y2 - y1), x2 - x1];
        const flip = out !== null && Math.sign(out[0] * nx + out[1] * ny) !== Math.sign(toward[0] * nx + toward[1] * ny);
        order.push(...(flip ? [3, 4, 5, 0, 1, 2] : [0, 1, 2, 3, 4, 5]).map((k) => base + k));
      }
      const t = placeText(ctx, f.layer, `feature:${f.id}`, f.code, size, tries, order);
      // The tick: an S across the wall, just before its code along the line, where a wall's code is written with one.
      if (ticked && entry && /\bwall\b/i.test(entry.meaning) && t.slot !== undefined && at[t.slot]) {
        const { i, along: placed } = at[t.slot]!;
        const [x1, y1] = page[i]!;
        const [x2, y2] = page[i + 1]!;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
        // Just before the code along the line, or just after it when that's too near the leg's end (where another line meets it).
        const back = textWidth(f.code, size) / 2 + 0.7;
        const mid = len * placed;
        const room = (c: number) => Math.min(c, len - c);
        const c = room(mid - back) >= TICK_CLEAR_MM || room(mid + back) < room(mid - back) ? mid - back : mid + back;
        // A code the surveyor dragged takes its tick along the line with it.
        const o = ctx.doc.labelOffsets[`feature:${f.id}`];
        const shift = o ? o.dx * ux + o.dy * uy : 0;
        let [cx, cy] = [x1 + ux * (c + shift), y1 + uy * (c + shift)];
        // On a leg drawn as the boundary, the tick crosses the boundary's line, where the wall is drawn.
        const s = sideOnPage(i);
        if (s) [cx, cy] = footOnPage([cx, cy], s);
        const tick = wallTick(cx, cy, ux, uy, size);
        ctx.out.push({ kind: "path", points: tick, closed: false, width: ctx.lines.thin, color: "ink", layer: f.layer, entity: `feature:${f.id}` });
        ctx.placer.segment(tick[0]!, tick.at(-1)!);
      }
    }
  }
}

/**
 * One text at the first of its places that covers nothing (stage 258, ADR 0266), as the label solver chooses; one the surveyor dragged
 * stays measured from the place it was dragged from, and an older drag without its place from the first, where it was drawn before.
 */
export function placeText(ctx: DrawCtx, layer: SceneLayer, entity: string, value: string, size: number, tries: readonly { x: number; y: number; theta: number }[], order?: readonly number[]): SceneText {
  return placeLines(ctx, layer, entity, [value], size, tries, order)[0]!;
}

/**
 * Several lines of one label placed together (stage 261): each place is the first line's, the others below it as the text is turned,
 * and the first place where every line covers nothing is taken.
 */
export function placeLines(ctx: DrawCtx, layer: SceneLayer, entity: string, values: readonly string[], size: number, tries: readonly { x: number; y: number; theta: number }[], order?: readonly number[]): SceneText[] {
  const at = (c: { x: number; y: number; theta: number }) => {
    const rad = (c.theta * Math.PI) / 180;
    const [dx, dy] = [-Math.sin(rad), Math.cos(rad)];
    return values.map((value, i) => ({ value, x: c.x + dx * i * size * 1.25, y: c.y + dy * i * size * 1.25, theta: c.theta }));
  };
  const quads = (c: { x: number; y: number; theta: number }) =>
    at(c).map((l) => textQuad({ kind: "text", x: l.x, y: l.y, text: l.value, size, rotate: l.theta, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer, entity, ...(ctx.slant ? { slant: ctx.slant } : {}) }));
  const m = moved(ctx, [entity]);
  const k = ctx.placer.choose(entity, tries.map(quads), { fallback: order?.[0] ?? 0, pinned: m.pinned, slot: m.slot ?? (m.pinned ? 0 : null), ...(m.shift ? { shift: m.shift } : {}), ...(order ? { order } : {}) });
  return at(tries[k]!).map((l) => text(ctx, layer, entity, l.x, l.y, l.value, size, { rotate: l.theta, slot: k }));
}

/**
 * An adjoining land's words in lines, as plans letter them (stage 261, ADR 0269): "Land claimed by" on one line and whose it is on the
 * next, when the whole is longer than a short label; any other words wrapped to the usual width.
 */
export function adjoiningLines(value: string, size: number): string[] {
  const m = /^((?:lands?|property|premises)\s+(?:claimed\s+by|of|owned\s+by|belonging\s+to)|claimed\s+by)\s+(.+)$/i.exec(value.trim());
  if (m && textWidth(value.trim(), size) > 16) return [m[1]!, ...wrap(m[2]!, size, 46)];
  return wrap(value, size, 46);
}

/** How near a line's points must lie to a lot's side to be drawn as it: a 225 mm wall's thickness, and a little over (stage 261). */
export const ALONG_BOUNDARY_M = 0.25;

/** How far from a leg's end a wall's tick stays, in millimetres of paper, so it never sits where another line meets it. */
const TICK_CLEAR_MM = 1.2;

type Ground = { e: number; n: number };

/** The sides of the lots drawn heavy: every lot's, or only the extract's when the sheet is an extract of one. */
function lotSides(ctx: DrawCtx): [SurveyPoint, SurveyPoint][] {
  const ex = ctx.doc.sheet.extractOf;
  const only = ex && ctx.doc.lots.some((l) => l.id === ex) ? ex : null;
  return ctx.doc.lots
    .filter((l) => !only || l.id === only)
    .flatMap((l) => {
      const ring = l.points.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p));
      // A lot missing a point isn't drawn (the checks stop it), so none of its sides stands for a line.
      return ring.length >= 3 && ring.length === l.points.length ? ring.map((p, i) => [p, ring[(i + 1) % ring.length]!] as [SurveyPoint, SurveyPoint]) : [];
    });
}

/** The foot of a page point on the line through a and b, on the page. */
function footOnPage(p: [number, number], [a, b]: readonly [[number, number], [number, number]]): [number, number] {
  const len2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2 || 1;
  const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / len2;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** How far a point lies from a side's straight line, when it falls between the side's corners (or a centimetre past them); else null. */
function offSide(p: Ground, [a, b]: readonly [Ground, Ground]): number | null {
  const len2 = (b.e - a.e) ** 2 + (b.n - a.n) ** 2;
  if (len2 === 0) return null;
  const len = Math.sqrt(len2);
  const t = ((p.e - a.e) * (b.e - a.e) + (p.n - a.n) * (b.n - a.n)) / len2;
  if (t * len < -0.01 || (t - 1) * len > 0.01) return null;
  return Math.abs((b.e - a.e) * (p.n - a.n) - (b.n - a.n) * (p.e - a.e)) / len;
}

/** Where the line through p and q, carried on, meets a side's line; null when they're parallel. */
function meetSide(p: Ground, q: Ground, [a, b]: readonly [Ground, Ground]): Ground | null {
  const [dx, dy] = [q.e - p.e, q.n - p.n];
  const [sx, sy] = [b.e - a.e, b.n - a.n];
  const den = dx * sy - dy * sx;
  if (Math.abs(den) < 1e-9 * Math.hypot(dx, dy) * Math.hypot(sx, sy)) return null;
  const t = ((a.e - p.e) * sy - (a.n - p.n) * sx) / den;
  return { e: p.e + dx * t, n: p.n + dy * t };
}

/** The foot of p on a side's line. */
function footOn(p: Ground, [a, b]: readonly [Ground, Ground]): Ground {
  const len2 = (b.e - a.e) ** 2 + (b.n - a.n) ** 2 || 1;
  const t = ((p.e - a.e) * (b.e - a.e) + (p.n - a.n) * (b.n - a.n)) / len2;
  return { e: a.e + (b.e - a.e) * t, n: a.n + (b.n - a.n) * t };
}

/**
 * A line's legs that run along a lot's side (both ends within ALONG_BOUNDARY_M of it, between its corners), and the runs left to draw:
 * the other legs in order, each carried on to the boundary where it leaves it, to where its leg's line meets the side (or the foot of
 * its point, when that's nearer than half a metre's carrying on). Null when no leg runs along a side. Ground coordinates.
 */
export function alongBoundary(ctx: DrawCtx, pts: readonly SurveyPoint[], closed: boolean): { legs: boolean[]; sides: ([SurveyPoint, SurveyPoint] | null)[]; runs: Ground[][]; offM: number } | null {
  const sides = lotSides(ctx);
  if (sides.length === 0 || pts.length < 2) return null;
  const n = closed ? pts.length : pts.length - 1;
  let offM = 0;
  const side = Array.from({ length: n }, (_, i) => {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    for (const s of sides) {
      const a = offSide(p, s);
      const b = offSide(q, s);
      if (a !== null && b !== null && a <= ALONG_BOUNDARY_M && b <= ALONG_BOUNDARY_M) {
        offM = Math.max(offM, a, b);
        return s;
      }
    }
    return null;
  });
  if (side.every((s) => s === null)) return null;
  const runs: Ground[][] = [];
  // A closed outline is walked from just after a leg along the boundary, so no run is cut where the ring closes.
  const start = closed ? (side.findIndex((s) => s !== null) + 1) % n : 0;
  let run: Ground[] = [];
  const carry = (at: Ground, from: Ground, s: readonly [Ground, Ground]): Ground | null => {
    const off = offSide(at, s) ?? 0;
    if (off < 0.005) return null;
    const m = meetSide(from, at, s);
    return m && Math.hypot(m.e - at.e, m.n - at.n) <= 0.5 ? m : footOn(at, s);
  };
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n;
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    if (side[i]) {
      if (run.length >= 2) runs.push(run);
      run = [];
      continue;
    }
    if (run.length === 0) {
      const before = closed || i > 0 ? side[(i - 1 + n) % n] : null;
      const c = before ? carry(p, q, before) : null;
      if (c) run.push(c);
      run.push(p);
    }
    run.push(q);
    const after = closed || i + 1 < n ? side[(i + 1) % n] : null;
    const c = after ? carry(q, p, after) : null;
    if (c) run.push(c);
  }
  if (run.length >= 2) runs.push(run);
  return { legs: side.map((s) => s !== null), sides: side, runs, offM };
}

/**
 * The page direction off a leg (x1, y1)-(x2, y2) that leaves the lots, tested 0.8 mm either side of the leg's middle, or of its foot on
 * `along` (the boundary's side the leg is drawn as, which a wall a few centimetres inside would otherwise blur at a large scale). Null
 * when both sides, or neither, are in a lot: then nothing says which side is outside.
 */
export function outsideOf(ctx: DrawCtx, x1: number, y1: number, x2: number, y2: number, along?: readonly [[number, number], [number, number]]): [number, number] | null {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const n: [number, number] = [-(y2 - y1) / len, (x2 - x1) / len];
  const [mx, my] = along ? footOnPage([(x1 + x2) / 2, (y1 + y2) / 2], along) : [(x1 + x2) / 2, (y1 + y2) / 2];
  const rings = ctx.doc.lots.map((l) => l.points.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p)).map((p) => atPage(ctx, p)));
  const inLot = (x: number, y: number) => rings.some((r) => r.length >= 3 && insidePage(x, y, r));
  const plus = inLot(mx + n[0] * 0.8, my + n[1] * 0.8);
  const minus = inLot(mx - n[0] * 0.8, my - n[1] * 0.8);
  return plus === minus ? null : plus ? [-n[0], -n[1]] : n;
}

/** A line named for the checks: its code and its first and last surveyed points ("MW from 5 to 22"). */
function featureName(f: SurveyDocument["features"][number], pts: readonly SurveyPoint[]): string {
  const name = f.code.trim() || (f.closed ? "An outline" : "A line");
  return `${name} ${f.closed ? "through" : "from"} ${pts[0]!.pointId} ${f.closed ? "and" : "to"} ${pts.at(-1)!.pointId}`;
}

/**
 * Lines whose code isn't written again: a line that carries straight on from another of the same code, end to end at one point
 * (within 12°), is one wall on paper, so its code is written once, beside the longest of them (stage 261).
 */
function carriedOn(ctx: DrawCtx): Set<string> {
  const open = ctx.doc.features
    .filter((f) => !f.closed && f.code.trim() && visible(ctx.doc, f.layer))
    .map((f) => ({ f, pts: f.points.map((id) => ctx.byId.get(id)).filter((p): p is SurveyPoint => Boolean(p)) }))
    .filter((x) => x.pts.length >= 2 && x.pts.length === x.f.points.length);
  const group = new Map(open.map((x) => [x.f.id, x.f.id]));
  const root = (id: string): string => {
    let r = id;
    while (group.get(r) !== r) r = group.get(r)!;
    return r;
  };
  // The direction a line leaves its end point at, looking along it from that end.
  const leaving = (pts: SurveyPoint[], atStart: boolean): [number, number] => {
    const [a, b] = atStart ? [pts[0]!, pts[1]!] : [pts.at(-1)!, pts.at(-2)!];
    const len = Math.hypot(b.e - a.e, b.n - a.n) || 1;
    return [(b.e - a.e) / len, (b.n - a.n) / len];
  };
  for (let x = 0; x < open.length; x++)
    for (let y = x + 1; y < open.length; y++) {
      const A = open[x]!;
      const B = open[y]!;
      if (A.f.code.trim().toUpperCase() !== B.f.code.trim().toUpperCase()) continue;
      for (const aStart of [true, false])
        for (const bStart of [true, false]) {
          const pa = aStart ? A.f.points[0] : A.f.points.at(-1);
          const pb = bStart ? B.f.points[0] : B.f.points.at(-1);
          if (pa !== pb) continue;
          const [ux, uy] = leaving(A.pts, aStart);
          const [vx, vy] = leaving(B.pts, bStart);
          // Straight on: the two leave the shared point in opposite directions.
          if (ux * vx + uy * vy <= -Math.cos((12 * Math.PI) / 180)) group.set(root(A.f.id), root(B.f.id));
        }
    }
  const length = (pts: SurveyPoint[]) => pts.slice(1).reduce((s, q, i) => s + Math.hypot(q.e - pts[i]!.e, q.n - pts[i]!.n), 0);
  const longest = new Map<string, { id: string; len: number }>();
  for (const x of open) {
    const r = root(x.f.id);
    const len = length(x.pts);
    const best = longest.get(r);
    if (!best || len > best.len) longest.set(r, { id: x.f.id, len });
  }
  return new Set(open.filter((x) => longest.get(root(x.f.id))!.id !== x.f.id).map((x) => x.f.id));
}

/** How far a line that carries on past its end is drawn on, in millimetres of paper (stage 261). */
export const RUN_ON_MM = 5;

/** An S across a line at (cx, cy) running along (ux, uy): the tick some surveyors draw beside a wall's code. */
export function wallTick(cx: number, cy: number, ux: number, uy: number, size: number): [number, number][] {
  const [nx, ny] = [-uy, ux];
  // About a fifth taller than the code's capitals, as measured on a practising surveyor's plan.
  const h = size * 0.5;
  const w = size * 0.18;
  return Array.from({ length: 9 }, (_, k) => {
    const s = k / 8 - 0.5;
    const across = s * 2 * h;
    const alongOff = Math.sin(s * 2 * Math.PI) * w;
    return [cx + nx * across + ux * alongOff, cy + ny * across + uy * alongOff] as [number, number];
  });
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
export function drawLots(ctx: DrawCtx, lots: PlanLots, opts: { legLabels: boolean; highlight: string | null; secondDecimals: number; distanceDecimals: number; scheduled?: ReadonlySet<string> }): void {
  const { doc } = ctx;
  const drawn = new Set<string>();
  // A leg two lots share is dimensioned once.
  const dimensioned = new Set<string>();
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
        // A curve (ADR 0276) is drawn once, as the arc through its points, from its first leg; its other legs are part of it.
        const cv = curveOfLeg(p.curves, i, p.vertices.length);
        if (cv && !cv.first) continue;
        const end = cv ? p.vertices[cv.curve.to % p.vertices.length]! : b;
        const k = (a.id < end.id ? `${a.id}|${end.id}` : `${end.id}|${a.id}`) + (cv ? "~arc" : "");
        if (drawn.has(k) && !heavy) continue;
        drawn.add(k);
        // The same circle the area is worked out on (lotcurves.ts), drawn within 0.02 mm of it on paper.
        const line = cv ? densifyCurve(p.vertices, cv.curve, (0.02 / 1000) * ctx.v.scale).map((q) => atPage(ctx, q)) : [ring[i]!, ring[(i + 1) % ring.length]!];
        ctx.out.push({ kind: "path", points: line, closed: false, width: heavy ? (ctx.doc.settings.thinBoundary === true ? ctx.lines.feature : ctx.lines.boundary) : ctx.lines.thin, color: heavy ? "ink" : "muted", layer: "BOUNDARY", entity: `lot:${r.lot.id}` });
        for (let j = 0; j + 1 < line.length; j++) ctx.placer.segment(line[j]!, line[j + 1]!);
      }
    }
    if (opts.legLabels && visible(doc, "DIMENSIONS") && heavy) {
      const area = pageArea(ring);
      const [cx, cy] = atPage(ctx, p.labelAt);
      p.legs.forEach((leg, i) => {
        // A curve (ADR 0276) is lettered once, on its first leg: its chord's bearing and distance, with its radius and its length along the arc.
        const cv = curveOfLeg(p.curves, i, p.vertices.length);
        if (cv && !cv.first) return;
        const from = leg.from;
        const to = cv ? p.vertices[cv.curve.to % p.vertices.length]! : leg.to;
        const brg = cv ? cv.curve.chordBearing : leg.bearing;
        if (brg === null) return;
        const key = from.id < to.id ? `${from.id}|${to.id}` : `${to.id}|${from.id}`;
        if (dimensioned.has(key)) return;
        dimensioned.add(key);
        // Left to the boundaries schedule (ADR 0248): the face names it in a note instead.
        if (opts.scheduled?.has(key)) return;
        const [x1, y1] = atPage(ctx, from);
        const [x2, y2] = atPage(ctx, to);
        const outside: [number, number] = area > 0 ? [y2 - y1, -(x2 - x1)] : area < 0 ? [-(y2 - y1), x2 - x1] : [(x1 + x2) / 2 - cx, (y1 + y2) / 2 - cy];
        const bearing = formatDms(toDms(brg, opts.secondDecimals));
        const dd = opts.distanceDecimals;
        const dist = cv ? `${fmt(cv.curve.chordDistance, dd)} (R ${fmt(cv.curve.radius, dd)}, arc ${fmt(cv.curve.arcLength, dd)})` : fmt(leg.distance, dd);
        const value = `${bearing}  ${dist}`;
        const size = ctx.sizes.label;
        const sides: [number, number][] = [outside, [-outside[0], -outside[1]]];
        type Line = { x: number; y: number; value: string; theta: number };
        // Each way of writing the leg's bearing and distance, every text beside its own leg, in order of preference:
        // - on one line, outside the lot, then inside (two short legs in a row would run their labels together); on a leg long enough,
        //   also a third of the way from either end, never past the leg's own ends;
        // - for a leg shorter than its label: the bearing over the distance, outside then inside, or the bearing on one side of the
        //   line and the distance on the other, as plans write a short leg.
        const along = textWidth(value, size) <= Math.hypot(x2 - x1, y2 - y1) * 0.4 ? [0.5, 0.3, 0.7] : [0.5];
        const ways: Line[][] = along.flatMap((t) => sides.map((side) => [{ ...besideSegment(x1, y1, x2, y2, side, size, t), value }]));
        const stacked = (side: [number, number]): Line[] => {
          const b = besideSegment(x1, y1, x2, y2, side, size);
          // The unit normal towards `side`, as besideSegment takes it, and whether that is up for the text: the bearing reads above.
          const nl = Math.hypot(x2 - x1, y2 - y1) || 1;
          let [nx, ny] = [-(y2 - y1) / nl, (x2 - x1) / nl];
          if (nx * side[0] + ny * side[1] < 0) [nx, ny] = [-nx, -ny];
          const rad = (b.theta * Math.PI) / 180;
          const up = nx * Math.sin(rad) - ny * Math.cos(rad) > 0;
          const step = size * 1.15;
          return up ? [{ x: b.x + nx * step, y: b.y + ny * step, value: bearing, theta: b.theta }, { x: b.x, y: b.y, value: dist, theta: b.theta }] : [{ x: b.x, y: b.y, value: bearing, theta: b.theta }, { x: b.x + nx * step, y: b.y + ny * step, value: dist, theta: b.theta }];
        };
        const split = (bearingSide: [number, number], distSide: [number, number]): Line[] => [
          { ...besideSegment(x1, y1, x2, y2, bearingSide, size), value: bearing },
          { ...besideSegment(x1, y1, x2, y2, distSide, size), value: dist },
        ];
        ways.push(stacked(sides[0]!), split(sides[0]!, sides[1]!), stacked(sides[1]!), split(sides[1]!, sides[0]!));
        const quadOf = (l: Line) => textQuad({ kind: "text", x: l.x, y: l.y, text: l.value, size, weight: "regular", font: "sans", anchor: "middle", rotate: l.theta, color: "ink", layer: "DIMENSIONS" });
        // When nothing against the leg is clear (a crowded frontage at the plan's scale), the same words a little way out, joined to the
        // leg's middle by a leader line (stage 251, ADR 0259), on the lot's outside. They always start at place LEADER_FROM, whatever
        // the leg's length, so a label dragged from a leader place keeps it; the places in between are never chosen. They cost more than
        // crossing a line (LEADER_COST), and the first pass never takes one: only the solver does, when it clears another label.
        const ordinary = ways.length;
        const leaders = leaderWays(x1, y1, x2, y2, [sides[0]!], size, value, quadOf);
        while (ways.length < LEADER_FROM) ways.push(ways[0]!);
        ways.push(...leaders.map((l) => [l.line]));
        const leaderOf = (j: number) => (j >= LEADER_FROM ? leaders[j - LEADER_FROM]! : null);
        // A leader place's shapes: its words, its leader and its dot. The dot sits on the leg, so every leader place pays for crossing
        // that one line alike, and nothing placed after may cover the dot.
        const dotsAt = new Set<Quad>();
        const shapes = ways.map((w, j) => {
          const l = leaderOf(j);
          if (!l) return w.map(quadOf);
          const [cx, cy, d] = [l.from[0], l.from[1], LEADER_DOT];
          const dot: Quad = [[cx - d, cy - d], [cx + d, cy - d], [cx + d, cy + d], [cx - d, cy + d]];
          dotsAt.add(dot);
          return [...w.map(quadOf), [l.start, l.end] as Quad, dot];
        });
        const admissible = shapes.map((s, j) => j < ordinary || (j >= LEADER_FROM && s.every((q) => inBounds(ctx, q))));
        const base = ways.map((_, j) => (j < ordinary ? (ordinary > 1 ? j / (ordinary - 1) : 0) : j < LEADER_FROM ? 0 : LEADER_COST + (j - LEADER_FROM) / Math.max(1, leaders.length - 1)));
        const entity = `leg:${r.lot.id}:${i}`;
        // A label the surveyor nudged stays at the place the nudge was measured from; an older nudge, without one, on one line outside.
        const m = moved(ctx, [entity]);
        // A dragged leader moves only at the words' end, and its dot not at all: both stay on the leg.
        const shift = m.shift ? (q: Quad, n: number) => (dotsAt.has(q) ? q : q.length === 2 ? ([q[0]!, m.shift!(q, n)[1]!] as Quad) : m.shift!(q, n)) : undefined;
        const k = ctx.placer.choose(entity, shapes, { admissible, base, firstUpTo: ordinary, pinned: m.pinned, slot: m.pinned ? (m.slot ?? 0) : null, ...(shift ? { shift } : {}) });
        for (const l of ways[k]!) text(ctx, "DIMENSIONS", entity, l.x, l.y, l.value, size, { rotate: l.theta, slot: k });
        const lead = leaderOf(k);
        if (lead) {
          // Drawn from the leg's middle to the words, following them when the surveyor drags them; a dot marks the leg it belongs to.
          // The placer already holds both, as shapes of the chosen place.
          const o = ctx.doc.labelOffsets[entity];
          ctx.out.push({ kind: "path", points: [lead.from, [lead.end[0] + (o?.dx ?? 0), lead.end[1] + (o?.dy ?? 0)]], closed: false, width: ctx.lines.thin, color: "ink", layer: "DIMENSIONS", entity });
          ctx.out.push({ kind: "circle", cx: lead.from[0], cy: lead.from[1], r: LEADER_DOT, width: ctx.lines.thin, color: "ink", fill: "ink", layer: "DIMENSIONS", entity });
        }
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
    // The 24 deepest: where a label has the most room, and few enough to place a sub division of many lots quickly.
    candidates.push(...deep.slice(0, 24));
    const box = (x: number, y: number): Quad => [[x - w / 2, y - h / 2], [x + w / 2, y - h / 2], [x + w / 2, y + h / 2], [x - w / 2, y + h / 2]];
    // Inside the lot: every corner inside and no leg through the box, so a label can't straddle a notch.
    const legs: Quad[] = ring.map((p, k) => [p, ring[(k + 1) % ring.length]!]);
    const within = (x: number, y: number) => box(x, y).every(([qx, qy]) => insidePage(qx, qy, ring)) && !legs.some((l) => quadsOverlap(box(x, y), l));
    const admissible = candidates.map(([x, y]) => within(x, y));
    // A label never sits outside its own lot: if it can't fit, it goes at the point deepest inside, and the checks say so.
    const fallback = insidePage(cx0, cy0, ring) ? ([cx0, cy0] as [number, number]) : (deep[0] ?? ([cx0, cy0] as [number, number]));
    const entity = `lot:${r.lot.id}`;
    const extentEntity = `lot-extent:${r.lot.id}`;
    // The label and its extent, each its own shape, since each can be moved by hand on its own.
    const split = size * 1.1;
    const shapes = (x: number, y: number): Quad[] => {
      const [x0, x1, y0, y1] = [x - w / 2, x + w / 2, y - h / 2, y + h / 2];
      return extent ? [[[x0, y0], [x1, y0], [x1, y0 + split], [x0, y0 + split]], [[x0, y0 + split], [x1, y0 + split], [x1, y1], [x0, y1]]] : [box(x, y)];
    };
    const m = moved(ctx, extent ? [entity, extentEntity] : [entity]);
    let at = fallback;
    let slot: number | undefined;
    if (admissible.some(Boolean)) {
      slot = ctx.placer.choose(entity, candidates.map(([x, y]) => shapes(x, y)), { admissible, pinned: m.pinned, slot: m.slot, ...(m.shift ? { shift: m.shift } : {}) });
      at = candidates[slot]!;
    } else {
      ctx.cramped.push(`${r.lot.label}${r.lot.sup}`);
      shapes(fallback[0], fallback[1]).forEach((q, k) => ctx.placer.add(m.shift ? m.shift(q, k) : q));
    }
    const [cx, cy] = at;
    const top = cy - h / 2;
    supLabel(ctx, "LOT_TEXT", entity, cx, top + size * 0.95, base, r.lot.sup, size, "regular", slot);
    if (extent) text(ctx, "LOT_TEXT", extentEntity, cx, top + size * 1.1 + ctx.sizes.body * 1.15, extent, ctx.sizes.body, slot !== undefined ? { slot } : {});
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
    // Eight places round the corner, away from its lots first.
    const tries: [number, number][] = [0, 1, -1, 2, -2, 3, -3, 4].map((k) => base + (k * Math.PI) / 4).map((a) => [x + Math.cos(a) * r, y + Math.sin(a) * r]);
    // Each line of the block where it's written, as its own shape, since each (number, mark) can be moved by hand on its own.
    const placed = ([cx, cy]: [number, number]) => {
      let ty = cy - blockH / 2;
      return lines.map((l) => {
        ty += l.size * 1.15;
        return { l, x: cx, y: ty - l.size * 0.2 };
      });
    };
    const shapeOf = (t: { l: (typeof lines)[number]; x: number; y: number }) => textQuad({ kind: "text", x: t.x, y: t.y, text: t.l.value, size: t.l.size, rotate: 0, weight: t.l.weight, anchor: "middle", font: "sans", color: t.l.color, layer: t.l.layer });
    const m = moved(ctx, lines.map((l) => l.entity));
    const k = ctx.placer.choose(`corner:${p.id}`, tries.map((c) => placed(c).map(shapeOf)), { pinned: m.pinned, slot: m.slot, ...(m.shift ? { shift: m.shift } : {}) });
    for (const t of placed(tries[k]!)) text(ctx, t.l.layer, t.l.entity, t.x, t.y, t.l.value, t.l.size, { weight: t.l.weight, color: t.l.color, slot: k });
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
    // A symbol the plan gives a point (a well the sketch shows there, ADR 0249) draws it as that symbol; the point itself is unchanged.
    const given = (doc.symbols ?? []).find((x) => x.point === p.id)?.code;
    const entry = lookupCode(doc.codes, given ?? codeOf(p.code));
    if (!entry || (entry.kind !== "mark" && entry.kind !== "symbol")) continue;
    const [x, y] = atPage(ctx, p);
    if (x < ctx.v.x - 5 || x > ctx.v.x + ctx.v.w + 5 || y < ctx.v.y - 5 || y > ctx.v.y + ctx.v.h + 5) continue;
    const symbol = entry.kind === "symbol";
    const r = symbol ? 1.3 : 0.5;
    ctx.out.push({ kind: "circle", cx: x, cy: y, r, width: ctx.lines.thin, color: "ink", fill: "paper", layer: "BOUNDARY_MARKS", entity: `pt:${p.id}` });
    // A well is a circle, as plans draw one (stage 261); other symbols carry a cross inside.
    if (symbol && !/\bwell\b/i.test(entry.meaning)) {
      ctx.out.push({ kind: "path", points: [[x - r * 0.7, y], [x + r * 0.7, y]], closed: false, width: ctx.lines.thin, color: "ink", layer: "BOUNDARY_MARKS", entity: `pt:${p.id}` });
      ctx.out.push({ kind: "path", points: [[x, y - r * 0.7], [x, y + r * 0.7]], closed: false, width: ctx.lines.thin, color: "ink", layer: "BOUNDARY_MARKS", entity: `pt:${p.id}` });
    }
    ctx.placer.add([[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]]);
    const value = symbol ? entry.meaning : entry.code;
    const size = ctx.sizes.small;
    const w = textWidth(value, size);
    // Right, left, above, then below, which is taken when nothing is free.
    const entity = `mark:${p.id}`;
    // Then a ring close round it (stage 261), below first, as a well's name is written just under it: each place's box half a
    // millimetre off the symbol, at 20° steps either way from straight below. The first four keep their numbers, which a dragged
    // label's saved place counts in.
    const ring = [90, 110, 70, 130, 50, 150, 30, 180, 0, 210, 330, 240, 300, 270].map((deg) => {
      const t = (deg * Math.PI) / 180;
      return [Math.cos(t) * (r + 0.5 + w / 2), Math.sin(t) * (r + 0.5 + size * 0.4) + size * 0.35] as const;
    });
    const tries = ([[r + 1 + w / 2, size * 0.35], [-(r + 1 + w / 2), size * 0.35], [0, -(r + 1)], [0, r + 1 + size], ...ring] as const).map(([dx, dy]) => ({ x: x + dx, y: y + dy }));
    const quad = (t: { x: number; y: number }) => textQuad({ kind: "text", x: t.x, y: t.y, text: value, size, rotate: 0, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "BOUNDARY_MARKS", entity, ...(ctx.slant ? { slant: ctx.slant } : {}) });
    const m = moved(ctx, [entity]);
    const k = ctx.placer.choose(entity, tries.map((c) => [quad(c)]), { fallback: 3, pinned: m.pinned, slot: m.slot, ...(m.shift ? { shift: m.shift } : {}) });
    text(ctx, "BOUNDARY_MARKS", entity, tries[k]!.x, tries[k]!.y, value, size, { slot: k });
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
    const width = road.width !== "none" && b.length >= 2 ? roadWidth(a, b) : null;
    const lines = [road.name.trim(), width ? roadWidthText(width.minM, width.maxM, road.width === "metres" ? "metres" : "feet") : ""].filter(Boolean);
    // Where the name (and the width under it) can go (stage 258, ADR 0266): along the centreline's longest leg at its middle, as before,
    // then a third of the way from each end, then the middles of the other legs; the first that covers nothing.
    const order = centre
      .slice(1)
      .map((q, i) => ({ i, len: Math.hypot(q[0] - centre[i]![0], q[1] - centre[i]![1]) }))
      .sort((p, q) => q.len - p.len);
    const places: { mx: number; my: number; theta: number }[] = [];
    order.forEach(({ i }, n) => {
      const [x1, y1] = centre[i]!;
      const [x2, y2] = centre[i + 1]!;
      const theta = readable((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
      for (const along of n === 0 ? [0.5, 0.3, 0.7, 0.15, 0.85] : [0.5]) places.push({ mx: x1 + (x2 - x1) * along, my: y1 + (y2 - y1) * along, theta });
    });
    const texts = (p: { mx: number; my: number; theta: number }) => {
      const rad = (p.theta * Math.PI) / 180;
      // Name a little above the centreline, width a little below, both along the road.
      const up: [number, number] = [Math.sin(rad), -Math.cos(rad)];
      return lines.map((value, i) => {
        const size = i === 0 ? ctx.sizes.label : ctx.sizes.small;
        const off = lines.length === 2 ? (i === 0 ? 0.3 : -0.3 - size * 0.9) * -1 : -size * 0.35;
        return { entity: `road${i ? "-width" : ""}:${road.id}`, value, size, x: p.mx - up[0] * off, y: p.my - up[1] * off, theta: p.theta };
      });
    };
    if (lines.length > 0) {
      const quads = (p: (typeof places)[number]) =>
        texts(p).map((x) => textQuad({ kind: "text", x: x.x, y: x.y, text: x.value, size: x.size, rotate: x.theta, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "ROADS", entity: x.entity, ...(ctx.slant ? { slant: ctx.slant } : {}) }));
      const entities = texts(places[0]!).map((x) => x.entity);
      const m = moved(ctx, entities);
      const k = ctx.placer.choose(`road:${road.id}`, places.map(quads), { fallback: 0, pinned: m.pinned, slot: m.slot ?? (m.pinned ? 0 : null), ...(m.shift ? { shift: m.shift } : {}) });
      for (const x of texts(places[k]!)) text(ctx, "ROADS", x.entity, x.x, x.y, x.value, x.size, { rotate: x.theta, slot: k });
    }
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
      const th = readable((Math.atan2(uy, ux) * 180) / Math.PI);
      // A long direction ("From the 5th Lane of the main road") in two lines, as plans letter it, rather than one running off the page.
      const lines = textWidth(value.trim(), ctx.sizes.small) > 30 ? wrap(value.trim(), ctx.sizes.small, 30) : [value.trim()];
      const w = Math.max(...lines.map((l) => textWidth(l, ctx.sizes.small)));
      // Beyond the end, along the road (stage 258): 6 mm out as before, then further, then to either side of the road's line.
      const tries = ([[6, 0], [6 + w / 2, 0], [6, 1.4], [6, -1.4], [6 + w / 2, 1.4], [6 + w / 2, -1.4]] as const).map(([out, side]) => ({ x: ex + ux * out - uy * side * ctx.sizes.small, y: ey + uy * out + ux * side * ctx.sizes.small, theta: th }));
      placeLines(ctx, "ROADS", `road-dir-${i}:${road.id}`, lines, ctx.sizes.small, tries);
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
    const lines = adjoiningLines(adj.text, size);
    const w = Math.max(...lines.map((l) => textWidth(l, size)));
    const h = lines.length * size * 1.25;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    const ux = (x2 - x1) / len;
    const uy = (y2 - y1) / len;
    // A block beside the leg, nearest first; then, as surveyors do on side legs, the text written along the leg outside the lot.
    const blocks: { c: [number, number]; q: Quad }[] = [];
    for (const dist of [3, 6, 10, 15, 21]) {
      for (const shift of [0, 0.25, -0.25]) {
        // The block's centre, far enough out that its nearest side clears the leg.
        const reach = dist + Math.abs(nx) * (w / 2) + Math.abs(ny) * (h / 2);
        const cx = mx + ux * shift * len + nx * reach;
        const cy = my + uy * shift * len + ny * reach;
        blocks.push({ c: [cx, cy], q: [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]] });
      }
    }
    const alongs = alongLeg(adj.text, size, [x1, y1], [x2, y2], [nx, ny]);
    const entity = `adjoining:${adj.id}`;
    const candidates: Quad[][] = [...blocks.map((b) => [b.q]), ...alongs.map((v) => v.map((t) => textQuad(t)))];
    // Only places inside the drawing's bounds can be chosen: text past the frame would be cut off.
    const admissible = [...blocks.map((b) => inBounds(ctx, b.q)), ...alongs.map((v) => v.every((t) => inBounds(ctx, textQuad(t))))];
    const m = moved(ctx, [entity]);
    let cx: number;
    let cy: number;
    let slot: number | undefined;
    if (admissible.some(Boolean)) {
      const k = ctx.placer.choose(entity, candidates, { admissible, pinned: m.pinned, slot: m.slot, ...(m.shift ? { shift: m.shift } : {}) });
      if (k >= blocks.length) {
        for (const t of alongs[k - blocks.length]!) text(ctx, "ADJOINING", entity, t.x, t.y, t.text, size, { rotate: t.rotate, slot: k });
        continue;
      }
      [cx, cy] = blocks[k]!.c;
      slot = k;
    } else {
      // Nowhere inside the bounds: it goes just outside the leg, and the checks say it runs past the frame.
      ctx.outside.push(adj.text);
      [cx, cy] = [mx + nx * (6 + w / 2), my + ny * (6 + h / 2)];
      ctx.placer.add(nudged(ctx, entity, [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]]));
    }
    let ty = cy - h / 2;
    for (const line of lines) {
      ty += size * 1.25;
      text(ctx, "ADJOINING", entity, cx, ty - size * 0.25, line, size, slot !== undefined ? { slot } : {});
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
 * left to right (or bottom to top), wrapped to the leg's length: one wording
 * at each distance out, nearest first. None on a leg too short to write along.
 */
function alongLeg(value: string, size: number, [x1, y1]: [number, number], [x2, y2]: [number, number], [nx, ny]: [number, number]): SceneText[][] {
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < size * 4) return [];
  const angle = readable((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
  const rad = (angle * Math.PI) / 180;
  const [c, s] = [Math.cos(rad), Math.sin(rad)];
  const lines = wrap(value, size, len * 0.95);
  // The text's "up" is (s, -c) on the page; when the outside of the lot is up, the first line goes farthest out.
  const outIsUp = nx * s - ny * c > 0;
  const [mx, my] = [(x1 + x2) / 2, (y1 + y2) / 2];
  return [1.2, 2.5, 4, 6].map((dist) =>
    lines.map((line, k): SceneText => {
      const row = outIsUp ? lines.length - 1 - k : k;
      const off = dist + size * 0.46 + row * size * 1.25;
      const [cx, cy] = [mx + nx * off, my + ny * off];
      // A line's visual middle sits 0.26 of its size above its baseline.
      return { kind: "text", x: cx - 0.26 * size * s, y: cy + 0.26 * size * c, text: line, size, rotate: angle, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "ADJOINING" };
    }),
  );
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
export function besideSegment(x1: number, y1: number, x2: number, y2: number, side: [number, number], size: number, along = 0.5): { x: number; y: number; theta: number } {
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
  return { x: x1 + (x2 - x1) * along + nx * gap, y: y1 + (y2 - y1) * along + ny * gap, theta };
}

/** How far beyond the place against a leg a leader's words may stand, mm, nearest first. */
export const LEADER_OUT = [5, 9, 13, 17] as const;
/** The place number a leg label's leader places start at, whatever the leg's length, so a place a label was dragged from keeps it. */
export const LEADER_FROM = 10;
/**
 * What a leader place costs the label solver before what it covers. Its dot always crosses its own leg (6 more), so a leader place
 * costs 8 in all: more than a place against the leg that crosses a line, less than covering a label (30).
 */
export const LEADER_COST = 2;
/** The dot that marks where a leader meets its leg, mm. */
export const LEADER_DOT = 0.35;

/**
 * A leg's leader places (stage 251, ADR 0259): its words on one line, parallel to the leg, a little way out on each side given (the
 * drawing gives only the lot's outside), straight out or shifted along the leg by half their width and a little more, or twice that. Each with its leader:
 * from the leg's middle to the nearest edge of the words, stopping just short, and where it's checked from, just along it.
 */
export function leaderWays<L extends { x: number; y: number; value: string; theta: number }>(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  sides: readonly [number, number][],
  size: number,
  value: string,
  quadOf: (l: L) => Quad,
): { line: L; from: [number, number]; start: [number, number]; end: [number, number] }[] {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1;
  const [ux, uy] = [(x2 - x1) / len, (y2 - y1) / len];
  const from: [number, number] = [(x1 + x2) / 2, (y1 + y2) / 2];
  const half = textWidth(value, size) / 2 + 2;
  const out: { line: L; from: [number, number]; start: [number, number]; end: [number, number] }[] = [];
  for (const side of sides) {
    let [nx, ny] = [-uy, ux];
    if (nx * side[0] + ny * side[1] < 0) [nx, ny] = [-nx, -ny];
    const base = besideSegment(x1, y1, x2, y2, side, size);
    for (const away of LEADER_OUT) {
      for (const along of [0, half, -half, 2 * half, -2 * half]) {
        const line = { x: base.x + nx * away + ux * along, y: base.y + ny * away + uy * along, value, theta: base.theta } as L;
        const q = quadOf(line);
        // The middle of the words' edge nearest the leg's middle.
        const edges = q.map((p, k) => [(p[0] + q[(k + 1) % q.length]![0]) / 2, (p[1] + q[(k + 1) % q.length]![1]) / 2] as [number, number]);
        const near = edges.reduce((a, b) => (Math.hypot(b[0] - from[0], b[1] - from[1]) < Math.hypot(a[0] - from[0], a[1] - from[1]) ? b : a));
        const d = Math.hypot(near[0] - from[0], near[1] - from[1]) || 1;
        const end: [number, number] = [near[0] - ((near[0] - from[0]) / d) * 0.4, near[1] - ((near[1] - from[1]) / d) * 0.4];
        // Checked from 1.2 mm along the line as drawn, so the leg it starts on never counts as covered.
        const s = Math.hypot(end[0] - from[0], end[1] - from[1]) || 1;
        out.push({ line, from, start: [from[0] + ((end[0] - from[0]) / s) * 1.2, from[1] + ((end[1] - from[1]) / s) * 1.2], end });
      }
    }
  }
  return out;
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

/**
 * Pairs of drawing labels that cover each other, or cover a boundary point,
 * by their estimated outlines. Only reported: a person moves labels, the
 * composer never does (the survey skill's rule 7).
 */
export function overlappingLabels(items: SceneItem[]): [string, string][] {
  return overlapping(items).map(([a, b]) => [a.name, b.name]);
}

/** The drawing entities whose labels overlap another label or a point, in pairs (a point has no entity). */
export function overlappingEntities(items: SceneItem[]): [string | undefined, string | undefined][] {
  return overlapping(items).map(([a, b]) => [a.entity, b.entity]);
}

function overlapping(items: SceneItem[]): [{ name: string; entity?: string }, { name: string; entity?: string }][] {
  const texts = items.filter((i): i is SceneText => i.kind === "text" && i.layer !== "TITLE" && i.layer !== "SHEET");
  const shapes: { name: string; quad: Quad; entity?: string }[] = texts.map((t) => ({ name: t.text, quad: textQuad(t), entity: t.entity }));
  const square = (cx: number, cy: number, r: number): Quad => [[cx - r, cy - r], [cx + r, cy - r], [cx + r, cy + r], [cx - r, cy + r]];
  for (const c of items) {
    if (c.kind === "circle" && c.layer === "POINTS") shapes.push({ name: "a point", quad: square(c.cx, c.cy, c.r) });
    // A leg label's leader and its dot (ADR 0259): covering either is as bad as covering the words.
    else if (c.kind === "circle" && c.layer === "DIMENSIONS" && c.entity?.startsWith("leg:")) shapes.push({ name: "a leader's dot", quad: square(c.cx, c.cy, c.r), entity: c.entity });
    else if (c.kind === "path" && c.layer === "DIMENSIONS" && c.entity?.startsWith("leg:") && c.points.length === 2) shapes.push({ name: "a leader", quad: [c.points[0]!, c.points[1]!], entity: c.entity });
  }
  const out: [{ name: string; entity?: string }, { name: string; entity?: string }][] = [];
  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < shapes.length; j++) {
      const same = Boolean(shapes[i]!.entity) && shapes[i]!.entity === shapes[j]!.entity;
      // A label and its own raised suffix touch by design, and a leader reaches its own words.
      if (same && (j >= texts.length || shapes[i]!.entity!.startsWith("lot:"))) continue;
      if (quadsOverlap(shapes[i]!.quad, shapes[j]!.quad)) out.push([shapes[i]!, shapes[j]!]);
    }
  }
  return out;
}
