/**
 * A web search provider (stage 205, ADR 0222). SearXNG on Farbaek's own server is the one in use; a provider with an API key
 * (Brave, Tavily) or a model's built-in search would be another implementation of this, chosen in `server/web/config.ts`.
 * Server-only.
 */
import type { Freshness } from "@/core/web/plan";
import type { SearchResult } from "@/core/web/sources";

export interface SearchRequest {
  query: string;
  freshness: Freshness;
  /** The general web, or news. */
  kind: "web" | "news";
  /**
   * How fresh the question itself needs its results, when that differs from the date limit sent to the engines (a question
   * about today searches the general web for the last week): a search kept in memory is reused only this long (search/cache.ts).
   */
  keep?: Freshness;
  /** A language code to prefer, when known ("en", "si"); null lets the engines decide. */
  language: string | null;
  signal: AbortSignal;
}

export interface SearchProvider {
  readonly name: string;
  search(request: SearchRequest): Promise<SearchResult[]>;
}

/** Why a search failed, in words that can be shown: "the search service didn't answer". */
export class SearchError extends Error {
  constructor(
    readonly kind: "unavailable" | "blocked" | "timeout" | "bad-answer",
    message: string,
  ) {
    super(message);
  }
}
