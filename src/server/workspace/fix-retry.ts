/**
 * The free retry (ADR 0101): when a fix's own checks fail too, the AI usage
 * it settled is given back from the plan's retry reserve. Runs after every
 * check run and every agent run; the database decides whether it applies
 * (a fix, failed, not yet settled) and keeps it to once.
 */
import { resolveEffectivePlan, type BillingSnapshot } from "@/core/billing/trial";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { FIXABLE_STATES } from "./fixes";
import { ORGANIZATION_SELECT, billingSnapshotFromRow } from "./organizations";
import type { Task } from "./types";

/** The units a workspace's free retries may give back in 31 days: none on Free, the plan's reserve otherwise (the trial uses Starter's). */
export function fixRetryCap(snapshot: BillingSnapshot | null, now: Date): number {
  if (!snapshot) return 0;
  return resolveEffectivePlan(snapshot, now).limits.retryUnitsPerMonth ?? 0;
}

export async function settleFixRetry(taskId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  try {
    const { data: task, error } = await admin.from("tasks").select("org_id, state, fix_of_task_id, fix_refunded_at").eq("id", taskId).maybeSingle();
    const t = task as { org_id: string; state: Task["state"]; fix_of_task_id: string | null; fix_refunded_at: string | null } | null;
    if (error || !t || !t.fix_of_task_id || t.fix_refunded_at || !FIXABLE_STATES.has(t.state)) return;
    const { data: org } = await admin.from("organizations").select(ORGANIZATION_SELECT).eq("id", t.org_id).maybeSingle();
    const cap = fixRetryCap(org ? billingSnapshotFromRow(org) : null, new Date());
    const r = await admin.rpc("app_refund_fix_task", { p_task: taskId, p_cap: cap });
    if (r.error) throw new Error(r.error.message);
    log("info", "fix.free_retry", { task: taskId, units: Number(r.data ?? 0), cap });
  } catch (e) {
    log("error", "fix.free_retry_failed", { task: taskId, error: e instanceof Error ? e.message.slice(0, 200) : "unknown" });
  }
}
