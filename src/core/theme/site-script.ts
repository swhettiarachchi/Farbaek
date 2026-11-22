/**
 * The look for a page built ahead of time (stage 211 part 2, ADR 0232). The public site's pages are the same file for every
 * visitor, so no server reads the cookie for them. This fixed text runs before the page paints, reads the saved choice
 * and writes it on the mark that precedes it (SiteThemeMark), so a visitor who chose Dark never sees a white flash.
 *
 * It only ever writes "dark" or "system", and only on that mark: a cookie is the browser's to send, so nothing else in
 * it is used. Light needs nothing: it is what the page already is. It reads the first cookie of its name, exactly as
 * `themeInCookies` does for the page once it is live, so the two can't disagree. The sign-in pages allow exactly this text by its
 * hash (app-headers.ts); a test fails when one changes without the other.
 */
import { THEME_COOKIE } from "./theme";

export function siteThemeScript(): string {
  return `(function(){try{var m=document.cookie.match(/(?:^|; )${THEME_COOKIE}=([^;]*)/),e=document.querySelector("[data-page-theme]");if(m&&e&&(m[1]==="dark"||m[1]==="system"))e.setAttribute("data-page-theme",m[1])}catch(_){}})()`;
}
