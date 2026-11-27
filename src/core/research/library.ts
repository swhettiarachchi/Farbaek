/**
 * Research a person has done with Farbaek AI, as a list they can find again (stage 288, ADR 0296).
 *
 * Every answer that read the live web already keeps what it read (ADR 0222): when, the searches, the sources, how far it
 * went and how its citations checked against the pages. This turns those answers into rows for the Research page. Nothing
 * new is stored, and nothing is said here that the answer's own record doesn't say, in the words Chat itself uses for it.
 */
import { searchMetaSchema, siteOf, type SearchMeta } from "@/core/web/sources";
import type { Depth } from "@/core/web/plan";

/** An answer as the reader gives it: its record is unread until it is checked here. */
export interface ResearchAnswer {
  id: string;
  conversationId: string;
  parentId: string | null;
  createdAt: string;
  meta: unknown;
  conversation: { title: string; projectId: string | null; archived: boolean } | null;
}

export interface ResearchItem {
  /** The answer's id. */
  id: string;
  conversationId: string;
  /** The question, as one short line. */
  title: string;
  at: string;
  /** How many pages the answer kept. */
  pages: number;
  /** How many of them the answer cites. Null until the answer was written and its citations counted (and for older answers). */
  cited: number | null;
  /** The first few sites, by name, each once, and how many different sites there were in all: the cited ones when there are any. */
  sites: string[];
  siteCount: number;
  depth: Depth;
  rounds: number;
  /** A roundup of news or updates, written as stories. */
  roundup: boolean;
  /** Of the cited pages, on how many the names and numbers cited were found, and on how many they weren't. Null when not counted. */
  checks: { cited: number; matched: number; unmatched: number } | null;
  projectId: string | null;
}

