/**
 * Looking at the sheet (stage 196): screen points as sheet millimetres, a two-finger pinch that zooms about the fingers and moves
 * with them, and the view that opens on the drawing itself. Framework-free, so the editor and its tests share one answer.
 *
 * A view is [x, y, width, height] in sheet millimetres, drawn in a box on the screen the way an SVG's "xMidYMid meet" draws it:
 * as large as fits, centred.
 */
import { entityGroup, viewAround } from "./entities";
import type { SheetPage } from "./scene";

export type View = [number, number, number, number];
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
type Point = readonly [number, number];

/** Screen pixels per sheet millimetre for a view drawn in a box. */
export function scaleIn(view: View, box: Box): number {
  return Math.min(box.width / view[2], box.height / view[3]);
}

/** Where the view's corner sits in the box: the space "meet" leaves on either side. */
function offset(view: View, box: Box, k: number): [number, number] {
  return [(box.width - view[2] * k) / 2, (box.height - view[3] * k) / 2];
}

/** A screen point as a sheet point, in millimetres. */
export function sheetPoint(view: View, box: Box, x: number, y: number): [number, number] {
  const k = scaleIn(view, box);
  const [ox, oy] = offset(view, box, k);
  return [view[0] + (x - box.left - ox) / k, view[1] + (y - box.top - oy) / k];
}

const between = (a: Point, b: Point): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
const apart = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1]);

/**
 * The view after a two-finger pinch from `from` to `to`: zoomed by how far the fingers spread, about the point between them, and
 * moved with that point, so what was under the fingers stays under them. The width stays within the limits.
 */
export function pinchView(start: View, box: Box, from: readonly [Point, Point], to: readonly [Point, Point], limits: { minWidth: number; maxWidth: number }): View {
  const f = apart(to[0], to[1]) / (apart(from[0], from[1]) || 1);
  const width = Math.min(limits.maxWidth, Math.max(limits.minWidth, start[2] / f));
  const height = (width / start[2]) * start[3];
  const [mx, my] = between(from[0], from[1]);
  const anchor = sheetPoint(start, box, mx, my);
  const next: View = [0, 0, width, height];
  const k = scaleIn(next, box);
  const [ox, oy] = offset(next, box, k);
  const [nx, ny] = between(to[0], to[1]);
  return [anchor[0] - (nx - box.left - ox) / k, anchor[1] - (ny - box.top - oy) / k, width, height];
}

/** What the surveyor drew: lots, points, roads, lines and adjoining lands (not the sheet's frame, title or legend). */
const DRAWN = /^(?:lot|pt|road|feature|adjoining):/;

/**
 * The view that opens on the drawing: the lots, points, roads and lines with a margin, in the sheet's proportions. On a phone the
 * whole sheet's text is too small to read, so the editor opens here, and "Whole sheet" is a tap away. The whole sheet when nothing
 * is drawn yet.
 */
export function drawingView(page: SheetPage): View {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const item of page.items) {
    if (!item.entity || !DRAWN.test(entityGroup(item.entity))) continue;
    if (item.kind === "path") for (const [x, y] of item.points) take(x, y);
    else if (item.kind === "circle") take(item.cx, item.cy);
  }
  if (!Number.isFinite(minX)) return [0, 0, page.widthMm, page.heightMm];
  const v = viewAround([minX, minY, maxX - minX, maxY - minY], page, 0.12);
  // Never wider than the sheet itself: a drawing that fills the page opens on the page.
  return v[2] >= page.widthMm ? [0, 0, page.widthMm, page.heightMm] : v;
}
