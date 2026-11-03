/**
 * Whether this server can generate images (ADR 0109): it needs a Gemini key.
 * GEMINI_IMAGE_MODEL may name another image model; anything that doesn't
 * look like a model id falls back to the default. No value is ever shown.
 */
import { DEFAULT_IMAGE_MODEL, createGeminiImageGenerator, type ImageGenerator } from "./gemini-image";

type Env = Record<string, string | undefined>;

export function imageModel(env: Env = process.env): string {
  const m = env.GEMINI_IMAGE_MODEL?.trim();
  return m && /^[a-z0-9][a-z0-9.-]{2,60}$/.test(m) ? m : DEFAULT_IMAGE_MODEL;
}

export function imageGeneration(env: Env = process.env): { generator: ImageGenerator; reason: null } | { generator: null; reason: string } {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { generator: null, reason: "Image generation isn't connected on this server yet." };
  return { generator: createGeminiImageGenerator({ apiKey: key, model: imageModel(env) }), reason: null };
}
