/**
 * Which search results are worth reading (stage 206, ADR 0223). Framework-free, no model, no network.
 *
 * Several searches come back as several lists. They are merged by Reciprocal Rank Fusion (Cormack, Clarke and Büttcher, 2009:
 * each list gives a result 1 / (60 + its rank), and the sums are compared), so a page that several searches found rises, and no
 * search engine's own score is trusted. The merged score is then weighed by what can be checked from the result itself:
 *
 * - relevance: how many of the plan's words (its queries and its English topic) the title and snippet carry, the title
 *   counting double. A result with none of them, when others have some, is dropped: that is how a page that only matched a
 *   stray word stays out of an answer;
 * - freshness: when the question is about now, a dated recent result counts for more and a dated old one for less; an
 *   undated one is left alone;
 * - the kind of source: the subject's own site (openai.com for a question about OpenAI) counts for more, and so, a little, does
 *   a site of the country the question is about (.lk for a Sri Lankan one); people-finder and contact-list sites, which answer
 *   nothing, count for less. No list of "trusted" names for a question with an answer: a well-known site isn't right about
 *   everything. A roundup of news is the one exception (stage 278, newsrooms.ts): it has no subject of its own to rank by, so
 *   a newsroom that reported a story counts a little more than a site that rewrote it;
 * - the same story on several sites (one title, syndicated) is kept once.
 *
 * At most two results from one site, as before (sources.ts).
 */
import { isNewsroom, NEWSROOM_WEIGHT } from "./newsrooms";
import type { Freshness, SearchPlan } from "./plan";
import { canonicalUrl, selectResults, siteOf, type SearchResult } from "./sources";

const STOP = new Set(
  "the a an of in on at to for is are was were be been and or not no what who how why when where which does do did me my about with from by it its this that these those can could would should will you your i we they he she as if than then so but vs versus".split(
    " ",
  ),
);

