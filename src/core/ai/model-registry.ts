/**
 * Every AI model Farbaek uses, in one list (stage 213, ADR 0229). Before this, a model's facts lived in five places:
 * its name (billing/model-names.ts), its price (billing/rate-card.ts), its tier (agent/routing.ts), its place in Chat
 * (chat/ladder.ts) and the feature that calls it (server/ai). Adding a provider meant finding all five by memory.
 *
 * The registry doesn't copy those: it reads the tier and Chat's line from where they are decided, and adds the facts no
 * file held as data (who makes the model, what it produces, what Farbaek uses it for, and the day its price was last read
 * from the provider's own page). `FACTS` is keyed by every model id, so a model added to the names without an entry
 * here stops the build, and model-registry.test.ts fails when the registry and the rate card disagree.
 *
 * It records only what Farbaek knows and can check. A model's context size, release date and retirement date aren't
 * here yet: they come from the providers' pages, each with the day it was read, never from memory.
 *
 * No prices: this file is safe for a page's JavaScript. What a model costs stays in rate-card.ts, on the server.
 */
import { TIERS, TIER_MODELS, type Tier } from "@/core/agent/routing";
import { MODEL_NAMES, type ModelId } from "@/core/billing/model-names";
import { chatModels, modelAt, type QuestionKind } from "@/core/chat/ladder";

export type ModelProvider = "anthropic" | "openai" | "gemini";

/** What a model produces. */
export type ModelMakes = "text" | "image" | "video";

/** What Farbaek uses a model for. */
export type ModelRole =
  /** Answers in Farbaek Chat. */
  | "chat"
  /** Plans, writes and reviews for the build agent, and drafts plans and changes. */
  | "build"
  /** Checks another model's work from a different provider (ADR 0121). */
  | "second-check"
  /** The image studio. */
  | "images"
  /** Pictures inside people's projects (ADR 0109). */
  | "project-images"
  /** The video studio. */
  | "video";

interface Facts {
  provider: ModelProvider;
  makes: ModelMakes;
  roles: readonly ModelRole[];
  /** The day (UTC) its price was last read from the provider's pricing page, where rate-card.ts records one. */
  priceReadOn: string | null;
}

const FACTS: Record<ModelId, Facts> = {
  "claude-haiku-5-5": { provider: "anthropic", makes: "text", roles: ["chat", "build"], priceReadOn: null },
  "claude-sonnet-5-5": { provider: "anthropic", makes: "text", roles: ["chat", "build"], priceReadOn: null },
  "claude-opus-5-5": { provider: "anthropic", makes: "text", roles: ["chat", "build"], priceReadOn: null },
  "claude-fable-5-1": { provider: "anthropic", makes: "text", roles: ["chat", "build"], priceReadOn: null },
  "gemini-3.5-flash-lite": { provider: "gemini", makes: "text", roles: ["build"], priceReadOn: null },
  "gemini-3.8-flash": { provider: "gemini", makes: "text", roles: ["build"], priceReadOn: null },
  "gemini-4-argon": { provider: "gemini", makes: "text", roles: ["build"], priceReadOn: null },
  "gemini-3.1-flash-lite-image": { provider: "gemini", makes: "image", roles: ["project-images"], priceReadOn: "2026-10-28" },
  "gpt-6-luna": { provider: "openai", makes: "text", roles: ["chat"], priceReadOn: "2026-11-17" },
  "gpt-6.1-terra": { provider: "openai", makes: "text", roles: ["chat", "second-check"], priceReadOn: "2026-10-30" },
  "gpt-6.1-sol": { provider: "openai", makes: "text", roles: ["chat"], priceReadOn: "2026-11-17" },
  "gpt-6-astra": { provider: "openai", makes: "text", roles: ["chat"], priceReadOn: "2026-11-17" },
  "gpt-image-2.5-sunburst": { provider: "openai", makes: "image", roles: ["images"], priceReadOn: "2026-11-17" },
  "gemini-omni-1.2-flash": { provider: "gemini", makes: "video", roles: ["video"], priceReadOn: "2026-11-17" },
};

export interface ModelEntry extends Facts {
  id: ModelId;
  /** Its product name, as people see it. */
  name: string;
  /** The tiers of the shared ladder it answers at (fast to frontier). Empty for models that sit on no ladder. */
  tiers: readonly Tier[];
  /** One line on what it's for, as Chat's picker says it. Null for models Chat doesn't offer. */
  about: string | null;
}

const KINDS: readonly QuestionKind[] = ["code", "reasoning", "analysis", "writing", "everyday"];

/** The tiers a model answers at: on the build ladder of its family, or in Chat for some kind of question. */
function tiersOf(id: ModelId): Tier[] {
  return TIERS.filter(
    (tier) =>
      TIER_MODELS.anthropic[tier] === id ||
      TIER_MODELS.gemini[tier] === id ||
      KINDS.some((kind) => [false, true].some((pictures) => modelAt("openai", tier, kind, pictures) === id)),
  );
}

function build(): ModelEntry[] {
  const inChat = new Map(chatModels().map((m) => [m.id, m.about]));
  return (Object.keys(FACTS) as ModelId[]).map((id) => ({ id, name: MODEL_NAMES[id], ...FACTS[id], tiers: tiersOf(id), about: inChat.get(id) ?? null }));
}

/** Every model, in the order of the names list. */
export const MODEL_REGISTRY: readonly ModelEntry[] = build();

/** A model's entry, or null for an id Farbaek doesn't list. */
export function registeredModel(id: string): ModelEntry | null {
  return MODEL_REGISTRY.find((m) => m.id === id) ?? null;
}

/** The models that match every part of the question asked. */
export function modelsWith(want: { provider?: ModelProvider; makes?: ModelMakes; role?: ModelRole; tier?: Tier }): ModelEntry[] {
  return MODEL_REGISTRY.filter(
    (m) =>
      (want.provider === undefined || m.provider === want.provider) &&
      (want.makes === undefined || m.makes === want.makes) &&
      (want.role === undefined || m.roles.includes(want.role)) &&
      (want.tier === undefined || m.tiers.includes(want.tier)),
  );
}

/** The providers a role can fall back across: one provider means no stand-in when it is down. */
export function providersFor(role: ModelRole): ModelProvider[] {
  return [...new Set(modelsWith({ role }).map((m) => m.provider))];
}

const DAY_MS = 86_400_000;
/** A price is checked again after this long. Providers change prices without notice. */
export const PRICE_CHECK_DAYS = 90;

/** Whether a model's price needs reading again from its provider's page: never dated, or dated too long ago. */
export function priceNeedsCheck(entry: Pick<ModelEntry, "priceReadOn">, today: Date, days: number = PRICE_CHECK_DAYS): boolean {
  if (!entry.priceReadOn) return true;
  const read = Date.parse(`${entry.priceReadOn}T00:00:00Z`);
  // Whole days, so the hour of the check doesn't move the line.
  return !Number.isFinite(read) || Math.floor((today.getTime() - read) / DAY_MS) > days;
}

/** The models whose prices need reading again, for staff to work through. */
export function pricesToCheck(today: Date, days: number = PRICE_CHECK_DAYS): ModelEntry[] {
  return MODEL_REGISTRY.filter((m) => priceNeedsCheck(m, today, days));
}
