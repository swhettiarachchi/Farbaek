/**
 * Each model's product name, as people see it ("Claude Haiku 5.5"), never its
 * id in monospace (ADR 0180). Names only: what a model costs Farbaek stays in
 * rate-card.ts, which browser code never imports, so prices and margins never
 * reach a page's JavaScript.
 */
export const MODEL_NAMES = {
  "claude-haiku-5-5": "Claude Haiku 5.5",
  "claude-sonnet-5-5": "Claude Sonnet 5.5",
  "claude-opus-5-5": "Claude Opus 5.5",
  "claude-fable-5-1": "Claude Fable 5.1",
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.8-flash": "Gemini 3.8 Flash",
  "gemini-4-argon": "Gemini 4 Argon",
  "gemini-3.1-flash-lite-image": "Gemini 3.1 Flash Lite Image",
  "gpt-6.1-terra": "GPT-6.1 Terra",
} as const;

export type ModelId = keyof typeof MODEL_NAMES;

/**
 * A model by its product name. A machine id Farbaek doesn't list (an internal
 * route, say) is never shown as it is: it reads "an AI model". A name that's
 * already words, such as the sample workspace's "Sample model", stays.
 */
export function modelName(model: string): string {
  const known = (MODEL_NAMES as Record<string, string>)[model];
  if (known) return known;
  return /^[a-z0-9][a-z0-9._:/-]*$/.test(model) ? "an AI model" : model;
}
