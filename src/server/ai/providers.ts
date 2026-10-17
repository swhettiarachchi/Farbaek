/**
 * Builds the drafter and proposer for the provider this server resolves to
 * (./config.ts). Callers check resolveAiProvider() first and show its reason
 * when no provider is connected.
 */
import { createAnthropicChangeProposer, createAnthropicContractDrafter } from "./anthropic";
import type { ChangeProposer } from "./change-proposer";
import { geminiModel, type AiProviderId } from "./config";
import type { ContractDrafter } from "./contract-drafter";
import { createGeminiChangeProposer, createGeminiContractDrafter } from "./gemini";

function geminiKey(): string {
  const key = process.env.GEMINI_API_KEY?.trim();
  if (!key) throw new Error("GEMINI_API_KEY isn't set.");
  return key;
}

export function createContractDrafter(provider: AiProviderId): ContractDrafter {
  return provider === "gemini" ? createGeminiContractDrafter({ apiKey: geminiKey(), model: geminiModel() }) : createAnthropicContractDrafter();
}

export function createChangeProposer(provider: AiProviderId): ChangeProposer {
  return provider === "gemini" ? createGeminiChangeProposer({ apiKey: geminiKey(), model: geminiModel() }) : createAnthropicChangeProposer();
}
