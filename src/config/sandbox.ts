/**
 * Sandbox limits per plan. Owner defaults for the first release: internal,
 * not published on the pricing page and not priced. They keep runtime cost
 * bounded (provisioned time is what the runtime bills for) and are enforced
 * on the server and again in the database. Change them here.
 */
import { TRIAL, getPlan, type PlanId } from "@/core/billing/catalog";
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

function tier(planId: Exclude<PlanId, "enterprise">, shape: Omit<SandboxPlanLimits, "minutesPerPeriod" | "sizes" | "networkProfiles">): SandboxPlanLimits {
  return { ...shape, minutesPerPeriod: (getPlan(planId).limits.sandboxHours ?? 0) * 60, sizes: ["small", "standard"], networkProfiles: ["none", "package_registries"] };
}

/** Provisioned minutes come from each plan's sandbox hours (allowance.ts); concurrency and lengths step up with the tier. */
export const SANDBOX_PLAN_LIMITS: Record<Exclude<PlanId, "enterprise">, SandboxPlanLimits> = {
  free: { ...tier("free", { maxConcurrentSessions: 1, maxSessionMinutes: 30, idleMinutes: 10, maxCommandSeconds: 300, previewMinutes: 30 }), sizes: ["small"] },
  starter: tier("starter", { maxConcurrentSessions: 1, maxSessionMinutes: 45, idleMinutes: 10, maxCommandSeconds: 600, previewMinutes: 60 }),
  plus: tier("plus", { maxConcurrentSessions: 2, maxSessionMinutes: 60, idleMinutes: 15, maxCommandSeconds: 600, previewMinutes: 60 }),
  pro: tier("pro", { maxConcurrentSessions: 3, maxSessionMinutes: 120, idleMinutes: 20, maxCommandSeconds: 900, previewMinutes: 120 }),
  studio: tier("studio", { maxConcurrentSessions: 4, maxSessionMinutes: 120, idleMinutes: 20, maxCommandSeconds: 900, previewMinutes: 120 }),
  max: tier("max", { maxConcurrentSessions: 5, maxSessionMinutes: 180, idleMinutes: 30, maxCommandSeconds: 1800, previewMinutes: 180 }),
  max_2x: tier("max_2x", { maxConcurrentSessions: 8, maxSessionMinutes: 240, idleMinutes: 30, maxCommandSeconds: 1800, previewMinutes: 240 }),
  max_3x: tier("max_3x", { maxConcurrentSessions: 12, maxSessionMinutes: 240, idleMinutes: 30, maxCommandSeconds: 1800, previewMinutes: 240 }),
};

/** The 14-day trial gets Pro's shape with Starter's hours, since trial caps are totals for the whole trial. */
export const SANDBOX_TRIAL_LIMITS: SandboxPlanLimits = { ...SANDBOX_PLAN_LIMITS.pro, maxConcurrentSessions: 2, minutesPerPeriod: TRIAL.limits.sandboxHours * 60 };

/** Enterprise limits are set by contract; until a contract value exists, Max 3x limits apply. */
export function sandboxLimitsFor(plan: { planId: PlanId; source: "free" | "trial" | "paid" } | null): SandboxPlanLimits {
  if (!plan) return SANDBOX_PLAN_LIMITS.free;
  if (plan.source === "trial") return SANDBOX_TRIAL_LIMITS;
  if (plan.planId === "enterprise") return SANDBOX_PLAN_LIMITS.max_3x;
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
