import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { robotsRules } from "@/core/seo/crawl";
import { appHostFromEnv } from "@/server/office/config";
import { normalizeHost } from "@/server/http/hosts";
import { siteUrl } from "@/server/supabase/config";

/**
 * /robots.txt for Farbaek's own site (src/core/seo/crawl.ts). It depends on
 * the host, so Office Space, which serves this file from its own name, asks
 * crawlers to stay away.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const host = normalizeHost(h.get("x-forwarded-host") ?? h.get("host"));
  const rules = robotsRules(host || null, appHostFromEnv(), siteUrl());
  return {
    rules: { userAgent: "*", ...(rules.allow.length ? { allow: rules.allow } : {}), disallow: rules.disallow },
    ...(rules.sitemap ? { sitemap: rules.sitemap } : {}),
  };
}
