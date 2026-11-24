/**
 * Dimension lines the surveyor adds between two points (stage 265, ADR 0273): a building's width, a gap between walls, a road's width
 * across. The distance is worked out from the coordinates, never typed, and written on a dimension line drawn parallel to the two
 * points, `offset` millimetres of paper to the left looking from the first to the second (negative: to the right), with extension lines
 * down to the points and an arrowhead at each end. Presentation only: nothing is measured from where it's drawn.
 */
import type { SurveyPoint } from "../parcel";
import { fmt } from "../units";
import { atPage, inBounds, moved, readable, text, textQuad, visible, type DrawCtx } from "./draw";
import { textWidth } from "./scene";

/** A dimension as the plan keeps it: two surveyed points' ids and how far off their line it's drawn, mm. */
export interface DimensionLine {
  id: string;
  from: string;
  to: string;
  offset: number;
}

/** The gap between a point and its extension line, and how far the extension line runs past the dimension line, mm of paper. */
const GAP_MM = 0.8;
const OVER_MM = 1.2;
/** An arrowhead's length and half its spread, mm. */
const HEAD_MM = 1.6;
const HEAD_HALF = 0.45;

/** The page direction square off the line from a to b, to its left looking from a to b on the ground (north up, east right). */
function leftOnPage(ctx: DrawCtx, a: SurveyPoint, b: SurveyPoint): [number, number] {
  const [de, dn] = [b.e - a.e, b.n - a.n];
  const len = Math.hypot(de, dn) || 1;
  const [pa, pl] = [atPage(ctx, a), atPage(ctx, { e: a.e - (dn / len) * 1, n: a.n + (de / len) * 1 })];
  const [x, y] = [pl[0] - pa[0], pl[1] - pa[1]];
  const l = Math.hypot(x, y) || 1;
  return [x / l, y / l];
}

/**
 * The plan's dimension lines on the sheet: the line, its extension lines and arrowheads, and the distance worked out from the
 * coordinates, written over the line's middle and placed clear of other labels like any label. One whose points are missing isn't
 * drawn (the checks say so).
 */
