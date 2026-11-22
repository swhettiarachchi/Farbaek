import "server-only";
import { cookies } from "next/headers";
import { OLD_CHAT_THEME_COOKIE, THEME_COOKIE, readTheme, type Theme } from "@/core/theme/theme";

/**
 * The look this person chose (stage 211, ADR 0227), from their cookie. Light when they never chose. Reading it makes a
 * page render per request, so only frames that already do (the signed-in app, the staff console, shared pages) call it;
 * pages built ahead of time read the cookie in the browser instead (SiteThemeScript).
 */
export async function savedTheme(): Promise<Theme> {
  const jar = await cookies();
  return readTheme(jar.get(THEME_COOKIE)?.value, jar.get(OLD_CHAT_THEME_COOKIE)?.value);
}
