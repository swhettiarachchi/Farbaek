/**
 * Contract drafting and change proposals with Claude through the official
 * Anthropic SDK.
 *
 * - Structured output: the response must match ContractDraftSchema.
 * - Refusal fallbacks are on (`fallbacks: "default"`) where the model has
 *   them: if it declines for policy reasons, the API retries on Anthropic's
 *   recommended fallback model in the same call. The model that answered is
 *   recorded.
 * - The task, project and notes are user data, sent as JSON, never as
 *   instructions (shared prompts in ./prompts.ts). The output is untrusted
 *   and only prefills the editor.
 * - Thinking is never returned to the browser or stored.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ProposalOutputSchema } from "@/core/realityloop/change-proposal";
import { ContractDraftSchema } from "@/core/realityloop/contract-draft";
import { log } from "@/server/observability/log";
import type { ChangeProposer, ProposalOutcome } from "./change-proposer";
import type { ContractDrafter, DraftOutcome, ProviderUsage } from "./contract-drafter";
import { CONTRACT_SYSTEM_PROMPT, PROPOSAL_SYSTEM_PROMPT, contractBriefMessage, proposalBriefMessage } from "./prompts";

/** The model when none is routed (the smoke test). Use cases route per plan and effort (src/core/agent/routing.ts). */
export const CONTRACT_DRAFT_MODEL = "claude-sonnet-5-5";

const MAX_OUTPUT_TOKENS = 8_000;

export interface AnthropicCallOptions {
  model?: string;
  /** Thinking effort. */
  effort?: "low" | "medium" | "high";
  client?: Anthropic;
}

/**
 * Refusal fallbacks re-run a declined request on another model inside the
 * same call. Claude Haiku 5.5 has none (a fallbacks list is a 400), so it
 * isn't asked for there.
 */
function fallbackParams(model: string): { betas: ["server-side-fallback-2026-07-01"]; fallbacks: "default" } | Record<string, never> {
  return model.startsWith("claude-haiku") ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };
}

/**
 * What Anthropic said when a call failed, for the server log only: the HTTP status, the error
 * type and the request id. Never the prompt, and never the key (log() masks keys anyway).
 * People see a plain "AI isn't available right now"; this is what makes that diagnosable.
 */
export function logProviderError(call: "contract_draft" | "change_proposal", model: string, error: unknown): void {
  const api = error instanceof Anthropic.APIError ? error : null;
  const body = api?.error as { error?: { type?: unknown } } | undefined;
  log("error", "anthropic.call_failed", {
    call,
    model,
    status: api?.status ?? null,
    type: typeof body?.error?.type === "string" ? body.error.type : error instanceof Error ? error.name : "unknown",
    requestId: api?.requestID ?? null,
    message: api ? api.message.slice(0, 300) : null,
  });
}

function usageOf(message: {
  model: string;
  usage: { input_tokens: number; output_tokens: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
}): ProviderUsage {
  return {
    model: message.model,
    inputTokens: message.usage.input_tokens,
    outputTokens: message.usage.output_tokens,
    cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
    cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
  };
}

export function createAnthropicContractDrafter(options: AnthropicCallOptions = {}): ContractDrafter {
  const client = options.client ?? new Anthropic({ maxRetries: 1, timeout: 90_000 });
  const model = options.model ?? CONTRACT_DRAFT_MODEL;
  return {
    model,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    async draft(brief, signal): Promise<DraftOutcome> {
      try {
        const message = await client.beta.messages.parse(
          {
            model,
            max_tokens: MAX_OUTPUT_TOKENS,
            ...fallbackParams(model),
            thinking: { type: "adaptive" },
            output_config: { effort: options.effort ?? "medium", format: betaZodOutputFormat(ContractDraftSchema) },
            system: CONTRACT_SYSTEM_PROMPT,
            messages: [{ role: "user", content: contractBriefMessage(brief) }],
          },
          { signal },
        );

        const usage = usageOf(message);
        // Branch on stop_reason before reading content: a refusal can arrive with partial or no output.
        if (message.stop_reason === "refusal") return { ok: false, failure: "REFUSED", usage };
        if (message.stop_reason === "max_tokens" || !message.parsed_output) return { ok: false, failure: "INCOMPLETE", usage };
        return { ok: true, draft: message.parsed_output, usage };
      } catch (error) {
        logProviderError("contract_draft", model, error);
        if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionTimeoutError) {
          return { ok: false, failure: "PROVIDER_BUSY", usage: null };
        }
        if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIUserAbortError) {
          return { ok: false, failure: "PROVIDER_ERROR", usage: null };
        }
        // The SDK raises a plain AnthropicError when structured output fails to parse.
        if (error instanceof Anthropic.AnthropicError) return { ok: false, failure: "INCOMPLETE", usage: null };
        return { ok: false, failure: "PROVIDER_ERROR", usage: null };
      }
    },
  };
}

const PROPOSAL_MAX_OUTPUT_TOKENS = 16_000;

export function createAnthropicChangeProposer(options: AnthropicCallOptions = {}): ChangeProposer {
  const client = options.client ?? new Anthropic({ maxRetries: 1, timeout: 300_000 });
  const model = options.model ?? CONTRACT_DRAFT_MODEL;
  return {
    model,
    maxOutputTokens: PROPOSAL_MAX_OUTPUT_TOKENS,
    async propose(brief, signal): Promise<ProposalOutcome> {
      try {
        // Streamed: proposals can be long, and streaming avoids request timeouts.
        const stream = client.beta.messages.stream(
          {
            model,
            max_tokens: PROPOSAL_MAX_OUTPUT_TOKENS,
            ...fallbackParams(model),
            thinking: { type: "adaptive" },
            output_config: { effort: options.effort ?? "medium", format: betaZodOutputFormat(ProposalOutputSchema) },
            system: PROPOSAL_SYSTEM_PROMPT,
            messages: [{ role: "user", content: proposalBriefMessage(brief) }],
          },
          { signal },
        );
        const message = await stream.finalMessage();
        const usage = usageOf(message);
        if (message.stop_reason === "refusal") return { ok: false, failure: "REFUSED", usage };
        if (message.stop_reason === "max_tokens" || !message.parsed_output) return { ok: false, failure: "INCOMPLETE", usage };
        return { ok: true, output: message.parsed_output, usage };
      } catch (error) {
        logProviderError("change_proposal", model, error);
        if (error instanceof Anthropic.RateLimitError || error instanceof Anthropic.InternalServerError || error instanceof Anthropic.APIConnectionTimeoutError) {
          return { ok: false, failure: "PROVIDER_BUSY", usage: null };
        }
        if (error instanceof Anthropic.APIError || error instanceof Anthropic.APIUserAbortError) return { ok: false, failure: "PROVIDER_ERROR", usage: null };
        if (error instanceof Anthropic.AnthropicError) return { ok: false, failure: "INCOMPLETE", usage: null };
        return { ok: false, failure: "PROVIDER_ERROR", usage: null };
      }
    },
  };
}
