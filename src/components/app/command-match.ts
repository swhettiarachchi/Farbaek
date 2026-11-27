import { QUICK_IDS, quickAction } from "@/core/assistant/quick";

/**
 * How well a command matches what was typed in the command palette: every
 * word typed must appear in the label or its keywords. A label that starts
 * with the query ranks first, then a page that was named by the start of
 * one of its other names or by words that each start one of its words, then
 * anything containing it. Zero means no match.
 */
export function matchScore(query: string, label: string, keywords: readonly string[] = []): number {
  const q = query.trim().toLowerCase();
  if (!q) return 1;
  const l = label.toLowerCase();
  const keys = keywords.map((k) => k.toLowerCase());
  const haystack = [l, ...keys].join(" ");
  const words = q.split(/\s+/);
  if (!words.every((w) => haystack.includes(w))) return 0;
  if (l.startsWith(q)) return 4;
  // Another name of the page, typed from its start, is its name too: "sandbox" for Test space, "audit" for History.
  if (keys.some((k) => k.startsWith(q))) return 3;
  const split = (text: string) => text.split(/[\s/:,.-]+/).filter(Boolean);
  const parts = split(haystack);
  // Named, not merely contained: every word typed starts a word of the label or its other names, and the first one a
  // word of the label itself. "what can I do" is a question, though "Who can do what" holds most of its letters.
  if (words.every((w) => parts.some((p) => p.startsWith(w))) && split(l).some((p) => p.startsWith(words[0]!))) return 3;
  if (l.includes(q)) return 2;
  return 1;
}

/** A prompt needs a few words before it's worth planning, as in the prompt box; a question can be two letters. */
export const BUILD_MIN = 8;
export const ASK_MIN = 2;

const THING = "(?:web\\s?sites?|sites?|web\\s?apps?|apps?|landing\\s+pages?|web\\s?pages?|online\\s+(?:store|shop)|stores?|shops?|dashboards?|portfolios?|blogs?|calculators?|booking\\s+(?:form|page|system))";
const BUILD_VERB = /^(?:please\s+)?(?:(?:can|could|would)\s+you\s+)?(?:please\s+)?(?:build|make|create|design|develop|code|generate|set\s+up)\b/i;
const BUILD_THING = new RegExp(`\\b${THING}\\b`, "i");
/** The thing leads the phrase: an article or "my", up to two describing words, the thing, then what it is for, or the end. */
const LEADS_WITH_THING = new RegExp(`^(?:(?:an?|the|my|our)\\s+)?(?:[\\p{L}\\p{N}'-]+\\s+){0,2}${THING}(?:\\s+(?:for|that|which|where|with|to|so)\\b|[.!]*$)`, "iu");
const QUESTION = /^(?:what|why|how|who|whom|whose|when|where|which|is|are|was|were|am|can|could|does|do|did|should|would|will|has|have|tell\s+me|explain|compare|summari[sz]e|translate)\b/i;
/** Words that open a request about something that exists, or for something other than a build: reading, finding, fixing, choosing. */
const NOT_A_BUILD = /^(?:write|find|open|fix|show|list|search|get|go|check|read|buy|sell|use|install|download|visit|review|best|top|good|cheap|free|latest|update|delete|remove|rename|share|publish|help)\b/i;

/**
 * Whether what was typed in the palette reads as something to build, rather than something to ask (stage 289, ADR 0297).
 * It only decides which of the two leads the list: both are always offered. It matters because choosing "Plan a build"
 * drafts a plan from the words at once, so a build must not lead for words that merely mention a site or a shop.
 *
 * The words must name a thing Build makes (a site, an app, a page, a shop), and then either:
 * - open with a making word ("build", "can you make"), or
 * - lead with the thing itself ("a booking site for my salon", "portfolio for my photography").
 *
 * A question is a question even when it names a site ("how do I speed up my site?"). So is a request about something
 * that exists or for something else ("my site is down", "write a blog post", "find a coffee shop near me", "best apps
 * for learning Sinhala"), and making words alone are not enough ("make this shorter", "create a poem").
 */
export function readsAsBuild(typed: string): boolean {
  const text = typed.trim();
  if (!text || !BUILD_THING.test(text)) return false;
  if (BUILD_VERB.test(text)) return true;
  if (/\?\s*$/.test(text) || QUESTION.test(text) || NOT_A_BUILD.test(text)) return false;
  return LEADS_WITH_THING.test(text);
}

/**
 * Where the three things that can be done with the typed words themselves sit among the results: asking Farbaek AI,
 * researching it, and planning it as a build. Zero means it isn't offered.
 *
 * `bestPage` is the best score of any page, project or workspace for what was typed (matchScore). A page that was named
 * (3 or 4) is what the person is going to, so it leads and these follow it. Otherwise these lead, a question before a
 * build unless the words read as a build.
 */
export function typedScores(typed: string, canBuild: boolean, bestPage: number): { ask: number; research: number; build: number } {
  const text = typed.trim();
  if (text.length < ASK_MIN) return { ask: 0, research: 0, build: 0 };
  const builds = canBuild && text.length >= BUILD_MIN;
  const buildFirst = builds && readsAsBuild(text);
  // Below a page that was named, above a page that merely contains the words.
  const base = bestPage >= 3 ? 2 : 6;
  return {
    ask: base + (buildFirst ? 0.6 : 0.8),
    research: base + 0.5,
    build: builds ? base + (buildFirst ? 0.9 : 0.4) : 0,
  };
}

/** A page, project or workspace the palette can open. */
export interface Rankable {
  id: string;
  label: string;
  keywords?: readonly string[];
}

/** The three commands made from the typed words themselves. */
export const TYPED_IDS = ["ask", "research", "build"] as const;

/** Where a request the assistant answers or does in place sits: above a page that was named (4) and the typed words' own commands (under 7). */
export const QUICK_SCORE = 9;

/**
 * What the palette lists for what was typed, best first, by id: the pages and projects that match, the typed words' own
 * three commands ("ask", "research", "build") where `typedScores` puts them, and what the assistant answers or does in
 * place ("needs", "progress", "pause", "resume"; stage 290) when the words are that request, whole. With nothing typed,
 * "needs" is offered first: one press answers it. Things that score the same keep the order they were given in.
 */
export function rankCommands(typed: string, items: readonly Rankable[], canBuild: boolean, max = 12): string[] {
  const text = typed.trim();
  const scored = items.map((item, i) => ({ id: item.id, i, score: matchScore(text, item.label, item.keywords) }));
  const own = typedScores(text, canBuild, text ? Math.max(0, ...scored.map((x) => x.score)) : 0);
  const mine = TYPED_IDS.map((id, i) => ({ id: id as string, i: i - TYPED_IDS.length, score: own[id] }));
  const asked = quickAction(text);
  const quick = QUICK_IDS.map((id, i) => ({ id: id as string, i: i - TYPED_IDS.length - QUICK_IDS.length, score: asked === id ? QUICK_SCORE : !text && id === "needs" ? 1 : 0 }));
  return [...quick, ...mine, ...scored]
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, max)
    .map((x) => x.id);
}
