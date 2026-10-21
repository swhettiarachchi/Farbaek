/**
 * The film timeline (ADR 0034): every value on the film stage is a pure
 * function of the time in milliseconds, so the recorder can step frame by
 * frame and get the same film every time. No wall clock, no timers.
 */
import type { FilmChapter } from "@/content/films";

/** A cubic Bézier easing, as CSS defines it, solved by Newton's method. */
export function bezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i += 1) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-6 || d === 0) break;
      t -= err / d;
    }
    return sy(Math.min(1, Math.max(0, t)));
  };
}

/** Farbaek's entrance curve, cubic-bezier(0.16,1,0.3,1). */
export const easeOut = bezier(0.16, 1, 0.3, 1);
/** A slow, even curve for camera moves. */
export const easeInOut = bezier(0.65, 0, 0.35, 1);
export const linear = (x: number) => Math.min(1, Math.max(0, x));

/** Progress from 0 to 1 between two moments, eased. */
export function progress(t: number, from: number, to: number, ease: (x: number) => number = easeOut): number {
  if (to <= from) return t >= to ? 1 : 0;
  return ease((t - from) / (to - from));
}

export const mix = (a: number, b: number, p: number) => a + (b - a) * p;

/** A value through keyframes [time, value]; each segment eased. Before the first and after the last, it holds. */
export function keys(t: number, frames: readonly (readonly [number, number])[], ease: (x: number) => number = easeInOut): number {
  if (frames.length === 0) return 0;
  if (t <= frames[0]![0]) return frames[0]![1];
  for (let i = 1; i < frames.length; i += 1) {
    const [t1, v1] = frames[i]!;
    const [t0, v0] = frames[i - 1]!;
    if (t <= t1) return mix(v0, v1, progress(t, t0, t1, ease));
  }
  return frames.at(-1)![1];
}

/** Text as typed at a steady pace from a start time. */
export function typed(text: string, t: number, start: number, charsPerSecond = 26): string {
  if (t <= start) return "";
  return text.slice(0, Math.min(text.length, Math.floor(((t - start) / 1000) * charsPerSecond)));
}

/** The chapter playing at a moment. */
export function chapterAt<T extends Pick<FilmChapter, "start">>(chapters: readonly T[], t: number): { chapter: T; index: number } {
  let index = 0;
  for (let i = 0; i < chapters.length; i += 1) if (t >= chapters[i]!.start) index = i;
  return { chapter: chapters[index]!, index };
}

/** "0:07" or "1:02". */
export function clock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function vttTime(ms: number): string {
  const total = Math.max(0, Math.round(ms));
  const h = Math.floor(total / 3_600_000);
  const m = Math.floor((total % 3_600_000) / 60_000);
  const s = Math.floor((total % 60_000) / 1000);
  const msPart = total % 1000;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(msPart).padStart(3, "0")}`;
}

/** WebVTT for a film: one cue per chapter, from its start to the next one's. */
export function toVtt(chapters: readonly Pick<FilmChapter, "start" | "caption" | "label">[], durationMs: number, field: "caption" | "label"): string {
  const cues = chapters.map((c, i) => {
    const end = chapters[i + 1]?.start ?? durationMs;
    return `${i + 1}\n${vttTime(c.start)} --> ${vttTime(end)}\n${c[field]}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
