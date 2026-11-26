/**
 * Search results and the sources an answer used (stage 205, ADR 0222). Framework-free.
 *
 * Results are deduplicated by a canonical address (tracking parameters and fragments removed), at most two per site, so one
 * site can't fill the answer (ranking is in rank.ts). The sources saved with an answer stay well under the 8 KB the database allows for a message's
 * facts, counted in UTF-8 bytes, since Sinhala, Tamil and Japanese titles take three bytes a character.
 */
import { z } from "zod";
import { PICTURE_SIG_PATTERN, PICTURE_URL_BYTES } from "./pictures";
import { DEPTHS, type Depth } from "./plan";

export interface SearchResult {
  url: string;
  title: string;
  snippet: string;
  /** The date the search engine gave, if any. */
  published: string | null;
  /** Which search found it: the general web or news. */
  kind: "web" | "news";
  /** When the search that found it ran, when that wasn't just now (a search kept for a few minutes, search/cache.ts). */
  fetchedAt?: number;
  /** The small picture the search gave with the result, if any (stage 278): an https address, never loaded by the browser. */
  image?: string | null;
  /** It came from a newsroom's own feed (stage 280, feeds.ts): a dated story, whatever words its title happens to use. */
  fromFeed?: boolean;
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
  /** The page's own "updated" date, when it gives one that differs from its published date. */
  updated?: string | null;
  /** The answer cites it. Set once the answer is written (citations.ts). */
  cited?: boolean;
  /** Whether the names and numbers in the sentences that cite it are on the page. Set once the answer is written. */
  support?: Support;
  /** The page's picture for previews of itself, and the server's signature of that address (stage 278, pictures.ts). Both or neither. */
  image?: string;
  imageSig?: string;
}

/** matched: found on the page. partly: some found. unmatched: none found. unchecked: nothing to compare, or only a snippet. */
export const SUPPORTS = ["matched", "partly", "unmatched", "unchecked"] as const;
export type Support = (typeof SUPPORTS)[number];

/** skipped: the message didn't need the web (a greeting, a poem, the person's own text), so it wasn't checked. */
export const SEARCH_STATUSES = ["done", "failed", "off", "skipped"] as const;

export interface SearchMeta {
  /** When the web was checked (ISO). */
  at: string;
  status: (typeof SEARCH_STATUSES)[number];
  queries: string[];
  /** Why it failed, was off or was skipped, in plain words. */
  reason?: string;
  sources: WebSource[];
  /** How far the research went: one search, a few, or a task in several parts. */
  depth?: Depth;
  /** Rounds of searching: 2 when a deep task looked again for what the first round missed. */
  rounds?: number;
  /** The person asked for a roundup of news or updates, and the answer was asked for as stories (stage 278). */
  roundup?: boolean;
  /** The answer's citations, counted once it is written: sources cited, and how many of them carry the cited names and numbers. */
  checks?: { cited: number; matched: number; unmatched: number; invalid: number };
}

/** The most sources and searches saved with one answer: a deep task reads more than a quick one. */
export const MAX_SAVED_SOURCES = 12;
export const MAX_SAVED_QUERIES = 8;

