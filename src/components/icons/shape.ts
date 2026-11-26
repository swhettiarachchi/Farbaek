/**
 * The geometry Farbaek's own icons are drawn with (ADR 0289): a 24 unit square, one stroke with round ends and round joins,
 * and soft corners on every box. Framework-free: only path data.
 */

/** One icon: `o` is stroked, `s` is filled (dots and small solids), `dash` breaks the stroke, `turn` rotates it about the middle. */
export interface Soft {
  o?: string;
  s?: string;
  dash?: string;
  turn?: number;
}

/**
 * The same icon as a state: `b` is its body, filled; `k` and `ks` are cut out of the body (a tick in a disc), as strokes and
 * as solids; `o` is stroked beside it (a handle, a stand).
 */
export interface Fill {
  b: string;
  k?: string;
  ks?: string;
  o?: string;
}

const n = (v: number) => String(Math.round(v * 100) / 100);

/** A box with soft corners. */
export function box(x: number, y: number, w: number, h: number, q: number): string {
  const a = `a${n(q)} ${n(q)} 0 0 1`;
  return `M${n(x + q)} ${n(y)}h${n(w - 2 * q)}${a} ${n(q)} ${n(q)}v${n(h - 2 * q)}${a} ${n(-q)} ${n(q)}h${n(-(w - 2 * q))}${a} ${n(-q)} ${n(-q)}v${n(-(h - 2 * q))}${a} ${n(q)} ${n(-q)}Z`;
}

/** A circle. */
export function ring(x: number, y: number, q: number): string {
  return `M${n(x - q)} ${n(y)}a${n(q)} ${n(q)} 0 1 0 ${n(2 * q)} 0a${n(q)} ${n(q)} 0 1 0 ${n(-2 * q)} 0Z`;
}

/** A dot, for the filled layer. */
export const dot = (x: number, y: number, q = 1.15) => ring(x, y, q);

/** The frames most icons sit in. */
export const SQUARE = box(3.5, 3.5, 17, 17, 5);
export const CIRCLE = ring(12, 12, 8.75);
export const SHIELD = "M12 3.4c2.1 1.4 4.5 2.1 7 2.3v5.4c0 4.4-2.7 7.9-7 9.6-4.3-1.7-7-5.2-7-9.6V5.7c2.5-.2 4.9-.9 7-2.3Z";
export const SEAL =
  "M19.58 8.86a3.5 3.5 0 0 1 0 6.28a3.5 3.5 0 0 1-4.44 4.44a3.5 3.5 0 0 1-6.28 0a3.5 3.5 0 0 1-4.44-4.44a3.5 3.5 0 0 1 0-6.28a3.5 3.5 0 0 1 4.44-4.44a3.5 3.5 0 0 1 6.28 0a3.5 3.5 0 0 1 4.44 4.44Z";
/** A sheet of paper with a folded corner, and the fold. */
export const SHEET = "M13.5 3.5H8.5a3 3 0 0 0-3 3v11a3 3 0 0 0 3 3h7a3 3 0 0 0 3-3v-9Z";
export const FOLD = "M13.5 3.5v3a2 2 0 0 0 2 2h3";
/** A folder with a soft tab. */
export const FOLDER = "M3.5 8a3 3 0 0 1 3-3h2.6a2 2 0 0 1 1.5.7l1 1.1a2 2 0 0 0 1.5.7h4.4a3 3 0 0 1 3 3V16a3 3 0 0 1-3 3h-11a3 3 0 0 1-3-3Z";
/** A person: a head and shoulders. */
export const HEAD = ring(12, 8.5, 3.5);
export const SHOULDERS = "M5 19.5c.9-3.3 3.7-5.2 7-5.2s6.1 1.9 7 5.2";
