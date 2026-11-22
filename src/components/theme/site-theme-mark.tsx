"use client";

import { useSyncExternalStore } from "react";
import { DEFAULT_THEME } from "@/core/theme/theme";
import { PAGE_THEME_ATTR, savedChoice, subscribeChoice } from "./apply";
import { ThemeSync } from "./theme-sync";

/**
 * The look's mark on pages built ahead of time: the public site (stage 211 part 2, ADR 0232). The server can't know
 * the choice there, so the page arrives marked Light, SiteThemeScript corrects the mark before the first paint, and
 * this keeps it right afterwards: when someone arrives from the app without a full load, and when they change the
 * choice. ThemeSync covers what happens to a page after it is drawn.
 *
 * The mark's value differs from the server's for anyone who chose Dark, on purpose, so React is told not to report it.
 * Keep the mark first: the script that follows it writes on the first mark in the page.
 */
export function SiteThemeMark() {
  const theme = useSyncExternalStore(subscribeChoice, savedChoice, () => DEFAULT_THEME);
  return (
    <>
      <span hidden suppressHydrationWarning {...{ [PAGE_THEME_ATTR]: theme }} />
      <ThemeSync />
    </>
  );
}
