/**
 * The shapes of a workspace's past changes (migration v51,
 * `app_replay_history`), read as the person so Row Level Security limits
 * them to workspaces they belong to. Paths, kinds and outcomes only, never
 * content. Shared by the autonomy replay (ADR 0081) and the rules test
 * (ADR 0082).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ReplayChange } from "@/core/trust/replay";

const Row = z.object({
  proposal_id: z.string(),
  task_id: z.string(),
  status: z.enum(["pending", "blocked", "applied", "discarded"]),
  created_at: z.string(),
  files: z.array(z.object({ path: z.string(), kind: z.enum(["create", "edit"]) })),
  violations: z.number().int(),
  from_agent: z.boolean(),
  has_checks: z.boolean(),
  evidence: z.enum(["unverified", "partially_verified", "verified", "failed"]).nullable(),
});

/** Up to 300 changes from the last `days` (at most 90), newest first. Throws when they can't be read. */
export async function readChangeHistory(client: SupabaseClient, orgId: string, days: number): Promise<ReplayChange[]> {
  const { data, error } = await client.rpc("app_replay_history", { p_org: orgId, p_days: days });
  if (error) throw new Error(`Couldn't read past changes: ${error.message}`);
  return z
    .array(Row)
    .parse(data)
    .map((r) => ({
      proposalId: r.proposal_id,
      taskId: r.task_id,
      createdAt: r.created_at,
      status: r.status,
      files: r.files,
      violations: r.violations,
      fromAgent: r.from_agent,
      hasChecks: r.has_checks,
      evidence: r.evidence,
    }));
}
