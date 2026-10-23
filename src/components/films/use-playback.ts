"use client";

/**
 * Browser facts the film players play by (ADR 0034, ADR 0051): the screen
 * width, the system's reduced-motion and Save-Data wishes, whether a film is
 * on screen and whether the tab is visible, and the video element itself. Read with useSyncExternalStore, or set
 * from browser callbacks, never in an effect body.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { playFailure, SLOW_AFTER_MS, VISIBLE_SHARE, WIDE_QUERY } from "./player-logic";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";
/** Large screens with a mouse: where the stage tilt and the breathing aurora are worth their cost. */
export const DESKTOP_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine)";
export const LG_QUERY = "(min-width: 1024px)";

export const noSubscribe = () => () => {};

function subscribeMedia(query: string) {
  return (notify: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", notify);
    return () => list.removeEventListener("change", notify);
  };
}
const subscriptions = new Map<string, (notify: () => void) => () => void>();
function subscriptionFor(query: string) {
  let s = subscriptions.get(query);
  if (!s) {
    s = subscribeMedia(query);
    subscriptions.set(query, s);
  }
  return s;
}

/** Whether a media query matches; null while rendering on the server. */
export function useMediaQuery(query: string): boolean | null {
  return useSyncExternalStore(subscriptionFor(query), () => window.matchMedia(query).matches, () => null);
}

/** Whether the screen is wide enough for the landscape cut; null while rendering on the server. */
export function useWide(): boolean | null {
  return useMediaQuery(WIDE_QUERY);
}

/** Reduced motion and Save-Data. The server assumes both, so nothing starts before the browser says it may. */
export function usePlaybackLimits(): { reducedMotion: boolean; saveData: boolean } {
  const reducedMotion = useSyncExternalStore(subscriptionFor(REDUCE_QUERY), () => window.matchMedia(REDUCE_QUERY).matches, () => true);
  const saveData = useSyncExternalStore(
    noSubscribe,
    () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
    () => true,
  );
  return { reducedMotion, saveData };
}

// ------------------------------------------------------------------ on screen

/** Whether at least `share` of an element is on screen, and whether the tab is in the background. */
export function useOnScreen<T extends Element>(share = VISIBLE_SHARE) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e) setInView(e.intersectionRatio >= share);
      },
      { threshold: [...new Set([0, share, 1])].sort((a, b) => a - b) },
    );
    io.observe(el);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [share]);
  return { ref, inView, hidden };
}

// ------------------------------------------------------------------ the video element

const HAVE_FUTURE_DATA = 3;

type Failed = (failure: "blocked" | "failed") => void;

/** Asks the element to play and reads a refusal (playFailure). An interruption is left to the resume handlers. */
function playVideo(v: HTMLVideoElement, failed: Failed) {
  v.play().catch((err: unknown) => {
    const failure = playFailure(err);
    if (failure === "blocked") failed("blocked");
    else if (failure === "failed" && v.error) failed("failed");
  });
}

/** Loads the recording again from where it was, then plays it. */
function reloadVideo(v: HTMLVideoElement, failed: Failed) {
  const at = v.currentTime;
  v.load();
  if (at > 0) v.currentTime = at;
  playVideo(v, failed);
}

export interface VideoControl {
  /** Frames are moving. */
  playing: boolean;
  /** A frame of this source has been drawn, so the poster can step aside. */
  shown: boolean;
  /** The browser won't start it on its own; a person's press will. */
  blocked: boolean;
  /** It has tried for a while without a frame. */
  slow: boolean;
  /** The recording failed to load or play. */
  error: boolean;
  /** Plays from a person's press, inside the gesture, so phones that refuse autoplay still play. */
  start: () => void;
  /** Loads the recording again and plays it, after a failure or a stall. */
  retry: () => void;
}

/**
 * Keeps a video element in step with `want`, and says honestly what it's
 * doing. Every refused `play()` is read (playFailure): a refused autoplay
 * waits for a press, an interruption is tried again when the video can play
 * or the page comes back (tab switch, screen unlock, back button), and a
 * failure shows. A stall past SLOW_AFTER_MS is reported instead of spinning
 * forever. State is kept per source, so switching cuts starts clean.
 */
export function useVideoControl(video: RefObject<HTMLVideoElement | null>, want: boolean, source: string | null): VideoControl {
  const [playingFor, setPlayingFor] = useState<string | null>(null);
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [blockedFor, setBlockedFor] = useState<string | null>(null);
  const [slowFor, setSlowFor] = useState<string | null>(null);
  const [errorFor, setErrorFor] = useState<string | null>(null);


  // What the element does, in state. Listeners live as long as this element and source.
  useEffect(() => {
    const v = video.current;
    if (!v || !source) return;
    const handlers: [string, () => void][] = [
      ["playing", () => {
        setPlayingFor(source);
        setShownFor(source);
        setSlowFor(null);
        setErrorFor(null);
        setBlockedFor(null);
      }],
      ["loadeddata", () => setShownFor(source)],
      ["pause", () => setPlayingFor(null)],
      ["waiting", () => setPlayingFor(null)],
      ["emptied", () => setPlayingFor(null)],
      ["error", () => {
        setPlayingFor(null);
        setErrorFor(source);
      }],
    ];
    handlers.forEach(([type, fn]) => v.addEventListener(type, fn));
    return () => handlers.forEach(([type, fn]) => v.removeEventListener(type, fn));
  }, [video, source]);

  // Play or pause to match `want`, and recover when the browser stops it on its own.
  useEffect(() => {
    const v = video.current;
    if (!v || !source) return;
    if (!want) {
      if (!v.paused) v.pause();
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const failed: Failed = (failure) => {
      if (!live) return;
      // A refusal isn't a stall: it waits for a press, so it's never "slow".
      if (failure === "blocked") {
        clearTimeout(timer);
        setBlockedFor(source);
      } else setErrorFor(source);
    };
    const watch = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (live && (v.paused || v.readyState < HAVE_FUTURE_DATA)) setSlowFor(source);
      }, SLOW_AFTER_MS);
    };
    // "interrupted" refusals end up here: when the video can play, or the page comes back.
    const resume = () => {
      if (live && v.paused && !document.hidden && !v.error) playVideo(v, failed);
    };
    const settled = () => clearTimeout(timer);
    playVideo(v, failed);
    watch();
    v.addEventListener("canplay", resume);
    v.addEventListener("waiting", watch);
    v.addEventListener("stalled", watch);
    v.addEventListener("playing", settled);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      live = false;
      clearTimeout(timer);
      v.removeEventListener("canplay", resume);
      v.removeEventListener("waiting", watch);
      v.removeEventListener("stalled", watch);
      v.removeEventListener("playing", settled);
      window.removeEventListener("pageshow", resume);
      document.removeEventListener("visibilitychange", resume);
    };
  }, [want, source, video]);

  const failedNow: Failed = (failure) => {
    if (!source) return;
    if (failure === "blocked") setBlockedFor(source);
    else setErrorFor(source);
  };
  const start = () => {
    const v = video.current;
    if (!v || !source) return;
    setBlockedFor(null);
    playVideo(v, failedNow);
  };
  const retry = () => {
    const v = video.current;
    if (!v || !source) return;
    setErrorFor(null);
    setSlowFor(null);
    setBlockedFor(null);
    reloadVideo(v, failedNow);
  };

  return {
    playing: source !== null && playingFor === source,
    shown: source !== null && shownFor === source,
    blocked: source !== null && blockedFor === source,
    slow: source !== null && slowFor === source,
    error: source !== null && errorFor === source,
    start,
    retry,
  };
}
