/**
 * What a field sketch draws, as the reader returns it and as Farbaek keeps it (stage 241, ADR 0249): the lines drawn between numbered
 * points with what is written along them, the symbols drawn at points, and the labelled areas. Everything is as drawn and as written:
 * point numbers are text to be matched against the survey, never positions. The schema has no place for a coordinate, a length the
 * reader measured on the photo, or a corrected number, so none can come from a sketch.
 */
import { z } from "zod";

export const SKETCH_LINE_STYLES = ["single", "double", "dashed", "hatched", "crossed", "curved", "other"] as const;
export type SketchLineStyle = (typeof SKETCH_LINE_STYLES)[number];
export const SKETCH_SYMBOLS = ["well", "tree", "post", "gate", "other"] as const;
export type SketchSymbolKind = (typeof SKETCH_SYMBOLS)[number];

/** Limits on what one read may keep, so a runaway answer can't fill a document. */
export const DRAWING_LIMITS = { lines: 200, symbols: 60, areas: 40, pointsPerLine: 60 } as const;

/** The drawing part of the reader's answer: added to the readings it already returns (autosurvey/sketch.ts). */
export const SketchDrawingOutput = {
  lines: z
    .array(
      z.object({
        image: z.number().describe("Which photo the line is on, counting from 0 in the order given"),
        points: z
          .array(z.string())
          .describe(
            "The point numbers written along this drawn line, in order from one end to the other, exactly as written: at least its two ends. Where the line passes a numbered point, list that number at its place. Where it turns a square corner with no number, the word corner at that place, between two numbers. Never a number that isn't written at the line.",
          ),
        label: z.string().describe("Writing along or beside this line, exactly as written: MW, fence, drain, a road's name, an owner's name. Empty when nothing is written there."),
        style: z.enum(SKETCH_LINE_STYLES).describe("single; double (two parallel lines, as walls are drawn); dashed; hatched (short marks across it); crossed (x marks along it); curved; other"),
        closes: z.boolean().describe("True when the line comes back to its first point"),
        runsOn: z
          .enum(["none", "start", "end", "both"])
          .describe("Whether the line is drawn on past its first (start) or last (end) listed number to an end with no number, as a neighbour's wall carrying on past the land's corner; none when it stops at its numbers"),
        certain: z.boolean().describe("True only when every number listed, and the line between them, is clearly drawn and clearly read"),
      }),
    )
    .describe("Every line drawn between numbered points"),
  symbols: z
    .array(
      z.object({
        image: z.number(),
        kind: z.enum(SKETCH_SYMBOLS).describe("well (a circle, often with a number or the word well), tree, post, gate, or other"),
        label: z.string().describe("Writing at the symbol, exactly as written, or empty"),
        at: z.string().describe("The point number written at or inside the symbol, exactly as written, or empty"),
      }),
    )
    .describe("Symbols drawn at points: wells, trees, posts, gates"),
  areas: z
    .array(
      z.object({
        image: z.number(),
        label: z.string().describe("Writing inside an area, exactly as written: a lot's letter, P, house, a building's name, an owner's name"),
        around: z.array(z.string()).describe("The point numbers at the area's corners, in order around it, as far as the drawing shows them; empty when its corners aren't numbered"),
      }),
    )
    .describe("Areas the sketch labels: lots, buildings, other people's land"),
};

const text = (max: number) => z.string().max(max);
const pointLabel = text(32).pipe(z.string().min(1));

export const sketchLineSchema = z.object({
  id: z.string().regex(/^l\d{1,3}$/),
  file: text(200),
  points: z.array(pointLabel).min(2).max(DRAWING_LIMITS.pointsPerLine),
  label: text(120),
  style: z.enum(SKETCH_LINE_STYLES),
  closes: z.boolean(),
  certain: z.boolean(),
  /** How many of the merged reads drew it (stage 257, ADR 0265); absent on a single read and on reads from before it. */
  reads: z.number().int().min(1).max(9).optional(),
  /** Drawn on past its first or last number to an end with no number (stage 261, ADR 0269): a neighbour's wall carrying on. Absent: it stops. */
  runsOn: z.enum(["start", "end", "both"]).optional(),
});
export type SketchLine = z.infer<typeof sketchLineSchema>;

export const sketchSymbolSchema = z.object({ id: z.string().regex(/^s\d{1,3}$/), file: text(200), kind: z.enum(SKETCH_SYMBOLS), label: text(120), at: text(32) });
export type SketchSymbol = z.infer<typeof sketchSymbolSchema>;

