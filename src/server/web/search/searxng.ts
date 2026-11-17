/**
 * SearXNG on Farbaek's own server as the search provider (stage 205, ADR 0222): one JSON request per query, general or news.
 * SearXNG's time ranges are day, month and year, so "this week" asks for the month and keeps results dated within eight days
 * (and undated ones) when there are enough. A search that comes back empty because every engine was blocked or timed out is a
 * failure, not "nothing found". Server-only.
 */
import { cleanDate } from "@/server/web/reader/dates.mjs";
import type { SearchResult } from "@/core/web/sources";
import { SearchError, type SearchProvider, type SearchRequest } from "./provider";

const RANGE: Record<SearchRequest["freshness"], string | null> = { day: "day", week: "month", month: "month", year: "year", any: null };

interface SearxngAnswer {
  results?: Array<{ url?: unknown; title?: unknown; content?: unknown; publishedDate?: unknown; pubdate?: unknown }>;
  unresponsive_engines?: unknown[];
}

export function createSearxng(baseUrl: string, fetcher: typeof fetch = fetch, now: () => number = Date.now): SearchProvider {
  return {
    name: "searxng",
    async search(request) {
      const url = new URL("/search", baseUrl);
      url.searchParams.set("q", request.query);
      url.searchParams.set("format", "json");
      url.searchParams.set("categories", request.kind === "news" ? "news" : "general");
      url.searchParams.set("safesearch", "1");
      url.searchParams.set("pageno", "1");
      const range = RANGE[request.freshness];
      if (range) url.searchParams.set("time_range", range);
      if (request.language && /^[a-z]{2}$/.test(request.language)) url.searchParams.set("language", request.language);
      let response: Response;
      try {
        response = await fetcher(url, { signal: request.signal, headers: { accept: "application/json" }, redirect: "error" });
      } catch {
        throw new SearchError(request.signal.aborted ? "timeout" : "unavailable", request.signal.aborted ? "the search took too long" : "the search service didn't answer");
      }
      if (!response.ok) throw new SearchError("unavailable", `the search service answered ${response.status}`);
      let body: SearxngAnswer;
      try {
        body = (await response.json()) as SearxngAnswer;
      } catch {
        throw new SearchError("bad-answer", "the search service gave an answer Farbaek couldn't read");
      }
      const results: SearchResult[] = (body.results ?? [])
        .filter((r) => typeof r.url === "string" && /^https?:\/\//i.test(r.url))
        .map((r) => ({
          url: r.url as string,
          title: typeof r.title === "string" ? r.title : "",
          snippet: typeof r.content === "string" ? r.content : "",
          published: cleanDate(r.publishedDate ?? r.pubdate ?? null, now()),
          kind: request.kind,
        }));
      if (results.length === 0 && (body.unresponsive_engines?.length ?? 0) > 0) throw new SearchError("blocked", "the search engines didn't answer this time");
      if (request.freshness !== "week") return results;
      const recent = results.filter((r) => !r.published || now() - Date.parse(r.published) <= 8 * 86_400_000);
      return recent.length >= 3 ? recent : results;
    },
  };
}
