/**
 * What search engines may crawl on Farbaek's own site. Pure, so the lists
 * are tested; src/app/robots.ts and src/app/sitemap.ts serve them.
 *
 * Only the public site is listed. Signed-in pages, Office Space, sign-in
 * links, one-off pages and published sites stay out: the app's pages
 * already say noindex, and robots.txt keeps crawlers from asking for them.
 * Published sites answer their own /robots.txt from the site route.
 */

/** The public pages, in the order a visitor meets them. */
export const PUBLIC_PAGES = ["/", "/pricing", "/security", "/verify", "/proofpack/v1", "/privacy", "/terms", "/acceptable-use"] as const;

/**
 * Paths crawlers are asked to leave alone on the app's host. Only the ordinary
 * ones: robots.txt is public, so it never maps staff or internal routes, which
 * keep themselves out of search with noindex instead (stage 171).
 */
export const PRIVATE_PATHS = ["/app", "/api", "/auth", "/invite", "/delete-account", "/account-deleted", "/offline"] as const;

/**
 * Every path that's never a public page: the ones above, plus the staff and
 * internal routes robots.txt doesn't name. Analytics never counts a visit to
 * any of them (src/core/analytics/consent.ts).
 */
export const NOT_PUBLIC_PATHS = [
  ...PRIVATE_PATHS,
  "/admin",
  "/office",
  "/sign-in/password",
  "/sandbox-preview",
  "/site-serve",
  "/film-stage",
  "/preview-frame",
] as const;

export interface RobotsRules {
  allow: string[];
  disallow: string[];
  /** Absolute sitemap address, only on the app's own host. */
  sitemap: string | null;
}

/**
 * The rules for one host. The app's host gets the public site and its
 * sitemap; any other name that reaches this file (Office Space, a name
 * nothing uses) asks crawlers to stay away entirely.
 */
export function robotsRules(host: string | null, appHost: string | null, siteUrl: string): RobotsRules {
  if (!host || !appHost || host !== appHost) return { allow: [], disallow: ["/"], sitemap: null };
  return { allow: ["/"], disallow: [...PRIVATE_PATHS], sitemap: `${siteUrl.replace(/\/+$/, "")}/sitemap.xml` };
}

/** The sitemap's addresses: every public page, absolute. */
export function sitemapUrls(siteUrl: string): string[] {
  const base = siteUrl.replace(/\/+$/, "");
  return PUBLIC_PAGES.map((path) => (path === "/" ? `${base}/` : `${base}${path}`));
}
