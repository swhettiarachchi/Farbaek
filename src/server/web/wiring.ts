/**
 * Live web search as the chat turn uses it (stage 205, ADR 0222): SearXNG and the page reader from the server's settings, with
 * one breaker per server process. Without the settings there's no research step, and every answer says the web couldn't be
 * checked. Server-only.
 */
import { webConfig } from "./config";
import { pictureKey } from "./picture";
import { createReaderClient } from "./reader-client";
import { research, type ResearchInput, type ResearchResult } from "./research";
import { withSearchCache } from "./search/cache";
import { createBreaker } from "./search/health";
import type { SearchProvider } from "./search/provider";
import { createSearxng } from "./search/searxng";

const breaker = createBreaker();
/** One search provider per server process, so the searches it keeps for a few minutes are shared by every answer (search/cache.ts). */
let searches: SearchProvider | undefined;

export function webResearch(): ((input: ResearchInput) => Promise<ResearchResult>) | undefined {
  const config = webConfig();
  if (!config) return undefined;
  searches ??= withSearchCache(createSearxng(config.searchUrl));
  const search = searches;
  const reader = createReaderClient(config.readerUrl);
  return (input) => research({ search, reader, breaker, now: Date.now, pictureKey: pictureKey() }, input);
}
