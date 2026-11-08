"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

function utcLabel(iso: string): string {
  return `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso))} UTC`;
}

/**
 * Shows an instant in the viewer's own time zone. The server render uses UTC
 * (labelled), then the browser swaps in local time after hydration.
 */
export function LocalTime({ iso, date = false }: { iso: string; date?: boolean }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat(undefined, date ? { dateStyle: "long" } : { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)),
    () => (date ? new Intl.DateTimeFormat("en-GB", { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso)) : utcLabel(iso)),
  );
  return <time dateTime={iso}>{text}</time>;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

/** "3 hours ago" in the viewer's locale, with the exact time on hover. */
export function RelativeTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => {
      const diff = new Date(iso).getTime() - Date.now();
      const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
      for (const [unit, ms] of UNITS) {
        if (Math.abs(diff) >= ms || unit === "minute") return rtf.format(Math.round(diff / ms), unit);
      }
      return rtf.format(0, "minute");
    },
    () => utcLabel(iso),
  );
  return (
    <time dateTime={iso} title={iso}>
      {text}
    </time>
  );
}
