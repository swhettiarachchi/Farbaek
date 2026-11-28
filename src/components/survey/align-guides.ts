/**
 * Alignment guides for a word or label dragged on the plan (stage 297): as it nears another word's point across or down the sheet, it
 * snaps into line with it and a guide shows where. Presentation only: what moves is where a label is drawn (its offset), never a surveyed
 * point or anything measured.
 */

export interface Guides {
  /** The sheet position (mm) the dragged point lines up with, across and down, or null where nothing is near enough. */
  x: number | null;
  y: number | null;
}

/**
 * Where a dragged point lands: `at` is where the pointer would put it, `others` the points of the other words on the page, `reach` how
 * near (in sheet mm) one must be to line up with. The nearest within reach wins, across and down apart.
 */
export function alignTo(at: { x: number; y: number }, others: readonly { x: number; y: number }[], reach: number): { x: number; y: number; guides: Guides } {
  let bestX: number | null = null;
  let bestY: number | null = null;
  let dX = reach;
  let dY = reach;
  for (const o of others) {
    if (!Number.isFinite(o.x) || !Number.isFinite(o.y)) continue;
    const ex = Math.abs(o.x - at.x);
    const ey = Math.abs(o.y - at.y);
    if (ex <= dX) [dX, bestX] = [ex, o.x];
    if (ey <= dY) [dY, bestY] = [ey, o.y];
  }
  return { x: bestX ?? at.x, y: bestY ?? at.y, guides: { x: bestX, y: bestY } };
}