/** Scripts written without spaces: matched by pairs of characters. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Thai}\p{Script=Khmer}\p{Script=Myanmar}]+/gu;

/** The words of a text for matching: lower-case words of two letters or more without the commonest English ones; pairs of characters for scripts without spaces. */
export function terms(text: string): string[] {
  const lower = text.normalize("NFC").toLowerCase();
  const out = new Set<string>();
  for (const run of lower.match(UNSPACED) ?? []) {
    if (run.length === 1) out.add(run);
    for (let i = 0; i + 1 < run.length; i++) out.add(run.slice(i, i + 2));
  }
  for (const word of lower.replace(UNSPACED, " ").split(/[^\p{L}\p{M}\p{N}+#\u200d]+/u)) {
    if (word.length >= 2 && !STOP.has(word)) out.add(word);
  }
  return [...out];
}

/** The plan's words: its queries and its topic. */
export function planTerms(plan: Pick<SearchPlan, "queries" | "topic">): string[] {
  return terms(`${plan.queries.join(" ")} ${plan.topic}`);
}

/** How much of the plan a text carries, 0 to 1. Words of four letters or more also match as the start of a longer word ("agent" in "agents"). */
export function coverage(text: string, wanted: readonly string[]): number {
  if (wanted.length === 0) return 0;
  const lower = text.normalize("NFC").toLowerCase();
  const have = new Set(terms(lower));
  let hits = 0;
  for (const w of wanted) {
    if (have.has(w)) hits++;
    else if (w.length >= 4 && lower.includes(w)) hits += 0.8;
  }
  return Math.min(1, hits / wanted.length);
}

const WINDOW_DAYS: Record<Freshness, number | null> = { day: 2, week: 10, month: 45, year: 400, any: null };

/** A weight for how recent a dated result is, against how fresh the question needs it. Undated results are left at 1. */
export function freshnessWeight(published: string | null, freshness: Freshness, now: number): number {
  const window = WINDOW_DAYS[freshness];
  if (window === null || !published) return 1;
  const t = Date.parse(published);
  if (!Number.isFinite(t)) return 1;
  const days = (now - t) / 86_400_000;
  if (days < -2) return 1;
  if (days <= window) return 1.3;
  if (days <= window * 4) return 1;
  return 0.6;
}

/** True when a result's own date is well outside what the question covers: yesterday's roundup has no use for a story from 2022. */
export function stale(published: string | null, freshness: Freshness, now: number): boolean {
  const window = WINDOW_DAYS[freshness];
  if (window === null || !published) return false;
  const t = Date.parse(published);
  return Number.isFinite(t) && (now - t) / 86_400_000 > window * 4;
}

/** Sites that list people and contact details, or only republish others: they answer nothing. Matched on the site's name. */
const LOW_VALUE = /(?:^|\.)(?:zoominfo|rocketreach|signalhire|contactout|lusha|apollo|spokeo|peekyou|whitepages|truepeoplesearch|pipl|radaris|beenverified|pinterest|scribd|slideshare|issuu|coursehero|chegg|brainly)\.[a-z.]+$/i;

/** The name of a site without its endings: "blog.openai.com" gives "openai". */
function siteName(site: string): string {
  const parts = site.split(".");
  const tldParts = parts.length >= 3 && parts[parts.length - 2]!.length <= 3 && parts[parts.length - 1]!.length <= 2 ? 2 : 1;
  return parts[Math.max(0, parts.length - tldParts - 1)] ?? site;
}

/** The country a plan is about, as its internet ending, when its words say so. Sri Lanka only for now: the country Farbaek is tested in. */
export function localEnding(plan: Pick<SearchPlan, "queries" | "topic">): string | null {
  const text = `${plan.queries.join(" ")} ${plan.topic}`;
  return /\p{Script=Sinhala}/u.test(text) || /\b(?:sri lanka|sri lankan|lanka|colombo|kandy|galle|jaffna|lkr)\b/i.test(text) ? "lk" : null;
}

/** A weight for the kind of source: the subject's own site up, a site of the country the question is about up a little, contact lists down. */
export function sourceWeight(url: string, wanted: readonly string[], local: string | null = null): number {
  const site = siteOf(url);
  if (LOW_VALUE.test(site)) return 0.4;
  const name = siteName(site);
  const own = name.length >= 4 && wanted.includes(name) ? 1.3 : 1;
  return local && site.endsWith(`.${local}`) ? own * 1.2 : own;
}

/**
 * A weight for a page that is a newsroom's front page or a section of it, in a roundup (stage 280): "reuters.com/technology/",
 * "techcrunch.com/". Such a page carries the question's own words in its title ("Tech News | Latest Technology News") and so
 * ranks first, and no story can be written from it. A story's address is longer: several parts, a date, or a long name.
 */
export function frontPageWeight(url: string): number {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    return 1;
  }
  const parts = path.split("/").filter(Boolean);
  const last = parts[parts.length - 1] ?? "";
  const hyphens = (last.match(/-/g) ?? []).length;
  // A name of several words ("chrome-zero-day"), or a short one with a number in it under a section ("news/claude-opus-5").
  // "science-and-environment" is a section's name, not a story's.
  const named = hyphens >= 3 || (hyphens === 2 && !/^[a-z]+-and-[a-z]+$/i.test(last));
  const storyLike = parts.length >= 3 || /\d{4}/.test(path) || named || (parts.length >= 2 && hyphens >= 1 && /\d/.test(last)) || /\.(?:html?|php|aspx?)$/i.test(last) || /\d{5,}/.test(last);
  return storyLike ? 1 : parts.length <= 1 ? 0.35 : 0.55;
}

/** A title without its site ("Story - The Site") and punctuation, for telling the same story on two sites. */
function storyKey(title: string): string {
  const main = title.split(/\s[|\-–—:·]\s/)[0] ?? title;
  const key = main.normalize("NFC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return key.length >= 24 ? key : "";
}

export interface Ranked extends SearchResult {
  score: number;
  /** How much of the plan its title and snippet carry, 0 to 1. */
  relevance: number;
}

export interface RankInput {
  /** One list per search, in the order the engine gave. */
  lists: SearchResult[][];
  plan: Pick<SearchPlan, "queries" | "topic" | "freshness" | "news"> & { roundup?: boolean };
  now: number;
  max?: number;
  perSite?: number;
}

export interface RankOutcome {
  results: Ranked[];
  /** Results left out because they carried none of the plan's words. */
  dropped: number;
  /** True when no result carried any of the plan's words: nothing here can be told apart from noise. */
  weak: boolean;
}

/** The results worth reading, best first. */
export function rankResults({ lists, plan, now, max = 8, perSite = 2 }: RankInput): RankOutcome {
  const wanted = planTerms(plan);
  const local = localEnding(plan);
  const merged = new Map<string, Ranked & { fused: number }>();
  for (const list of lists) {
    list.forEach((r, rank) => {
      const url = canonicalUrl(r.url);
      if (!url) return;
      const gain = 1 / (60 + rank + 1);
      const seen = merged.get(url);
      if (seen) {
        seen.fused += gain;
        if (!seen.published && r.published) seen.published = r.published;
        if (r.snippet.length > seen.snippet.length) seen.snippet = r.snippet.slice(0, 600);
        if (r.kind === "news") seen.kind = "news";
        if (!seen.image && r.image) seen.image = r.image;
        // Found by a search and given by a feed: it is the feed's story either way.
        if (r.fromFeed) seen.fromFeed = true;
        return;
      }
      // What a search engine returns is cut before anything reads it: a title is a line, a snippet a sentence or two.
      merged.set(url, { ...r, url, title: r.title.slice(0, 300), snippet: r.snippet.slice(0, 600), fused: gain, score: 0, relevance: 0 });
    });
  }
  const all = [...merged.values()];
  for (const r of all) {
    r.relevance = Math.min(1, coverage(r.title, wanted) * 2 * 0.6 + coverage(`${r.title} ${r.snippet} ${siteOf(r.url)}`, wanted) * 0.7);
    // A story from a newsroom's feed is about the subject by where it came from: a headline rarely repeats the words "tech news".
    if (r.fromFeed) r.relevance = Math.max(r.relevance, 0.6);
    const newsy = plan.news && r.kind === "news" && (plan.freshness === "day" || plan.freshness === "week") ? 1.15 : 1;
    const newsroom = plan.roundup && isNewsroom(siteOf(r.url)) ? NEWSROOM_WEIGHT : 1;
    // In a roundup a front page counts for little, and a story dated outside what the roundup covers counts for less still.
    // A feed's item is a story by where it came from, however short its address.
    const story = plan.roundup ? (r.fromFeed ? 1 : frontPageWeight(r.url)) * (stale(r.published, plan.freshness, now) ? 0.3 : 1) : 1;
    r.score = r.fused * (0.35 + r.relevance) * freshnessWeight(r.published, plan.freshness, now) * sourceWeight(r.url, wanted, local) * newsy * newsroom * story;
  }
  const relevant = all.filter((r) => r.relevance > 0);
  const weak = wanted.length > 0 && relevant.length === 0;
  // Results with none of the plan's words go, once at least three others have some.
  const pool = relevant.length >= 3 ? relevant : all;
  const sorted = [...pool].sort((a, b) => b.score - a.score);
  // The same story on several sites: the best-placed copy stays.
  const stories = new Set<string>();
  const unique = sorted.filter((r) => {
    const key = storyKey(r.title);
    if (!key) return true;
    if (stories.has(key)) return false;
    stories.add(key);
    return true;
  });
  const byUrl = new Map(unique.map((r) => [r.url, r]));
  const results = selectResults(unique, { max, perSite }).map((r) => ({ ...byUrl.get(r.url)!, ...r }));
  return { results, dropped: all.length - pool.length, weak };
}
