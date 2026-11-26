"use client";

/**
 * The level the person chose, in the browser (stage 285, ADR 0293). Choosing saves a cookie for the server's next render
 * and turns the menus now, with no reload: everything that lists by level reads it through `useLevel`.
 *
 * A page can be drawn before the choice changed (the browser's Back, or another tab chose since), so the cookie is read
 * again whenever the page is shown or comes back into view.
 */
import { useSyncExternalStore } from "react";
import { levelCookie, levelInCookies, type Level } from "@/core/experience/level";

const listeners = new Set<() => void>();
/** What was picked on this page, used only when the browser holds no cookie for it (cookies refused). */
let chosen: Level | null = null;

function cookieChoice(): Level | null {
  try {
    return levelInCookies(document.cookie);
  } catch {
    return null;
  }
}

/** Saves the choice for a year and shows it at once. */
export function applyLevel(level: Level) {
  try {
    document.cookie = levelCookie(level, window.location.protocol === "https:");
  } catch {
    // Cookies blocked: the choice lasts for this page only.
  }
  chosen = level;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("pageshow", listener);
  window.addEventListener("focus", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("pageshow", listener);
    window.removeEventListener("focus", listener);
  };
}

/** The level to list by. `saved` is what the server read, so the first paint and the page agree. */
export function useLevel(saved: Level): Level {
  return useSyncExternalStore(
    subscribe,
    () => cookieChoice() ?? chosen ?? saved,
    () => saved,
  );
}
