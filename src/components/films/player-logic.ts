/**
 * The film player's rules, kept apart from React so they can be tested
 * (ADR 0034). Which recording to load, when a film may play on its own,
 * how far through each chapter it is, and what each key does.
 */
import type { FilmChapter, FilmFormat } from "@/content/films";

/** Wider than this, the landscape recording fits; narrower, the portrait one. */
export const WIDE_QUERY = "(min-width: 640px)";

/** How much of a film must be on screen before it plays on its own. */
export const VISIBLE_SHARE = 0.45;

/** The recording to load: the landscape film on wide screens, the portrait film on phones, a clip as it is. */
export function formatFor(formats: readonly FilmFormat[], wide: boolean): FilmFormat {
  if (formats.includes("clip")) return "clip";
  if (!wide && formats.includes("portrait")) return "portrait";
  return formats.includes("landscape") ? "landscape" : formats[0]!;
}

export interface AutoplayInput {
  /** At least VISIBLE_SHARE of it is on screen. */
  inView: boolean;
  /** The tab is in the background. */
  hidden: boolean;
  /** The system asks for reduced motion. */
  reducedMotion: boolean;
  /** The browser asks to save data. */
  saveData: boolean;
  /** The person paused it. A person's pause stays until they press play. */
  userPaused: boolean;
  /** The person pressed play themselves, which overrides reduced motion and Save-Data. */
  userPlayed: boolean;
}

/** Whether the film should be playing right now. It never plays off screen or in a background tab. */
export function shouldPlay(s: AutoplayInput): boolean {
  if (!s.inView || s.hidden || s.userPaused) return false;
  if (s.userPlayed) return true;
  return !s.reducedMotion && !s.saveData;
}

/** How far through each chapter the film is, from 0 to 1. */
export function chapterFills(chapters: readonly Pick<FilmChapter, "start">[], durationMs: number, t: number): number[] {
  return chapters.map((c, i) => {
    const end = chapters[i + 1]?.start ?? durationMs;
    if (t <= c.start) return 0;
    if (t >= end) return 1;
    return (t - c.start) / (end - c.start);
  });
}

export type PlayerKey =
  | { kind: "toggle" }
  | { kind: "seek"; byMs: number }
  | { kind: "chapter"; step: 1 | -1 }
  | { kind: "captions" }
  | { kind: "fullscreen" };

/** What a key does on the focused player: Space or K, the arrows, J and L for chapters, C and F. */
export function keyAction(key: string): PlayerKey | null {
  switch (key) {
    case " ":
    case "k":
    case "K":
      return { kind: "toggle" };
    case "ArrowLeft":
      return { kind: "seek", byMs: -5_000 };
    case "ArrowRight":
      return { kind: "seek", byMs: 5_000 };
    case "j":
    case "J":
      return { kind: "chapter", step: -1 };
    case "l":
    case "L":
      return { kind: "chapter", step: 1 };
    case "c":
    case "C":
      return { kind: "captions" };
    case "f":
    case "F":
      return { kind: "fullscreen" };
    default:
      return null;
  }
}

/** Where a chapter step lands: the next chapter's start, or this chapter's start when more than two seconds in. */
export function chapterTarget(chapters: readonly Pick<FilmChapter, "start">[], t: number, step: 1 | -1): number {
  let index = 0;
  for (let i = 0; i < chapters.length; i += 1) if (t >= chapters[i]!.start) index = i;
  if (step === 1) return chapters[Math.min(chapters.length - 1, index + 1)]!.start;
  const into = t - chapters[index]!.start;
  return chapters[into > 2_000 ? index : Math.max(0, index - 1)]!.start;
}