export const sketchAreaSchema = z.object({ id: z.string().regex(/^a\d{1,3}$/), file: text(200), label: text(120).pipe(z.string().min(1)), around: z.array(pointLabel).max(DRAWING_LIMITS.pointsPerLine) });
export type SketchArea = z.infer<typeof sketchAreaSchema>;

/** What was read of the sketch's drawing, kept with the plan's version beside the readings. */
export const sketchDrawingSchema = z.object({
  lines: z.array(sketchLineSchema).max(DRAWING_LIMITS.lines),
  symbols: z.array(sketchSymbolSchema).max(DRAWING_LIMITS.symbols),
  areas: z.array(sketchAreaSchema).max(DRAWING_LIMITS.areas),
});
export type SketchDrawing = z.infer<typeof sketchDrawingSchema>;

export interface DrawingAnswer {
  /** `reads`: when the photos were read more than once and merged, how many of the reads drew the line (stage 257); never the model's. */
  lines: { image: number; points: string[]; label: string; style: string; closes: boolean; certain: boolean; reads?: number; runsOn?: string }[];
  symbols: { image: number; kind: string; label: string; at: string }[];
  areas: { image: number; label: string; around: string[] }[];
}

/**
 * The reader's drawing made safe to keep: an element on a photo that wasn't sent, of an unknown style or kind, with a point number
 * carrying invisible characters (which could make two numbers look alike), or a line with fewer than two numbers is dropped. Numbers
 * and labels are kept as written, only trimmed.
 */
export function acceptDrawing(answer: DrawingAnswer, files: readonly string[], clean: (s: string, max: number) => string, invisible: (s: string) => boolean): SketchDrawing {
  const onPhoto = (image: number) => Number.isInteger(image) && image >= 0 && image < files.length;
  const labels = (xs: readonly string[]) => xs.map((x) => clean(x, 32)).filter((x) => x && !invisible(x));
  const lines: SketchLine[] = [];
  for (const l of answer.lines) {
    if (lines.length >= DRAWING_LIMITS.lines || !onPhoto(l.image) || !(SKETCH_LINE_STYLES as readonly string[]).includes(l.style)) continue;
    if (l.points.some((p) => invisible(p))) continue;
    // A number left empty can't be skipped: joining its neighbours would draw a leg the sketch never drew.
    if (l.points.some((p) => !clean(p, 32))) continue;
    const pts = labels(l.points).slice(0, DRAWING_LIMITS.pointsPerLine);
    const label = clean(l.label, 120);
    if (pts.length < 2 || invisible(label)) continue;
    const reads = typeof l.reads === "number" && Number.isInteger(l.reads) && l.reads >= 1 && l.reads <= 9 ? { reads: l.reads } : {};
    // A closed outline has no ends to carry on past.
    const runsOn = !l.closes && (l.runsOn === "start" || l.runsOn === "end" || l.runsOn === "both") ? { runsOn: l.runsOn as "start" | "end" | "both" } : {};
    lines.push({ id: `l${lines.length + 1}`, file: files[l.image]!, points: pts, label, style: l.style as SketchLineStyle, closes: Boolean(l.closes), certain: Boolean(l.certain), ...reads, ...runsOn });
  }
  const symbols: SketchSymbol[] = [];
  for (const s of answer.symbols) {
    if (symbols.length >= DRAWING_LIMITS.symbols || !onPhoto(s.image) || !(SKETCH_SYMBOLS as readonly string[]).includes(s.kind)) continue;
    const [label, at] = [clean(s.label, 120), clean(s.at, 32)];
    if (invisible(label) || invisible(at)) continue;
    symbols.push({ id: `s${symbols.length + 1}`, file: files[s.image]!, kind: s.kind as SketchSymbolKind, label, at });
  }
  const areas: SketchArea[] = [];
  for (const a of answer.areas) {
    if (areas.length >= DRAWING_LIMITS.areas || !onPhoto(a.image)) continue;
    const label = clean(a.label, 120);
    if (!label || invisible(label) || a.around.some((p) => invisible(p))) continue;
    // Corners with one left empty aren't a ring the sketch numbers: the area is kept without them, and asked about.
    const around = a.around.some((p) => !clean(p, 32)) ? [] : labels(a.around).slice(0, DRAWING_LIMITS.pointsPerLine);
    areas.push({ id: `a${areas.length + 1}`, file: files[a.image]!, label, around });
  }
  return { lines, symbols, areas };
}
