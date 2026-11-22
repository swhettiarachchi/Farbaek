"use client";

/**
 * The look the person chose, in the browser (stage 211, ADR 0227). Choosing saves a cookie for the server's next render
 * and turns the page now, with no reload, by changing the page's mark: the one the server rendered (ThemeMark), or the
 * one a page built ahead of time carries (SiteThemeMark, stage 211 part 2). A page without a mark stays light.
 *
 * A page can be drawn before the choice changed: the browser's Back brings a page back as it was, and another tab may
 * have chosen since. `syncTheme` puts such a page back in step with the cookie (ThemeSync calls it).
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_THEME, PAGE_COLOR, clearOldChatCookie, isTheme, showsDark, themeCookie, themeInCookies, type Theme } from "@/core/theme/theme";

export const PAGE_THEME_ATTR = "data-page-theme";
const DARK_DEVICE = "(prefers-color-scheme: dark)";
const listeners = new Set<() => void>();
/** What was picked on this page, used only when the browser holds no cookie for it (cookies refused). */
let chosen: Theme | null = null;

/** The choice this browser's cookie holds, or null: none saved, or cookies can't be read. */
function cookieChoice(): Theme | null {
  try {
    return themeInCookies(document.cookie);
  } catch {
    return null;
  }
}

/** What the page shows now: the server's mark, or nothing known on a page without one. */
function current(): Theme | null {
  const marked = document.querySelector(`[${PAGE_THEME_ATTR}]`)?.getAttribute(PAGE_THEME_ATTR);
  return isTheme(marked) ? marked : null;
}

/** The browser's own bars follow the page. Only what's there is changed: React owns these tags. */
export function paintBrowserBar(theme: Theme) {
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
  chosen = theme;
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

/**
 * The saved choice as this browser holds it, for pages built ahead of time, where no server read the cookie. The cookie
 * comes first, so a choice made in another tab counts; anything but a known choice is Light.
 */
export function savedChoice(): Theme {
  return cookieChoice() ?? chosen ?? DEFAULT_THEME;
}

/**
 * Puts a page that was drawn earlier back in step with the saved choice: its marks, the browser's own bars, and the
 * control. With no choice saved, the page is left as the server drew it (the server may have read Chat's older cookie,
 * which this page can't see).
 */
export function syncTheme() {
  const saved = cookieChoice();
  if (!saved) return;
  let turned = false;
  for (const mark of document.querySelectorAll(`[${PAGE_THEME_ATTR}]`)) {
    if (mark.getAttribute(PAGE_THEME_ATTR) === saved) continue;
    mark.setAttribute(PAGE_THEME_ATTR, saved);
    turned = true;
  }
  // Always: the bars' tags are replaced when a link inside the site is followed, and arrive saying Light.
  paintBrowserBar(saved);
  if (turned) listeners.forEach((listener) => listener());
}

export { subscribe as subscribeChoice };

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