export function drawDimensions(ctx: DrawCtx, dims: readonly DimensionLine[], decimals: number): void {
  if (!visible(ctx.doc, "DIMENSIONS")) return;
  for (const d of dims) {
    const a = ctx.byId.get(d.from);
    const b = ctx.byId.get(d.to);
    if (!a || !b || a.id === b.id) continue;
    const metres = Math.hypot(b.e - a.e, b.n - a.n);
    if (metres < 0.005) continue;
    const [nx, ny] = leftOnPage(ctx, a, b);
    const sign = d.offset >= 0 ? 1 : -1;
    const [ax, ay] = atPage(ctx, a);
    const [bx, by] = atPage(ctx, b);
    const a2: [number, number] = [ax + nx * d.offset, ay + ny * d.offset];
    const b2: [number, number] = [bx + nx * d.offset, by + ny * d.offset];
    const entity = `dim:${d.id}`;
    const ink = { width: ctx.lines.thin, color: "ink" as const, layer: "DIMENSIONS" as const, entity };
    // Extension lines, from a little off each point to a little past the dimension line; none when the line is drawn on the points.
    if (Math.abs(d.offset) > GAP_MM) {
      for (const [[px, py], [qx, qy]] of [
        [
          [ax, ay],
          [a2[0], a2[1]],
        ],
        [
          [bx, by],
          [b2[0], b2[1]],
        ],
      ] as const) {
        const start: [number, number] = [px + nx * sign * GAP_MM, py + ny * sign * GAP_MM];
        const end: [number, number] = [qx + nx * sign * OVER_MM, qy + ny * sign * OVER_MM];
        ctx.out.push({ kind: "path", points: [start, end], closed: false, ...ink });
        ctx.placer.segment(start, end);
      }
    }
    // The dimension line, and an arrowhead at each end pointing out to the extension line.
    ctx.out.push({ kind: "path", points: [a2, b2], closed: false, ...ink });
    ctx.placer.segment(a2, b2);
    const len = Math.hypot(b2[0] - a2[0], b2[1] - a2[1]) || 1;
    const [ux, uy] = [(b2[0] - a2[0]) / len, (b2[1] - a2[1]) / len];
    // On a dimension too short for both arrowheads inside it, they stand outside, pointing in, as drafters draw a short one.
    const inside = len >= 2 * HEAD_MM + 0.4;
    const head = (tip: [number, number], dir0: 1 | -1) => {
      const dir = inside ? dir0 : (-dir0 as 1 | -1);
      const [bx0, by0] = [tip[0] + ux * HEAD_MM * dir, tip[1] + uy * HEAD_MM * dir];
      const side: [number, number] = [-uy * HEAD_HALF, ux * HEAD_HALF];
      ctx.out.push({ kind: "path", points: [[bx0 + side[0], by0 + side[1]], tip, [bx0 - side[0], by0 - side[1]]], closed: true, fill: "ink", ...ink });
    };
    head(a2, 1);
    head(b2, -1);
    // The distance, from the coordinates, over the line's middle on the side away from the points; then the other side, or along it.
    const value = fmt(metres, decimals);
    const size = ctx.sizes.small;
    const theta = readable((Math.atan2(b2[1] - a2[1], b2[0] - a2[0]) * 180) / Math.PI);
    const rad = (theta * Math.PI) / 180;
    // "Up" for the text as it reads: the side its tops face.
    const [upx, upy] = [Math.sin(rad), -Math.cos(rad)];
    const away: [number, number] = [nx * sign, ny * sign];
    const out = away[0] * upx + away[1] * upy >= 0 ? 1 : -1;
    const tries = [0.5, 0.3, 0.7].flatMap((t) =>
      [out, -out].map((s) => {
        const [mx, my] = [a2[0] + (b2[0] - a2[0]) * t, a2[1] + (b2[1] - a2[1]) * t];
        // Above the line by a gap when the text sits on its upper side; below by the gap and the letters' height otherwise.
        const shift = s > 0 ? 0.6 : 0.6 + size * 0.72;
        return { x: mx + upx * shift * s, y: my + upy * shift * s, theta };
      }),
    );
    // A dimension shorter than its words: they go just past its end, along it, and are judged there, where they're drawn.
    const roomy = textWidth(value, size) + 1 <= len;
    const places = roomy ? tries : [{ x: b2[0] + ux * (textWidth(value, size) / 2 + 1.5 + (inside ? 0 : HEAD_MM)), y: b2[1] + uy * (textWidth(value, size) / 2 + 1.5 + (inside ? 0 : HEAD_MM)), theta }];
    const quad = (c: { x: number; y: number; theta: number }) => textQuad({ kind: "text", x: c.x, y: c.y, text: value, size, rotate: c.theta, weight: "regular", anchor: "middle", font: "sans", color: "ink", layer: "DIMENSIONS", entity, ...(ctx.slant ? { slant: ctx.slant } : {}) });
    // A figure the surveyor dragged stays where it was put, and the next labels keep clear of where it's drawn, as for every label.
    const m = moved(ctx, [entity]);
    const admissible = places.map((c) => inBounds(ctx, quad(c)));
    if (!admissible.some(Boolean)) ctx.outside.push(value);
    const k = ctx.placer.choose(entity, places.map((c) => [quad(c)]), { fallback: 0, pinned: m.pinned, slot: m.slot ?? (m.pinned ? 0 : null), ...(m.shift ? { shift: m.shift } : {}), ...(admissible.some(Boolean) ? { admissible } : {}) });
    const c = places[k]!;
    text(ctx, "DIMENSIONS", entity, c.x, c.y, value, size, { rotate: c.theta, slot: k });
  }
}
