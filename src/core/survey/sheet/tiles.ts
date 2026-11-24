/**
 * Plans over several sheets (stage 268, ADR 0275). A drawing that doesn't fit one sheet at the scale the surveyor chose is cut into
 * sheets at that scale: never shrunk, never moved. Each sheet shows the part of the drawing in its drawing area, cut at the area's
 * edge; a dashed match line where the drawing goes on, naming the sheet it goes on to; and a key to the sheets with its own marked.
 * A line that crosses an edge is drawn up to it on both sheets, so nothing between them is lost.
 */
import type { SceneColor, SceneItem, ScenePath, SceneText } from "./scene";
import { textWidth } from "./scene";

/** A rectangle on the page, mm: left, top, right, bottom. */
export type Rect = [number, number, number, number];

/** The most sheets a plan is cut into. Past this, the scale is what's wrong. */
export const MAX_SHEETS = 12;
/** How much of a sheet's drawing area the drawing fills at most at the grid's outside edges, so it keeps a margin there. */
const FILL = 0.94;
/**
 * How far past a sheet's edge something still counts as on it, mm. The grid is centred on the drawing, so a shared edge often runs
 * exactly along a lot's side: rounding must never put that side, or its corners, on neither sheet.
 */
const EDGE_MM = 1e-6;

export interface GridTile {
  col: number;
  row: number;
  /** The model point (E, N) at this sheet's drawing-area centre. */
  centreE: number;
  centreN: number;
}

/**
 * The grid of sheets over the drawing's extent at the scale: sheets side by side with no overlap, each the drawing area's size, the
 * grid centred on the extent. Rows run north to south, columns west to east.
 */
export function tileGrid(ext: { minE: number; maxE: number; minN: number; maxN: number }, area: { w: number; h: number }, scale: number, fill: { w: number; h: number } = { w: FILL, h: FILL }): { cols: number; rows: number; tiles: GridTile[] } {
  const k = scale / 1000;
  const [tw, th] = [area.w * k, area.h * k];
  const cols = Math.max(1, Math.ceil((ext.maxE - ext.minE) / (tw * fill.w)));
  const rows = Math.max(1, Math.ceil((ext.maxN - ext.minN) / (th * fill.h)));
  const [cE, cN] = [(ext.minE + ext.maxE) / 2, (ext.minN + ext.maxN) / 2];
  const tiles: GridTile[] = [];
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) tiles.push({ col, row, centreE: cE + (col - (cols - 1) / 2) * tw, centreN: cN - (row - (rows - 1) / 2) * th });
  return { cols, rows, tiles };
}

const inside = (r: Rect, x: number, y: number, pad = 0) => x >= r[0] - pad - EDGE_MM && x <= r[2] + pad + EDGE_MM && y >= r[1] - pad - EDGE_MM && y <= r[3] + pad + EDGE_MM;

