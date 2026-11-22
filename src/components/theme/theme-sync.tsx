"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { syncTheme } from "./apply";

/**
 * Keeps a page that is already drawn in step with the saved look (stage 211 part 2, ADR 0232). A mark is right when
 * it is drawn, and then things happen that no server sees:
 *
 * - **Back and Forward** bring a page back as it was, with the look it had then.
 * - **Another tab** may have chosen since.
 * - **A link inside the site** replaces the tags that colour the browser's own bars, and they arrive saying Light.
 * - **The device turns**, for someone on Auto.
 *
 * Each time, the page is checked against the cookie and corrected. Draws nothing.
 */
export function ThemeSync() {
  const pathname = usePathname();

  useEffect(() => {
    syncTheme();
  }, [pathname]);

  useEffect(() => {
    const whenShown = () => {
      if (document.visibilityState === "visible") syncTheme();
    };
    // New tags in the head, not their contents: correcting a tag's colour doesn't call this again.
    const head = new MutationObserver(() => syncTheme());
    head.observe(document.head, { childList: true });
    const device = window.matchMedia("(prefers-color-scheme: dark)");
    window.addEventListener("pageshow", whenShown);
    document.addEventListener("visibilitychange", whenShown);
    device.addEventListener("change", whenShown);
    return () => {
      head.disconnect();
      window.removeEventListener("pageshow", whenShown);
      document.removeEventListener("visibilitychange", whenShown);
      device.removeEventListener("change", whenShown);
    };
  }, []);

  return null;
}
