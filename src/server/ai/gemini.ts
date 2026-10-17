/**
 * Contract drafting and change proposals with Gemini (ADR 0014), through the
 * official Gemini API REST endpoint (models.generateContent). No SDK: one
 * fetch per request, so there is no extra dependency to vet.
 *
 * - The key goes in the x-goog-api-key header, never in the URL, so it can't
 *   end up in logs or referrers.
 * - Same rules and data as Claude (./prompts.ts). Output must be JSON and is
 *   validated against Farbaek's own schemas; anything that doesn't match is
 *   INCOMPLETE, never used.
 * - Structured output is requested with a JSON Schema reduced to the subset
 *   the Gemini API documents. If the API rejects the schema field itself, the
 *   request is retried once in plain JSON mode with the schema stated in the
 *   instructions; validation still applies.
 * - Safety blocks and refusals come back as REFUSED; usage is what the API
 *   reports (thinking tokens count as output, as they are billed).
 */
import { z } from "zod";
import { ProposalOutputSchema } from "@/core/realityloop/change-proposal";
import { ContractDraftSchema } from "@/core/realityloop/contract-draft";
import type { ChangeProposer, ProposalOutcome } from "./change-proposer";
import type { ContractDrafter, DraftFailure, DraftOutcome, ProviderUsage } from "./contract-drafter";
import { CONTRACT_SYSTEM_PROMPT, PROPOSAL_SYSTEM_PROMPT, contractBriefMessage, proposalBriefMessage } from "./prompts";

const API_BASE = "https://generativelanguage.googleapis.com/v1beta";

const SUPPORTED_KEYWORDS = new Set([
  "type",
  "title",
  "description",
  "properties",
  "required",
  "additionalProperties",
  "enum",
  "format",
  "minimum",
  "maximum",
  "items",
  "prefixItems",
  "minItems",
  "maxItems",
  "anyOf",
]);

/** Keeps only the JSON Schema keywords the Gemini API documents as supported. */
export function toGeminiSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toGeminiSchema);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    if (!SUPPORTED_KEYWORDS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      out.properties = Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)]));
    } else if (key === "items" || key === "anyOf" || key === "prefixItems") {
      out[key] = toGeminiSchema(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
  promptFeedback?: { blockReason?: string };
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
  modelVersion?: string;
}

const REFUSAL_REASONS = new Set(["SAFETY", "RECITATION", "BLOCKLIST", "PROHIBITED_CONTENT", "SPII", "LANGUAGE", "ESCALATION", "PUP_LIMITED_DISABLED"]);

export interface GeminiOptions {
  apiKey: string;
  model: string;
  fetch?: typeof fetch;
}

type CallResult<T> = { ok: true; value: T; usage: ProviderUsage } | { ok: false; failure: DraftFailure; usage: ProviderUsage | null };

async function generate<T>(
  options: GeminiOptions,
  request: { system: string; user: string; schema: z.ZodType<T>; maxOutputTokens: number; timeoutMs: number },
  signal?: AbortSignal,
): Promise<CallResult<T>> {
  const doFetch = options.fetch ?? fetch;
  const jsonSchema = toGeminiSchema(z.toJSONSchema(request.schema));
  const timeout = AbortSignal.timeout(request.timeoutMs);
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;

  const call = async (withSchemaField: boolean) => {
    const system = withSchemaField ? request.system : `${request.system}\n\nRespond with JSON only, matching this JSON Schema exactly:\n${JSON.stringify(jsonSchema)}`;
    return doFetch(`${API_BASE}/models/${encodeURIComponent(options.model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": options.apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: request.user }] }],
        generationConfig: {
          responseMimeType: "application/json",
          ...(withSchemaField ? { responseJsonSchema: jsonSchema } : {}),
          maxOutputTokens: request.maxOutputTokens,
        },
      }),
      signal: combined,
    });
  };

  let res: Response;
  try {
    res = await call(true);
    if (res.status === 400) {
      const text = await res.text();
      // The schema field itself was rejected (unknown field or unsupported schema): retry once in plain JSON mode.
      if (/responseJsonSchema|response_json_schema|schema/i.test(text)) res = await call(false);
      else return { ok: false, failure: "PROVIDER_ERROR", usage: null };
    }
  } catch {
    return { ok: false, failure: combined.aborted && !signal?.aborted ? "PROVIDER_BUSY" : "PROVIDER_ERROR", usage: null };
  }

  if (res.status === 429 || res.status >= 500) return { ok: false, failure: "PROVIDER_BUSY", usage: null };
  if (!res.ok) return { ok: false, failure: "PROVIDER_ERROR", usage: null };

  let body: GeminiResponse;
  try {
    body = (await res.json()) as GeminiResponse;
  } catch {
    return { ok: false, failure: "INCOMPLETE", usage: null };
  }
  const meta = body.usageMetadata ?? {};
  const usage: ProviderUsage = {
    model: body.modelVersion ?? options.model,
    inputTokens: meta.promptTokenCount ?? 0,
    outputTokens: (meta.candidatesTokenCount ?? 0) + (meta.thoughtsTokenCount ?? 0),
  };

  if (body.promptFeedback?.blockReason) return { ok: false, failure: "REFUSED", usage };
  const candidate = body.candidates?.[0];
  const reason = candidate?.finishReason ?? "";
  if (REFUSAL_REASONS.has(reason)) return { ok: false, failure: "REFUSED", usage };
  if (reason === "MAX_TOKENS" || reason === "CONTINUATION") return { ok: false, failure: "INCOMPLETE", usage };

  const text = (candidate?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, failure: "INCOMPLETE", usage };
  }
  const parsed = request.schema.safeParse(json);
  return parsed.success ? { ok: true, value: parsed.data, usage } : { ok: false, failure: "INCOMPLETE", usage };
}

export function createGeminiContractDrafter(options: GeminiOptions): ContractDrafter {
  return {
    model: options.model,
    async draft(brief, signal): Promise<DraftOutcome> {
      const r = await generate(
        options,
        { system: CONTRACT_SYSTEM_PROMPT, user: contractBriefMessage(brief), schema: ContractDraftSchema, maxOutputTokens: 16_000, timeoutMs: 90_000 },
        signal,
      );
      return r.ok ? { ok: true, draft: r.value, usage: r.usage } : { ok: false, failure: r.failure, usage: r.usage };
    },
  };
}

export function createGeminiChangeProposer(options: GeminiOptions): ChangeProposer {
  return {
    model: options.model,
    async propose(brief, signal): Promise<ProposalOutcome> {
      const r = await generate(
        options,
        { system: PROPOSAL_SYSTEM_PROMPT, user: proposalBriefMessage(brief), schema: ProposalOutputSchema, maxOutputTokens: 32_000, timeoutMs: 300_000 },
        signal,
      );
      return r.ok ? { ok: true, output: r.value, usage: r.usage } : { ok: false, failure: r.failure, usage: r.usage };
    },
  };
}
