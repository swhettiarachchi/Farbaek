"use client";

import { useEffect } from "react";

/**
 * The homepage lays out sections below the first screen only as they near it
 * (`.home-later`, content-visibility). A jump to an anchor (#status from the
 * hero, the menu's "What works today") would land by estimated sizes, in the
 * wrong place. Just before any jump within the page, this lays out every
 * section, so the browser lands exactly; the saving at load is kept
 * (ADR 0052).
 */
export function AnchorLayout() {
  useEffect(() => {
    const root = document.documentElement;
    const layOutAll = () => root.classList.add("cv-off");
    const land = () => {
      const id = decodeURIComponent(location.hash.slice(1));
      if (!id) return;
      layOutAll();
      // Instantly: arriving at a page has nothing to animate from.
      document.getElementById(id)?.scrollIntoView({ behavior: "instant" });
    };
    // Arriving with a hash: the browser already jumped by estimates, so land again, and once
    // more after the page and its fonts finish loading (text above can re-wrap), unless the
    // person has started moving around by then.
    let moved = false;
    const onMove = () => {
      moved = true;
    };
    const settle = () => {
      if (!moved) land();
    };
    land();
    const intents = ["wheel", "touchstart", "keydown", "pointerdown"] as const;
    intents.forEach((t) => window.addEventListener(t, onMove, { passive: true }));
    if (document.readyState !== "complete") window.addEventListener("load", settle, { once: true });
    void document.fonts?.ready.then(settle);
    // A click on an in-page link: lay out before the browser scrolls (capture runs first).
    const onClick = (e: MouseEvent) => {
      const link = (e.target as Element | null)?.closest?.("a[href*='#']");
      if (!(link instanceof HTMLAnchorElement)) return;
      const url = new URL(link.href);
      if (url.pathname === location.pathname && url.hash) layOutAll();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener("hashchange", land);
    return () => {
      moved = true;
      intents.forEach((t) => window.removeEventListener(t, onMove));
      window.removeEventListener("load", settle);
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("hashchange", land);
    };
  }, []);
  return null;
}
