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

export type PromptStarter = "static-website" | "nextjs-app";

/** The starter that fits: a Next.js app when the prompt asks for app-like behaviour, otherwise a static website that previews instantly. */
export function starterForPrompt(prompt: string): PromptStarter {
  return APP_WORDS.test(prompt) ? "nextjs-app" : "static-website";
}

// One agent step, at the light and heavy ends of what Farbaek's runs use (prompt caching on).
// Calibrated on a live run (2026-10-18): 3 Sonnet steps on a small site cost 147 units, about 49 a step.
// The heavy end allows for a larger project, where each step resends more cached context and writes more.
const LIGHT_STEP: TokenUsage = { inputTokens: 400, cacheReadTokens: 5_000, outputTokens: 300 };
const HEAVY_STEP: TokenUsage = { inputTokens: 1_500, cacheReadTokens: 25_000, outputTokens: 1_200 };
const STEPS = { fast: [3, 10], balanced: [4, 18], deep: [6, 28] } as const;

/**
 * A run's likely share of this period's AI usage, as a range of whole
 * percents (at least 1). Guidance only: the wallet still meters each step
 * at its real cost and refunds failed ones. Null without an allowance.
 */
export function estimateRunShare(input: { model: string; effort: keyof typeof STEPS; periodUnits: number | null }): { low: number; high: number } | null {
  if (!input.periodUnits || input.periodUnits <= 0) return null;
  const [fewest, most] = STEPS[input.effort];
  const low = fewest * costUnits(input.model, LIGHT_STEP);
  const high = most * costUnits(input.model, HEAVY_STEP);
  const pct = (units: number) => Math.max(1, Math.round((units / input.periodUnits!) * 100));
  return { low: pct(low), high: Math.max(pct(low), pct(high)) };
}
