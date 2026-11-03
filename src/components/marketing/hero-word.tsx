"use client";

/**
 * The hero's last word, which cycles through what Farbaek builds: software,
 * a website, an app. Each word slides up into place inside a box sized to
 * the widest one, so nothing around it moves. Screen readers get the whole
 * sentence once (the h1 carries it); this part is hidden from them. Under
 * reduced motion it stays on the first word, and it pauses while the tab is
 * hidden.
 */
import { useEffect, useState, useSyncExternalStore } from "react";

export const HERO_WORDS = ["software", "website", "app"] as const;

const STEP_MS = 2600;
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(listener: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, () => window.matchMedia(QUERY).matches, () => true);
}

export function HeroWord() {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % HERO_WORDS.length);
    }, STEP_MS);
    return () => window.clearInterval(timer);
  }, [reduced]);

  const shown = reduced ? 0 : index;
  const leaving = (shown - 1 + HERO_WORDS.length) % HERO_WORDS.length;

  return (
    // Padding gives "app" room for its descenders inside the clipped box; the negative margin keeps the line where it was.
    <span aria-hidden className="relative -mb-[0.16em] inline-grid overflow-hidden pb-[0.16em] align-baseline text-accent">
      {HERO_WORDS.map((word, i) => (
        <span
          key={word}
          className="col-start-1 row-start-1 whitespace-nowrap transition-[transform,opacity] duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none"
          style={{
            transform: i === shown ? "translateY(0)" : i === leaving ? "translateY(-105%)" : "translateY(105%)",
            opacity: i === shown ? 1 : 0,
          }}
        >
          {word}
          <span className="text-ink">.</span>
        </span>
      ))}
    </span>
  );
}
