/**
 * Governed workflows on this server (ADR 0092): the v58 functions through
 * the server's client, and step runs started as the approver. Called from a
 * page after approving or continuing, from the hooks when a run or a task's
 * checks end, and from the hourly sweep. Every call is safe to repeat.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { parsePermissions } from "@/core/workspace/permissions";
import { startCloudRun } from "@/server/cloud-agent/executor";
import { cloudRunDeps } from "@/server/cloud-agent/wiring";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { ORG_ROLES } from "@/server/workspace/types";
import { advanceWorkflow, settleStep, type OrchestratorDeps } from "./orchestrator";

const Claim = z.object({ result: z.string(), step: z.number().nullable(), task_id: z.string().nullable(), cap_units: z.number().nullable(), approved_by: z.string().nullable() });

export function workflowDeps(admin: SupabaseClient): OrchestratorDeps {
  async function rpc(name: string, args: Record<string, unknown>): Promise<unknown> {
    const { data, error } = await admin.rpc(name, args);
    if (error) throw new Error(`${name}: ${error.message}`);
    return data;
  }
  return {
    async claimNext(workflowId) {
      const row = z.array(Claim).parse(await rpc("app_workflow_claim_next", { p_workflow: workflowId }))[0];
      if (!row) throw new Error("app_workflow_claim_next returned nothing");
      return { result: row.result, step: row.step, taskId: row.task_id, capUnits: row.cap_units, approvedBy: row.approved_by };
    },
    stepResult: async (workflowId, step, result, detail) => {
      await rpc("app_workflow_step_result", { p_workflow: workflowId, p_step: step, p_result: result, p_detail: detail });
    },
    attachRun: async (workflowId, step, runId) => {
      await rpc("app_workflow_attach_run", { p_workflow: workflowId, p_step: step, p_run: runId });
    },
    async taskState(orgId, taskId) {
      const { data, error } = await admin.from("tasks").select("state").eq("org_id", orgId).eq("id", taskId).maybeSingle();
      if (error) throw new Error(`tasks: ${error.message}`);
      return (data as { state: string } | null)?.state ?? null;
    },
    async person(orgId, userId) {
      const { data, error } = await admin.from("organization_members").select("role, permissions").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
      if (error) throw new Error(`organization_members: ${error.message}`);
      const row = z.object({ role: z.enum(ORG_ROLES), permissions: z.unknown() }).nullable().parse(data);
      return row ? { orgId, userId, role: row.role, permissions: parsePermissions(row.permissions) } : null;
    },
    async startRun(person, taskId, capUnits) {
      const wiring = await cloudRunDeps(person, { system: true });
      if (!wiring.ok) return { ok: false, code: "FORBIDDEN", message: wiring.reason };
      const started = await startCloudRun(wiring.deps, { person, taskId, effort: "balanced", capUnits });
      return started.ok ? { ok: true, value: { runId: started.value.runId } } : started;
    },
    async stepForTask(taskId) {
      const { data, error } = await admin.from("workflow_steps").select("workflow_id, org_id, position, status").eq("task_id", taskId).maybeSingle();
      if (error) throw new Error(`workflow_steps: ${error.message}`);
      const row = data as { workflow_id: string; org_id: string; position: number; status: string } | null;
      return row ? { workflowId: row.workflow_id, orgId: row.org_id, step: row.position, status: row.status } : null;
    },
  };
}

/** After a run or a task's checks end. Never throws. */
export async function settleWorkflowStep(taskId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  try {
    const r = await settleStep(workflowDeps(admin), taskId);
    if (r) log("info", "workflow.settled", { task: taskId, result: r });
  } catch (e) {
    log("error", "workflow.settle_failed", { task: taskId, error: e instanceof Error ? e.message : String(e) });
  }
}

/** Starts the next step if one is due, after approving or continuing. Returns what happened, or null when it couldn't be asked. */
export async function advanceWorkflowNow(workflow: { id: string; orgId: string }): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  try {
    return await advanceWorkflow(workflowDeps(admin), workflow);
  } catch (e) {
    log("error", "workflow.advance_failed", { workflow: workflow.id, error: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/**
 * The hourly safety net: a hook can miss (a restart mid-run), so each
 * running or waiting workflow's current step is settled and the workflow
 * carried on if it can.
 */
export async function sweepWorkflows(admin: SupabaseClient): Promise<{ checked: number; results: Record<string, number> }> {
  const deps = workflowDeps(admin);
  const { data, error } = await admin.from("workflows").select("id, org_id, status").in("status", ["approved", "running", "waiting"]).limit(200);
  if (error) throw new Error(`workflows: ${error.message}`);
  const results: Record<string, number> = {};
  for (const w of (data ?? []) as { id: string; org_id: string; status: string }[]) {
    const { data: current } = await admin.from("workflow_steps").select("task_id").eq("workflow_id", w.id).in("status", ["running", "waiting"]).limit(1).maybeSingle();
    const r = current ? await settleStep(deps, (current as { task_id: string }).task_id) : await advanceWorkflow(deps, { id: w.id, orgId: w.org_id });
    const key = r ?? "unchanged";
    results[key] = (results[key] ?? 0) + 1;
  }
  return { checked: (data ?? []).length, results };
}
