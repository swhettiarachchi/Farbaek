/**
 * The platform switches as this server last read them (ADR 0032). Reading
 * them is synchronous, so the existing "is AI connected?" style checks can
 * explain a pause without becoming async. The snapshot refreshes every 15
 * seconds when a page loads, and at once when Office Space changes a switch
 * on this server. If the switches can't be read, nothing shows as paused
 * here, but the database still refuses paused work: this only explains.
 */
import { FLAG_DETAILS, PLATFORM_FLAGS, type PlatformFlag } from "@/core/office/flags";
import { pricedModel } from "@/core/ai/model-canary";
import { TIERS, type Tier, type TierOverrides } from "@/core/agent/routing";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

interface Snapshot {
  readAt: number;
  paused: Map<PlatformFlag, string>;
  /** Tiers an owner switched to another priced model (ADR 0090). */
  models: TierOverrides;
}

const TTL_MS = 15_000;
const store = globalThis as typeof globalThis & { __farbaekPlatform?: Snapshot };

/** The reason a feature is paused, or null when it isn't (or the switches haven't been read). */
export function platformPause(flag: PlatformFlag): string | null {
  return store.__farbaekPlatform?.paused.get(flag) ?? null;
}

/** The tiers switched to another model (ADR 0090); empty when none are, or the switches haven't been read. */
export function platformModels(): TierOverrides {
  return store.__farbaekPlatform?.models ?? {};
}

/** Only rows for a known tier and a model Farbaek has a price for take effect; anything else leaves the tier on its default. */
export function overridesFrom(rows: readonly { tier: string; model: string }[]): TierOverrides {
  const out: TierOverrides = {};
  for (const r of rows) {
    const tier = TIERS.find((t) => t === r.tier) as Tier | undefined;
    const model = pricedModel(r.model);
    if (tier && model) out[tier] = model;
  }
  return out;
}

/** Reads the switches if the snapshot is older than 15 seconds (or `force`). Never throws. */
export async function refreshPlatformState(force = false): Promise<void> {
  const current = store.__farbaekPlatform;
  if (!force && current && Date.now() - current.readAt < TTL_MS) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  try {
    const [{ data, error }, models] = await Promise.all([
      admin.from("platform_flags").select("key, paused, public_message"),
      admin.from("platform_models").select("tier, model").eq("family", "anthropic"),
    ]);
    if (error) return;
    const paused = new Map<PlatformFlag, string>();
    for (const row of (data ?? []) as { key: string; paused: boolean; public_message: string | null }[]) {
      const flag = PLATFORM_FLAGS.find((f) => f === row.key);
      if (flag && row.paused) paused.set(flag, row.public_message?.trim() || FLAG_DETAILS[flag].fallback);
    }
    // If the switches can't be read, keep the last ones rather than dropping to the defaults mid-incident.
    const switched = models.error ? (current?.models ?? {}) : overridesFrom((models.data ?? []) as { tier: string; model: string }[]);
    store.__farbaekPlatform = { readAt: Date.now(), paused, models: switched };
  } catch {
    // Keep the last snapshot; the database still enforces.
  }
}

/** After Office Space changes a switch, so this server explains it at once. */
export function notePlatformFlag(flag: PlatformFlag, paused: boolean, message: string | null): void {
  const current = store.__farbaekPlatform ?? { readAt: 0, paused: new Map<PlatformFlag, string>(), models: {} };
  const next = new Map(current.paused);
  if (paused) next.set(flag, message?.trim() || FLAG_DETAILS[flag].fallback);
  else next.delete(flag);
  store.__farbaekPlatform = { readAt: current.readAt, paused: next, models: current.models };
}

/** After Office Space switches a tier (or returns it to its default, `model` null), so this server routes to it at once. */
export function notePlatformModel(tier: Tier, model: string | null): void {
  const current = store.__farbaekPlatform ?? { readAt: 0, paused: new Map<PlatformFlag, string>(), models: {} };
  const models: TierOverrides = { ...current.models };
  const priced = model ? pricedModel(model) : null;
  if (priced) models[tier] = priced;
  else delete models[tier];
  store.__farbaekPlatform = { readAt: current.readAt, paused: current.paused, models };
}
