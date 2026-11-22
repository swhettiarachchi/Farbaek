"use client";

/**
 * The look the person chose, in the browser (stage 211, ADR 0227). Choosing saves a cookie for the server's next render
 * and turns the page now, with no reload, by changing the mark the server rendered (ThemeMark). Only pages that carry
 * a mark turn: the public site has none yet and stays light, so it never depends on which page someone came from.
 */
import { useSyncExternalStore } from "react";
import { PAGE_COLOR, clearOldChatCookie, isTheme, showsDark, themeCookie, type Theme } from "@/core/theme/theme";

export const PAGE_THEME_ATTR = "data-page-theme";
const DARK_DEVICE = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();

/** What the page shows now: the server's mark, or nothing known on a page without one. */
function current(): Theme | null {
  const marked = document.querySelector(`[${PAGE_THEME_ATTR}]`)?.getAttribute(PAGE_THEME_ATTR);
  return isTheme(marked) ? marked : null;
}

/** The browser's own bars follow the page. Only what's there is changed: React owns these tags. */
function paintBrowserBar(theme: Theme) {
  const dark = showsDark(theme, window.matchMedia(DARK_DEVICE).matches);
  for (const meta of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) {
    const forDark = meta.media.includes("dark");
    const forLight = meta.media.includes("light");
    if (theme === "system" && (forDark || forLight)) meta.content = forDark ? PAGE_COLOR.dark : PAGE_COLOR.light;
    else meta.content = dark ? PAGE_COLOR.dark : PAGE_COLOR.light;
  }
}

/** Saves the choice for a year and shows it at once. */
export function applyTheme(theme: Theme) {
  const secure = window.location.protocol === "https:";
  try {
    document.cookie = themeCookie(theme, secure);
    document.cookie = clearOldChatCookie(secure);
  } catch {
    // Cookies blocked: the choice lasts for this page only.
  }
  for (const mark of document.querySelectorAll(`[${PAGE_THEME_ATTR}]`)) mark.setAttribute(PAGE_THEME_ATTR, theme);
  paintBrowserBar(theme);
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The choice to show as selected. `saved` is what the server read, so the first paint and the page agree. */
export function useTheme(saved: Theme): Theme {
  return useSyncExternalStore(
    subscribe,
    () => current() ?? saved,
    () => saved,
  );
}

function subscribeDark(listener: () => void) {
  listeners.add(listener);
  const device = window.matchMedia(DARK_DEVICE);
  device.addEventListener("change", listener);
  // A piece can also be turned by itself (data-theme), and Chat's settings change the page while it is open.
  const seen = new MutationObserver(listener);
  seen.observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: [PAGE_THEME_ATTR, "data-theme"] });
  return () => {
    listeners.delete(listener);
    device.removeEventListener("change", listener);
    seen.disconnect();
  };
}

/**
 * Whether this element is shown dark right now, whatever made it so: the page's look, the device, or a piece turned by
 * itself. Read from the colour scheme the browser worked out for it. False on the server and until the page is live.
 */
export function useShownDark(element: () => Element | null): boolean {
  return useSyncExternalStore(
    subscribeDark,
    () => {
      const el = element();
      return el ? getComputedStyle(el).colorScheme === "dark" : false;
    },
    () => false,
  );
}
