import { ViewTransition } from "react";

/** The transition type the app's navigation links add, so only moving between pages animates. */
export const PAGE_NAV = ["page-nav"];

/**
 * Animates the app's page content when someone moves between pages from the
 * sidebar or the tab bar (styles in globals.css, off under reduced motion).
 * Refreshes, form results and live polling change the page without it.
 */
export function PageTransition({ children }: { children: React.ReactNode }) {
  return <ViewTransition default={{ "page-nav": "page", default: "none" }}>{children}</ViewTransition>;
}
