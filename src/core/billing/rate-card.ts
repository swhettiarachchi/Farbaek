/**
 * What each model costs Farbaek, per million tokens, at provider list prices
 * (sources and dates: reports/AI coding platform costs and pricing.md,
 * retrieved 2026-10-18). Usage is metered from the real token counts each
 * call reports, in internal units where 1 unit = $0.0001 of list cost.
 *
 * Gemini is listed at its announced 2027 prices (Gemini 4 Argon doubles on
 * 2026-12-01, 3.8 Flash on 2027-01-01), so allowances never turn
 * unprofitable when those increases land. People never see units: they see
 * the share of their allowance used (ADR 0019).
 */

export const USD_PER_UNIT = 0.0001;

export type ModelId =
  | "claude-haiku-5-5"
  | "claude-sonnet-5-5"
  | "claude-opus-5-5"
  | "claude-fable-5-1"
  | "gemini-3.5-flash-lite"
  | "gemini-3.8-flash"
  | "gemini-4-argon"
  | "gemini-3.1-flash-lite-image"
  | "gpt-6.1-terra";

export interface ModelRate {
  label: string;
  provider: "anthropic" | "gemini" | "openai";
  /** USD per million tokens. */
  input: number;
  output: number;
  /** Writing the prompt cache (5-minute entries). Gemini bills cache storage separately; unused here. */
  cacheWrite: number;
  cacheRead: number;
  /** Haiku 5.5 costs 5x for any request whose prompt exceeds 100K tokens; OpenAI's models cost more above 272K. */
  longPrompt?: { aboveTokens: number; multiplier: number };
}

export const RATE_CARD: Record<ModelId, ModelRate> = {
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", provider: "anthropic", input: 0.1, output: 0.5, cacheWrite: 0.125, cacheRead: 0.01, longPrompt: { aboveTokens: 100_000, multiplier: 5 } },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", provider: "anthropic", input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.1 },
  "claude-opus-5-5": { label: "Claude Opus 5.5", provider: "anthropic", input: 4, output: 20, cacheWrite: 5, cacheRead: 0.2 },
  "claude-fable-5-1": { label: "Claude Fable 5.1", provider: "anthropic", input: 10, output: 50, cacheWrite: 12.5, cacheRead: 0.25 },
  "gemini-3.5-flash-lite": { label: "Gemini 3.5 Flash-Lite", provider: "gemini", input: 0.3, output: 2.5, cacheWrite: 0.3, cacheRead: 0.03 },
  "gemini-3.8-flash": { label: "Gemini 3.8 Flash", provider: "gemini", input: 1.5, output: 7.5, cacheWrite: 1.5, cacheRead: 0.15 },
  "gemini-4-argon": { label: "Gemini 4 Argon", provider: "gemini", input: 4, output: 20, cacheWrite: 4, cacheRead: 0.2 },
  // Image generation (ADR 0109): output is image tokens, $30 per million, so a 1K image (1,120 tokens) is $0.0336. Google's pricing page, 2026-10-28.
  "gemini-3.1-flash-lite-image": { label: "Gemini 3.1 Flash Lite Image", provider: "gemini", input: 0.25, output: 30, cacheWrite: 0.25, cacheRead: 0.025 },
  // The second checker (ADR 0121). OpenAI's pricing page, 2026-10-30: $1 input, $0.05 cached input, $5 output; caching is automatic with no
  // write charge. Above 272K prompt tokens input doubles and output is 1.5x; metering the whole call at 2x there never under-meters.
  "gpt-6.1-terra": { label: "GPT-6.1 Terra", provider: "openai", input: 1, output: 5, cacheWrite: 1, cacheRead: 0.05, longPrompt: { aboveTokens: 272_000, multiplier: 2 } },
};

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
}

/** A model id as a provider reports it ("claude-sonnet-5-5-20260901"), matched to its rate. Unknown models price as the most expensive one, so nothing is under-metered. */
export function rateFor(model: string): { id: ModelId; rate: ModelRate } {
  const id = (Object.keys(RATE_CARD) as ModelId[]).find((m) => model === m || model.startsWith(`${m}-`) || model.startsWith(`${m}@`));
  if (id) return { id, rate: RATE_CARD[id] };
  return { id: "claude-fable-5-1", rate: RATE_CARD["claude-fable-5-1"] };
}

/**
 * Exact list cost in USD. `oneRequest` applies per-request rules (Haiku's
 * long-prompt price); totals summed over many requests must pass false.
 */
export function costUsd(model: string, usage: TokenUsage, oneRequest = true): number {
  const { rate } = rateFor(model);
  const prompt = usage.inputTokens + (usage.cacheWriteTokens ?? 0) + (usage.cacheReadTokens ?? 0);
  const m = oneRequest && rate.longPrompt && prompt > rate.longPrompt.aboveTokens ? rate.longPrompt.multiplier : 1;
  const usd =
    (usage.inputTokens * rate.input + usage.outputTokens * rate.output + (usage.cacheWriteTokens ?? 0) * rate.cacheWrite + (usage.cacheReadTokens ?? 0) * rate.cacheRead) / 1_000_000;
  return usd * m;
}

/** Units for one call, rounded up so a call is never metered below its cost. */
export function costUnits(model: string, usage: TokenUsage, oneRequest = true): number {
  return Math.ceil(costUsd(model, usage, oneRequest) / USD_PER_UNIT - 1e-9);
}

/** A conservative token count for a prompt: about 3 characters per token (code and JSON run denser than prose). */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

/** What to reserve before a call: its whole prompt, plus the most it can write. */
export function reserveUnits(model: string, promptTokens: number, maxOutputTokens: number): number {
  return Math.max(1, costUnits(model, { inputTokens: promptTokens, outputTokens: maxOutputTokens }));
}

/**
 * Anthropic's published sample Claude Code session (code.claude.com costs
 * docs): 1.2K input, 50K cache write, 940K cache read and 5.3K output
 * tokens. Used only as guidance ("about N agent sessions a month").
 */
export const SAMPLE_SESSION: TokenUsage = { inputTokens: 1_200, cacheWriteTokens: 50_000, cacheReadTokens: 940_000, outputTokens: 5_300 };

/** Newer Claude tokenizers produce about 30% more tokens for the same text; guidance includes it so it doesn't over-promise. */
export const GUIDANCE_TOKEN_UPLIFT = 1.3;

export function sampleSessionUnits(model: ModelId): number {
  const u = SAMPLE_SESSION;
  const lift = RATE_CARD[model].provider === "anthropic" ? GUIDANCE_TOKEN_UPLIFT : 1;
  // A session is many requests, each well under Haiku's long-prompt threshold.
  return costUnits(
    model,
    {
      inputTokens: Math.round(u.inputTokens * lift),
      outputTokens: Math.round(u.outputTokens * lift),
      cacheWriteTokens: Math.round((u.cacheWriteTokens ?? 0) * lift),
      cacheReadTokens: Math.round((u.cacheReadTokens ?? 0) * lift),
    },
    false,
  );
}

/** A model as people see it: its product name ("Claude Haiku 5.5"), never its id in monospace (ADR 0180). */
export function modelName(model: string): string {
  return (RATE_CARD as Record<string, ModelRate>)[model]?.label ?? model;
}
