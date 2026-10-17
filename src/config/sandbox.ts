/**
 * Sandbox limits per plan. Owner defaults for the first release: internal,
 * not published on the pricing page and not priced. They keep runtime cost
 * bounded (provisioned time is what the runtime bills for) and are enforced
 * on the server and again in the database. Change them here.
 */
import type { PlanId } from "@/core/billing/catalog";
import type { NetworkProfile } from "@/core/sandbox/network";
import type { SizeId } from "@/core/sandbox/templates";

export interface SandboxPlanLimits {
  /** Sessions that exist at once (starting, running, paused or stopping) in a workspace. */
  maxConcurrentSessions: number;
  /** Hard lifetime of one session, also passed to the runtime as its own timeout. */
  maxSessionMinutes: number;
  /** A running session with no activity for this long is stopped. */
  idleMinutes: number;
  /** Longest single command. */
  maxCommandSeconds: number;
  /** Provisioned session-minutes per usage period (wall-clock time a sandbox exists, running or paused). */
  minutesPerPeriod: number;
  sizes: readonly SizeId[];
  networkProfiles: readonly NetworkProfile[];
  /** Longest a private preview link stays valid. */
  previewMinutes: number;
}

export const SANDBOX_PLAN_LIMITS: Record<Exclude<PlanId, "enterprise">, SandboxPlanLimits> = {
  free: {
    maxConcurrentSessions: 1,
    maxSessionMinutes: 30,
    idleMinutes: 10,
    maxCommandSeconds: 300,
    minutesPerPeriod: 120,
    sizes: ["small"],
    networkProfiles: ["none", "package_registries"],
    previewMinutes: 30,
  },
  developer: {
    maxConcurrentSessions: 2,
    maxSessionMinutes: 60,
    idleMinutes: 15,
    maxCommandSeconds: 600,
    minutesPerPeriod: 900,
    sizes: ["small", "standard"],
    networkProfiles: ["none", "package_registries"],
    previewMinutes: 60,
  },
  team: {
    maxConcurrentSessions: 4,
    maxSessionMinutes: 120,
    idleMinutes: 20,
    maxCommandSeconds: 900,
    minutesPerPeriod: 3000,
    sizes: ["small", "standard"],
    networkProfiles: ["none", "package_registries"],
    previewMinutes: 120,
  },
  business: {
    maxConcurrentSessions: 10,
    maxSessionMinutes: 240,
    idleMinutes: 30,
    maxCommandSeconds: 1800,
    minutesPerPeriod: 12000,
    sizes: ["small", "standard"],
    networkProfiles: ["none", "package_registries"],
    previewMinutes: 240,
  },
};

/** The 14-day trial gets Team's shape with a smaller total, since trial caps are totals for the whole trial. */
export const SANDBOX_TRIAL_LIMITS: SandboxPlanLimits = { ...SANDBOX_PLAN_LIMITS.team, maxConcurrentSessions: 2, minutesPerPeriod: 600 };

/** Enterprise limits are set by contract; until a contract value exists, Business limits apply. */
export function sandboxLimitsFor(plan: { planId: PlanId; source: "free" | "trial" | "paid" } | null): SandboxPlanLimits {
  if (!plan) return SANDBOX_PLAN_LIMITS.free;
  if (plan.source === "trial") return SANDBOX_TRIAL_LIMITS;
  if (plan.planId === "enterprise") return SANDBOX_PLAN_LIMITS.business;
  return SANDBOX_PLAN_LIMITS[plan.planId];
}

/** Platform ceilings that no plan can exceed. The database checks the same numbers. */
export const SANDBOX_HARD_LIMITS = {
  maxSessionMinutes: 24 * 60,
  maxCommandSeconds: 60 * 60,
  maxUploadFiles: 3000,
  maxUploadBytes: 25 * 1024 * 1024,
  /** Executions and events older than this are pruned by the sweeper. */
  historyRetentionDays: 30,
  /** Requests per user per minute, per kind of request. */
  rateLimits: { create: 6, exec: 60, files: 240, preview: 30, read: 600 },
} as const;
