/**
 * Which Studio kit a plan builds with. Kept apart from studio-kit.ts, whose
 * constants the browser uses, because it reads the plan catalog.
 */
import { checkFeature } from "../billing/entitlements";
import type { EffectivePlan } from "../billing/trial";
import type { KitTier } from "./studio-kit";

/** Paid plans (and the trial) build with Studio kit Pro; Free with the core kit. */
export function kitTierFor(plan: EffectivePlan | null): KitTier {
  return checkFeature(plan, "studio_kit_pro").allowed ? "pro" : "core";
}
