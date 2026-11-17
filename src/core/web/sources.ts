/**
 * Search results and the sources an answer used (stage 205, ADR 0222). Framework-free.
 *
 * Results are deduplicated by a canonical address (tracking parameters and fragments removed), at most two per site, so one
 * site can't fill the answer. The sources saved with an answer stay well under the 8 KB the database allows for a message's
 * facts, counted in UTF-8 bytes, since Sinhala, Tamil and Japanese titles take three bytes a character.
 */
import { z } from "zod";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  /** The date the search engine gave, if any. */
  published: string | null;
  /** Which search found it: the general web or news. */
  kind: "web" | "news";
}

export interface WebSource {
  /** Its number in the answer's citations. */
  n: number;
  url: string;
  title: string;
  site: string;
  published: string | null;
  /** True when the page itself was read; false when only the search snippet was used. */
  read: boolean;
}

export const SEARCH_STATUSES = ["done", "failed", "off"] as const;

export interface SearchMeta {
  /** When the web was checked (ISO). */
  at: string;
  status: (typeof SEARCH_STATUSES)[number];
  queries: string[];
  /** Why it failed or was off, in plain words. */
  reason?: string;
  sources: WebSource[];
}

const source = z.object({
  n: z.number().int().min(1).max(20),
  url: z.string().max(700).refine((u) => /^https?:\/\//i.test(u)),
  title: z.string().max(300),
  site: z.string().max(120),
  published: z.string().max(40).nullable(),
  read: z.boolean(),
});

export const searchMetaSchema = z.object({
  at: z.string().max(40),
  status: z.enum(SEARCH_STATUSES),
  queries: z.array(z.string().max(200)).max(3),
  reason: z.string().max(200).optional(),
  sources: z.array(source).max(8),
});

const TRACKING = /^(?:utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|igshid|ref|ref_src|ref_url|_hsenc|_hsmi|yclid|si|spm)$/i;

/** The address without tracking parameters or a fragment, or null when it isn't a usable http(s) address. */
export function canonicalUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  const out = url.toString();
  return new TextEncoder().encode(out).length <= 600 ? out : null;
}

/** A site's short name from its address: "www.bbc.co.uk" → "bbc.co.uk". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^(?:www|m|amp)\./, "");
  } catch {
    return "";
  }
}

/**
 * The results worth reading, best first: news first when fresh news was asked for, each address once, at most `perSite` from
 * one site, at most `max` in all.
 */
export function selectResults(results: SearchResult[], { max = 8, perSite = 2, newsFirst = false }: { max?: number; perSite?: number; newsFirst?: boolean } = {}): SearchResult[] {
  const ordered = newsFirst ? [...results.filter((r) => r.kind === "news"), ...results.filter((r) => r.kind !== "news")] : results;
  const seen = new Set<string>();
  const perSiteCount = new Map<string, number>();
  const out: SearchResult[] = [];
  for (const r of ordered) {
    const url = canonicalUrl(r.url);
    if (!url || seen.has(url)) continue;
    const site = siteOf(url);
    if ((perSiteCount.get(site) ?? 0) >= perSite) continue;
    seen.add(url);
    perSiteCount.set(site, (perSiteCount.get(site) ?? 0) + 1);
    out.push({ ...r, url, title: r.title.trim().slice(0, 300), snippet: r.snippet.trim().slice(0, 600) });
    if (out.length >= max) break;
  }
  return out;
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** The search facts to save with an answer, trimmed to fit `maxBytes` of UTF-8: long titles shortened, then sources dropped from the end. */
export function fitSearchMeta(meta: SearchMeta, maxBytes = 5_500): SearchMeta {
  const fitted: SearchMeta = {
    ...meta,
    queries: meta.queries.slice(0, 3).map((q) => q.slice(0, 200)),
    reason: meta.reason?.slice(0, 200),
    sources: meta.sources
      .filter((s) => new TextEncoder().encode(s.url).length <= 600)
      .slice(0, 8)
      .map((s) => ({ ...s, title: s.title.slice(0, 120), site: s.site.slice(0, 60) })),
  };
  if (fitted.reason === undefined) delete fitted.reason;
  // Shorter titles in fixed steps (each step always ends), then fewer sources.
  for (const limit of [90, 60, 40]) {
    if (bytes(fitted) <= maxBytes) break;
    fitted.sources = fitted.sources.map((s) => ({ ...s, title: s.title.length > limit ? `${s.title.slice(0, limit - 1)}…` : s.title }));
  }
  while (bytes(fitted) > maxBytes && fitted.sources.length > 0) fitted.sources = fitted.sources.slice(0, -1);
  return fitted;
}
