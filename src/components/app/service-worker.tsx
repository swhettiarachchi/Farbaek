"use client";

import { useEffect } from "react";

/**
 * Registers Farbaek's service worker (public/sw.js, ADR 0079) in production:
 * the offline page for the installed app, and notifications once someone
 * turns them on. It caches nothing personal.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, []);
  return null;
}
