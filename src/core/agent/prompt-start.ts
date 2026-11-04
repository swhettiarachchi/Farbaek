/**
 * Starting from one sentence (ADR 0027): what the prompt becomes before any
 * AI runs. The project's name, its starter and the task's title come from
 * the words themselves, so they're instant, free and predictable. The AI
 * only drafts the plan (the intent contract), which the person approves.
 */
import { costUnits, type TokenUsage } from "@/core/billing/rate-card";

export const PROMPT_MIN = 8;
export const PROMPT_MAX = 2_000;

/** The prompt as stored: trimmed, single-spaced line ends, and within limits. Null when it's too short to act on. */
export function cleanPrompt(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const text = raw.replace(/\r\n?/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  if (text.length < PROMPT_MIN) return null;
  return text.slice(0, PROMPT_MAX);
}

const LEAD = /^(please\s+)?((can|could|would)\s+you\s+)?(i\s+(want|need|would\s+like)(\s+to)?\s+)?(help\s+me\s+)?(build|make|create|design|develop|code|generate|write|set\s+up)?\s*(me\s+)?(a|an|the|my|our)?\s+/i;

/** A short project name from the prompt: its first words, without "Build me a". */
export function projectNameFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0]!.replace(/[^\p{L}\p{N}\s'&.-]/gu, " ").replace(/\s+/g, " ").trim();
  const stripped = firstLine.replace(LEAD, "").trim() || firstLine;
  const kept = stripped.split(" ").slice(0, 6);
  // A name shouldn't end on "for", "in", "and" and the like.
  while (kept.length > 1 && /^(a|an|the|my|our|for|in|on|at|of|to|with|and|or|that|which)$/i.test(kept.at(-1)!)) kept.pop();
  const words = kept.join(" ");
  const name = words.length > 60 ? `${words.slice(0, 59).trimEnd()}…` : words;
  return name ? name[0]!.toUpperCase() + name.slice(1) : "New project";
}

/** The task's title: the prompt's first line, within the task title limit. */
export function taskTitleFromPrompt(prompt: string): string {
  const firstLine = prompt.split("\n")[0]!.trim();
  return firstLine.length > 200 ? `${firstLine.slice(0, 199).trimEnd()}…` : firstLine;
}

// Words that mean the person wants an application with logic or data, not a site.
const APP_WORDS =
  /\b(app|application|dashboard|log ?in|sign ?in|sign ?up|accounts?|users?|database|admin|crm|saas|api|backend|next\.?js|react|booking system|todo|to-do|tracker|inventory|chat|portal|auth\w*)\b/i;

// Words that mean an API on its own, with no screens (ADR 0140): checked before the app words.
const API_WORDS = /\b(rest ?api|json api|api (service|server|only)|backend api|endpoints?|web ?service|microservice)\b/i;

export type PromptStarter = "static-website" | "nextjs-app" | "rest-api";

/**
 * The premium design direction a new website starts from (ADR 0158), by the kind of business, or null when none
 * fits. The agent keeps the structure it starts from, so a finished high-end page for the business is the
 * strongest start. Only templates rebuilt on the Studio kit are listed; the first match wins.
 */
const DIRECTIONS: readonly (readonly [RegExp, string])[] = [
  // Asking for an online shop outright wins over the kind of business: a roastery's web shop is a shop.
  [/\b(e-?commerce|online (?:shop|store))\b/i, "online-store"],
  // ADR 0163: asking for a blog outright wins too: a food blog is a blog, not a café.
  [/\b(blogs?|journals?|newsletters?|magazines?|diar(?:y|ies)|essays?|stories by|writer'?s? site)\b/i, "blog"],
  [/\b(caf[eé]s?|coffee|bakery|bakeries|bakehouse|baker|patisserie|pastr(?:y|ies)|cakes?|restaurants?|bistro|diner|eatery|pizzeria|bar|pub|brewery|tea ?room|deli|juice bar|ice cream|desserts?|catering|food)\b/i, "local-business"],
  [/\b(hotels?|resorts?|spas?|villas?|guest ?house|retreats?|lodge|real estate|propert(?:y|ies)|apartments?|penthouses?|jewell?e?ry|watch(?:es|maker)?|perfumes?|fragrances?|yachts?|luxury)\b/i, "luxury"],
  // ADR 0163: anyone who sells time by appointment, before the portfolio words, so a booking for a studio is a booking.
  [/\b(appointments?|bookings?|book online|salons?|barbers?|barbershops?|hairdressers?|hair (?:studio|stylist)s?|nail (?:bar|salon|studio)s?|beauty (?:salon|parlou?r|studio)s?|clinics?|dentists?|dental|physio\w*|therap(?:y|ist|ists)|chiropract\w*|yoga|pilates|gyms?|fitness (?:studio|centre|center|classes)|personal trainers?|tutors?|tutoring|driving school)\b/i, "booking"],
  // ADR 0160: the work of one person or studio, an event, a shop, then a launch. A wedding photographer is a portfolio.
  [/\b(portfolios?|photographers?|photography|illustrat(?:or|ors|ion)|designers?|artists?|painters?|architects?|architecture (?:practice|studio|firm))\b/i, "portfolio"],
  [/\b(events?|conferences?|summits?|meetups?|festivals?|concerts?|gigs?|expos?|hackathons?|weddings?|galas?|part(?:y|ies)|webinars?|reunions?)\b/i, "event-page"],
  // ADR 0165: a site for a software product, before the shop and launch words, so software that sells or launches stays software.
  [/\b(software|startups?|b2b|tech company|developer tools?|dev ?tools?|productivity tools?|invoicing|accounting tool|project management tool|(?:tool|platform) for (?:teams|freelancers|businesses|small businesses|studios|agencies))\b/i, "saas-site"],
  [/\b((?<!barber )shops?|(?<!(?:app|play) )stores?|sell(?:s|ing)?|products|merch(?:andise)?|boutiques?|clothing|apparel|candles?|handmade)\b/i, "online-store"],
  [/\b(landing page|launch(?:es|ing)?|pre-?orders?|wait ?list|coming soon|kickstarter|crowdfund\w*|gadgets?|devices?|headphones|earbuds|(?:bluetooth|wireless|smart) speakers?|wearables?|single product|product page)\b/i, "landing-page"],
];

export function templateForPrompt(prompt: string): string | null {
  return DIRECTIONS.find(([words]) => words.test(prompt))?.[1] ?? null;
}

/** The starter that fits: a REST API for an API on its own, a Next.js app for app-like behaviour, otherwise a static website that previews instantly. */
export function starterForPrompt(prompt: string): PromptStarter {
  if (API_WORDS.test(prompt)) return "rest-api";
  return APP_WORDS.test(prompt) ? "nextjs-app" : "static-website";
}

// One agent step, at the light and heavy ends of what Farbaek's runs use (prompt caching on).
// Calibrated on a live run (2026-10-18): 3 Sonnet steps on a small site cost 147 units, about 49 a step.
// The heavy end allows for a larger project, where each step resends more cached context and writes more.
const LIGHT_STEP: TokenUsage = { inputTokens: 400, cacheReadTokens: 5_000, outputTokens: 300 };
const HEAVY_STEP: TokenUsage = { inputTokens: 1_500, cacheReadTokens: 25_000, outputTokens: 1_200 };
const STEPS = { fast: [3, 10], balanced: [4, 18], deep: [6, 28] } as const;

/** About how many more steps a first build or a design upgrade takes at the least than a change to one part (ADR 0158). */
const WHOLE_SITE_SCALE = 2.5;

/** The opening words of the Upgrade its design brief, which its task title keeps (src/core/media/studio-kit.ts). */
export const UPGRADE_TITLE_START = "Upgrade this site's design";

/**
 * Whether a run is a site's first build or a design upgrade (ADR 0158): the project's only task, or the
 * Upgrade its design brief. Free writes these with the standard model, and their estimate is a whole site's.
 */
export function isDesignPass(taskTitle: string, tasksInProject: number): boolean {
  return tasksInProject <= 1 || taskTitle.startsWith(UPGRADE_TITLE_START);
}

/** Units as a share of the period's allowance, as people see it: "under 0.1%", "0.4%", "3%". Null without an allowance. */
export function shareOfPeriod(units: number, periodUnits: number | null): string | null {
  if (!periodUnits || periodUnits <= 0) return null;
  const pct = (Math.max(0, units) / periodUnits) * 100;
  if (pct === 0) return "0%";
  if (pct < 0.1) return "under 0.1%";
  if (pct < 1) return `${pct.toFixed(1)}%`;
  return `${Math.round(pct)}%`;
}

/**
 * A run's likely share of this period's AI usage, as a range of whole
 * percents (at least 1). Guidance only: the wallet still meters each step
 * at its real cost and refunds failed ones. Null without an allowance.
 */
export function estimateRunShare(input: { model: string; effort: keyof typeof STEPS; periodUnits: number | null; wholeSite?: boolean }): { low: number; high: number } | null {
  if (!input.periodUnits || input.periodUnits <= 0) return null;
  const [fewest, most] = STEPS[input.effort];
  // A whole site written or redesigned never takes as few steps as a small change, so its low end rises. The high
  // end is already a long run of heavy steps, and a run can't use more than the whole period, so it stops at 100%.
  const low = fewest * (input.wholeSite ? WHOLE_SITE_SCALE : 1) * costUnits(input.model, LIGHT_STEP);
  const high = most * costUnits(input.model, HEAVY_STEP);
  const pct = (units: number) => Math.min(100, Math.max(1, Math.round((units / input.periodUnits!) * 100)));
  return { low: pct(low), high: Math.max(pct(low), pct(high)) };
}
