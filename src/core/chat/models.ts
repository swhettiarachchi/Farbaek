/**
 * The models a chat can use, as the picker lists them (stage 199, ADR 0213; stage 203, ADR 0220). People talk to Farbaek AI; the
 * model behind an answer is named truthfully by its product name, never presented as Farbaek's own. Auto is the default: GPT-6 Luna
 * answers first, and a stronger model comes in when a question needs one (intelligence.ts). A model chosen by hand is honoured when
 * the plan's tier includes it.
 */
import { maxTier, TIERS, type TierOverrides } from "@/core/agent/routing";
import type { EffectivePlan } from "@/core/billing/trial";
import { modelName } from "@/core/billing/model-names";
import { chatModels, type ChatProvider } from "./ladder";

export type { ChatProvider } from "./ladder";

/** OpenAI's writing model: the studio's prompt refiner uses it when Claude isn't connected (src/server/studio/refine.ts). */
export const OPENAI_CHAT_MODEL = "gpt-6.1-terra";

/** Farbaek AI's default model for chat (the owner's choice, 2026-11-17). */
export const DEFAULT_CHAT_MODEL = "gpt-6-luna";

export interface ChatModelOption {
  /** "auto" or a model id. */
  id: string;
  name: string;
  about: string;
  provider: ChatProvider | null;
  /** Why it can't be chosen here, or null. */
  unavailable: string | null;
}

export interface ChatSetup {
  plan: EffectivePlan;
  /** Claude can answer on this server (Farbaek's key or the workspace's own). */
  claude: boolean;
  /** OpenAI's key is set on this server. */
  openai: boolean;
  /** The workspace answers on its own Claude key, so its questions never go to OpenAI (ADR 0125). */
  claudeOwnKey?: boolean;
  overrides?: TierOverrides;
}

/** What the picker lists: Auto first, then each model, fastest first, with a reason when it can't be used. */
export function chatModelOptions(setup: ChatSetup): ChatModelOption[] {
  const top = TIERS.indexOf(maxTier(setup.plan));
  const openai = setup.openai && !setup.claudeOwnKey;
  const options: ChatModelOption[] = [
    {
      id: "auto",
      name: "Auto",
      // Said from what this workspace can really use.
      about: openai ? `${modelName(DEFAULT_CHAT_MODEL)} first, and a stronger model when a question needs one.` : "Claude, with a stronger model when a question needs one.",
      provider: null,
      unavailable: setup.claude || setup.openai ? null : "AI isn't connected on this server yet.",
    },
  ];
  for (const m of chatModels(setup.overrides)) {
    const connected = m.provider === "anthropic" ? setup.claude : setup.openai;
    options.push({
      id: m.id,
      name: modelName(m.id),
      about: m.about,
      provider: m.provider,
      unavailable: m.provider === "openai" && setup.claudeOwnKey
        ? "This workspace answers on its own Claude key."
        : !connected
        ? m.provider === "anthropic"
          ? "Claude isn't connected on this server."
          : "OpenAI isn't connected on this server yet."
        : TIERS.indexOf(m.tier) <= top
          ? null
          : setup.plan.planId === "free"
            ? "Included in paid plans."
            : "Included in a larger plan.",
    });
  }
  return options;
}
