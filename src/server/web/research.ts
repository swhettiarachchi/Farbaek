/**
 * Checking the live web before an answer (stage 205, ADR 0222): plan the searches, search, read the best pages, and hand the
 * model numbered, dated sources. One deadline (9 seconds) covers it all, so an answer never waits long; a page that can't be
 * read in time is represented by its search snippet. Every outcome is honest: if the web couldn't be checked, the model is told
 * so and must say so, and the answer records why. Server-only.
 */
import { randomBytes } from "node:crypto";
import { buildWebBlock, webFailureNote, type WebDoc } from "@/core/web/context";
import { cleanQuery, type SearchPlan } from "@/core/web/plan";
import { fitSearchMeta, selectResults, siteOf, type SearchMeta, type SearchResult } from "@/core/web/sources";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import type { ChatModel } from "@/server/ai/chat-model";
import { log } from "@/server/observability/log";
import { planSearch } from "./planner";
import type { ReaderClient } from "./reader-client";
import type { Breaker } from "./search/health";
import { SearchError, type SearchProvider } from "./search/provider";

export const RESEARCH_DEADLINE_MS = 9_000;
/** Pages opened per answer; the rest of the results are given as snippets. */
const PAGES_TO_READ = 5;

export type ResearchStage = { stage: "planning" } | { stage: "searching"; queries: string[] } | { stage: "reading"; pages: number };

export interface ResearchDeps {
  search: SearchProvider | null;
  reader: ReaderClient | null;
  breaker: Breaker;
  now: () => number;
  tag?: () => string;
}

export interface ResearchInput {
  question: string;
  earlier: { role: "user" | "assistant"; text: string }[];
  /** Plan without a model call. */
  local: boolean;
  plannerModel: ChatModel | null;
  plannerModelId: string | null;
  /** A language code the search may prefer. */
  language: string | null;
  /** Characters of web text the answer may read. */
  budgetChars: number;
  signal: AbortSignal;
  onStage?: (stage: ResearchStage) => void;
}

export interface ResearchResult {
  /** The text appended to the question for the model: the web results, or a note that the web couldn't be checked. */
  context: string;
  meta: SearchMeta;
  plannerUsage: ProviderUsage | null;
}

function failed(reason: string, at: Date, queries: string[], plannerUsage: ProviderUsage | null): ResearchResult {
  return { context: webFailureNote(reason, at), meta: fitSearchMeta({ at: at.toISOString(), status: "failed", queries, reason, sources: [] }), plannerUsage };
}

async function searchAll(provider: SearchProvider, plan: SearchPlan, language: string | null, signal: AbortSignal): Promise<{ results: SearchResult[]; failures: SearchError[] }> {
  const jobs: { query: string; kind: "web" | "news" }[] = plan.queries.map((query) => ({ query, kind: "web" }));
  // News too, for the main query, when it's about events, releases or anything recent.
  if (plan.news || plan.freshness === "day") jobs.push({ query: plan.queries[0]!, kind: "news" });
  const settled = await Promise.allSettled(jobs.map((job) => provider.search({ query: job.query, kind: job.kind, freshness: plan.freshness, language, signal })));
  const results: SearchResult[] = [];
  const failures: SearchError[] = [];
  // Interleaved, so the first results of every query come before the second results of any.
  const lists = settled.map((s) => (s.status === "fulfilled" ? s.value : (failures.push(s.reason instanceof SearchError ? s.reason : new SearchError("unavailable", "the search service didn't answer")), [])));
  for (let i = 0; i < Math.max(0, ...lists.map((l) => l.length)); i++) for (const list of lists) if (list[i]) results.push(list[i]!);
  return { results, failures };
}

export async function research(deps: ResearchDeps, input: ResearchInput): Promise<ResearchResult> {
  const started = deps.now();
  const deadline = started + RESEARCH_DEADLINE_MS;
  const at = new Date(started);
  if (!deps.search || !deps.reader) return failed("live web search isn't set up on this server", at, [], null);
  if (deps.breaker.open()) return failed("the search service isn't answering right now", at, [], null);

  input.onStage?.({ stage: "planning" });
  const planned = await planSearch({ question: input.question, earlier: input.earlier, local: input.local, model: input.plannerModel, modelId: input.plannerModelId, signal: input.signal, timeoutMs: 2_500 });
  const plan = planned.plan.queries.length > 0 ? planned.plan : { ...planned.plan, queries: [cleanQuery(input.question)].filter((q) => q.length >= 2) };
  if (input.signal.aborted) return failed("stopped", at, plan.queries, planned.usage);
  if (plan.queries.length === 0) return failed("there was nothing in the message to search for", at, [], planned.usage);

  input.onStage?.({ stage: "searching", queries: plan.queries });
  const searchSignal = AbortSignal.any([input.signal, AbortSignal.timeout(Math.max(1_000, Math.min(3_500, deadline - deps.now() - 2_000)))]);
  const { results, failures } = await searchAll(deps.search, plan, input.language, searchSignal);
  if (results.length === 0) {
    if (failures.length > 0) {
      deps.breaker.fail();
      log("warn", "web.search_failed", { kinds: failures.map((f) => f.kind).join(","), queries: plan.queries.length });
      return failed(failures[0]!.message, at, plan.queries, planned.usage);
    }
    deps.breaker.ok();
    return {
      context: webFailureNote("the search found no pages for this question", at),
      meta: fitSearchMeta({ at: at.toISOString(), status: "done", queries: plan.queries, reason: "nothing found", sources: [] }),
      plannerUsage: planned.usage,
    };
  }
  deps.breaker.ok();

  const chosen = selectResults(results, { max: 8, perSite: 2, newsFirst: plan.freshness === "day" && plan.news });
  const toRead = chosen.slice(0, PAGES_TO_READ);
  input.onStage?.({ stage: "reading", pages: toRead.length });
  const readTime = Math.max(1_500, Math.min(4_000, deadline - deps.now() - 250));
  const pages = await Promise.all(toRead.map((r) => deps.reader!.read(r.url, { timeoutMs: readTime, hintedDate: r.published, signal: input.signal })));

  const docs: WebDoc[] = chosen.map((r, i) => {
    const page = i < pages.length ? pages[i]! : null;
    const read = page?.ok === true && !page.optOut && page.text.length >= 200;
    return {
      n: i + 1,
      url: page?.ok ? page.url : r.url,
      title: (page?.ok && page.title) || r.title || siteOf(r.url),
      site: (page?.ok && page.site) || siteOf(r.url),
      published: (page?.ok && page.published) || r.published,
      updated: page?.ok ? page.updated : null,
      read,
      // A page that opted out of being used gives its title only.
      text: read && page?.ok ? page.text : page?.ok && page.optOut ? "" : r.snippet,
    };
  });
  const tag = deps.tag?.() ?? randomBytes(6).toString("hex");
  const context = buildWebBlock({ docs, queries: plan.queries, retrievedAt: at, budgetChars: input.budgetChars, tag });
  log("info", "web.research", { ms: deps.now() - started, queries: plan.queries.length, results: results.length, read: docs.filter((d) => d.read).length, planner: planned.via });
  return {
    context,
    meta: fitSearchMeta({ at: at.toISOString(), status: "done", queries: plan.queries, sources: docs.map(({ n, url, title, site, published, read }) => ({ n, url, title, site, published, read })) }),
    plannerUsage: planned.usage,
  };
}
