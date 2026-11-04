import { z } from "zod";

/**
 * Public Supabase settings. The publishable key is designed to be used in
 * browsers; Row Level Security protects the data. The secret key is never
 * read here.
 */
const PublicConfig = z.object({
  url: z.url().refine((u) => u.startsWith("https://") || u.startsWith("http://localhost"), "Supabase URL must use https"),
  publishableKey: z.string().min(20),
});

export type SupabasePublicConfig = z.infer<typeof PublicConfig>;

export function readSupabaseConfig(): SupabasePublicConfig | null {
  const parsed = PublicConfig.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The public origin used in email links. Taken from configuration, never from
 * the request's Host header, so a forged host can't redirect sign-in links.
 */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production") throw new Error("NEXT_PUBLIC_SITE_URL must be set in production");
  return "http://localhost:3000";
}

/**
 * How the app's session cookies are set: never readable by page scripts (an injected script can't lift the
 * session), only over https where the site is served over https, and not sent on cross-site posts.
 */
export function sessionCookieOptions(): { httpOnly: true; secure: boolean; sameSite: "lax"; path: "/" } {
  return { httpOnly: true, secure: siteUrl().startsWith("https://"), sameSite: "lax", path: "/" };
}

/**
 * Only same-site relative paths are allowed as post-sign-in destinations. Browsers drop tabs and newlines
 * from a URL and read a backslash as a slash, so "/\t/evil.com" would become "//evil.com": any control
 * character, whitespace or backslash is refused, and what's left must resolve to this site.
 */
export function safeNextPath(next: string | null | undefined, fallback = "/app"): string {
  if (!next || !next.startsWith("/") || /[\u0000-\u001f\u007f\s\\]/.test(next)) return fallback;
  const base = "https://next.invalid";
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return fallback;
  }
  return url.origin === base ? `${url.pathname}${url.search}${url.hash}` : fallback;
}
