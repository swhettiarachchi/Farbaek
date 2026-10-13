/**
 * The versioned plan catalog. One source of truth for the marketing site, the
 * pricing page, entitlement checks and (later) checkout. Values are the owner
 * defaults from docs/FARBAEK_MASTER_SPEC.md section 15.
 *
 * Prices are stored in integer cents. Annual prices are charged upfront.
 */

export const PLAN_CATALOG_VERSION = "2026-10-13.1";
export const BILLING_CURRENCY = "USD";

export type PlanId = "free" | "developer" | "team" | "business" | "enterprise";
export type BillingInterval = "month" | "year";

export type FeatureKey =
  | "basic_policies"
  | "action_receipts"
  | "community_support"
  | "developer_api"
  | "usage_alerts"
  | "basic_simulations"
  | "advanced_approvals"
  | "policy_builder"
  | "shadow_mode"
  | "replay_and_recovery"
  | "team_collaboration"
  | "advanced_rbac"
  | "incident_response"
  | "advanced_autonomy"
  | "impact_analysis"
  | "evidence_exports"
  | "priority_support";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  basic_policies: "Basic policies",
  action_receipts: "Action receipts",
  community_support: "Community support",
  developer_api: "Developer API and SDK access",
  usage_alerts: "Usage alerts",
  basic_simulations: "Basic simulations",
  advanced_approvals: "Advanced approval workflows",
  policy_builder: "Policy builder",
  shadow_mode: "Shadow mode",
  replay_and_recovery: "Basic replay and supported recovery",
  team_collaboration: "Team collaboration",
  advanced_rbac: "Advanced roles and permissions",
  incident_response: "Incident response tools",
  advanced_autonomy: "Advanced autonomy policies",
  impact_analysis: "Impact analysis",
  evidence_exports: "Evidence exports",
  priority_support: "Priority support",
};

/** `null` means the value is set by contract (Enterprise). */
export interface PlanLimits {
  workspaces: number | null;
  seats: number | null;
  agents: number | null;
  evaluationsPerMonth: number | null;
  historyDays: number | null;
  integrations: number | null;
  aiCreditsPerMonth: number | null;
}

export type PlanPricing =
  | { kind: "free" }
  | { kind: "paid"; monthlyCents: number; annualCents: number }
  | { kind: "contract" };

export interface Plan {
  id: PlanId;
  name: string;
  summary: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  /** Shown instead of the numeric workspace cap where the owner has not published one. */
  workspacesLabel?: string;
  /** Cumulative: every feature this plan includes. */
  features: readonly FeatureKey[];
  recommendedFor?: string;
}

const FREE_FEATURES = ["basic_policies", "action_receipts", "community_support"] as const satisfies readonly FeatureKey[];
const DEVELOPER_FEATURES = [...FREE_FEATURES, "developer_api", "usage_alerts", "basic_simulations"] as const satisfies readonly FeatureKey[];
const TEAM_FEATURES = [
  ...DEVELOPER_FEATURES,
  "advanced_approvals",
  "policy_builder",
  "shadow_mode",
  "replay_and_recovery",
  "team_collaboration",
] as const satisfies readonly FeatureKey[];
const BUSINESS_FEATURES = [
  ...TEAM_FEATURES,
  "advanced_rbac",
  "incident_response",
  "advanced_autonomy",
  "impact_analysis",
  "evidence_exports",
  "priority_support",
] as const satisfies readonly FeatureKey[];

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    summary: "For trying Farbaek on one project.",
    pricing: { kind: "free" },
    limits: {
      workspaces: 1,
      seats: 1,
      agents: 2,
      evaluationsPerMonth: 2_000,
      historyDays: 7,
      integrations: 1,
      aiCreditsPerMonth: 20,
    },
    features: FREE_FEATURES,
  },
  {
    id: "developer",
    name: "Developer",
    summary: "For a solo builder shipping real work.",
    pricing: { kind: "paid", monthlyCents: 1_900, annualCents: 18_000 },
    limits: {
      workspaces: 1,
      seats: 1,
      agents: 5,
      evaluationsPerMonth: 25_000,
      historyDays: 30,
      integrations: 3,
      aiCreditsPerMonth: 100,
    },
    features: DEVELOPER_FEATURES,
  },
  {
    id: "team",
    name: "Team",
    summary: "For small teams that review and approve together.",
    pricing: { kind: "paid", monthlyCents: 7_900, annualCents: 75_600 },
    limits: {
      // PENDING OWNER CONFIRMATION: the spec says "per config". This cap is enforced
      // but not published; the UI shows `workspacesLabel` instead.
      workspaces: 5,
      seats: 5,
      agents: 20,
      evaluationsPerMonth: 100_000,
      historyDays: 90,
      integrations: 5,
      aiCreditsPerMonth: 500,
    },
    workspacesLabel: "Multiple",
    features: TEAM_FEATURES,
    recommendedFor: "teams",
  },
  {
    id: "business",
    name: "Business",
    summary: "For organizations that need governance and evidence.",
    pricing: { kind: "paid", monthlyCents: 24_900, annualCents: 238_800 },
    limits: {
      // PENDING OWNER CONFIRMATION: see the Team plan note.
      workspaces: 20,
      seats: 20,
      agents: 100,
      evaluationsPerMonth: 500_000,
      historyDays: 365,
      integrations: 10,
      aiCreditsPerMonth: 2_500,
    },
    workspacesLabel: "Multiple",
    features: BUSINESS_FEATURES,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    summary: "Custom contract. Capabilities are listed only once they are implemented.",
    pricing: { kind: "contract" },
    limits: {
      workspaces: null,
      seats: null,
      agents: null,
      evaluationsPerMonth: null,
      historyDays: null,
      integrations: null,
      aiCreditsPerMonth: null,
    },
    features: BUSINESS_FEATURES,
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Plans that can be shown as self-serve cards (everything except Enterprise). */
export const SELF_SERVE_PLANS = PLANS.filter((p) => p.pricing.kind !== "contract");

export function annualSavingsCents(plan: Plan): number {
  if (plan.pricing.kind !== "paid") return 0;
  return plan.pricing.monthlyCents * 12 - plan.pricing.annualCents;
}

/** The annual price divided by 12. Only shown next to the upfront annual amount. */
export function annualMonthlyEquivalentCents(plan: Plan): number {
  if (plan.pricing.kind !== "paid") return 0;
  return plan.pricing.annualCents / 12;
}

/** The smallest self-serve plan that includes a feature, for upgrade hints. */
export function cheapestPlanWithFeature(feature: FeatureKey): PlanId | null {
  return SELF_SERVE_PLANS.find((p) => p.features.includes(feature))?.id ?? null;
}

/**
 * The 14-day Team trial. Internal to Farbaek: it is never created as a payment
 * provider trial, because provider trials take a $0 card mandate.
 */
export const TRIAL = {
  lengthDays: 14,
  basePlan: "team" as const satisfies PlanId,
  limits: {
    workspaces: 5,
    seats: 3,
    agents: 5,
    integrations: 3,
    evaluationsTotal: 10_000,
    historyDays: 30,
    aiCreditsTotal: 100,
  },
  reminderDays: [7, 12, 13] as const,
};

const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: BILLING_CURRENCY, maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: BILLING_CURRENCY, minimumFractionDigits: 2 });

/** "$19" for whole dollars, "$15.50" otherwise. */
export function formatUsd(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}
