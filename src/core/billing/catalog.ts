/**
 * The versioned plan catalog: the one source of truth for the pricing page,
 * Billing, entitlement checks and (later) checkout. Prices are the owner's
 * (2026-10-18). Every AI and sandbox allowance comes from allowance.ts, so a
 * plan keeps a 57% net margin after payment fees even when fully used (ADR 0103).
 *
 * Prices are integer cents a month. The monthly plans are billed monthly.
 * Lite and Maker (ADR 0105) are billed once a year: on a 99-cent monthly
 * charge, Dodo's 40-cent fee alone would leave less than the 57% margin.
 */
import { allowanceFor, lightAllowance, sessionsGuide, type Allowance } from "./allowance";
import { USD_PER_UNIT } from "./rate-card";

export const PLAN_CATALOG_VERSION = "2026-10-18.1";
export const BILLING_CURRENCY = "USD";

export type PlanId = "free" | "lite" | "lite_monthly" | "maker" | "maker_monthly" | "starter" | "plus" | "pro" | "studio" | "max" | "max_2x" | "max_3x" | "enterprise";
export const PAID_PLAN_IDS = ["lite", "lite_monthly", "maker", "maker_monthly", "starter", "plus", "pro", "studio", "max", "max_2x", "max_3x", "enterprise"] as const satisfies readonly PlanId[];

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
  | "site_publishing"
  | "studio_kit_pro"
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
  basic_policies: "Built-in rules",
  action_receipts: "A signed record of each change you apply",
  community_support: "Community support",
  usage_rollover: "Unused AI usage carries over a month",
  free_retries: "Failed attempts given back",
  developer_api: "Developer API and SDK access",
  usage_alerts: "Usage alerts",
  live_previews: "Live previews of running apps",
  site_publishing: "Publish sites at their own address, after Farbaek's rules check",
  studio_kit_pro: "Studio kit Pro: more looks, story chapters and carousels for your sites",
  security_checks: "Full security checks: package audits, code scanning and an AI review",
  replay_and_recovery: "Replay and undo of applied changes",
  opus_models: "Claude Opus for the hardest tasks",
  advanced_approvals: "Advanced approval workflows",
  policy_builder: "Write your own rules",
  shadow_mode: "Practice mode",
  team_collaboration: "Team collaboration",
  advanced_rbac: "Advanced roles and permissions",
  priority_support: "Priority support",
  fable_models: "Claude Fable, the most capable model, for the hardest tasks",
  incident_response: "Tools for working through problems",
  impact_analysis: "See what a change could affect",
  advanced_autonomy: "More changes that can apply on their own",
  evidence_exports: "Export your proof",
};

/**
 * Whether a feature works today. Pricing shows coming features with a
 * "Coming soon" label, never as available. Flip each one as it ships.
 */
