"use server";

import { z } from "zod";
import { checkFeature } from "@/core/billing/entitlements";
import { summarizeRehearsal, type RehearsalSummary } from "@/core/trust/rehearsal";
import { replayLimits, type ReplayChange } from "@/core/trust/replay";
import { currentExecutionMode } from "@/server/execution/sandbox";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { SHADOW_NOT_IN_PLAN } from "@/server/workspace/autonomy";
import { loadAppContext } from "@/server/workspace/context";

// A "use server" file exports only its actions, so this stays here.
const REPLAY_DAYS = 30;

export type ReplayState =
  | { status: "done"; summary: RehearsalSummary; leftOut: number; since: string; assumption: string; limits: { maxFiles: number; allowCreates: boolean } }
  | { status: "error"; message: string };

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

/**
 * Replays autonomy limits over the workspace's last 30 days of changes
 * (ADR 0081), read as the person. It predicts; it changes nothing.
 */
export async function replayAutonomyAction(input: { maxFiles: number; allowCreates: boolean }): Promise<ReplayState> {
  const limits = z.object({ maxFiles: z.number().int().min(1).max(5), allowCreates: z.boolean() }).safeParse(input);
  if (!limits.success) return { status: "error", message: "Choose a file limit from 1 to 5." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Sign in again to replay." };
  if (ctx.mode !== "live") return { status: "error", message: "The demo workspace has no past changes to replay." };
  const feature = checkFeature(ctx.current.plan, "shadow_mode");
  if (!feature.allowed) return { status: "error", message: feature.code === "FEATURE_NOT_IN_PLAN" ? SHADOW_NOT_IN_PLAN : feature.message };
  const client = await createSupabaseServerClient();
  if (!client) return { status: "error", message: "The server isn't configured for this yet." };

  const { data, error } = await client.rpc("app_replay_history", { p_org: ctx.current.id, p_days: REPLAY_DAYS });
  if (error) return { status: "error", message: "The past changes couldn't be read. Try again." };
  const parsed = z.array(Row).safeParse(data);
  if (!parsed.success) return { status: "error", message: "The past changes couldn't be read. Try again." };
  const changes: ReplayChange[] = parsed.data.map((r) => ({
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

  const sandbox = currentExecutionMode().mode === "sandboxed";
  const result = await replayLimits(changes, limits.data, sandbox);
  return {
    status: "done",
    summary: summarizeRehearsal(result.rows),
    leftOut: result.leftOut,
    since: new Date(Date.now() - REPLAY_DAYS * 86_400_000).toISOString(),
    assumption: sandbox
      ? "It assumes a verified sandbox was connected when each change was made, as one is now."
      : "No verified sandbox is connected now, so it assumes nothing could have checked these changes.",
    limits: limits.data,
  };
}
