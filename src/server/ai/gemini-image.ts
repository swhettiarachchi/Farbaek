/**
 * Image generation with Gemini (ADR 0109), through the Gemini API's REST
 * endpoints. No SDK: one fetch per request.
 *
 * - The key goes in the x-goog-api-key header, never in the URL.
 * - It asks models.generateContent for an image (responseModalities IMAGE).
 *   If that method is refused for the model (404, or a 400 naming the
 *   response settings), it asks the Interactions API once instead, the form
 *   Google's image guide shows. Either answer is read the same way.
 * - Safety blocks come back as REFUSED; nothing usable is INCOMPLETE. Usage
 *   is what the API reports; when it reports none, the documented cost of
 *   one image is used, so a call is never metered below its price.
 * - The bytes are untrusted: the caller checks they're an image before
 *   saving them (core/workspace/images.ts).
 */
import type { DraftFailure, ProviderUsage } from "./contract-drafter";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

/** The cheapest image model on 2026-10-28 ($0.0336 a 1K image), and the one Google names to replace the deprecated one. */
export const DEFAULT_IMAGE_MODEL = "gemini-3.1-flash-lite-image";

/** Image output tokens a 1K image costs: $0.0336 at $30 per million, from Google's pricing page (2026-10-28). */
export const IMAGE_OUTPUT_TOKENS = 1_120;

export const ASPECT_RATIOS = ["1:1", "4:3", "3:4", "3:2", "2:3", "16:9", "9:16", "4:5", "5:4", "21:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export type ImageOutcome =
  | { ok: true; bytes: Uint8Array; mimeType: string; usage: ProviderUsage }
  | { ok: false; failure: DraftFailure; usage: ProviderUsage | null };

export interface ImageGenerator {
  model: string;
  generate(input: { prompt: string; aspectRatio: AspectRatio }, signal?: AbortSignal): Promise<ImageOutcome>;
}

interface Options {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

type Json = Record<string, unknown>;
const obj = (v: unknown): Json | null => (v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

/** The first image in either answer: generateContent's inlineData, or an Interactions image block. */
export function findImage(body: unknown): { data: string; mimeType: string } | null {
  const b = obj(body);
  if (!b) return null;
  for (const c of arr(b.candidates)) {
    for (const p of arr(obj(obj(c)?.content)?.parts)) {
      const inline = obj(obj(p)?.inlineData) ?? obj(obj(p)?.inline_data);
      const data = inline?.data;
      if (typeof data === "string" && data.length > 0) return { data, mimeType: String(inline?.mimeType ?? inline?.mime_type ?? "image/png") };
    }
  }
  const direct = obj(b.output_image) ?? obj(b.outputImage);
  if (direct && typeof direct.data === "string") return { data: direct.data, mimeType: String(direct.mime_type ?? direct.mimeType ?? "image/png") };
  for (const list of [b.steps, b.outputs]) {
    for (const step of arr(list)) {
      const s = obj(step);
      const blocks = s?.type === "image" ? [s] : arr(s?.content);
      for (const block of blocks) {
        const k = obj(block);
        if (k?.type === "image" && typeof k.data === "string" && k.data.length > 0) return { data: k.data, mimeType: String(k.mime_type ?? k.mimeType ?? "image/png") };
      }
    }
  }
  return null;
}

/** Whether the answer says the prompt or the image was blocked for safety. */
export function wasBlocked(body: unknown): boolean {
  const b = obj(body);
  if (!b) return false;
  if (obj(b.promptFeedback)?.blockReason) return true;
  if (arr(b.candidates).some((c) => /SAFETY|PROHIBITED|BLOCKLIST|IMAGE_SAFETY|SPII|RECITATION/.test(String(obj(c)?.finishReason ?? "")))) return true;
  return arr(b.errors).some((e) => /safety|blocked|prohibited/i.test(`${obj(e)?.code ?? ""} ${obj(e)?.message ?? ""}`));
}

/** Tokens the answer reports, in either API's words; the documented price of one image when it reports none. */
export function usageOf(body: unknown, model: string): ProviderUsage {
  const b = obj(body);
  const meta = obj(b?.usageMetadata);
  const usage = obj(b?.usage);
  const input = meta ? num(meta.promptTokenCount) : num(usage?.total_input_tokens);
  const output = meta ? num(meta.candidatesTokenCount) + num(meta.thoughtsTokenCount) : num(usage?.total_output_tokens) + num(usage?.total_thought_tokens);
  return { model: typeof b?.modelVersion === "string" ? b.modelVersion : model, inputTokens: input, outputTokens: Math.max(output, IMAGE_OUTPUT_TOKENS) };
}

export function createGeminiImageGenerator(options: Options): ImageGenerator {
  const model = options.model ?? DEFAULT_IMAGE_MODEL;
  const doFetch = options.fetch ?? fetch;
  const headers = { "content-type": "application/json", "x-goog-api-key": options.apiKey };

  return {
    model,
    async generate(input, signal) {
      const timeout = AbortSignal.timeout(options.timeoutMs ?? 90_000);
      const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
      const viaGenerateContent = () =>
        doFetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: input.prompt }] }],
            generationConfig: { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: input.aspectRatio } },
          }),
          signal: combined,
        });
      const viaInteractions = () =>
        doFetch(`${API_BASE}/interactions`, {
          method: "POST",
          headers,
          body: JSON.stringify({ model, input: input.prompt, response_format: { type: "image", mime_type: "image/png", aspect_ratio: input.aspectRatio, image_size: "1K" } }),
          signal: combined,
        });

      let res: Response;
      try {
        res = await viaGenerateContent();
        if (res.status === 404 || res.status === 400) {
          const text = await res.text();
          // The method or its image settings aren't accepted for this model: ask the Interactions API once.
          if (res.status === 404 || /responseModalities|response_modalities|imageConfig|image_config|not supported|unsupported/i.test(text)) res = await viaInteractions();
          else return { ok: false, failure: /safety|blocked/i.test(text) ? "REFUSED" : "PROVIDER_ERROR", usage: null };
        }
      } catch {
        return { ok: false, failure: combined.aborted && !signal?.aborted ? "PROVIDER_BUSY" : "PROVIDER_ERROR", usage: null };
      }
      if (res.status === 429 || res.status >= 500) return { ok: false, failure: "PROVIDER_BUSY", usage: null };
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return { ok: false, failure: /safety|blocked/i.test(text) ? "REFUSED" : "PROVIDER_ERROR", usage: null };
      }

      let body: unknown;
      try {
        body = await res.json();
      } catch {
        return { ok: false, failure: "INCOMPLETE", usage: null };
      }
      const usage = usageOf(body, model);
      const image = findImage(body);
      if (!image) return { ok: false, failure: wasBlocked(body) ? "REFUSED" : "INCOMPLETE", usage };
      const bytes = new Uint8Array(Buffer.from(image.data, "base64"));
      if (bytes.length === 0) return { ok: false, failure: "INCOMPLETE", usage };
      return { ok: true, bytes, mimeType: image.mimeType, usage };
    },
  };
}
