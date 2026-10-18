/**
 * The versioned plan catalog: the one source of truth for the pricing page,
 * Billing, entitlement checks and (later) checkout. Prices are the owner's
 * (2026-10-18). Every AI and sandbox allowance comes from allowance.ts, so a
 * plan keeps a 40% margin after payment fees even when fully used.
 *
 * Prices are integer cents, monthly. Annual billing waits for payments: a
 * discount would cut the margin unless allowances shrink, and that choice
 * belongs at go-live (docs/billing/go-live.md).
 */
import { allowanceFor, sessionsGuide, type Allowance } from "./allowance";
import { USD_PER_UNIT } from "./rate-card";

export const PLAN_CATALOG_VERSION = "2026-10-18.1";
export const BILLING_CURRENCY = "USD";

export type PlanId = "free" | "starter" | "plus" | "pro" | "studio" | "max" | "max_2x" | "max_3x" | "enterprise";
export const PAID_PLAN_IDS = ["starter", "plus", "pro", "studio", "max", "max_2x", "max_3x", "enterprise"] as const satisfies readonly PlanId[];

export type FeatureKey =
  | "cloud_agent"
  | "basic_policies"
  | "action_receipts"
  | "community_support"
  | "usage_rollover"
  | "free_retries"
  | "developer_api"
  | "usage_alerts"
  | "live_previews"
  | "security_checks"
  | "replay_and_recovery"
  | "opus_models"
  | "advanced_approvals"
  | "policy_builder"
  | "shadow_mode"
  | "team_collaboration"
  | "advanced_rbac"
  | "priority_support"
  | "fable_models"
  | "incident_response"
  | "impact_analysis"
  | "advanced_autonomy"
  | "evidence_exports";

export const FEATURE_LABELS: Record<FeatureKey, string> = {
  cloud_agent: "Farbaek Agent in the cloud",
  basic_policies: "Basic policies",
  action_receipts: "Action receipts",
  community_support: "Community support",
  usage_rollover: "Unused AI usage carries over a month",
  free_retries: "Failed attempts given back",
  developer_api: "Developer API and SDK access",
  usage_alerts: "Usage alerts",
  live_previews: "Live previews of running apps",
  security_checks: "Security checks",
  replay_and_recovery: "Replay and undo of applied changes",
  opus_models: "Claude Opus on Deep effort",
  advanced_approvals: "Advanced approval workflows",
  policy_builder: "Policy builder",
  shadow_mode: "Shadow mode",
  team_collaboration: "Team collaboration",
  advanced_rbac: "Advanced roles and permissions",
  priority_support: "Priority support",
  fable_models: "Claude Fable on Deep effort, the most capable model",
  incident_response: "Incident response tools",
  impact_analysis: "Impact analysis",
  advanced_autonomy: "Advanced autonomy policies",
  evidence_exports: "Evidence exports",
};

/**
 * Whether a feature works today. Pricing shows coming features with a
 * "Coming soon" label, never as available. Flip each one as it ships.
 */
export const FEATURE_STATUS: Record<FeatureKey, "live" | "coming"> = {
  cloud_agent: "coming",
  basic_policies: "live",
  action_receipts: "live",
  community_support: "live",
  usage_rollover: "live",
  free_retries: "live",
  developer_api: "live",
  usage_alerts: "live",
  live_previews: "coming",
  security_checks: "coming",
  replay_and_recovery: "live",
  opus_models: "live",
  advanced_approvals: "live",
  policy_builder: "coming",
  shadow_mode: "coming",
  team_collaboration: "live",
  advanced_rbac: "coming",
  priority_support: "coming",
  fable_models: "live",
  incident_response: "coming",
  impact_analysis: "coming",
  advanced_autonomy: "coming",
  evidence_exports: "live",
};

