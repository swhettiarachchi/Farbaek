"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * Shows an instant in the viewer's own time zone. The server render uses UTC
 * (labelled), then the browser swaps in local time after hydration.
 */
export function LocalTime({ iso }: { iso: string }) {
  const text = useSyncExternalStore(
    subscribe,
    () => new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)),
    () => `${new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(iso))} UTC`,
  );
  return <time dateTime={iso}>{text}</time>;
}
