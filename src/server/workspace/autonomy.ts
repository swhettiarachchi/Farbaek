/**
 * Autonomy level 2, bounded execution (ADR 0046): a workspace's setting,
 * read as the person (Row Level Security), and changed by owners and admins
 * through the server. The database enforces it again on every proposal.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { AutonomyLimits } from "@/core/trust/policy";
import { MANAGER_ROLES } from "./types";
import { codeFromDatabaseError, fail, type RpcResult, type WriteDeps, type WriteResult } from "./use-cases";

export interface AutonomyView {
  level: 0 | 2;
  maxFiles: number;
  allowCreates: boolean;
  /** Set when a change applied on its own failed its checks; autonomy is off until turned on again. */
  suspendedAt: string | null;
  suspendedReason: string | null;
  updatedAt: string | null;
}

export const AUTONOMY_OFF: AutonomyView = { level: 0, maxFiles: 3, allowCreates: false, suspendedAt: null, suspendedReason: null, updatedAt: null };

const Row = z.object({
  level: z.union([z.literal(0), z.literal(2)]),
  max_files: z.number().int(),
  allow_creates: z.boolean(),
  suspended_at: z.string().nullable(),
  suspended_reason: z.string().nullable(),
  updated_at: z.string(),
});

export async function readAutonomy(client: SupabaseClient, orgId: string): Promise<AutonomyView> {
  const { data, error } = await client.from("org_autonomy").select("level, max_files, allow_creates, suspended_at, suspended_reason, updated_at").eq("org_id", orgId).maybeSingle();
  if (error) throw new Error(`Couldn't read the workspace's autonomy: ${error.message}`);
  if (!data) return AUTONOMY_OFF;
  const r = Row.parse(data);
  return { level: r.level, maxFiles: r.max_files, allowCreates: r.allow_creates, suspendedAt: r.suspended_at, suspendedReason: r.suspended_reason, updatedAt: r.updated_at };
}

/** The limits the policy uses, or null when changes always wait for a person. */
export const limitsFrom = (view: AutonomyView): AutonomyLimits | null =>
  view.level === 2 && view.suspendedAt === null ? { level: 2, maxFiles: view.maxFiles, allowCreates: view.allowCreates } : null;

export interface AutonomyDeps {
  setAutonomy(input: { orgId: string; actor: string; level: 0 | 2; maxFiles: number; allowCreates: boolean }): Promise<RpcResult<null>>;
}

export async function setWorkspaceAutonomy(deps: WriteDeps & AutonomyDeps, input: { orgId: string; userId: string; level: 0 | 2; maxFiles: number; allowCreates: boolean }): Promise<WriteResult<null>> {
  const role = await deps.role(input.orgId);
  if (!role) return fail("NOT_FOUND");
  if (!MANAGER_ROLES.includes(role)) return fail("FORBIDDEN", "Only an owner or admin can change the workspace's autonomy.");
  if (!Number.isInteger(input.maxFiles) || input.maxFiles < 1 || input.maxFiles > 5) return fail("FORBIDDEN", "Choose a file limit from 1 to 5.");
  const r = await deps.setAutonomy({ orgId: input.orgId, actor: input.userId, level: input.level, maxFiles: input.maxFiles, allowCreates: input.allowCreates });
  return r.ok ? r : fail(codeFromDatabaseError(r.error));
}