/** `null` means the value is set by contract (Enterprise). */
export interface PlanLimits {
  /** Active projects. */
  workspaces: number | null;
  seats: number | null;
  agents: number | null;
  evaluationsPerMonth: number | null;
  historyDays: number | null;
  integrations: number | null;
  /** AI usage per month in internal units (1 unit = $0.0001 of provider list cost). Never shown as a number. */
  aiUnitsPerMonth: number | null;
  /** Units that free retries may give back per month. */
  retryUnitsPerMonth: number | null;
  /** Provisioned sandbox hours per month. */
  sandboxHours: number | null;
}

export type PlanPricing = { kind: "free" } | { kind: "paid"; monthlyCents: number } | { kind: "contract" };

export interface Plan {
  id: PlanId;
  name: string;
  summary: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  /** Cumulative: every feature this plan includes. */
  features: readonly FeatureKey[];
  recommendedFor?: string;
}

const FREE_FEATURES = ["cloud_agent", "basic_policies", "action_receipts", "community_support", "live_previews"] as const satisfies readonly FeatureKey[];
const STARTER_FEATURES = [...FREE_FEATURES, "usage_rollover", "free_retries", "developer_api", "usage_alerts"] as const satisfies readonly FeatureKey[];
const PLUS_FEATURES = [...STARTER_FEATURES, "security_checks", "replay_and_recovery"] as const satisfies readonly FeatureKey[];
const PRO_FEATURES = [...PLUS_FEATURES, "opus_models", "advanced_approvals", "policy_builder", "shadow_mode"] as const satisfies readonly FeatureKey[];
const STUDIO_FEATURES = [...PRO_FEATURES, "team_collaboration"] as const satisfies readonly FeatureKey[];
const MAX_FEATURES = [...STUDIO_FEATURES, "advanced_rbac", "priority_support"] as const satisfies readonly FeatureKey[];
const MAX_2X_FEATURES = [...MAX_FEATURES, "fable_models", "incident_response", "impact_analysis"] as const satisfies readonly FeatureKey[];
const MAX_3X_FEATURES = [...MAX_2X_FEATURES, "advanced_autonomy", "evidence_exports"] as const satisfies readonly FeatureKey[];

/** Free: about $0.50 of AI cost a month on fast models, and one sandbox hour, paid from the paid plans' margin. */
export const FREE_AI_USD = 0.5;

type FixedLimits = Omit<PlanLimits, "aiUnitsPerMonth" | "retryUnitsPerMonth" | "sandboxHours">;

function paid(id: PlanId, name: string, summary: string, priceCents: number, sandboxHours: number, rest: FixedLimits, features: readonly FeatureKey[], recommendedFor?: string): Plan {
  const a = allowanceFor(priceCents / 100, sandboxHours);
  return {
    id,
    name,
    summary,
    pricing: { kind: "paid", monthlyCents: priceCents },
    limits: { ...rest, aiUnitsPerMonth: a.aiUnits, retryUnitsPerMonth: a.retryUnits, sandboxHours },
    features,
    ...(recommendedFor ? { recommendedFor } : {}),
  };
}

