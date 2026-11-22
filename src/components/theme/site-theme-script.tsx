import { siteThemeScript } from "@/core/theme/site-script";

/**
 * Corrects the look's mark before the page paints, on pages built ahead of time (stage 211 part 2, ADR 0232). Rendered straight
 * after SiteThemeMark, by the server, so the browser runs it as it reads the page. The script is a fixed string of our
 * own; the public pages' policy doesn't limit scripts, and the sign-in pages allow this one by its hash.
 */
export function SiteThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: siteThemeScript() }} />;
}
