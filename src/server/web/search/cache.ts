/**
 * Search results kept for a short while (stage 206, ADR 0223), so asking again, answering again and a deep task's rounds don't
 * send the same search to the engines twice: one server's address asking too often is what gets it blocked. How long a kept
 * search may be reused depends on how fresh the question asking for it needs its results (`keep`, or else the date limit the
 * search was sent with): two minutes for today's news and prices, ten for "this week", up to an hour for a question with no
 * date in it. Nothing stays longer than that hour: every call first removes what is older. A result that comes from here
 * carries the time its search really ran, and that time is what the answer says the web was checked at. Only a query and the
 * public results it found are kept, in memory, never on disk; an empty or failed search isn't kept. Server-only.
 */
import type { Freshness } from "@/core/web/plan";
import type { SearchResult } from "@/core/web/sources";
import type { SearchProvider } from "./provider";

export const SEARCH_TTL_MS: Record<Freshness, number> = { day: 120_000, week: 600_000, month: 1_800_000, year: 3_600_000, any: 3_600_000 };
const LONGEST_MS = Math.max(...Object.values(SEARCH_TTL_MS));

export function withSearchCache(provider: SearchProvider, { now = Date.now, max = 300 }: { now?: () => number; max?: number } = {}): SearchProvider & { size(): number } {
  // Oldest first: an entry is set once, when its search ran, and replaced (moved to the end) when it runs again.
  const kept = new Map<string, { at: number; results: SearchResult[] }>();
  const sweep = () => {
    for (const [key, entry] of kept) {
      if (now() - entry.at <= LONGEST_MS) break;
      kept.delete(key);
    }
  };
  return {
    name: provider.name,
    size: () => kept.size,
    async search(request) {
      sweep();
      const key = JSON.stringify([request.kind, request.freshness, request.language ?? "", request.query.trim().toLowerCase()]);
      const hit = kept.get(key);
      if (hit && now() - hit.at <= SEARCH_TTL_MS[request.keep ?? request.freshness]) return hit.results.map((r) => ({ ...r, fetchedAt: hit.at }));
      const results = await provider.search(request);
      if (results.length > 0) {
        kept.delete(key);
        kept.set(key, { at: now(), results });
        if (kept.size > max) kept.delete(kept.keys().next().value!);
      }
      return results;
    },
  };
}
