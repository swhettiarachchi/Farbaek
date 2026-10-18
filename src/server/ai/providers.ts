/**
 * Builds the drafter and proposer for the provider this server resolves to
 * (./config.ts) and the model Auto routing chose (src/core/agent/routing.ts).
 * Callers check resolveAiProvider() first and show its reason when no
 * provider is connected.
 */
import { createAnthropicChangeProposer, createAnthropicContractDrafter } from "./anthropic";
import type { ChangeProposer } from "./change-proposer";
import type { AiProviderId } from "./config";
import type { ContractDrafter } from "./contract-drafter";
import { createGeminiChangeProposer, createGeminiContractDrafter } from "./gemini";

/** The model and thinking effort Auto routing chose. */
export interface ModelSelection {
  model: string;
  thinking: "low" | "medium" | "high";
}

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY isn't set.");
  return key;
}

export function createContractDrafter(provider: AiProviderId, selection: ModelSelection): ContractDrafter {
  return provider === "gemini"
    ? createGeminiContractDrafter({ apiKey: geminiKey(), model: selection.model })
    : createAnthropicContractDrafter({ model: selection.model, effort: selection.thinking });
}

export function createChangeProposer(provider: AiProviderId, selection: ModelSelection): ChangeProposer {
  return provider === "gemini"
    ? createGeminiChangeProposer({ apiKey: geminiKey(), model: selection.model })
    : createAnthropicChangeProposer({ model: selection.model, effort: selection.thinking });
}