export const PLANS: readonly Plan[] = [
  {
    id: "free",
    name: "Free",
    summary: "Try Farbaek on one project with fast models.",
    pricing: { kind: "free" },
    limits: {
      workspaces: 1,
      seats: 1,
      agents: 1,
      evaluationsPerMonth: 1_000,
      historyDays: 7,
      integrations: 1,
      aiUnitsPerMonth: Math.floor(FREE_AI_USD / USD_PER_UNIT),
      retryUnitsPerMonth: 0,
      sandboxHours: 1,
    },
    features: FREE_FEATURES,
  },
  paid("starter", "Starter", "For a first site or side project.", 999, 5, { workspaces: 3, seats: 1, agents: 1, evaluationsPerMonth: 5_000, historyDays: 30, integrations: 1 }, STARTER_FEATURES),
  paid("plus", "Plus", "For building and shipping on your own.", 1_999, 10, { workspaces: 10, seats: 1, agents: 2, evaluationsPerMonth: 10_000, historyDays: 30, integrations: 2 }, PLUS_FEATURES),
  paid(
    "pro",
    "Pro",
    "For regular builders who want stronger models.",
    5_000,
    25,
    { workspaces: 25, seats: 2, agents: 3, evaluationsPerMonth: 25_000, historyDays: 90, integrations: 3 },
    PRO_FEATURES,
    "builders",
  ),
  paid("studio", "Studio", "For small studios building for clients.", 7_999, 40, { workspaces: 50, seats: 3, agents: 5, evaluationsPerMonth: 50_000, historyDays: 90, integrations: 5 }, STUDIO_FEATURES),
  paid("max", "Max", "For people who build with Farbaek every day.", 10_000, 50, { workspaces: 100, seats: 5, agents: 10, evaluationsPerMonth: 100_000, historyDays: 180, integrations: 10 }, MAX_FEATURES),
  paid("max_2x", "Max 2x", "Twice Max, with the most capable model.", 20_000, 100, { workspaces: 250, seats: 10, agents: 20, evaluationsPerMonth: 250_000, historyDays: 365, integrations: 20 }, MAX_2X_FEATURES),
  paid("max_3x", "Max 3x", "Three times Max, for teams shipping all day.", 30_000, 150, { workspaces: 500, seats: 20, agents: 50, evaluationsPerMonth: 500_000, historyDays: 365, integrations: 50 }, MAX_3X_FEATURES),
  {
    id: "enterprise",
    name: "Enterprise",
    summary: "Committed usage at a custom rate, with governance and evidence.",
    pricing: { kind: "contract" },
    limits: { workspaces: null, seats: null, agents: null, evaluationsPerMonth: null, historyDays: null, integrations: null, aiUnitsPerMonth: null, retryUnitsPerMonth: null, sandboxHours: null },
    features: MAX_3X_FEATURES,
  },
];

export function getPlan(id: PlanId): Plan {
  const plan = PLANS.find((p) => p.id === id);
  if (!plan) throw new Error(`Unknown plan: ${id}`);
  return plan;
}

/** Plans shown as self-serve cards (everything except Enterprise). */
export const SELF_SERVE_PLANS = PLANS.filter((p) => p.pricing.kind !== "contract");

/** The order plans step up in, for upgrade hints. */
export const PLAN_ORDER: readonly PlanId[] = ["free", "starter", "plus", "pro", "studio", "max", "max_2x", "max_3x"];

/** The smallest self-serve plan that includes a feature, for upgrade hints. */
export function cheapestPlanWithFeature(feature: FeatureKey): PlanId | null {
  return SELF_SERVE_PLANS.find((p) => p.features.includes(feature))?.id ?? null;
}

/** Guidance for a plan's card: about how many typical agent sessions its AI usage covers on Sonnet. */
export function planSessionsGuide(plan: Plan): number | null {
  return plan.limits.aiUnitsPerMonth === null ? null : sessionsGuide(plan.limits.aiUnitsPerMonth);
}

/** The allowance behind a paid plan, for Billing and the tests. */
export function planAllowance(plan: Plan): Allowance | null {
  return plan.pricing.kind === "paid" && plan.limits.sandboxHours !== null ? allowanceFor(plan.pricing.monthlyCents / 100, plan.limits.sandboxHours) : null;
}

/**
 * The 14-day trial: Pro's features and limits, with AI usage and sandbox time
 * equal to a month of Starter (every trial is paid for from margin). Internal
 * to Farbaek: never a payment provider trial.
 */
export const TRIAL = {
  lengthDays: 14,
  basePlan: "pro" as const satisfies PlanId,
  limits: {
    workspaces: 5,
    seats: 3,
    agents: 3,
    integrations: 3,
    evaluationsTotal: 10_000,
    historyDays: 30,
    aiUnitsTotal: allowanceFor(9.99, 5).aiUnits,
    sandboxHours: 5,
  },
  reminderDays: [7, 12, 13] as const,
};

const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: BILLING_CURRENCY, maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: BILLING_CURRENCY, minimumFractionDigits: 2 });

/** "$19" for whole dollars, "$15.50" otherwise. */
export function formatUsd(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}
