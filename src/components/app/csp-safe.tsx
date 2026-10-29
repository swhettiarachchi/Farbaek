"use client";

import { z } from "zod";

// The app's Content-Security-Policy has no 'unsafe-eval' (ADR 0107). Zod probes
// for it with `new Function`, which the browser reports even though Zod
// catches the throw; jitless skips the probe. Browser only: the server keeps
// Zod's faster compiled parsers.
if (typeof window !== "undefined") z.config({ jitless: true });

/** Rendered once in the app layout so the setting above runs before any page parses. */
export function CspSafe() {
  return null;
}
