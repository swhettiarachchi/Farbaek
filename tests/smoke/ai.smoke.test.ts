/**
 * AI provider smoke test: one small, real contract draft with each provider
 * whose key is set (Claude and/or Gemini). Skipped unless run with
 * `pnpm ai:smoke` (vitest --mode smoke), so `pnpm test` never spends credits.
 * Keys are read from the server environment and never printed.
 */
import { describe, expect, it } from "vitest";
import { createAnthropicContractDrafter } from "@/server/ai/anthropic";
import { geminiModel } from "@/server/ai/config";
import type { ContractDrafter } from "@/server/ai/contract-drafter";
import { createGeminiContractDrafter } from "@/server/ai/gemini";

const enabled = import.meta.env.MODE === "smoke";
const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
const geminiKey = process.env.GEMINI_API_KEY?.trim();

const brief = {
  taskTitle: "Add a README section that explains how to run the tests",
  projectName: "Smoke test project",
  projectDescription: "A small TypeScript project used to check that AI drafting works.",
  notes: {},
};

async function check(name: string, drafter: ContractDrafter) {
  const r = await drafter.draft(brief);
  if (!r.ok) throw new Error(`${name} draft failed: ${r.failure}`);
  console.info(`${name}: ok, model ${r.usage.model}, ${r.usage.inputTokens} input and ${r.usage.outputTokens} output tokens. Outcome: ${r.draft.outcome}`);
  expect(r.draft.outcome.length).toBeGreaterThan(0);
}

describe.skipIf(!enabled)("AI providers smoke test", () => {
  it.skipIf(!anthropicKey)("Claude drafts a contract", async () => {
    await check("Claude", createAnthropicContractDrafter());
  }, 120_000);

  it.skipIf(!geminiKey)("Gemini drafts a contract", async () => {
    await check("Gemini", createGeminiContractDrafter({ apiKey: geminiKey!, model: geminiModel() }));
  }, 120_000);

  it("has at least one provider key", () => {
    expect(Boolean(anthropicKey || geminiKey)).toBe(true);
  });
});
