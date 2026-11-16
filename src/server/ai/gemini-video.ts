/**
 * Google's Gemini Omni video model for the video studio (stage 201, ADR 0216), over the Interactions API with plain fetch.
 * Server-only: the key goes in the x-goog-api-key header, never in a URL.
 *
 * Checked against Google's docs on 2026-11-17: POST /v1beta/interactions with model gemini-omni-1.2-flash, input as text or as an
 * image part then a text part, response_format { type: "video", aspect_ratio, resolution, duration }. The call returns when the
 * video is ready. Videos over 4 MB are asked for by URI ("delivery": "uri"): the file is polled until ACTIVE, then downloaded.
 * Billing is by output tokens per second of video, so the usage is worked out from the length and resolution.
 */
import { videoTokens, type VideoResolution, type VideoShape } from "@/core/studio/studio";
import type { DraftFailure, ProviderUsage } from "./contract-drafter";

export const DEFAULT_VIDEO_MODEL = "gemini-omni-1.2-flash";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

export interface VideoInput {
  prompt: string;
  shape: VideoShape;
  seconds: number;
  resolution: VideoResolution;
  /** A still to start from. */
  still: { mime: string; data: string } | null;
}

export type VideoOutcome =
  | { ok: true; bytes: Uint8Array; mime: "video/mp4"; usage: ProviderUsage }
  | { ok: false; failure: DraftFailure | "BLOCKED"; usage: ProviderUsage | null };

export interface VideoEngine {
  model: string;
  make(input: VideoInput, signal: AbortSignal): Promise<VideoOutcome>;
}

interface Options {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  timeoutMs?: number;
  /** Between checks of a file that's still processing. */
  pollMs?: number;
}

type Content = { type?: string; mime_type?: string; data?: string; uri?: string };

/** The video in an interaction: base64 bytes, or the address of a file to download. */
export function findVideo(body: unknown): { data: string } | { uri: string } | null {
  const steps = (body as { steps?: { type?: string; content?: Content[] }[] } | null)?.steps;
  if (!Array.isArray(steps)) return null;
  for (const step of steps) {
    if (step?.type !== "model_output" || !Array.isArray(step.content)) continue;
    for (const c of step.content) {
      if (c?.type !== "video") continue;
      if (typeof c.data === "string" && c.data.length > 0) return { data: c.data };
      if (typeof c.uri === "string" && /^https:\/\/generativelanguage\.googleapis\.com\//.test(c.uri)) return { uri: c.uri };
    }
  }
  return null;
}

function failureOf(status: number, body: unknown): DraftFailure | "BLOCKED" {
  const text = JSON.stringify(body ?? "").toLowerCase();
  if (/safety|blocked|prohibited|policy/.test(text)) return "BLOCKED";
  if (status === 429 || status >= 500) return "PROVIDER_BUSY";
  return "PROVIDER_ERROR";
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(t), reject(new Error("aborted"))), { once: true });
  });

export function createGeminiVideoEngine(options: Options): VideoEngine {
  const model = options.model ?? DEFAULT_VIDEO_MODEL;
  const doFetch = options.fetch ?? fetch;
  const timeoutMs = options.timeoutMs ?? 540_000;
  const pollMs = options.pollMs ?? 5_000;
  const headers = { "content-type": "application/json", "x-goog-api-key": options.apiKey };

  return {
    model,
    async make(input, signal) {
      const all = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]);
      const usage: ProviderUsage = { model, inputTokens: Math.ceil(input.prompt.length / 4) + (input.still ? 1_300 : 0), outputTokens: videoTokens(input.seconds, input.resolution), cacheWriteTokens: 0, cacheReadTokens: 0 };
      const body = {
        model,
        input: input.still
          ? [
              { type: "image", data: input.still.data, mime_type: input.still.mime },
              { type: "text", text: input.prompt },
            ]
          : input.prompt,
        response_format: { type: "video", aspect_ratio: input.shape, resolution: input.resolution, duration: `${input.seconds}s`, delivery: "uri" },
      };
      try {
        const res = await doFetch(`${BASE}/interactions`, { method: "POST", headers, body: JSON.stringify(body), signal: all });
        const parsed = await res.json().catch(() => null);
        if (!res.ok) return { ok: false, failure: failureOf(res.status, parsed), usage: null };
        const found = findVideo(parsed);
        if (!found) return { ok: false, failure: failureOf(200, parsed) === "BLOCKED" ? "BLOCKED" : "INCOMPLETE", usage: null };
        if ("data" in found) return { ok: true, bytes: Buffer.from(found.data, "base64"), mime: "video/mp4", usage };

        // Delivered by address: wait for the file to be ready, then download it.
        const file = /\/files\/([A-Za-z0-9_-]+)/.exec(found.uri)?.[1];
        if (!file) return { ok: false, failure: "INCOMPLETE", usage: null };
        for (let i = 0; i < 60; i++) {
          const state = await doFetch(`${BASE}/files/${file}`, { headers, signal: all }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
          const s = (state as { state?: string } | null)?.state;
          if (s === "ACTIVE") break;
          if (s === "FAILED") return { ok: false, failure: "PROVIDER_ERROR", usage: null };
          await sleep(pollMs, all);
        }
        const download = await doFetch(`${BASE}/files/${file}:download?alt=media`, { headers, signal: all });
        if (!download.ok) return { ok: false, failure: failureOf(download.status, null), usage: null };
        return { ok: true, bytes: new Uint8Array(await download.arrayBuffer()), mime: "video/mp4", usage };
      } catch {
        return { ok: false, failure: signal.aborted ? "PROVIDER_ERROR" : "PROVIDER_BUSY", usage: null };
      }
    },
  };
}

/** The video studio's engine, when GEMINI_API_KEY is set. GEMINI_VIDEO_MODEL may name another Omni model. */
export function geminiVideoEngine(env: Readonly<Record<string, string | undefined>> = process.env): VideoEngine | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  const m = env.GEMINI_VIDEO_MODEL?.trim();
  return createGeminiVideoEngine({ apiKey: key, model: m && /^gemini-omni-[a-z0-9.-]{1,40}$/.test(m) ? m : DEFAULT_VIDEO_MODEL });
}
