/**
 * Server-authoritative entitlement decisions. Every check fails closed: if the
 * entitlement state is unknown, protected work is refused. A short list of
 * safety and data-access operations stays available in every state.
 */
import { PLAN_ORDER, cheapestPlanWithFeature, getPlan, type FeatureKey, type PlanId, type PlanLimits } from "./catalog";
import type { EffectivePlan } from "./trial";

export type EntitlementErrorCode =
  | "QUOTA_EXCEEDED"
  | "FEATURE_NOT_IN_PLAN"
  | "TRIAL_CAP_REACHED"
  | "BILLING_SUSPENDED"
  | "ENTITLEMENT_UNAVAILABLE";

export type EntitlementDecision =
  | { allowed: true }
  | { allowed: false; code: EntitlementErrorCode; message: string; upgradeTo?: PlanId };

export type Meter = "workspaces" | "seats" | "agents" | "integrations" | "evaluations" | "ai_usage";

const METER_LIMIT: Record<Meter, keyof PlanLimits> = {
  workspaces: "workspaces",
  seats: "seats",
  agents: "agents",
  integrations: "integrations",
  evaluations: "evaluationsPerMonth",
  ai_usage: "aiUnitsPerMonth",
};

/** Available at every quota level, in every billing state, even when entitlements can't be read. */
export const ALWAYS_AVAILABLE_OPERATIONS = [
  "audit.read",
  "project.export",
  "billing.manage",
  "agent.emergency_pause",
  "permission.revoke",
] as const;

export type AlwaysAvailableOperation = (typeof ALWAYS_AVAILABLE_OPERATIONS)[number];

const ALLOW: EntitlementDecision = { allowed: true };

function unavailable(): EntitlementDecision {
  return {
    allowed: false,
    code: "ENTITLEMENT_UNAVAILABLE",
    message: "Your plan could not be confirmed, so this action is paused. Safety controls, exports and billing still work.",
  };
}

export function checkAlwaysAvailable(operation: string): operation is AlwaysAvailableOperation {
  return (ALWAYS_AVAILABLE_OPERATIONS as readonly string[]).includes(operation);
}

export function checkFeature(plan: EffectivePlan | null, feature: FeatureKey): EntitlementDecision {
  if (!plan) return unavailable();
  const features = getPlan(plan.planId).features;
  if (features.includes(feature)) return ALLOW;

  if (plan.suspendedFrom && getPlan(plan.suspendedFrom).features.includes(feature)) {
    return {
      allowed: false,
      code: "BILLING_SUSPENDED",
      message: "Paid features are paused until billing is resolved. Your data is preserved.",
    };
  }

  return {
    allowed: false,
    code: "FEATURE_NOT_IN_PLAN",
    message: "This feature isn't included in your current plan.",
    upgradeTo: cheapestPlanWithFeature(feature) ?? undefined,
  };
}

/**
 * Checks whether `requested` more units fit under the plan's limit.
 * `used` must come from the server-side ledger, inside the same transaction
 * that records the new usage.
 */
export function checkQuota(
  plan: EffectivePlan | null,
  meter: Meter,
  usage: { used: number; requested?: number },
): EntitlementDecision {
  if (!plan) return unavailable();
  const requested = usage.requested ?? 1;
  if (!Number.isInteger(usage.used) || !Number.isInteger(requested) || usage.used < 0 || requested < 1) {
    return unavailable();
  }

  const limit = plan.limits[METER_LIMIT[meter]];
  // null means "set by contract"; contract limits are enforced by their own config.
  if (limit === null) return unavailable();
  if (usage.used + requested <= limit) return ALLOW;

  const trial = plan.source === "trial";
  const specific = limitMessage(meter, limit, trial ? "Your trial" : `Your ${getPlan(plan.planId).name} plan`);
  if (trial) {
    return {
      allowed: false,
      code: "TRIAL_CAP_REACHED",
      message: specific ?? "You've reached a trial limit. Choose a plan to keep going, or continue on Free.",
      upgradeTo: "plus",
    };
  }

  return {
    allowed: false,
    code: "QUOTA_EXCEEDED",
    message: specific ?? "You've reached this plan's limit for the current period.",
    upgradeTo: nextPlanWithHigherLimit(plan.planId, meter, usage.used + requested),
  };
}

/**
 * What a reached limit means and how to get past it, for the limits people
 * meet in everyday work. It names the count and a way forward that works
 * today; it doesn't say "choose a plan" while plans can't be bought.
 */
function limitMessage(meter: Meter, limit: number, whose: string): string | null {
  if (meter === "workspaces") {
    const inUse = limit === 1 ? "it's in use" : `all ${limit} are in use`;
    return `${whose} includes ${limit} ${limit === 1 ? "project" : "projects"}, and ${inUse}. Archive one you've finished to make room, or see the plans with more on the pricing page.`;
  }
  if (meter === "seats") {
    return `${whose} includes ${limit} ${limit === 1 ? "seat" : "seats"}, and ${limit === 1 ? "it's" : "all are"} taken. Remove someone who no longer needs access, or see the plans with more on the pricing page.`;
  }
  return null;
}

function nextPlanWithHigherLimit(current: PlanId, meter: Meter, needed: number): PlanId | undefined {
  const start = PLAN_ORDER.indexOf(current);
  for (const id of PLAN_ORDER.slice(start + 1)) {
    // Hints name the plans on the pricing cards; a yearly version is chosen from its monthly plan's card.
    if (getPlan(id).yearlyOf) continue;
    const limit = getPlan(id).limits[METER_LIMIT[meter]];
    if (limit !== null && limit >= needed) return id;
  }
  return undefined;
}

/** Usage level for 80% and 100% alerts. */
export function quotaAlertLevel(used: number, limit: number | null): "ok" | "warning" | "reached" {
  if (limit === null || limit <= 0) return "ok";
  if (used >= limit) return "reached";
  if (used >= limit * 0.8) return "warning";
  return "ok";
}
