/**
 * Checking the live web before an answer (stage 205, ADR 0222; stage 206, ADR 0223): decide whether the web is needed, plan
 * the searches, search, rank what came back, read the best pages, and hand the model numbered, dated sources.
 *
 * Three depths, chosen from the question, never by the person:
 * - quick: one search, four pages read, 9 seconds at most;
 * - standard: two or three searches side by side, six pages, 12 seconds;
 * - deep: a task in up to five parts, then a second round for what those pages didn't cover, up to twelve sources, 36 seconds.
 *
 * A search for something recent that comes back nearly empty is run once more without its date limit (engines that can't filter
 * by date are left out of a dated search without saying so). Results that carry none of the plan's words are left out; when
 * none of them do, the model is told the search found nothing on the question rather than being handed noise. A page that
 * can't be read in time is represented by its search snippet. Every outcome is honest: if the web couldn't be checked, the model
 * is told so and must say so, and the answer records why. The pages are returned to the turn so the finished answer's
 * citations can be checked against them; they are never stored. Server-only.
 */
import { randomBytes } from "node:crypto";
import { readLanguage } from "@/core/chat/language";
import { buildWebBlock, oneLine, sourceOf, webFailureNote, webNothingRelevantNote, webNotNeededNote, type WebDoc } from "@/core/web/context";
import type { NeedReading } from "@/core/web/intent";
import type { Depth, Freshness, SearchPlan } from "@/core/web/plan";
import { rankResults, type Ranked } from "@/core/web/rank";
import { canonicalUrl, fitSearchMeta, siteOf, type SearchMeta, type SearchResult } from "@/core/web/sources";
import type { ProviderUsage } from "@/server/ai/contract-drafter";
import type { ChatModel } from "@/server/ai/chat-model";
import { log } from "@/server/observability/log";
import { signedPicture } from "./picture";
import { addUsage, planGap, planSearch } from "./planner";
import type { ReaderClient } from "./reader-client";
import type { Breaker } from "./search/health";
import { SearchError, type SearchProvider } from "./search/provider";

export const RESEARCH_DEADLINE_MS: Record<Depth, number> = { quick: 9_000, standard: 12_000, deep: 36_000 };
/** Pages opened in the first round; the rest of the results are given as snippets. */
const PAGES_TO_READ: Record<Depth, number> = { quick: 4, standard: 6, deep: 6 };
/** Sources an answer is given, read or not. */
const SOURCES_KEPT: Record<Depth, number> = { quick: 6, standard: 8, deep: 8 };
/** A roundup of news is made of many stories from many places (stage 278): more sources, and more of them opened. */
const ROUNDUP = { sources: 10, pages: 6 };
/** A deep task's second round: more pages read, more sources kept. */
const SECOND_ROUND = { pages: 4, sources: 4, leastMs: 11_000 };

export type ResearchStage =
  | { stage: "planning" }
  | { stage: "searching"; queries: string[]; round?: number }
  | { stage: "reading"; pages: number; round?: number }
  /** A deep task, between rounds: looking at what the pages found don't cover yet. */
  | { stage: "checking" };

export interface ResearchDeps {
  search: SearchProvider | null;
  reader: Pick<ReaderClient, "read"> | null;
  breaker: Breaker;
  now: () => number;
  tag?: () => string;
  /** The key a source's picture is signed with (server/web/picture.ts). Missing or null: sources carry no picture. */
  pictureKey?: Buffer | null;
}

export interface ResearchInput {
  question: string;
  earlier: { role: "user" | "assistant"; text: string }[];
  /** What the message's own words say about needing the web (core/web/intent.ts). */
  need: NeedReading;
  /** Plan without a model call. */
  local: boolean;
  plannerModel: ChatModel | null;
  plannerModelId: string | null;
  /** Characters of web text the answer may read, and the larger amount a deep task may. */
  budgetChars: number;
  deepBudgetChars?: number;
  signal: AbortSignal;
  onStage?: (stage: ResearchStage) => void;
}

