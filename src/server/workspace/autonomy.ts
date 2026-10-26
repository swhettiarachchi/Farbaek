/**
 * Autonomy level 2, bounded execution (ADR 0046), shadow mode (ADR 0075)
 * and level 3, earned and bounded by a daily budget (ADR 0086): a
 * workspace's setting, read as the person (Row Level Security), and changed
 * by owners and admins through the server. The database enforces it again
 * on every proposal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { resolveEffectivePlan } from "@/core/billing/trial";
import { checkFeature } from "@/core/billing/entitlements";
import { LEVEL_3, type AutonomyRecord } from "@/core/trust/autonomy-levels";
import type { AutonomyLimits } from "@/core/trust/policy";
import { MANAGER_ROLES } from "./types";
import { codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export interface AutonomyView {
  level: 0 | 2 | 3;
  maxFiles: number;
  allowCreates: boolean;
  /** Level 3: changes it may apply on its own in 24 hours, and how many it did. */
  dailyLimit: number | null;
  appliedToday: number;
  /** Set when a change applied on its own failed its checks; autonomy is off until turned on again. */
  suspendedAt: string | null;
  suspendedReason: string | null;
  /** When level 0 started rehearsing level 2 (shadow mode), or null. */
  shadowSince: string | null;
  updatedAt: string | null;
}

export const AUTONOMY_OFF: AutonomyView = { level: 0, maxFiles: 3, allowCreates: false, dailyLimit: null, appliedToday: 0, suspendedAt: null, suspendedReason: null, shadowSince: null, updatedAt: null };

const Row = z.object({
  level: z.union([z.literal(0), z.literal(2), z.literal(3)]),
  max_files: z.number().int(),
  allow_creates: z.boolean(),
  daily_limit: z.number().int().nullable().optional(),
  suspended_at: z.string().nullable(),
  suspended_reason: z.string().nullable(),
  shadow_since: z.string().nullable().optional(),
  updated_at: z.string(),
});

export async function readAutonomy(client: SupabaseClient, orgId: string): Promise<AutonomyView> {
  const { data, error } = await client
    .from("org_autonomy")
    .select("level, max_files, allow_creates, daily_limit, suspended_at, suspended_reason, shadow_since, updated_at")
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the workspace's autonomy: ${error.message}`);
  if (!data) return AUTONOMY_OFF;
  const r = Row.parse(data);
  // Level 3's budget counts what applied on its own in the last 24 hours. A count that can't be read spends the budget: nothing more applies on its own.
  let appliedToday = 0;
  if (r.level === 3 && r.daily_limit) {
    const { count, error: countError } = await client
      .from("change_proposals")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("policy->>outcome", "ALLOW_WITHIN_LIMITS")
      .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
    appliedToday = countError ? r.daily_limit : (count ?? r.daily_limit);
  }
  return {
    level: r.level,
    maxFiles: r.max_files,
    allowCreates: r.allow_creates,
    dailyLimit: r.daily_limit ?? null,
    appliedToday,
    suspendedAt: r.suspended_at,
    suspendedReason: r.suspended_reason,
    shadowSince: r.shadow_since ?? null,
    updatedAt: r.updated_at,
  };
}

/**
 * The limits the policy uses, or null when changes always wait for a person.
 * In shadow mode the limits come marked as a rehearsal: recorded, never acted on.
 */
export const limitsFrom = (view: AutonomyView): AutonomyLimits | null =>
  view.level === 3 && view.suspendedAt === null
    ? { level: 3, maxFiles: view.maxFiles, allowCreates: view.allowCreates, dailyLeft: Math.max(0, (view.dailyLimit ?? 0) - view.appliedToday) }
    : view.level === 2 && view.suspendedAt === null
    ? { level: 2, maxFiles: view.maxFiles, allowCreates: view.allowCreates }
    : view.level === 0 && view.shadowSince !== null
      ? { level: 2, maxFiles: view.maxFiles, allowCreates: view.allowCreates, rehearsal: true }
      : null;

/** The record level 3 is earned from (migration v54), read as the person; null when it can't be read. */
export async function readAutonomyRecord(client: SupabaseClient, orgId: string): Promise<AutonomyRecord | null> {
  const { data, error } = await client.rpc("app_autonomy_record", { p_org: orgId });
  if (error) return null;
  const row = z.array(z.object({ verified: z.number().int(), failed: z.number().int() })).safeParse(data);
  return row.success && row.data[0] ? row.data[0] : null;
}

export interface AutonomyDeps {
  setAutonomy(input: { orgId: string; actor: string; level: 0 | 2 | 3; maxFiles: number; allowCreates: boolean; shadow: boolean; dailyLimit: number | null }): Promise<RpcResult<null>>;
}

export const SHADOW_NOT_IN_PLAN = "Shadow mode is included in Pro and up, and in the trial.";
export const LEVEL_3_NOT_IN_PLAN = "Level 3 is included in Max 3x and up.";

export async function setWorkspaceAutonomy(
  deps: WriteDeps & AutonomyDeps,
  input: { orgId: string; userId: string; level: 0 | 2 | 3; maxFiles: number; allowCreates: boolean; shadow?: boolean; dailyLimit?: number | null },
): Promise<WriteResult<null>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", "Only an owner or admin can change the workspace's autonomy.");
  const most = input.level === 3 ? LEVEL_3.maxFiles : 5;
  if (!Number.isInteger(input.maxFiles) || input.maxFiles < 1 || input.maxFiles > most) return fail("FORBIDDEN", `Choose a file limit from 1 to ${most}.`);
  const dailyLimit = input.level === 3 ? (input.dailyLimit ?? null) : null;
  if (input.level === 3) {
    if (!LEVEL_3.dailyLimits.some((d) => d === dailyLimit)) return fail("FORBIDDEN", `Choose a daily limit of ${LEVEL_3.dailyLimits.join(", ")} changes.`);
    const snapshot = await deps.billing(input.orgId);
    const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "advanced_autonomy");
    if (!feature.allowed) return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? LEVEL_3_NOT_IN_PLAN : feature.message);
  }
  const shadow = input.level === 0 && input.shadow === true;
  if (shadow) {
    const snapshot = await deps.billing(input.orgId);
    const feature = checkFeature(snapshot ? resolveEffectivePlan(snapshot, deps.now()) : null, "shadow_mode");
    if (!feature.allowed) return fail(feature.code, feature.code === "FEATURE_NOT_IN_PLAN" ? SHADOW_NOT_IN_PLAN : feature.message);
  }
  const r = await deps.setAutonomy({ orgId: input.orgId, actor: input.userId, level: input.level, maxFiles: input.maxFiles, allowCreates: input.allowCreates, shadow, dailyLimit });
  return r.ok ? r : fail(codeFromDatabaseError(r.error));
}
