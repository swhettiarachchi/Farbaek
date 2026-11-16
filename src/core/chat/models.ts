/**
 * The models a chat can use, and which one answers (stage 199, ADR 0213). People talk to Farbaek; the model behind an answer is
 * named truthfully by its product name, never presented as Farbaek's own. Auto picks by the plan and the answer style asked for,
 * through the same routing every other AI action uses. A model chosen by hand is honoured when the plan includes it.
 */
import { allowedModels, maxTier, route, TIERS, tierModels, type TierOverrides } from "@/core/agent/routing";
import type { EffectivePlan } from "@/core/billing/trial";
import { modelName } from "@/core/billing/model-names";
import type { ChatEffort } from "./protocol";

export type ChatProvider = "anthropic" | "openai";

/** OpenAI's chat model on this server: the one already priced in the rate card (the second check uses it too). */
export const OPENAI_CHAT_MODEL = "gpt-6.1-terra";

export interface ChatModelOption {
  /** "auto" or a model id. */
  id: string;
  name: string;
  about: string;
  provider: ChatProvider | null;
  /** Why it can't be chosen here, or null. */
  unavailable: string | null;
}

const ABOUT: Record<string, string> = {
  "claude-haiku-5-5": "Fastest. Everyday questions and quick drafts.",
  "claude-sonnet-5-5": "Strong all-rounder for writing, code and analysis.",
  "claude-opus-5-5": "Deep reasoning for hard problems and long documents.",
  "claude-fable-5-1": "Anthropic's most capable model, for the hardest work.",
  [OPENAI_CHAT_MODEL]: "OpenAI's model, for a second point of view.",
};

const EFFORT_TO_ROUTE = { quick: "fast", balanced: "balanced", thorough: "deep" } as const;

export interface ChatSetup {
  plan: EffectivePlan;
  /** Claude can answer on this server (Farbaek's key or the workspace's own). */
  claude: boolean;
  /** OpenAI's key is set on this server. */
  openai: boolean;
  overrides?: TierOverrides;
}

/** What the picker lists: Auto first, then each model with a reason when it can't be used. */
export function chatModelOptions(setup: ChatSetup): ChatModelOption[] {
  const options: ChatModelOption[] = [{ id: "auto", name: "Auto", about: "Farbaek picks the model for each question.", provider: null, unavailable: setup.claude || setup.openai ? null : "AI isn't connected on this server yet." }];
  const tiers = tierModels("anthropic", setup.overrides);
  const claudeAll = [...new Set(TIERS.map((t) => tiers[t] as string))];
  const allowed = new Set<string>(allowedModels(setup.plan, "anthropic", setup.overrides));
  for (const id of claudeAll) {
    options.push({
      id,
      name: modelName(id),
      about: ABOUT[id] ?? "",
      provider: "anthropic",
      unavailable: !setup.claude ? "Claude isn't connected on this server." : allowed.has(id) ? null : setup.plan.planId === "free" ? "Included in paid plans." : "Included in a larger plan.",
    });
  }
  options.push({
    id: OPENAI_CHAT_MODEL,
    name: modelName(OPENAI_CHAT_MODEL),
    about: ABOUT[OPENAI_CHAT_MODEL]!,
    provider: "openai",
    unavailable: !setup.openai ? "OpenAI isn't connected on this server yet." : maxTier(setup.plan) === "fast" ? "Included in paid plans." : null,
  });
  return options;
}

export interface ChatChoice {
  model: string;
  provider: ChatProvider;
  /** Thinking effort for the provider. */
  thinking: "low" | "medium" | "high";
  /** Set when the choice differs from what was asked: shown to the person. */
  note: string | null;
}

/** The model that answers one question. Never a model the plan doesn't include. */
export function chooseChatModel(setup: ChatSetup, wanted: string, effort: ChatEffort): ChatChoice | null {
  const thinking = effort === "quick" ? "low" : effort === "thorough" ? "high" : "medium";
  const options = chatModelOptions(setup);
  const picked = options.find((o) => o.id === wanted && o.id !== "auto");
  if (picked && picked.unavailable === null && picked.provider) return { model: picked.id, provider: picked.provider, thinking, note: null };
  const note = picked ? `${picked.name} isn't available here (${picked.unavailable!.replace(/\.$/, "").toLowerCase()}), so Farbaek chose one for you.` : null;
  if (setup.claude) {
    const r = route({ plan: setup.plan, family: "anthropic", step: "write", effort: EFFORT_TO_ROUTE[effort], overrides: setup.overrides });
    return { model: r.model, provider: "anthropic", thinking, note };
  }
  if (setup.openai && maxTier(setup.plan) !== "fast") return { model: OPENAI_CHAT_MODEL, provider: "openai", thinking, note };
  return null;
}