export interface ResearchResult {
  /** The text appended to the question for the model: the web results, or a note on why there are none. */
  context: string;
  meta: SearchMeta;
  plannerUsage: ProviderUsage | null;
  /** The pages as the model read them, for checking the answer's citations. In memory for this answer only. */
  docs: WebDoc[];
}

function failed(reason: string, at: Date, queries: string[], plannerUsage: ProviderUsage | null): ResearchResult {
  return { context: webFailureNote(reason, at), meta: fitSearchMeta({ at: at.toISOString(), status: "failed", queries, reason, sources: [] }), plannerUsage, docs: [] };
}

/** The language a query is written in, when it is in a script of its own ("si" for Sinhala script); null for Latin letters, where the engines decide. */
function queryLanguage(query: string): string | null {
  const reading = readLanguage(query);
  return reading.script && reading.script !== "Latin" && reading.language && /^[a-z]{2}$/.test(reading.language) ? reading.language : null;
}

interface Searched {
  lists: SearchResult[][];
  failures: SearchError[];
}

/**
 * Every query on the general web, side by side, and the first one in news too when the question is about events or anything
 * recent. On the general web "today" asks for recent pages rather than pages published today: the page with today's price or
 * score is often older than a day. News keeps the exact period.
 */
async function searchAll(provider: SearchProvider, queries: readonly string[], plan: Pick<SearchPlan, "freshness" | "news" | "roundup">, freshness: Freshness, keep: Freshness, signal: AbortSignal): Promise<Searched> {
  const web: Freshness = freshness === "day" ? "week" : freshness;
  const jobs: { query: string; kind: "web" | "news"; freshness: Freshness }[] = queries.map((query) => ({ query, kind: "web", freshness: web }));
  // A roundup looks in news for every part of it (stage 278); anything else about events, for its first search.
  if (plan.roundup) for (const query of queries.slice(0, 3)) jobs.push({ query, kind: "news", freshness });
  else if ((plan.news || plan.freshness === "day") && queries[0]) jobs.push({ query: queries[0], kind: "news", freshness });
  // `keep` is how fresh the question needs its results: a search for today is kept two minutes, whatever date limit it was sent with.
  const settled = await Promise.allSettled(jobs.map((job) => provider.search({ query: job.query, kind: job.kind, freshness: job.freshness, keep, language: queryLanguage(job.query), signal })));
  const failures: SearchError[] = [];
  const lists = settled.map((s) => (s.status === "fulfilled" ? s.value : (failures.push(s.reason instanceof SearchError ? s.reason : new SearchError("unavailable", "the search service didn't answer")), [])));
  return { lists, failures };
}

const total = (lists: SearchResult[][]) => lists.reduce((n, l) => n + l.length, 0);

