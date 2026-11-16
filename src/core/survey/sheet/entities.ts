/**
 * What the sheet's drawing entities are, for the editor and the drafting
 * assistant (stage 195): which item a part belongs to, which labels may move,
 * and where an entity sits on the page so the view can zoom to it.
 *
 * Entity ids come from draw.ts and classic.ts: lot:<id>, lot-extent:<id>,
 * leg:<lotId>:<i>, pt:<pointId>, mark:<pointId>, feature:<id>, road:<id>,
 * road-width:<id>, road-dir-0:<id>, road-dir-1:<id>, adjoining:<id>, and the
 * sheet's own parts (north, scalebar, checkline, title, legend...).
 */
import type { SceneItem, SheetPage } from "./scene";

/** The item a part belongs to: a lot's legs and extent are the lot, a road's width and direction texts the road, a mark its point. */
export function entityGroup(entity: string): string {
  const [kind, ...rest] = entity.split(":");
  if (kind === "leg") return `lot:${rest[0]}`;
  if (kind === "lot-extent") return `lot:${rest.join(":")}`;
  if (kind === "road-width" || kind === "road-dir-0" || kind === "road-dir-1") return `road:${rest.join(":")}`;
  if (kind === "mark") return `pt:${rest.join(":")}`;
  return entity;
}

/** Sheet parts that always print where the layout puts them: they never move. */
const FIXED = new Set(["north", "scalebar", "checkline"]);

/** Whether a scene item is a label that can be moved on paper (the layer's lock is checked by the caller). */
export function movableLabel(item: SceneItem): boolean {
  return item.kind === "text" && Boolean(item.entity) && item.layer !== "SHEET" && !FIXED.has(item.entity!);
}

/** The page area an entity (or everything in its group) covers, in millimetres: [x, y, width, height], or null when it isn't drawn. */
export function entityBounds(page: SheetPage, entity: string): [number, number, number, number] | null {
  const group = entityGroup(entity);
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const take = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };
  for (const item of page.items) {
    if (!item.entity || (item.entity !== entity && entityGroup(item.entity) !== group)) continue;
    if (item.kind === "path") for (const [x, y] of item.points) take(x, y);
    else if (item.kind === "circle") {
      take(item.cx - item.r, item.cy - item.r);
      take(item.cx + item.r, item.cy + item.r);
    } else {
      // A text's box, roughly: its size high and about half its size wide per character.
      const w = item.text.length * item.size * 0.55;
      const x0 = item.anchor === "start" ? item.x : item.anchor === "end" ? item.x - w : item.x - w / 2;
      take(x0, item.y - item.size);
      take(x0 + w, item.y + item.size * 0.3);
    }
  }
  if (!Number.isFinite(minX)) return null;
  return [minX, minY, maxX - minX, maxY - minY];
}

/** A view that shows an area with a margin, keeping the sheet's proportions: [x, y, width, height]. */
export function viewAround(area: readonly [number, number, number, number], page: Pick<SheetPage, "widthMm" | "heightMm">, margin = 0.35): [number, number, number, number] {
  const [x, y, w, h] = area;
  const aspect = page.widthMm / page.heightMm;
  let vw = Math.max(w, 10) * (1 + 2 * margin);
  let vh = Math.max(h, 10) * (1 + 2 * margin);
  if (vw / vh > aspect) vh = vw / aspect;
  else vw = vh * aspect;
  return [x + w / 2 - vw / 2, y + h / 2 - vh / 2, vw, vh];
}