export const RESEARCH_LIMITS = { title: 140, sites: 3, list: 60 } as const;

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** A question as a title: its first line with words in it, cut at a word where it can be. */
export function researchTitle(question: string | null | undefined, fallback: string): string {
  const line = oneLine((question ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "") || oneLine(fallback) || "Research";
  const chars = [...line];
  if (chars.length <= RESEARCH_LIMITS.title) return line;
  const cut = chars.slice(0, RESEARCH_LIMITS.title).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > RESEARCH_LIMITS.title * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.]+$/, "")}...`;
}

/** The answer's record of its search, when it is one that found something; null for everything that isn't research. */
function searchOf(answer: ResearchAnswer): SearchMeta | null {
  if (!answer.conversation || answer.conversation.archived) return null;
  const record = typeof answer.meta === "object" && answer.meta !== null ? (answer.meta as { search?: unknown }).search : undefined;
  const parsed = searchMetaSchema.safeParse(record);
  return parsed.success && parsed.data.status === "done" && parsed.data.sources.length > 0 ? (parsed.data as SearchMeta) : null;
}

function toItem(answer: ResearchAnswer, search: SearchMeta, question: string | null | undefined): ResearchItem {
  // Once the answer is written, each source says whether the answer cites it; until then, and for older answers, none does.
  const judged = search.sources.some((s) => s.cited !== undefined);
  const cited = search.sources.filter((s) => s.cited === true);
  const named = cited.length > 0 ? cited : search.sources;
  const sites: string[] = [];
  for (const source of named) {
    // By its address, as Chat names it, never by what the page calls itself.
    const name = siteOf(source.url) || oneLine(source.site).toLowerCase();
    if (name && !sites.includes(name)) sites.push(name);
  }
  return {
    id: answer.id,
    conversationId: answer.conversationId,
    title: researchTitle(question, answer.conversation?.title ?? ""),
    at: answer.createdAt,
    pages: search.sources.length,
    cited: judged ? cited.length : null,
    sites: sites.slice(0, RESEARCH_LIMITS.sites),
    siteCount: sites.length,
    depth: search.depth ?? "quick",
    rounds: search.rounds ?? 1,
    roundup: search.roundup === true,
    checks: search.checks ? { cited: search.checks.cited, matched: search.checks.matched, unmatched: search.checks.unmatched } : null,
    projectId: answer.conversation?.projectId ?? null,
  };
}

const newestFirst = (answers: readonly ResearchAnswer[]) => [...answers].sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));

/**
 * The research a person asked for, newest first: answers that searched the web and kept at least one page, in
 * conversations that aren't archived. A question answered more than once (tried again) is listed once, by its newest
 * answer. `questions` gives each question's words by its id; without them a row takes its chat's name.
 */
export function researchItems(answers: readonly ResearchAnswer[], questions: ReadonlyMap<string, string>): ResearchItem[] {
  const seen = new Set<string>();
  const items: ResearchItem[] = [];
  for (const answer of newestFirst(answers)) {
    if (items.length >= RESEARCH_LIMITS.list) break;
    const search = searchOf(answer);
    if (!search) continue;
    const key = answer.parentId ?? answer.id;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push(toItem(answer, search, answer.parentId ? questions.get(answer.parentId) : null));
  }
  return items;
}

/**
 * Research that Farbaek repeats by itself (a scheduled task's or an agent's conversation): one row for each conversation,
 * its newest. Every run asks the same thing again, so listing each run would bury what the person asked for themselves.
 */
export function latestByConversation(answers: readonly ResearchAnswer[], questions: ReadonlyMap<string, string>): ResearchItem[] {
  const seen = new Set<string>();
  const items: ResearchItem[] = [];
  for (const answer of newestFirst(answers)) {
    if (items.length >= RESEARCH_LIMITS.list) break;
    if (seen.has(answer.conversationId)) continue;
    const search = searchOf(answer);
    if (!search) continue;
    seen.add(answer.conversationId);
    items.push(toItem(answer, search, answer.parentId ? questions.get(answer.parentId) : null));
  }
  return items;
}

const DEPTH_WORDS: Record<Depth, string> = { quick: "A quick check", standard: "A search", deep: "A deep study" };

/** What a piece of research was, in one plain sentence, from its own record: what was cited, of what was checked. */
export function researchLine(item: Pick<ResearchItem, "depth" | "rounds" | "pages" | "cited" | "roundup">): string {
  const kind = `${item.roundup ? "A roundup" : DEPTH_WORDS[item.depth]}${item.rounds > 1 ? ` in ${item.rounds} rounds` : ""}`;
  const pages = `${item.pages} ${item.pages === 1 ? "page" : "pages"} checked`;
  if (item.cited === null) return `${kind}: ${pages}.`;
  if (item.cited === 0) return `${kind}: ${pages}, none cited in the answer.`;
  const cited = `${item.cited} ${item.cited === 1 ? "source" : "sources"} cited`;
  return item.pages > item.cited ? `${kind}: ${cited}, of ${pages}.` : `${kind}: ${cited}.`;
}

/**
 * How the answer's citations checked, or null when there is nothing to say. The check looks for the names and numbers of
 * the sentences that cite a page on that page (citations.ts), so that is all this says: never that an answer is verified.
 */
export function checksLine(checks: ResearchItem["checks"]): string | null {
  if (!checks || checks.cited === 0) return null;
  const found =
    checks.matched === checks.cited
      ? checks.cited === 1
        ? "The names and numbers cited were found on its cited page."
        : `The names and numbers cited were found on all ${checks.cited} cited pages.`
      : `The names and numbers cited were found on ${checks.matched} of ${checks.cited} cited pages.`;
  return checks.unmatched > 0 ? `${found} On ${checks.unmatched}, they weren't found.` : found;
}

/** Where it read, by site: "From a.org, b.com and c.net." When there were more sites than are named: "From a.org, b.com, c.net and others." */
export function sitesLine(item: Pick<ResearchItem, "sites" | "siteCount">): string {
  if (item.sites.length === 0) return "";
  if (item.siteCount > item.sites.length) return `From ${item.sites.join(", ")} and others.`;
  const names = item.sites.length === 1 ? item.sites[0]! : `${item.sites.slice(0, -1).join(", ")} and ${item.sites[item.sites.length - 1]}`;
  return `From ${names}.`;
}