export const FEATURE_STATUS: Record<FeatureKey, "live" | "coming"> = {
  cloud_agent: "live",
  basic_policies: "live",
  action_receipts: "live",
  community_support: "live",
  usage_rollover: "live",
  free_retries: "live",
  developer_api: "live",
  usage_alerts: "live",
  live_previews: "live",
  site_publishing: "live",
  studio_kit_pro: "live",
  security_checks: "live",
  replay_and_recovery: "live",
  opus_models: "live",
  advanced_approvals: "live",
  policy_builder: "live",
  shadow_mode: "live",
  team_collaboration: "live",
  advanced_rbac: "live",
  priority_support: "live",
  fable_models: "live",
  incident_response: "live",
  impact_analysis: "live",
  advanced_autonomy: "live",
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

/** How often a paid plan is charged. A yearly plan's price is still shown a month, with the yearly charge beside it. */
export type BillingInterval = "month" | "year";

export type PlanPricing = { kind: "free" } | { kind: "paid"; monthlyCents: number; interval: BillingInterval } | { kind: "contract" };

export interface Plan {
  id: PlanId;
  name: string;
  summary: string;
  pricing: PlanPricing;
  limits: PlanLimits;
  /** Cumulative: every feature this plan includes. */
  features: readonly FeatureKey[];
  recommendedFor?: string;
  /** Lite yearly and Maker yearly: the same plan paid once a year, offered on its monthly plan's card (ADR 0105). */
  yearlyOf?: PlanId;
}

// Every plan can export its proof: a ProofPack's download and a project's export have no plan check.
const FREE_FEATURES = ["cloud_agent", "basic_policies", "action_receipts", "evidence_exports", "community_support", "live_previews", "site_publishing"] as const satisfies readonly FeatureKey[];
const LITE_FEATURES = [...FREE_FEATURES, "usage_alerts", "developer_api", "usage_rollover", "studio_kit_pro"] as const satisfies readonly FeatureKey[];
const MAKER_FEATURES = [...LITE_FEATURES, "free_retries"] as const satisfies readonly FeatureKey[];
const STARTER_FEATURES = MAKER_FEATURES;
const PLUS_FEATURES = [...STARTER_FEATURES, "security_checks", "replay_and_recovery"] as const satisfies readonly FeatureKey[];
const PRO_FEATURES = [...PLUS_FEATURES, "opus_models", "advanced_approvals", "policy_builder", "shadow_mode"] as const satisfies readonly FeatureKey[];
const STUDIO_FEATURES = [...PRO_FEATURES, "team_collaboration"] as const satisfies readonly FeatureKey[];
const MAX_FEATURES = [...STUDIO_FEATURES, "advanced_rbac", "priority_support"] as const satisfies readonly FeatureKey[];
const MAX_2X_FEATURES = [...MAX_FEATURES, "fable_models", "incident_response", "impact_analysis"] as const satisfies readonly FeatureKey[];
const MAX_3X_FEATURES = [...MAX_2X_FEATURES, "advanced_autonomy"] as const satisfies readonly FeatureKey[];

/** Free: about $0.50 of AI cost a month on fast models, and one sandbox hour, paid from the paid plans' margin. */
export const FREE_AI_USD = 0.5;

type FixedLimits = Omit<PlanLimits, "aiUnitsPerMonth" | "retryUnitsPerMonth" | "sandboxHours">;

function paid(id: PlanId, name: string, summary: string, priceCents: number, sandboxHours: number, rest: FixedLimits, features: readonly FeatureKey[], recommendedFor?: string): Plan {
  const a = allowanceFor(priceCents / 100, sandboxHours);
  return {
    id,
    name,
    summary,
    pricing: { kind: "paid", monthlyCents: priceCents, interval: "month" },
    limits: { ...rest, aiUnitsPerMonth: a.aiUnits, retryUnitsPerMonth: a.retryUnits, sandboxHours },
    features,
    ...(recommendedFor ? { recommendedFor } : {}),
  };
}

const FREE_BASE = { aiUnits: Math.floor(FREE_AI_USD / USD_PER_UNIT), sandboxHours: 1 };

/** Lite and Maker: Free plus what their charge pays for (ADR 0105). Monthly first, so people can try Farbaek for little; paid yearly, they include more AI usage. */
const LIGHT: Partial<Record<PlanId, { extraSandboxHours: number; retries: boolean }>> = {
  lite: { extraSandboxHours: 0, retries: false },
  lite_monthly: { extraSandboxHours: 0, retries: false },
  maker: { extraSandboxHours: 1, retries: true },
  maker_monthly: { extraSandboxHours: 1, retries: true },
};

function lightAllowanceOf(id: PlanId, monthlyCents: number, interval: BillingInterval): Allowance {
  const spec = LIGHT[id]!;
  return interval === "year"
    ? lightAllowance((monthlyCents * 12) / 100, 12, FREE_BASE, spec.extraSandboxHours, spec.retries)
    : lightAllowance(monthlyCents / 100, 1, FREE_BASE, spec.extraSandboxHours, spec.retries);
}

function light(id: "lite" | "maker", name: string, summary: string, monthlyCents: number, rest: FixedLimits, features: readonly FeatureKey[]): Plan[] {
  const plan = (pid: PlanId, interval: BillingInterval): Plan => {
    const a = lightAllowanceOf(pid, monthlyCents, interval);
    return {
      id: pid,
      name: interval === "month" ? name : `${name} yearly`,
      summary,
      pricing: { kind: "paid", monthlyCents, interval },
      limits: { ...rest, aiUnitsPerMonth: a.aiUnits, retryUnitsPerMonth: a.retryUnits, sandboxHours: a.sandboxHours },
      features,
      ...(interval === "year" ? { yearlyOf: `${id}_monthly` as PlanId } : {}),
    };
  };
  return [plan(`${id}_monthly` as PlanId, "month"), plan(id, "year")];
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
      sandboxHours: FREE_BASE.sandboxHours,
    },
    features: FREE_FEATURES,
  },
  ...light("lite", "Lite", "A low-cost way to get to know Farbaek.", 99, { workspaces: 2, seats: 1, agents: 1, evaluationsPerMonth: 2_000, historyDays: 30, integrations: 1 }, LITE_FEATURES),
  ...light("maker", "Maker", "More room to build, with an extra test space hour.", 199, { workspaces: 3, seats: 1, agents: 1, evaluationsPerMonth: 3_000, historyDays: 30, integrations: 1 }, MAKER_FEATURES),
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
    summary: "Committed usage at a custom rate, with admin controls.",
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
export const SELF_SERVE_PLANS = PLANS.filter((p) => p.pricing.kind !== "contract" && !p.yearlyOf);