export async function research(deps: ResearchDeps, input: ResearchInput): Promise<ResearchResult> {
  const started = deps.now();
  const at = new Date(started);
  if (!deps.search || !deps.reader) return failed("live web search isn't set up on this server", at, [], null);
  if (deps.breaker.open()) return failed("the search service isn't answering right now", at, [], null);
  const provider = deps.search;
  const reader = deps.reader;

  input.onStage?.({ stage: "planning" });
  const planned = await planSearch({ question: input.question, earlier: input.earlier, need: input.need, local: input.local, model: input.plannerModel, modelId: input.plannerModelId, signal: input.signal, now: started, timeoutMs: 4_000 });
  let plannerUsage = planned.usage;
  if (planned.miss) log("warn", "web.planner_missed", { why: planned.miss, ms: deps.now() - started });
  if (input.signal.aborted) return failed("stopped", at, planned.plan?.queries ?? [], plannerUsage);
  if (!planned.plan) {
    log("info", "web.research", { ms: deps.now() - started, need: "none", planner: planned.via });
    return { context: webNotNeededNote(at), meta: { at: at.toISOString(), status: "skipped", queries: [], reason: "this message didn't need current information", sources: [] }, plannerUsage, docs: [] };
  }
  const plan: SearchPlan = planned.plan;
  if (plan.queries.length === 0) {
    // Only request words in the message ("mata kiyanna"), or nothing a search engine should see: there's nothing to look up, and
    // the question as typed is never sent in its place.
    return { context: webNotNeededNote(at), meta: { at: at.toISOString(), status: "skipped", queries: [], reason: "there was nothing in the message to search for", sources: [] }, plannerUsage, docs: [] };
  }
  const depth = plan.depth;
  // The deadline is counted from the start, so a slow plan leaves less for the rest, never more time in all.
  const deadline = started + RESEARCH_DEADLINE_MS[depth];
  const left = () => deadline - deps.now();
  const stopped = () => failed("stopped", at, plan.queries, plannerUsage);

  // Round one: search.
  input.onStage?.({ stage: "searching", queries: plan.queries, round: 1 });
  const searchTime = () => AbortSignal.any([input.signal, AbortSignal.timeout(Math.max(1_000, Math.min(depth === "deep" ? 5_000 : 3_500, left() - 2_000)))]);
  let { lists, failures } = await searchAll(provider, plan.queries, plan, plan.freshness, plan.freshness, searchTime());
  // The person pressed Stop: not the search service's fault, so the breaker isn't told.
  if (input.signal.aborted) return stopped();
  // A dated search that found next to nothing is run once more without its date limit, when there's time.
  if (total(lists) < 3 && failures.length === 0 && plan.freshness !== "any" && left() > 4_500) {
    const wider = await searchAll(provider, plan.queries, { freshness: "any", news: false }, "any", plan.freshness, searchTime());
    if (input.signal.aborted) return stopped();
    lists = [...lists, ...wider.lists];
    failures = wider.failures;
  }
  if (total(lists) === 0) {
    if (failures.length > 0) {
      deps.breaker.fail();
      log("warn", "web.search_failed", { kinds: failures.map((f) => f.kind).join(","), queries: plan.queries.length });
      return failed(failures[0]!.message, at, plan.queries, plannerUsage);
    }
    deps.breaker.ok();
    return {
      context: webFailureNote("the search found no pages for this question", at),
      meta: fitSearchMeta({ at: at.toISOString(), status: "done", queries: plan.queries, reason: "nothing found", sources: [], depth }),
      plannerUsage,
      docs: [],
    };
  }
  deps.breaker.ok();

  const roundup = plan.roundup === true && depth !== "deep";
  const first = rankResults({ lists, plan, now: started, max: roundup ? ROUNDUP.sources : SOURCES_KEPT[depth], perSite: 2 });
  if (first.weak && plan.topic) {
    // Nothing that came back carries a single word of the plan: noise, said as such.
    log("info", "web.research", { ms: deps.now() - started, queries: plan.queries.length, results: total(lists), read: 0, planner: planned.via, weak: true });
    return {
      context: webNothingRelevantNote(at),
      meta: fitSearchMeta({ at: at.toISOString(), status: "done", queries: plan.queries, reason: "nothing found", sources: [], depth }),
      plannerUsage,
      docs: [],
    };
  }

  /** Reads the first `pages` of the results and turns all of them into numbered sources. */
  const readAll = async (results: Ranked[], pages: number, from: number, round: number): Promise<WebDoc[]> => {
    const toRead = results.slice(0, pages);
    input.onStage?.({ stage: "reading", pages: toRead.length, round });
    // The reader client allows half a second more than this for the answer to arrive: all within the deadline.
    const readTime = Math.max(1_000, Math.min(depth === "deep" ? 5_000 : 4_000, left() - 800));
    const read = await Promise.all(toRead.map((r) => reader.read(r.url, { timeoutMs: readTime, hintedDate: r.published, signal: input.signal })));
    return results.map((r, i) => {
      const page = i < read.length ? read[i]! : null;
      const wasRead = page?.ok === true && !page.optOut && page.text.length >= 200;
      // The address after redirects, when it's a usable length; otherwise the one the search gave.
      const url = (page?.ok && canonicalUrl(page.url)) || r.url;
      // The page's own picture for previews, else the one the search gave. None at all for a page that asked not to be used,
      // or for no picture preview: the search's thumbnail is a preview of that page too.
      const refused = page?.ok === true && (page.optOut || page.noPicture === true);
      const picture = refused ? null : (signedPicture(page?.ok ? page.image : null, deps.pictureKey ?? null, url) ?? signedPicture(r.image, deps.pictureKey ?? null, url));
      return {
        n: from + i,
        url,
        title: oneLine((page?.ok && page.title) || r.title || siteOf(r.url)),
        // A site is named by its address, which it can't choose: what a page calls itself (stage 278) named one source "go",
        // and would let any page call itself a newsroom.
        site: siteOf(url),
        ...(picture ?? {}),
        published: (page?.ok && page.published) || r.published,
        updated: page?.ok ? page.updated : null,
        read: wasRead,
        // A page that opted out of being used gives its title only.
        text: wasRead && page?.ok ? page.text : page?.ok && page.optOut ? "" : r.snippet,
      };
    });
  };

  let docs = await readAll(first.results, roundup ? ROUNDUP.pages : PAGES_TO_READ[depth], 1, 1);
  if (input.signal.aborted) return stopped();
  const queries = [...plan.queries];
  let rounds = 1;

  // Round two, for a deep task: what the pages found don't cover yet.
  if (depth === "deep" && left() > SECOND_ROUND.leastMs && input.plannerModel?.complete && input.plannerModelId) {
    input.onStage?.({ stage: "checking" });
    const gap = await planGap({ task: input.question, queries, titles: docs.map((d) => `${d.title} (${d.site})`), model: input.plannerModel, modelId: input.plannerModelId, signal: input.signal, timeoutMs: 4_000 });
    plannerUsage = addUsage(plannerUsage, gap.usage);
    if (input.signal.aborted) return stopped();
    if (gap.queries.length > 0 && left() > 7_000) {
      input.onStage?.({ stage: "searching", queries: gap.queries, round: 2 });
      const more = await searchAll(provider, gap.queries, { freshness: plan.freshness, news: false }, plan.freshness, plan.freshness, searchTime());
      if (input.signal.aborted) return stopped();
      // Both the address a page ended at and the one the search gave, so a page that redirected isn't read again under a second number.
      const have = new Set([...docs.map((d) => canonicalUrl(d.url) ?? d.url), ...first.results.map((r) => r.url)]);
      const second = rankResults({ lists: more.lists, plan: { ...plan, queries: gap.queries }, now: started, max: SECOND_ROUND.sources + have.size, perSite: 2 });
      const fresh = second.results.filter((r) => !have.has(r.url)).slice(0, SECOND_ROUND.sources);
      if (fresh.length > 0 && left() > 2_500) {
        docs = [...docs, ...(await readAll(fresh, SECOND_ROUND.pages, docs.length + 1, 2))];
        if (input.signal.aborted) return stopped();
        queries.push(...gap.queries);
        rounds = 2;
      }
    }
  }

  // When the web was really checked: a search kept from a few minutes ago says its own time.
  const earliest = Math.min(started, ...lists.flat().map((r) => r.fetchedAt ?? started));
  const checkedAt = new Date(earliest);
  const tag = deps.tag?.() ?? randomBytes(6).toString("hex");
  const budgetChars = depth === "deep" ? (input.deepBudgetChars ?? input.budgetChars) : input.budgetChars;
  const context = buildWebBlock({ docs, queries, topic: plan.topic, retrievedAt: checkedAt, budgetChars, tag, rounds, roundup });
  log("info", "web.research", { ms: deps.now() - started, depth, rounds, queries: queries.length, results: total(lists), dropped: first.dropped, read: docs.filter((d) => d.read).length, planner: planned.via });
  return {
    context,
    meta: fitSearchMeta({
      at: checkedAt.toISOString(),
      status: "done",
      queries,
      sources: docs.map(sourceOf),
      depth,
      ...(roundup ? { roundup: true } : {}),
      ...(rounds > 1 ? { rounds } : {}),
    }),
    plannerUsage,
    docs,
  };
}
