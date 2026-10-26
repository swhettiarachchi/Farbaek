/**
 * Auto routing (ADR 0021): Farbaek picks the model for each step, so people
 * get strong results without choosing models or paying frontier prices for
 * reading files.
 *
 * - Reading, searching, planning and summaries go to the fast model.
 * - Writing code and drafting go to the standard model.
 * - Deep effort, or two failures in a row, step up to the strong model on
 *   plans that include it (Pro and up), and Deep goes to the frontier model
 *   on Max 2x and up.
 * - Free uses the fast model only.
 *
 * People choose an effort (Fast, Balanced, Deep). Pro and up may pin a
 * model they're entitled to. Every choice is re-checked on the server, so a
 * request can never reach a model its plan doesn't include.
 */
import { getPlan } from "../billing/catalog";
import type { ModelId } from "../billing/rate-card";
import type { EffectivePlan } from "../billing/trial";

export const EFFORTS = ["fast", "balanced", "deep"] as const;
export type Effort = (typeof EFFORTS)[number];

export const EFFORT_LABELS: Record<Effort, { title: string; detail: string }> = {
  fast: { title: "Fast", detail: "The quickest models. Stretches your usage furthest." },
  balanced: { title: "Balanced", detail: "Farbaek picks the model for each step. Recommended." },
  deep: { title: "Deep", detail: "The strongest model your plan includes, for hard problems. Uses your usage faster." },
};

/** What a step does, which decides how much model it needs. */
export type StepKind = "read" | "plan" | "write" | "review";

export type ModelFamily = "anthropic" | "gemini";

/** Model tiers, from cheapest to most capable. */
export const TIERS = ["fast", "standard", "strong", "frontier"] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_MODELS: Record<ModelFamily, Record<Tier, ModelId>> = {
  anthropic: { fast: "claude-haiku-5-5", standard: "claude-sonnet-5-5", strong: "claude-opus-5-5", frontier: "claude-fable-5-1" },
  // Gemini has no frontier tier above Argon.
  gemini: { fast: "gemini-3.5-flash-lite", standard: "gemini-3.8-flash", strong: "gemini-4-argon", frontier: "gemini-4-argon" },
};

/** A tier switched to another priced model at runtime (ADR 0090). Applies to Anthropic only. */
export type TierOverrides = Partial<Record<Tier, ModelId>>;

/** The models each tier routes to, with Farbaek's runtime switches applied. */
export function tierModels(family: ModelFamily, overrides?: TierOverrides): Record<Tier, ModelId> {
  return family === "anthropic" && overrides ? { ...TIER_MODELS.anthropic, ...overrides } : TIER_MODELS[family];
}

/** The most capable tier a plan includes. */
export function maxTier(plan: EffectivePlan): Tier {
  const features = getPlan(plan.planId).features;
  if (features.includes("fable_models")) return "frontier";
  if (features.includes("opus_models")) return "strong";
  return plan.planId === "free" ? "fast" : "standard";
}

const rank = (t: Tier) => TIERS.indexOf(t);
const cap = (t: Tier, max: Tier): Tier => (rank(t) > rank(max) ? max : t);

/** The models a plan may use, cheapest first, without duplicates. */
export function allowedModels(plan: EffectivePlan, family: ModelFamily, overrides?: TierOverrides): ModelId[] {
  const max = maxTier(plan);
  const models = tierModels(family, overrides);
  return [...new Set(TIERS.filter((t) => rank(t) <= rank(max)).map((t) => models[t]))];
}

/** The tier a step needs at an effort, before the plan's cap. */
function wantedTier(step: StepKind, effort: Effort, failures: number): Tier {
  if (effort === "fast") return "fast";
  if (effort === "deep") return step === "read" ? "standard" : "frontier";
  // Balanced: cheap for reading and planning, standard for writing and review, a step up after two failures.
  const base: Tier = step === "read" || step === "plan" ? "fast" : "standard";
  return failures >= 2 ? TIERS[Math.min(rank(base) + 1, rank("strong"))]! : base;
}

export interface RouteInput {
  plan: EffectivePlan;
  family: ModelFamily;
  step: StepKind;
  effort: Effort;
  /** A model the person pinned, honoured only when the plan includes it (Pro and up). */
  pinned?: string | null;
  /** Failed attempts at this step in a row. */
  failures?: number;
  /** Farbaek's runtime switches (ADR 0090). */
  overrides?: TierOverrides;
}

export interface RouteChoice {
  model: ModelId;
  tier: Tier;
  /** Thinking effort for the provider. */
  thinking: "low" | "medium" | "high";
  /** Set when the choice differs from what was asked: shown to the person. */
  note: string | null;
}

export function route(input: RouteInput): RouteChoice {
  const max = maxTier(input.plan);
  const thinking = input.effort === "fast" ? "low" : input.effort === "deep" ? "high" : "medium";
  const allowed = allowedModels(input.plan, input.family, input.overrides);
  const models = tierModels(input.family, input.overrides);

  if (input.pinned) {
    const pinTier = TIERS.find((t) => models[t] === input.pinned);
    const canPin = rank(max) >= rank("strong");
    if (pinTier && canPin && allowed.includes(models[pinTier])) {
      return { model: models[pinTier], tier: pinTier, thinking, note: null };
    }
    const tier = cap(wantedTier(input.step, input.effort, input.failures ?? 0), max);
    const why = canPin ? "isn't included in this plan" : "can be chosen from the Pro plan up";
    return { model: models[tier], tier, thinking, note: `That model ${why}, so Farbaek chose one for you.` };
  }

  const wanted = wantedTier(input.step, input.effort, input.failures ?? 0);
  const tier = cap(wanted, max);
  const note = max === "fast" && rank(wanted) > rank(max) ? "Free uses fast models. Paid plans use stronger ones for writing code." : null;
  return { model: models[tier], tier, thinking, note };
}
