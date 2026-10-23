"use client";

import { useSyncExternalStore } from "react";

// One shared clock for every timer on the page, ticking while anything listens.
let current = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  current = Date.now();
  timer ??= setInterval(() => {
    current = Date.now();
    for (const l of listeners) l();
  }, 15_000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/**
 * The time now, refreshed every 15 seconds. The server render and hydration
 * use `serverNow` (the server's render time), so both draw the same thing.
 */
export function useNow(serverNow: number): number {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => serverNow,
  );
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/**
 * "in 2 days" or "3 hours ago", from a difference in milliseconds. Rounded
 * toward zero, so time left is never overstated. English like the rest of
 * the interface, which also keeps the server render and hydration equal.
 */
export function relativeLabel(diffMs: number): string {
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  for (const [unit, ms] of UNITS) {
    if (Math.abs(diffMs) >= ms || unit === "minute") return rtf.format(Math.trunc(diffMs / ms), unit);
  }
  return rtf.format(0, "minute");
}
