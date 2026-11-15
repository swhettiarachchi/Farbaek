/**
 * The sheet scene: a plan sheet as plain drawing primitives on paper, in
 * millimetres, origin at the top-left corner, y downward. The screen preview,
 * the PDF writer and the checks all read this one structure, so what is
 * printed is exactly what was reviewed (ADR 0201).
 */
import type { LayerId } from "../document";

export type SceneColor = "ink" | "muted" | "faint" | "red" | "paper";
export type SceneLayer = LayerId | "SHEET";

interface Tagged {
  layer: SceneLayer;
  /** The drawing entity this primitive belongs to, for selection in the editor. */
  entity?: string;
}

export interface ScenePath extends Tagged {
  kind: "path";
  points: [number, number][];
  closed: boolean;
  /** Stroke width, mm. */
  width: number;
  color: SceneColor;
  fill?: SceneColor;
  /** Dash pattern, mm. */
  dash?: number[];
}

export interface SceneText extends Tagged {
  kind: "text";
  x: number;
  y: number;
  text: string;
  /** Font size, mm. */
  size: number;
  weight: "regular" | "bold";
  font: "sans" | "mono";
  anchor: "start" | "middle" | "end";
  /** Degrees, clockwise on the page, about (x, y). */
  rotate: number;
  color: SceneColor;
}

export interface SceneCircle extends Tagged {
  kind: "circle";
  cx: number;
  cy: number;
  r: number;
  width: number;
  color: SceneColor;
  fill?: SceneColor;
}

export type SceneItem = ScenePath | SceneText | SceneCircle;

export interface SheetPage {
  widthMm: number;
  heightMm: number;
  /** "Front" for the plan, "Overleaf" for schedules. */
  role: "front" | "overleaf";
  items: SceneItem[];
}

/** How model coordinates map onto the front page. */
export interface Viewport {
  /** The drawing area on the page, mm. */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Scale denominator: 1 : scale. */
  scale: number;
  /** The model point (E, N) at the viewport's centre. */
  centreE: number;
  centreN: number;
}

/** Model (E, N, metres) to page (x, y, mm). One metre on the ground is 1000 / scale mm on paper. */
export function toPage(v: Viewport, e: number, n: number): [number, number] {
  const k = 1000 / v.scale;
  return [v.x + v.w / 2 + (e - v.centreE) * k, v.y + v.h / 2 - (n - v.centreN) * k];
}

/** Page (x, y, mm) back to model (E, N, metres): for clicks in the editor. */
export function toModel(v: Viewport, x: number, y: number): { e: number; n: number } {
  const k = 1000 / v.scale;
  return { e: v.centreE + (x - v.x - v.w / 2) / k, n: v.centreN - (y - v.y - v.h / 2) / k };
}

/** Approximate text width in mm. Conservative, so wrapping and overflow checks err toward "too long". */
export function textWidth(text: string, size: number, font: "sans" | "mono" = "sans"): number {
  return [...text].length * size * (font === "mono" ? 0.62 : 0.56);
}

/** Wraps text into lines no wider than `width` mm, breaking at spaces; a single over-long word is kept whole. */
export function wrap(text: string, size: number, width: number, font: "sans" | "mono" = "sans"): string[] {
  const out: string[] = [];
  for (const para of text.split(/\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && textWidth(next, size, font) > width) {
        out.push(line);
        line = w;
      } else line = next;
    }
    out.push(line);
  }
  return out;
}
