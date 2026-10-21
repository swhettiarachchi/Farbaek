"use client";

/**
 * Browser facts the film players play by (ADR 0034): the screen width, the
 * system's reduced-motion and Save-Data wishes, whether a film is on screen
 * and whether the tab is visible. Read with useSyncExternalStore, or set
 * from browser callbacks, never in an effect body.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { VISIBLE_SHARE, WIDE_QUERY } from "./player-logic";

const REDUCE_QUERY = "(prefers-reduced-motion: reduce)";

export const noSubscribe = () => () => {};

function subscribeMedia(query: string) {
  return (notify: () => void) => {
    const list = window.matchMedia(query);
    list.addEventListener("change", notify);
    return () => list.removeEventListener("change", notify);
  };
}
const subscribeWide = subscribeMedia(WIDE_QUERY);
const subscribeReduce = subscribeMedia(REDUCE_QUERY);

/** Whether the screen is wide enough for the landscape cut; null while rendering on the server. */
export function useWide(): boolean | null {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => null);
}

/** Reduced motion and Save-Data. The server assumes both, so nothing starts before the browser says it may. */
export function usePlaybackLimits(): { reducedMotion: boolean; saveData: boolean } {
  const reducedMotion = useSyncExternalStore(subscribeReduce, () => window.matchMedia(REDUCE_QUERY).matches, () => true);
  const saveData = useSyncExternalStore(
    noSubscribe,
    () => Boolean((navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData),
    () => true,
  );
  return { reducedMotion, saveData };
}

/** Whether at least `share` of an element is on screen, and whether the tab is in the background. */
export function useOnScreen<T extends Element>(share = VISIBLE_SHARE) {
  const ref = useRef<T>(null);
  const [inView, setInView] = useState(false);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(Boolean(e && e.intersectionRatio >= share)), { threshold: [0, share, 1] });
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
