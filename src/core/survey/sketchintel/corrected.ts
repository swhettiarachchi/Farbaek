/**
 * The surveyor's corrections of point numbers as read (stage 249, ADR 0257), applied: the drawing and the readings as the engine and the
 * plan's checks read them. Pure and with type imports only, so the sketch record's own checks (`autosurvey/sketch.ts`) can use it.
 */
import type { SketchReading, SketchRecord } from "../autosurvey/sketch";
import type { SketchDrawing } from "./drawing";

/** One correction: the photo the number is written on, the number as read, the number it is, who corrected it and when. */
export type SketchCorrection = NonNullable<SketchRecord["corrections"]>[number];

/**
 * A point number as the engine matches it (`match.ts`): trimmed, without trailing punctuation, and without leading zeros when it's all
 * digits, so "10.", "010" and "10" on one photo are corrected together. Letter case is kept: A1 and a1 can be two surveyed points.
 */
export function numberKey(label: string): string {
  const written = label.trim().replace(/[.,;:]+$/, "");
  return /^0+\d+$/.test(written) ? written.replace(/^0+(?=\d)/, "") : written;
}

/** The corrections for one photo, as a map from the number read to the number it is; the newest correction of a number wins. */
function mapFor(corrections: readonly SketchCorrection[], file: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of corrections) if (c.file === file) m.set(numberKey(c.label), c.to);
  return m;
}

/**
 * The drawing as the engine reads it: every point number the surveyor corrected, on its own photo, replaced once. A correction is never
 * applied to another's result, so two numbers swapped on a photo are corrected by correcting each.
 */
export function correctedDrawing(drawing: SketchDrawing, corrections: readonly SketchCorrection[]): SketchDrawing {
  if (corrections.length === 0) return drawing;
  const maps = new Map<string, Map<string, string>>();
  const fix = (file: string, label: string) => {
    if (!maps.has(file)) maps.set(file, mapFor(corrections, file));
    return maps.get(file)!.get(numberKey(label)) ?? label;
  };
  return {
    lines: drawing.lines.map((l) => ({ ...l, points: l.points.map((p) => fix(l.file, p)) })),
    symbols: drawing.symbols.map((s) => ({ ...s, at: s.at ? fix(s.file, s.at) : s.at })),
    areas: drawing.areas.map((a) => ({ ...a, around: a.around.map((p) => fix(a.file, p)) })),
  };
}

/** The readings as the engine reads them: a point number corrected, and the ends of a measurement or what a label is near. */
export function correctedReadings(readings: readonly SketchReading[], corrections: readonly SketchCorrection[]): SketchReading[] {
  if (corrections.length === 0) return [...readings];
  const maps = new Map<string, Map<string, string>>();
  return readings.map((r) => {
    if (!maps.has(r.file)) maps.set(r.file, mapFor(corrections, r.file));
    const m = maps.get(r.file)!;
    if (m.size === 0) return r;
    const fix = (x: string) => (x ? (m.get(numberKey(x)) ?? x) : x);
    const next = { ...r, text: r.kind === "point" ? fix(r.text) : r.text, from: fix(r.from), to: fix(r.to), near: fix(r.near) };
    return next.text === r.text && next.from === r.from && next.to === r.to && next.near === r.near ? r : next;
  });
}
