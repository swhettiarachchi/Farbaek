import type { MetadataRoute } from "next";
import { sitemapUrls } from "@/core/seo/crawl";
import { siteUrl } from "@/server/supabase/config";

// Built when asked, from the server's own address (NEXT_PUBLIC_SITE_URL), never at build time.
export const dynamic = "force-dynamic";

/** /sitemap.xml: Farbaek's public pages (src/core/seo/crawl.ts), for Google Search Console. */
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapUrls(siteUrl()).map((url) => ({ url }));
}
