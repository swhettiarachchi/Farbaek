/**
 * Which model provider this server uses for AI features (ADR 0014). Keys are
 * checked for presence only; values are never logged or returned.
 *
 * AI_PROVIDER picks one explicitly ("anthropic" or "gemini"). Unset, Claude
 * is used when its key is present, otherwise Gemini when its key is present.
 * There is no silent switch between vendors mid-request: project data only
 * goes to the provider this resolves to.
 */

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

export type AiProviderResolution = { provider: AiProviderId; label: string } | { provider: null; reason: string };

export function resolveAiProvider(): AiProviderResolution {
  const pref = (env("AI_PROVIDER") ?? "").toLowerCase();
  const pick = (p: AiProviderId): AiProviderResolution => ({ provider: p, label: AI_PROVIDER_LABELS[p] });

  if (pref === "anthropic") return hasAnthropicKey() ? pick("anthropic") : { provider: null, reason: "AI_PROVIDER is anthropic, but ANTHROPIC_API_KEY isn't set on this server." };
  if (pref === "gemini") return hasGeminiKey() ? pick("gemini") : { provider: null, reason: "AI_PROVIDER is gemini, but GEMINI_API_KEY isn't set on this server." };
  if (pref) return { provider: null, reason: `AI_PROVIDER is set to "${pref.slice(0, 20)}". Use anthropic or gemini.` };
  if (hasAnthropicKey()) return pick("anthropic");
  if (hasGeminiKey()) return pick("gemini");
  return { provider: null, reason: "AI isn't connected on this server yet." };
}
