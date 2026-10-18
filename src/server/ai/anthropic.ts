/**
 * Contract drafting and change proposals with Claude through the official
 * Anthropic SDK.
 *
 * - Structured output: the response must match ContractDraftSchema.
 * - Refusal fallbacks are on (`fallbacks: "default"`): if the model declines
 *   for policy reasons, the API retries on Anthropic's recommended fallback
 *   model in the same call. The model that answered is recorded.
 * - The task, project and notes are user data, sent as JSON, never as
 *   instructions (shared prompts in ./prompts.ts). The output is untrusted
 *   and only prefills the editor.
 * - Thinking is never returned to the browser or stored.
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { ProposalOutputSchema } from "@/core/realityloop/change-proposal";
import { ContractDraftSchema } from "@/core/realityloop/contract-draft";
import type { ChangeProposer, ProposalOutcome } from "./change-proposer";
import type { ContractDrafter, DraftOutcome, ProviderUsage } from "./contract-drafter";
import { CONTRACT_SYSTEM_PROMPT, PROPOSAL_SYSTEM_PROMPT, contractBriefMessage, proposalBriefMessage } from "./prompts";

export const CONTRACT_DRAFT_MODEL = "claude-opus-5-5";

const MAX_OUTPUT_TOKENS = 8_000;

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

export function createAnthropicContractDrafter(client: Anthropic = new Anthropic({ maxRetries: 1, timeout: 90_000 })): ContractDrafter {
  return {
    model: CONTRACT_DRAFT_MODEL,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    async draft(brief, signal): Promise<DraftOutcome> {
      try {
        const message = await client.beta.messages.parse(
          {
            model: CONTRACT_DRAFT_MODEL,
            max_tokens: MAX_OUTPUT_TOKENS,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: "medium", format: betaZodOutputFormat(ContractDraftSchema) },
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

export function createAnthropicChangeProposer(client: Anthropic = new Anthropic({ maxRetries: 1, timeout: 300_000 })): ChangeProposer {
  return {
    model: CONTRACT_DRAFT_MODEL,
    maxOutputTokens: PROPOSAL_MAX_OUTPUT_TOKENS,
    async propose(brief, signal): Promise<ProposalOutcome> {
      try {
        // Streamed: proposals can be long, and streaming avoids request timeouts.
        const stream = client.beta.messages.stream(
          {
            model: CONTRACT_DRAFT_MODEL,
            max_tokens: PROPOSAL_MAX_OUTPUT_TOKENS,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            thinking: { type: "adaptive" },
            output_config: { effort: "medium", format: betaZodOutputFormat(ProposalOutputSchema) },
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