const source = z.object({
  n: z.number().int().min(1).max(20),
  url: z.string().max(700).refine((u) => /^https?:\/\//i.test(u)),
  title: z.string().max(300),
  site: z.string().max(120),
  published: z.string().max(40).nullable(),
  read: z.boolean(),
  updated: z.string().max(40).nullable().optional(),
  cited: z.boolean().optional(),
  support: z.enum(SUPPORTS).optional(),
  // A picture that doesn't read as one is left out; it never costs the answer its sources.
  image: z.string().max(PICTURE_URL_BYTES).refine((u) => /^https:\/\//i.test(u)).optional().catch(undefined),
  imageSig: z.string().regex(PICTURE_SIG_PATTERN).optional().catch(undefined),
});

export const searchMetaSchema = z.object({
  at: z.string().max(40),
  status: z.enum(SEARCH_STATUSES),
  queries: z.array(z.string().max(200)).max(MAX_SAVED_QUERIES),
  reason: z.string().max(200).optional(),
  sources: z.array(source).max(MAX_SAVED_SOURCES),
  depth: z.enum(DEPTHS).optional(),
  rounds: z.number().int().min(1).max(3).optional(),
  roundup: z.boolean().optional(),
  checks: z.object({ cited: z.number().int().min(0).max(20), matched: z.number().int().min(0).max(20), unmatched: z.number().int().min(0).max(20), invalid: z.number().int().min(0).max(99) }).optional(),
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
  // A host with no dot in its name is no site on the web. The first live roundup (2026-11-26) was given "https://go/v1/…",
  // a search engine's own redirect: nobody can open it, and it showed as a source called "go".
  if (!url.hostname.includes(".")) return null;
  url.hash = "";
  for (const key of [...url.searchParams.keys()]) if (TRACKING.test(key)) url.searchParams.delete(key);
  url.hostname = url.hostname.toLowerCase();
  const out = url.toString();
  return new TextEncoder().encode(out).length <= 600 ? out : null;
}

/** The first letter of a site's own name, for the place where its picture would be: "M" for news.mit.edu, "B" for bbc.co.uk. */
export function siteInitial(site: string): string {
  const parts = site.toLowerCase().replace(/^(?:www|m|amp)\./, "").split(".").filter(Boolean);
  // The name is the label before the ending: the last but one, or the one before a two-part ending like "co.uk".
  const twoPart = parts.length >= 3 && parts[parts.length - 2]!.length <= 3 && parts[parts.length - 1]!.length <= 2;
  const name = parts[Math.max(0, parts.length - (twoPart ? 3 : 2))] ?? "";
  return (name[0] ?? "").toUpperCase();
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

/** A source without its picture: the address and its signature go together. */
function withoutPicture(s: WebSource): WebSource {
  const rest = { ...s };
  delete rest.image;
  delete rest.imageSig;
  return rest;
}

/**
 * An answer's search facts without any picture (stage 278), for where pictures aren't shown: a shared chat, which anyone with
 * its link can read, carries no picture address and no signature of one.
 */
export function withoutPictures(meta: SearchMeta): SearchMeta {
  return { ...meta, sources: meta.sources.map(withoutPicture) };
}

const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** The search facts to save with an answer, trimmed to fit `maxBytes` of UTF-8: long titles shortened, then sources dropped from the end. */
export function fitSearchMeta(meta: SearchMeta, maxBytes = 5_500): SearchMeta {
  const fitted: SearchMeta = {
    ...meta,
    queries: meta.queries.slice(0, MAX_SAVED_QUERIES).map((q) => q.slice(0, 200)),
    reason: meta.reason?.slice(0, 200),
    sources: meta.sources
      .filter((s) => new TextEncoder().encode(s.url).length <= 600)
      .slice(0, MAX_SAVED_SOURCES)
      .map((s) => ({ ...s, title: s.title.slice(0, 120), site: s.site.slice(0, 60) })),
  };
  if (fitted.reason === undefined) delete fitted.reason;
  // A picture is the first thing to go: of a source the answer doesn't cite, from the end, then of any source.
  for (const onlyUncited of [true, false]) {
    for (let i = fitted.sources.length - 1; i >= 0 && bytes(fitted) > maxBytes; i--) {
      const s = fitted.sources[i]!;
      if (s.image && (!onlyUncited || !s.cited)) fitted.sources = fitted.sources.map((x, at) => (at === i ? withoutPicture(x) : x));
    }
  }
  // Shorter titles in fixed steps (each step always ends), then fewer sources.
  for (const limit of [90, 60, 40]) {
    if (bytes(fitted) <= maxBytes) break;
    fitted.sources = fitted.sources.map((s) => ({ ...s, title: s.title.length > limit ? `${s.title.slice(0, limit - 1)}…` : s.title }));
  }
  // Then fewer sources: the last one the answer doesn't cite goes first, so a cited source is never lost before an uncited one.
  while (bytes(fitted) > maxBytes && fitted.sources.length > 0) {
    const uncited = fitted.sources.findLastIndex((s) => !s.cited);
    const drop = uncited >= 0 ? uncited : fitted.sources.length - 1;
    fitted.sources = fitted.sources.filter((_, i) => i !== drop);
  }
  return fitted;
}

/**
 * An answer's text with its cited sources listed under it, for copying it somewhere else (stage 206): the numbers in the text
 * mean nothing without the pages they stand for. An answer that cites nothing, or wasn't searched, is returned as it is.
 */
export function withSourceList(content: string, search: SearchMeta | undefined): string {
  if (!search || search.status !== "done") return content;
  const cited = search.sources.filter((s) => s.cited);
  if (cited.length === 0) return content;
  return `${content.trimEnd()}\n\nSources\n${cited.map((s) => `[${s.n}] ${s.title || s.site} (${s.site}) ${s.url}`).join("\n")}`;
}
