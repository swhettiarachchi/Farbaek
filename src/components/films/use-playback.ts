"use client";

/**
 * Browser facts the film players play by (ADR 0034, ADR 0051): the screen
 * width, the system's reduced-motion and Save-Data wishes, whether a film is
 * on screen and whether the tab is visible, and the video element itself. Read with useSyncExternalStore, or set
 * from browser callbacks, never in an effect body.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { PLAY_AHEAD, playFailure, PRELOAD_AHEAD, QUIET_REFUSAL_MS, SLOW_AFTER_MS, WIDE_QUERY } from "./player-logic";

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

/**
 * Whether a film is close enough to play (within PLAY_AHEAD of the view) or
 * to download (within PRELOAD_AHEAD), and whether the tab is in the
 * background (ADR 0061).
 */
export function useOnScreen<T extends Element>() {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [near, setNear] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const play = new IntersectionObserver(([e]) => e && setInView(e.isIntersecting), { rootMargin: PLAY_AHEAD });
    const preload = new IntersectionObserver(([e]) => e && setNear(e.isIntersecting), { rootMargin: PRELOAD_AHEAD });
    play.observe(el);
    preload.observe(el);
    const onVisibility = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      play.disconnect();
      preload.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  return { ref, inView, near, hidden };
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

// ------------------------------------------------------------------ unlocking on a person's first touch

/**
 * Low Power Mode and some in-app browsers refuse to start any video until a
 * person touches the page (ADR 0061). Each refused film signs up here, and
 * its silent loop stands in. The next tap, click or key anywhere plays every
 * one of them inside that gesture, which unlocks each for good, and pauses
 * again at once any that shouldn't be moving yet.
 */
const refused = new Map<HTMLVideoElement, () => boolean>();
const UNLOCK_EVENTS = ["pointerup", "touchend", "click", "keydown"] as const;
let listening = false;

function stopListening() {
  UNLOCK_EVENTS.forEach((t) => window.removeEventListener(t, unlockFilms, true));
  listening = false;
}

function unlockFilms() {
  for (const [v, wants] of refused) {
    const started = v.play();
    if (!wants()) v.pause();
    // A pause right after counts: the gesture unlocked it. Only a refusal keeps it waiting for the next touch.
    started
      .then(() => refused.delete(v))
      .catch((err: unknown) => {
        if (playFailure(err) !== "blocked") refused.delete(v);
      })
      .finally(() => refused.size === 0 && stopListening());
  }
}

function waitForTouch(v: HTMLVideoElement, wants: () => boolean) {
  refused.set(v, wants);
  if (listening) return;
  listening = true;
  UNLOCK_EVENTS.forEach((t) => window.addEventListener(t, unlockFilms, { capture: true, passive: true }));
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
  // For the first-touch unlock: whether this film should be moving at that moment.
  const wantRef = useRef(want);
  useEffect(() => {
    wantRef.current = want;
  }, [want]);
  // A refused film stops waiting for a touch once its element or recording goes away.
  useEffect(() => {
    const v = video.current;
    return () => {
      if (v) refused.delete(v);
    };
  }, [video, source]);

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
        waitForTouch(v, () => wantRef.current);
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
    // Nothing at all after a few seconds, and not even downloading: a quiet refusal (QUIET_REFUSAL_MS).
    // A slow download isn't one; it keeps its poster until the first frame.
    const quiet = setTimeout(() => {
      if (live && v.paused && v.readyState === 0 && v.networkState !== v.NETWORK_LOADING && !v.error) failed("blocked");
    }, QUIET_REFUSAL_MS);
    v.addEventListener("canplay", resume);
    v.addEventListener("waiting", watch);
    v.addEventListener("stalled", watch);
    v.addEventListener("playing", settled);
    window.addEventListener("pageshow", resume);
    document.addEventListener("visibilitychange", resume);
    return () => {
      live = false;
      clearTimeout(timer);
      clearTimeout(quiet);
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
