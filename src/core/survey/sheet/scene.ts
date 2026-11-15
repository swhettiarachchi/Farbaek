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
  /** Degrees the letters lean right (slanted CAD lettering), about the text's own baseline point. */
  slant?: number;
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

/**
 * Geist's advance widths for printable ASCII (U+0020 to U+007E), in
 * thousandths of the font size, measured from the embedded font
 * (android/app/src/main/assets/fonts/geist.ttf) with fontkit.
 */
const GEIST_ASCII = "250,213,346,478,629,802,620,178,274,274,430,558,201,419,201,480,663,384,619,613,615,626,624,524,604,624,297,297,544,540,544,559,906,668,680,703,698,603,590,700,713,270,597,640,580,877,743,739,650,733,672,640,552,689,667,945,606,576,544,347,455,347,426,557,248,551,595,546,595,561,395,594,581,244,260,590,267,877,581,573,595,595,379,524,392,575,536,819,585,537,549,389,264,389,523".split(",").map(Number);
/** The same for the survey symbols the sheet writes, measured likewise. */
const GEIST_EXTRA: Record<string, number> = { "°": 404, "′": 211, "″": 333, "²": 348, "×": 502, "–": 591, "’": 203 };

/**
 * Text width in mm, from the font's measured advances (Geist Mono is 0.6 em
 * for every character), with a 4% margin on all text (which also covers the
 * stroke that draws bold), so wrapping and the overflow checks err toward
 * "too long". Characters not in the table count as 0.7 em.
 */
export function textWidth(text: string, size: number, font: "sans" | "mono" = "sans"): number {
  return advanceWidth(text, size, font) * 1.04;
}

/** The font's own advance for the text, mm, with no margin: for placing one piece of text right after another. */
export function advanceWidth(text: string, size: number, font: "sans" | "mono" = "sans"): number {
  let em = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    em += font === "mono" ? 600 : c >= 32 && c <= 126 ? GEIST_ASCII[c - 32]! : (GEIST_EXTRA[ch] ?? 700);
  }
  return (em / 1000) * size;
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
