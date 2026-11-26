"use client";

import { useEffect } from "react";
import { syncMemoryCookieFromPrefs } from "./prefs";

/**
 * Keeps the server's copy of the memory switch equal to this browser's own (stage 284, ADR 0292), on every signed-in page. A
 * person who switched memory off before the server could read that still has it off for the next plan Build drafts. Draws nothing.
 */
export function MemoryCookieSync() {
  useEffect(() => {
    syncMemoryCookieFromPrefs();
  }, []);
  return null;
}
