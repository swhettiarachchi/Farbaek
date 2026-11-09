/**
 * Which model provider this server uses for AI features (ADR 0014). Keys are
 * checked for presence only; values are never logged or returned.
 *
 * AI_PROVIDER picks one explicitly ("anthropic" or "gemini"). Unset, Claude
 * is used when its key is present, otherwise Gemini when its key is present.
 * There is no silent switch between vendors mid-request: project data only
 * goes to the provider this resolves to.
 */
import { USD_PER_UNIT } from "@/core/billing/rate-card";
import { platformPause } from "@/server/platform/state";

export type AiProviderId = "anthropic" | "gemini";

export const AI_PROVIDER_LABELS: Record<AiProviderId, string> = { anthropic: "Claude", gemini: "Gemini" };

/** Stable Gemini model for drafting and proposals (Gemini API models page, checked 2026-10-17). */
export const DEFAULT_GEMINI_MODEL = "gemini-3.8-flash";

function env(name: string): string | null {
  const v = process.env[name]?.trim();
  return v ? v : null;
}

export function hasAnthropicKey(): boolean {
  return env("ANTHROPIC_API_KEY") !== null;
}

export function hasGeminiKey(): boolean {
  return env("GEMINI_API_KEY") !== null;
}

/** GEMINI_MODEL when it looks like a model id, otherwise the default. */
export function geminiModel(): string {
  const m = env("GEMINI_MODEL");
  return m && /^[a-z0-9][a-z0-9.-]{2,60}$/.test(m) ? m : DEFAULT_GEMINI_MODEL;
}

/** The whole platform's AI spend for one UTC day when AI_DAILY_LIMIT_USD isn't set (ADR 0065). */
export const DEFAULT_AI_DAILY_LIMIT_USD = 20;

/**
 * Today's platform-wide AI limit in units, passed to every reservation (ADR
 * 0065), or null when AI_DAILY_LIMIT_USD is "off". A cap on what free trials
 * and any bug can spend from Farbaek's own keys in a day.
 */
export function platformDailyAiUnits(read: (name: string) => string | null = env): number | null {
  const raw = read("AI_DAILY_LIMIT_USD")?.toLowerCase() ?? null;
  if (raw === "off") return null;
  const usd = raw === null ? DEFAULT_AI_DAILY_LIMIT_USD : Number(raw);
  const safe = Number.isFinite(usd) && usd > 0 ? Math.min(usd, 100_000) : DEFAULT_AI_DAILY_LIMIT_USD;
  return Math.floor(safe / USD_PER_UNIT);
}

export type AiProviderResolution = { provider: AiProviderId; label: string } | { provider: null; reason: string; detail?: string };

/** What people read when AI isn't set up here. Which setting is at fault is `detail`, for staff and the logs (stage 171). */
export const AI_NOT_AVAILABLE = "AI isn't available on this server right now. Try again later, or write to support@farbaek.com.";

export function resolveAiProvider(): AiProviderResolution {
  // Paused by Farbaek's owners from Office Space (ADR 0032): every AI path shows this reason.
  const paused = platformPause("ai_runs");
  if (paused) return { provider: null, reason: paused };
  const pref = (env("AI_PROVIDER") ?? "").toLowerCase();
  const pick = (p: AiProviderId): AiProviderResolution => ({ provider: p, label: AI_PROVIDER_LABELS[p] });

  if (pref === "anthropic") return hasAnthropicKey() ? pick("anthropic") : { provider: null, reason: AI_NOT_AVAILABLE, detail: "AI_PROVIDER is anthropic, but ANTHROPIC_API_KEY isn't set on this server." };
  if (pref === "gemini") return hasGeminiKey() ? pick("gemini") : { provider: null, reason: AI_NOT_AVAILABLE, detail: "AI_PROVIDER is gemini, but GEMINI_API_KEY isn't set on this server." };
  if (pref) return { provider: null, reason: AI_NOT_AVAILABLE, detail: `AI_PROVIDER is set to "${pref.slice(0, 20)}". Use anthropic or gemini.` };
  if (hasAnthropicKey()) return pick("anthropic");
  if (hasGeminiKey()) return pick("gemini");
  return { provider: null, reason: AI_NOT_AVAILABLE, detail: "No AI provider key is set on this server." };
}
