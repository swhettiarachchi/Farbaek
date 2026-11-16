/**
 * OpenAI's image model for the image studio (stage 201, ADR 0216), over the Images API with plain fetch. Server-only: the key
 * never leaves the server. One picture per call, streamed, so the studio can show a first look while it renders; references
 * (pictures from the person's library) go to the edits endpoint as data URLs.
 *
 * Checked against OpenAI's API reference on 2026-11-17: POST /v1/images/generations and /v1/images/edits, base64 output only,
 * stream + partial_images (events image_generation.* and image_edit.*), custom sizes on the 2.5 models, usage in the completed
 * event. A prompt the model refuses comes back as error code moderation_blocked.
 */
import type { DraftFailure, ProviderUsage } from "./contract-drafter";

export const DEFAULT_STUDIO_IMAGE_MODEL = "gpt-image-2.5-sunburst";

export interface StudioImageInput {
  prompt: string;
  width: number;
  height: number;
  quality: "low" | "medium" | "high" | "xhigh";
  format: "webp" | "png" | "jpeg";
  transparent: boolean;
  references: readonly { mime: string; data: string }[];
  /** A stable, non-identifying id for the person, so OpenAI's abuse checks can tell people apart. */
  safetyId: string;
}

export type StudioImageOutcome =
  | { ok: true; data: string; mime: string; usage: ProviderUsage }
  /** blocked: the model's safety checks refused the request. */
  | { ok: false; failure: DraftFailure | "BLOCKED"; usage: ProviderUsage | null };

export interface StudioImageEngine {
  model: string;
  make(input: StudioImageInput, onPartial: (data: string, mime: string) => void, signal: AbortSignal): Promise<StudioImageOutcome>;
}

interface Options {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const MIME = { webp: "image/webp", png: "image/png", jpeg: "image/jpeg" } as const;

interface ApiUsage {
  input_tokens?: number;
  output_tokens?: number;
  input_tokens_details?: { text_tokens?: number; image_tokens?: number };
}

function toUsage(model: string, u: ApiUsage | undefined): ProviderUsage | null {
  if (!u || typeof u.output_tokens !== "number") return null;
  return { model, inputTokens: u.input_tokens ?? 0, outputTokens: u.output_tokens, cacheWriteTokens: 0, cacheReadTokens: 0 };
}

/** What an error response means for the person: refused, busy, or broken. */
export function failureOf(status: number, body: unknown): DraftFailure | "BLOCKED" {
  const error = (body as { error?: { code?: unknown; type?: unknown } } | null)?.error;
  if (error?.code === "moderation_blocked" || error?.type === "image_generation_user_error") return "BLOCKED";
  if (status === 429 || status >= 500) return "PROVIDER_BUSY";
  return "PROVIDER_ERROR";
}

/** Reads a server-sent event stream into events of { event, data }. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, cut);
      buffer = buffer.slice(cut).replace(/^\r?\n\r?\n/, "");
      let event = "message";
      const data: string[] = [];
      for (const line of block.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (data.length) yield { event, data: data.join("\n") };
    }
    if (done) return;
  }
}

export function createOpenAiImageEngine(options: Options): StudioImageEngine {
  const model = options.model ?? DEFAULT_STUDIO_IMAGE_MODEL;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 240_000;

  return {
    model,
    async make(input, onPartial, signal) {
      const edit = input.references.length > 0;
      const mime = MIME[input.format];
      const body: Record<string, unknown> = {
        model,
        prompt: input.prompt,
        n: 1,
        size: `${input.width}x${input.height}`,
        quality: input.quality,
        output_format: input.format,
        background: input.transparent && input.format !== "jpeg" ? "transparent" : "auto",
        moderation: "auto",
        safety_identifier: input.safetyId,
        stream: true,
        partial_images: 1,
        ...(input.format === "jpeg" || input.format === "webp" ? { output_compression: 92 } : {}),
        ...(edit ? { images: input.references.map((r) => ({ image_url: `data:${r.mime};base64,${r.data}` })) } : {}),
      };
      const timeout = AbortSignal.timeout(timeoutMs);
      let res: Response;
      try {
        res = await doFetch(`https://api.openai.com/v1/images/${edit ? "edits" : "generations"}`, {
          method: "POST",
          headers: { authorization: `Bearer ${options.apiKey}`, "content-type": "application/json", accept: "text/event-stream" },
          body: JSON.stringify(body),
          signal: AbortSignal.any([signal, timeout]),
        });
      } catch {
        return { ok: false, failure: signal.aborted ? "PROVIDER_ERROR" : "PROVIDER_BUSY", usage: null };
      }
      if (!res.ok || !res.body) {
        const parsed = await res.json().catch(() => null);
        return { ok: false, failure: failureOf(res.status, parsed), usage: null };
      }
      const prefix = edit ? "image_edit" : "image_generation";
      try {
        for await (const e of readEvents(res.body)) {
          let payload: { type?: string; b64_json?: string; usage?: ApiUsage; error?: { code?: string; type?: string } };
          try {
            payload = JSON.parse(e.data);
          } catch {
            continue;
          }
          const type = payload.type ?? e.event;
          if (type === `${prefix}.partial_image` && typeof payload.b64_json === "string") onPartial(payload.b64_json, mime);
          else if (type === `${prefix}.completed` && typeof payload.b64_json === "string") {
            const usage = toUsage(model, payload.usage) ?? { model, inputTokens: 0, outputTokens: 0, cacheWriteTokens: 0, cacheReadTokens: 0 };
            return { ok: true, data: payload.b64_json, mime, usage };
          } else if (type === "error" || payload.error) return { ok: false, failure: failureOf(200, payload), usage: null };
        }
      } catch {
        return { ok: false, failure: signal.aborted ? "PROVIDER_ERROR" : "PROVIDER_BUSY", usage: null };
      }
      return { ok: false, failure: "INCOMPLETE", usage: null };
    },
  };
}

/** The studio's OpenAI image engine, when OPENAI_API_KEY is set. OPENAI_IMAGE_MODEL may name another GPT image model. */
export function openAiImageEngine(env: Readonly<Record<string, string | undefined>> = process.env): StudioImageEngine | null {
  const key = env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  const m = env.OPENAI_IMAGE_MODEL?.trim();
  return createOpenAiImageEngine({ apiKey: key, model: m && /^gpt-image-[a-z0-9.-]{1,40}$/.test(m) ? m : DEFAULT_STUDIO_IMAGE_MODEL });
}