/** One segment cut to the rectangle (Liang-Barsky), or null when none of it is inside. */
function cutTo(r: Rect, a: [number, number], b: [number, number]): [[number, number], [number, number]] | null {
  const [dx, dy] = [b[0] - a[0], b[1] - a[1]];
  let [t0, t1] = [0, 1];
  for (const [p, q] of [
    [-dx, a[0] - r[0]],
    [dx, r[2] - a[0]],
    [-dy, a[1] - r[1]],
    [dy, r[3] - a[1]],
  ] as const) {
    if (Math.abs(p) < 1e-12) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

/**
 * One segment cut at the rectangle's edge. A segment lying along the edge, which rounding can put a hair outside, is kept, its ends
 * brought onto the edge (by no more than EDGE_MM): a side two sheets share is drawn on both, never on neither.
 */
function clipSegment(r: Rect, a: [number, number], b: [number, number]): [[number, number], [number, number]] | null {
  const exact = cutTo(r, a, b);
  if (exact) return exact;
  const wide = cutTo([r[0] - EDGE_MM, r[1] - EDGE_MM, r[2] + EDGE_MM, r[3] + EDGE_MM], a, b);
  if (!wide) return null;
  const onto = ([x, y]: [number, number]): [number, number] => [Math.min(r[2], Math.max(r[0], x)), Math.min(r[3], Math.max(r[1], y))];
  return [onto(wide[0]), onto(wide[1])];
}

/** A line's pieces inside the rectangle, each a run of the line's own points between the places it crosses the edge. */
function clipPolyline(r: Rect, pts: readonly [number, number][]): [number, number][][] {
  const runs: [number, number][][] = [];
  let run: [number, number][] | null = null;
  for (let i = 0; i + 1 < pts.length; i++) {
    const c = clipSegment(r, pts[i]!, pts[i + 1]!);
    if (!c) {
      run = null;
      continue;
    }
    const [s, e] = c;
    const last = run?.at(-1);
    if (run && last && Math.abs(last[0] - s[0]) < 1e-9 && Math.abs(last[1] - s[1]) < 1e-9) run.push(e);
    else {
      run = [s, e];
      runs.push(run);
    }
  }
  return runs.filter((x) => x.length >= 2 && x.some((p, i) => i > 0 && (p[0] !== x[0]![0] || p[1] !== x[0]![1])));
}

/**
 * The drawing's items cut to a sheet's drawing area. Lines and outlines are cut at the edge into the pieces inside. Small filled
 * symbols (arrowheads, dots) and circles are kept whole when their centre is inside, else left off. A word is kept when the point
 * it's written from is inside, padded by `textPad` mm: words are placed inside the area, so only a neighbour's words fall outside.
 */
export function clipItems(items: readonly SceneItem[], r: Rect, textPad = 0): SceneItem[] {
  const out: SceneItem[] = [];
  for (const it of items) {
    if (it.kind === "text") {
      if (inside(r, it.x, it.y, textPad)) out.push(it);
    } else if (it.kind === "circle") {
      if (inside(r, it.cx, it.cy)) out.push(it);
    } else if (it.fill) {
      const n = it.points.length || 1;
      const [cx, cy] = [it.points.reduce((s, p) => s + p[0], 0) / n, it.points.reduce((s, p) => s + p[1], 0) / n];
      if (inside(r, cx, cy)) out.push(it);
    } else {
      const loop = it.closed && it.points.length > 2 ? [...it.points, it.points[0]!] : it.points;
      if (loop.every(([x, y]) => inside(r, x, y))) {
        out.push(it);
        continue;
      }
      for (const run of clipPolyline(r, loop)) out.push({ ...it, points: run, closed: false } satisfies ScenePath);
    }
  }
  return out;
}

/**
 * Whether a sheet shows any of the drawing: a line crossing its area, or a point in it, more than half a millimetre in from its edges.
 * Words alone don't make a sheet (a neighbour's label reaching just over the edge), nor does a line along the edge, which the
 * neighbouring sheet shows.
 */
export function showsDrawing(items: readonly SceneItem[], r: Rect): boolean {
  const core: Rect = [r[0] + 0.5, r[1] + 0.5, r[2] - 0.5, r[3] - 0.5];
  const deep = (x: number, y: number) => x > core[0] && x < core[2] && y > core[1] && y < core[3];
  return items.some((i) => {
    if (i.layer === "TITLE" || i.layer === "SHEET" || i.kind === "text") return false;
    if (i.kind === "circle") return deep(i.cx, i.cy);
    return i.points.some((p, k) => deep(p[0], p[1]) || (k > 0 && deep((p[0] + i.points[k - 1]![0]) / 2, (p[1] + i.points[k - 1]![1]) / 2)));
  });
}

/**
 * The most grid places worth drawing to find which show the drawing: past this, the scale is plainly wrong, and drawing every place
 * would hold the plan up.
 */
export const MAX_GRID_PLACES = 2 * MAX_SHEETS;

export interface Sheet {
  /** Its number, from 1, north-west first, along each row. */
  n: number;
  col: number;
  row: number;
}

/** Where a match line's words stand, for an edge shared with a neighbouring grid place: reserved before the drawing, said after. */
export function matchSpot(r: Rect, edge: "left" | "right" | "top" | "bottom", size: number): { x: number; y: number; anchor: SceneText["anchor"]; quad: [number, number][] } {
  const [x0, y0, x1, y1] = r;
  const w = textWidth("Continued on sheet 12", size);
  const at =
    edge === "left"
      ? { x: x0 + 1.2, y: (y0 + y1) / 2, anchor: "start" as const }
      : edge === "right"
        ? { x: x1 - 1.2, y: (y0 + y1) / 2, anchor: "end" as const }
        : edge === "top"
          ? { x: (x0 + x1) / 2, y: y0 + 1.2 + size, anchor: "middle" as const }
          : { x: (x0 + x1) / 2, y: y1 - 1.2, anchor: "middle" as const };
  const left = at.anchor === "start" ? at.x : at.anchor === "end" ? at.x - w : at.x - w / 2;
  return { ...at, quad: [[left, at.y - size], [left + w, at.y - size], [left + w, at.y + size * 0.3], [left, at.y + size * 0.3]] };
}

/** The edges a grid place shares with other places in the grid, whether or not those turn out to show anything. */
export function gridEdges(col: number, row: number, cols: number, rows: number): ("left" | "right" | "top" | "bottom")[] {
  return [...(col > 0 ? (["left"] as const) : []), ...(col < cols - 1 ? (["right"] as const) : []), ...(row > 0 ? (["top"] as const) : []), ...(row < rows - 1 ? (["bottom"] as const) : [])];
}

/**
 * The match lines on one sheet: a dashed line along each edge it shares with another sheet, and the words "Continued on sheet N"
 * just inside it. Edges facing a grid place that shows nothing get neither.
 */
export function matchLines(r: Rect, self: Sheet, sheets: readonly Sheet[], size: number, width: number): SceneItem[] {
  const [x0, y0, x1, y1] = r;
  const out: SceneItem[] = [];
  const at = (col: number, row: number) => sheets.find((s) => s.col === col && s.row === row);
  const edges: { edge: "left" | "right" | "top" | "bottom"; to: Sheet | undefined; line: [number, number][] }[] = [
    { edge: "left", to: at(self.col - 1, self.row), line: [[x0, y0], [x0, y1]] },
    { edge: "right", to: at(self.col + 1, self.row), line: [[x1, y0], [x1, y1]] },
    { edge: "top", to: at(self.col, self.row - 1), line: [[x0, y0], [x1, y0]] },
    { edge: "bottom", to: at(self.col, self.row + 1), line: [[x0, y1], [x1, y1]] },
  ];
  for (const e of edges) {
    if (!e.to) continue;
    out.push({ kind: "path", points: e.line, closed: false, width, color: "ink", dash: [4, 1.2, 0.8, 1.2], layer: "SHEET", entity: "match-line" });
    const spot = matchSpot(r, e.edge, size);
    out.push({ kind: "text", x: spot.x, y: spot.y, text: `Continued on sheet ${e.to.n}`, size, weight: "bold", font: "sans", anchor: spot.anchor, rotate: 0, color: "ink", layer: "SHEET", entity: "match-line" });
  }
  return out;
}

/**
 * The key to the sheets, in the box given: the grid of sheets that show the drawing, each numbered, this one shaded and outlined
 * more heavily. Grid places that show nothing are left out, as on a printed index.
 */
export function keyToSheets(box: { x: number; y: number; w: number; h: number }, self: Sheet, sheets: readonly Sheet[], cols: number, rows: number, size: number, width: number): SceneItem[] {
  const cell = Math.min(box.w / cols, box.h / rows);
  const [gx, gy] = [box.x + (box.w - cell * cols) / 2, box.y + (box.h - cell * rows) / 2];
  const out: SceneItem[] = [];
  const digits = Math.min(size, cell * 0.45);
  for (const s of sheets) {
    const [x, y] = [gx + s.col * cell, gy + s.row * cell];
    const mine = s.n === self.n;
    const fill: SceneColor | undefined = mine ? "faint" : undefined;
    out.push({ kind: "path", points: [[x, y], [x + cell, y], [x + cell, y + cell], [x, y + cell]], closed: true, width: mine ? width * 2.5 : width, color: "ink", ...(fill ? { fill } : {}), layer: "SHEET", entity: "sheet-key" });
    out.push({ kind: "text", x: x + cell / 2, y: y + cell / 2 + digits * 0.36, text: String(s.n), size: digits, weight: mine ? "bold" : "regular", font: "sans", anchor: "middle", rotate: 0, color: "ink", layer: "SHEET", entity: "sheet-key" });
  }
  return out;
}

/** The sheets that show the drawing, numbered north-west first along each row. */
export function numberSheets(shown: readonly { col: number; row: number }[]): Sheet[] {
  return [...shown].sort((a, b) => a.row - b.row || a.col - b.col).map((s, i) => ({ n: i + 1, col: s.col, row: s.row }));
}
