/**
 * Light or dark, for all of Farbaek (stage 211, ADR 0227). It is the person's choice: Light unless they pick Dark or
 * "Match device". The choice is a cookie, so the server's first paint is already right and nothing flashes.
 *
 * Until stage 211 only Farbaek Chat had Dark, with a cookie of its own that browsers send to Chat's pages alone. That
 * cookie is still read where it arrives, so a choice made in Chat is kept; the first change anywhere replaces it.
 */
export type Theme = "light" | "dark" | "system";

export const THEMES: readonly Theme[] = ["light", "dark", "system"];
export const DEFAULT_THEME: Theme = "light";

export const THEME_COOKIE = "fb_theme";
export const OLD_CHAT_THEME_COOKIE = "fb_chat_theme";
const YEAR_SECONDS = 31_536_000;

/** The page colour of each look, for the browser's own bars. Kept equal to the `canvas` token of each (a test checks). */
export const PAGE_COLOR = { light: "#fbfbfc", dark: "#0f1013" } as const;

export function isTheme(value: unknown): value is Theme {
  return typeof value === "string" && (THEMES as readonly string[]).includes(value);
}

/** The saved choice, from the cookie's value. Anything else is Light: a cookie is the browser's to send, so it is checked. */
export function readTheme(saved: string | null | undefined, olderChatChoice?: string | null): Theme {
  if (isTheme(saved)) return saved;
  if (isTheme(olderChatChoice)) return olderChatChoice;
  return DEFAULT_THEME;
}

/**
 * The choice in a browser's own cookie text ("a=1; fb_theme=dark"), or null when there is none or it isn't a known look.
 * The first cookie of that name counts. The script for pages built ahead of time reads it the same way (site-script.ts);
 * a test holds the two together.
 */
export function themeInCookies(cookies: string): Theme | null {
  const first = cookies.split("; ").find((part) => part.startsWith(`${THEME_COOKIE}=`));
  const value = first?.slice(THEME_COOKIE.length + 1);
  return isTheme(value) ? value : null;
}

/** The cookie that keeps a choice for a year, on every page of this site. */
export function themeCookie(theme: Theme, secure: boolean): string {
  return `${THEME_COOKIE}=${theme}; path=/; max-age=${YEAR_SECONDS}; samesite=lax${secure ? "; secure" : ""}`;
}

/** Removes Chat's older cookie, which lives on Chat's path only. */
export function clearOldChatCookie(secure: boolean): string {
  return `${OLD_CHAT_THEME_COOKIE}=; path=/app/chat; max-age=0; samesite=lax${secure ? "; secure" : ""}`;
}

/**
 * The colour a browser gives its own bars round the page. "Match device" names both, each for its own setting, so the
 * bar is right before any script runs.
 */
export function browserBarColor(theme: Theme): string | { media: string; color: string }[] {
  if (theme === "system") {
    return [
      { media: "(prefers-color-scheme: light)", color: PAGE_COLOR.light },
      { media: "(prefers-color-scheme: dark)", color: PAGE_COLOR.dark },
    ];
  }
  return PAGE_COLOR[theme];
}

/** Whether a choice shows dark on a device whose own setting is `deviceDark`. */
export function showsDark(theme: Theme, deviceDark: boolean): boolean {
  return theme === "dark" || (theme === "system" && deviceDark);
}
