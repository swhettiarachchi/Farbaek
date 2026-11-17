/**
 * Live web search as the chat turn uses it (stage 205, ADR 0222): SearXNG and the page reader from the server's settings, with
 * one breaker per server process. Without the settings there's no research step, and every answer says the web couldn't be
 * checked. Server-only.
 */
import { webConfig } from "./config";
import { createReaderClient } from "./reader-client";
import { research, type ResearchInput, type ResearchResult } from "./research";
import { createBreaker } from "./search/health";
import { createSearxng } from "./search/searxng";

const breaker = createBreaker();

export function webResearch(): ((input: ResearchInput) => Promise<ResearchResult>) | undefined {
  const config = webConfig();
  if (!config) return undefined;
  const search = createSearxng(config.searchUrl);
  const reader = createReaderClient(config.readerUrl);
  return (input) => research({ search, reader, breaker, now: Date.now }, input);
}
