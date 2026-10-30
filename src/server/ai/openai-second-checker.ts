/**
 * The second check on OpenAI (ADR 0121): a model from another company than
 * the one that wrote the change, for a more independent read. Called over
 * OpenAI's Responses API with a strict JSON schema; the answer is validated
 * again here, untrusted. Responses aren't stored at OpenAI (store: false).
 * Server-only: the key is read from OPENAI_API_KEY and never leaves the
 * server.
 */
import { FINDING_SEVERITIES, FINDING_TOPICS, SECOND_CHECK_VERDICTS, parseSecondCheckOutput } from "@/core/trust/second-check";
import type { ProviderUsage } from "./contract-drafter";
import { SECOND_CHECK_MAX_OUTPUT_TOKENS, SECOND_CHECK_SYSTEM_PROMPT, secondCheckMessage, type SecondChecker, type SecondCheckOutcome } from "./second-checker";

/** The model the second check uses on OpenAI. Priced in the rate card. */
export const OPENAI_SECOND_CHECK_MODEL = "gpt-6.1-terra";

const RESPONSES_URL = "https://api.openai.com/v1/responses";
const TIMEOUT_MS = 240_000;

/** The key, or null when this server doesn't have one. Never logged or returned. */
export function openAiKey(env: Readonly<Record<string, string | undefined>> = process.env): string | null {
  const key = env.OPENAI_API_KEY?.trim();
  return key ? key : null;
}

/** The answer's shape for OpenAI's strict structured output: every property required, nothing extra. */
const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["verdict", "summary", "findings", "uncertainty"],
  properties: {
    verdict: { type: "string", enum: [...SECOND_CHECK_VERDICTS] },
    summary: { type: "string" },
    findings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["topic", "severity", "path", "detail"],
        properties: {
          topic: { type: "string", enum: [...FINDING_TOPICS] },
          severity: { type: "string", enum: [...FINDING_SEVERITIES] },
          path: { type: ["string", "null"] },
          detail: { type: "string" },
        },
      },
    },
    uncertainty: { type: "string" },
  },
} as const;

interface ResponsesReply {
  status?: string;
  output?: { type?: string; content?: { type?: string; text?: string; refusal?: string }[] }[];
  usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number } };
}

export function createOpenAiSecondChecker(options: { key: string; model?: string; fetcher?: typeof fetch }): SecondChecker {
  const model = options.model ?? OPENAI_SECOND_CHECK_MODEL;
  const fetcher = options.fetcher ?? fetch;
  return {
    model,
    maxOutputTokens: SECOND_CHECK_MAX_OUTPUT_TOKENS,
    async check(request, signal): Promise<SecondCheckOutcome> {
      let response: Response;
      try {
        response = await fetcher(RESPONSES_URL, {
          method: "POST",
          headers: { authorization: `Bearer ${options.key}`, "content-type": "application/json" },
          body: JSON.stringify({
            model,
            instructions: SECOND_CHECK_SYSTEM_PROMPT,
            input: secondCheckMessage(request),
            max_output_tokens: SECOND_CHECK_MAX_OUTPUT_TOKENS,
            store: false,
            text: { format: { type: "json_schema", name: "second_check", strict: true, schema: OUTPUT_SCHEMA } },
          }),
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]) : AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch {
        return { ok: false, failure: "PROVIDER_BUSY", usage: null };
      }
      if (response.status === 429 || response.status >= 500) return { ok: false, failure: "PROVIDER_BUSY", usage: null };
      if (!response.ok) return { ok: false, failure: "PROVIDER_ERROR", usage: null };

      let reply: ResponsesReply;
      try {
        reply = (await response.json()) as ResponsesReply;
      } catch {
        return { ok: false, failure: "INCOMPLETE", usage: null };
      }
      const cached = reply.usage?.input_tokens_details?.cached_tokens ?? 0;
      const usage: ProviderUsage = {
        model,
        // OpenAI counts cached tokens inside input_tokens; they're priced apart.
        inputTokens: Math.max(0, (reply.usage?.input_tokens ?? 0) - cached),
        outputTokens: reply.usage?.output_tokens ?? 0,
        cacheWriteTokens: 0,
        cacheReadTokens: cached,
      };
      const content = (reply.output ?? []).filter((o) => o.type === "message").flatMap((o) => o.content ?? []);
      if (content.some((c) => c.type === "refusal")) return { ok: false, failure: "REFUSED", usage };
      if (reply.status !== "completed") return { ok: false, failure: "INCOMPLETE", usage };
      const text = content.find((c) => c.type === "output_text")?.text;
      if (!text) return { ok: false, failure: "INCOMPLETE", usage };
      try {
        const output = parseSecondCheckOutput(JSON.parse(text));
        return output ? { ok: true, output, usage } : { ok: false, failure: "INCOMPLETE", usage };
      } catch {
        return { ok: false, failure: "INCOMPLETE", usage };
      }
    },
  };
}
