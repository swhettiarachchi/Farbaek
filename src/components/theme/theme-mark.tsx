import type { Theme } from "@/core/theme/theme";
import { ThemeSync } from "./theme-sync";

/**
 * The person's look, marked in the page by the server (stage 211, ADR 0227). The stylesheet reads it from anywhere in
 * the page (`:root:has([data-page-theme])`, src/styles/theme-dark.css), so the whole page is right at first paint,
 * with its dialogs and menus, and no script runs for that. Rendered by the frames that know who is asking; pages built
 * ahead of time use SiteThemeMark and SiteThemeScript instead.
 *
 * ThemeSync then keeps a drawn page in step: Back can bring this page back as it was before the choice changed.
 */
export function ThemeMark({ theme }: { theme: Theme }) {
  return (
    <>
      <span hidden data-page-theme={theme} />
      <ThemeSync />
    </>
  );
}
