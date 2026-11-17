/**
 * The models behind Farbaek AI's chat, in one place (stage 203, ADR 0220). Each model sits on a tier of the same ladder the rest of
 * Farbaek uses (fast, standard, strong, frontier), with one from each provider at the same price where there is one:
 *
 *   fast      Claude Haiku 5.5   GPT-6 Luna      $0.10 in, $0.50 out per million tokens
 *   standard  Claude Sonnet 5.5  GPT-6.1 Sol     $2 in, $10 out (GPT-6.1 Terra, $1 and $5, for writing and pictures)
 *   strong    Claude Opus 5.5    GPT-6.1 Sol     $4 and $20; Sol thinks harder here
 *   frontier  Claude Fable 5.1   GPT-6 Astra     $10 and $50
 *
 * A plan's tier ceiling (`maxTier`) therefore bounds what an answer can cost whichever provider writes it. Adding a model is one entry
 * here, plus its price in rate-card.ts and its name in model-names.ts. Claude's tiers follow Farbaek's runtime switches (ADR 0090).
 */
import { TIERS, tierModels, type Tier, type TierOverrides } from "@/core/agent/routing";

export type ChatProvider = "anthropic" | "openai";

/** What a question is mostly about, read from its words and files (intelligence.ts). */
export type QuestionKind = "code" | "reasoning" | "analysis" | "writing" | "everyday";

export interface ChatModelSpec {
  id: string;
  provider: ChatProvider;
  tier: Tier;
  /** One line for the picker. */
  about: string;
}

/** OpenAI's models, by tier. Claude's come from the shared ladder, so a runtime switch reaches chat too. */
const OPENAI: ChatModelSpec[] = [
  { id: "gpt-6-luna", provider: "openai", tier: "fast", about: "Farbaek AI's everyday model: quick, clear answers." },
  { id: "gpt-6.1-terra", provider: "openai", tier: "standard", about: "Clear, natural writing, and questions about pictures." },
  { id: "gpt-6.1-sol", provider: "openai", tier: "standard", about: "Complex reasoning, maths and code, at a lower cost." },
  { id: "gpt-6-astra", provider: "openai", tier: "frontier", about: "OpenAI's most capable model, for the hardest work." },
];

const CLAUDE_ABOUT: Record<Tier, string> = {
  fast: "Fast. Everyday questions and quick drafts.",
  standard: "Strong all-rounder for writing, code and analysis.",
  strong: "Deep reasoning for hard problems and long documents.",
  frontier: "Anthropic's most capable model, for the hardest work.",
};

/** Every chat model, fastest first: GPT-6 Luna, Farbaek AI's default, then the rest by tier. */
export function chatModels(overrides?: TierOverrides): ChatModelSpec[] {
  const claude = tierModels("anthropic", overrides);
  const seen = new Set<string>();
  const out: ChatModelSpec[] = [];
  for (const tier of TIERS) {
    const here: ChatModelSpec[] = [...OPENAI.filter((m) => m.tier === tier), { id: claude[tier], provider: "anthropic", tier, about: CLAUDE_ABOUT[tier] }];
    for (const m of here) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

/** A model's tier and provider, or null for one this list doesn't know. */
export function chatModel(id: string, overrides?: TierOverrides): ChatModelSpec | null {
  return chatModels(overrides).find((m) => m.id === id) ?? null;
}

/** The model a provider answers with at a tier, for a kind of question (and whether pictures came with it). */
export function modelAt(provider: ChatProvider, tier: Tier, kind: QuestionKind, pictures: boolean, overrides?: TierOverrides): string {
  if (provider === "anthropic") return tierModels("anthropic", overrides)[tier];
  if (tier === "fast") return "gpt-6-luna";
  if (tier === "frontier") return "gpt-6-astra";
  // OpenAI describes Terra for "visual reasoning ... clear, natural writing", and Sol for complex work; Sol again at strong, thinking harder.
  return tier === "standard" && (kind === "writing" || pictures) ? "gpt-6.1-terra" : "gpt-6.1-sol";
}

/**
 * Who answers first at each tier. At the fast tier it's always GPT-6 Luna, Farbaek AI's default (the owner's choice, 2026-11-17).
 * Above it, by what each provider says its models are for: Claude for code, careful analysis and long documents; OpenAI for maths
 * and step-by-step reasoning (Sol and Astra: "complex reasoning and coding"), writing and pictures (Terra). The other provider
 * always stands by. One table, so it can be tuned from the answers' ratings later without touching the rules.
 */
const LEAD_ABOVE_FAST: Record<QuestionKind, ChatProvider> = {
  code: "anthropic",
  analysis: "anthropic",
  reasoning: "openai",
  writing: "openai",
  everyday: "openai",
};

export function leadAt(tier: Tier, kind: QuestionKind): ChatProvider {
  return tier === "fast" ? "openai" : LEAD_ABOVE_FAST[kind];
}