/** Every plan that can be bought, yearly versions included: what Office Space creates products for. */
export const BILLABLE_PLANS = PLANS.filter((p) => p.pricing.kind === "paid");

/** The plans the comparison shows: the cards' plans plus the yearly versions, whose usage differs. */
export const COMPARE_PLANS = PLANS.filter((p) => p.pricing.kind !== "contract");

/** The yearly version of a monthly plan, when it has one. */
export function yearlyVersionOf(id: PlanId): PlanId | null {
  return PLANS.find((p) => p.yearlyOf === id)?.id ?? null;
}

/** Lite and Maker, either way they're paid (ADR 0105). Their allowance includes Free's. */
export function isLight(id: PlanId): boolean {
  return LIGHT[id] !== undefined;
}

/** The order plans step up in, for upgrade hints. */
export const PLAN_ORDER: readonly PlanId[] = ["free", "lite_monthly", "lite", "maker_monthly", "maker", "starter", "plus", "pro", "studio", "max", "max_2x", "max_3x"];

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
  if (plan.pricing.kind !== "paid" || plan.limits.sandboxHours === null) return null;
  if (isLight(plan.id)) return lightAllowanceOf(plan.id, plan.pricing.monthlyCents, plan.pricing.interval);
  return allowanceFor(plan.pricing.monthlyCents / 100, plan.limits.sandboxHours);
}

/** Plans charged once a year (ADR 0105). */
export const YEARLY_PLAN_IDS = PLANS.filter((p) => p.pricing.kind === "paid" && p.pricing.interval === "year").map((p) => p.id);

/** Whether a plan is charged once a year. */
export function isYearly(id: PlanId): boolean {
  const plan = PLANS.find((p) => p.id === id);
  return plan?.pricing.kind === "paid" && plan.pricing.interval === "year";
}

/** What one charge of a paid plan is, in cents: a month's price, or twelve for a yearly plan. Zero for Free and contracts. */
export function chargeCents(plan: Plan): number {
  if (plan.pricing.kind !== "paid") return 0;
  return plan.pricing.interval === "year" ? plan.pricing.monthlyCents * 12 : plan.pricing.monthlyCents;
}

/** "$0.99 a month", with "billed $11.88 a year" for a yearly plan: the words every price sentence uses. */
export function priceWords(plan: Plan): { price: string; per: string; billed: string | null } {
  if (plan.pricing.kind !== "paid") return { price: plan.pricing.kind === "free" ? "$0" : "Custom", per: plan.pricing.kind === "free" ? "forever" : "", billed: null };
  return { price: formatUsd(plan.pricing.monthlyCents), per: "a month", billed: plan.pricing.interval === "year" ? `Billed ${formatUsd(chargeCents(plan))} a year` : null };
}

/** The price as one sentence part: "$9.99 a month" or "$11.88 a year". */
export function chargeLine(plan: Plan): string {
  if (plan.pricing.kind !== "paid") return "";
  return plan.pricing.interval === "year" ? `${formatUsd(chargeCents(plan))} a year` : `${formatUsd(plan.pricing.monthlyCents)} a month`;
}

/**
 * The 14-day trial: Pro's features and limits, with AI usage equal to a month
 * of Starter (every trial is paid for from margin) and 2 sandbox hours, enough
 * for about 40 to 120 site checks (ADR 0065). Internal to Farbaek: never a
 * payment provider trial.
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
    sandboxHours: 2,
  },
  reminderDays: [7, 12, 13] as const,
};

const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: BILLING_CURRENCY, maximumFractionDigits: 0 });
const usdCents = new Intl.NumberFormat("en-US", { style: "currency", currency: BILLING_CURRENCY, minimumFractionDigits: 2 });

/** "$19" for whole dollars, "$15.50" otherwise. */
export function formatUsd(cents: number): string {
  return cents % 100 === 0 ? usdWhole.format(cents / 100) : usdCents.format(cents / 100);
}
