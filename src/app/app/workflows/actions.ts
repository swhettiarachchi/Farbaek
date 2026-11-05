"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CAP_CHOICES } from "@/core/agent/run-cap";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { advanceWorkflowNow } from "@/server/workflows/wiring";
import { approveWorkflow, cancelWorkflow, continueWorkflow, createWorkflow, type WorkflowWriteDeps } from "@/server/workflows/use-cases";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { runCapUnits } from "@/server/workspace/plan-card-data";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type WorkflowState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

const ADVANCE_WORDS: Record<string, string> = {
  started: "The first step's run has started.",
  paused: "Agents are paused in this workspace, so it starts when an owner or admin resumes them.",
  failed: "The first step couldn't start; the workflow shows why.",
  halted: "It stopped, because a step's plan changed after it was approved.",
};

async function writer(): Promise<{ ctx: AppContext & { current: NonNullable<AppContext["current"]> }; deps: WorkflowWriteDeps } | { error: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { error: "The demo workspace is read-only. Sign in to run your own workflows." };
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current) return { error: "Create or join a workspace first." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "The server isn't configured for writes." };
  const base = createSupabaseWriteDeps(user, admin, ctx.user.id);
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const { data, error } = await admin.rpc(name, args);
    return error ? { ok: false as const, error: error.message } : { ok: true as const, value: data as unknown };
  };
  const deps: WorkflowWriteDeps = {
    role: base.role,
    billing: base.billing,
    now: () => new Date(),
    read: (orgId, id) => ctx.reader.getWorkflow(orgId, id),
    async create(i) {
      const r = await rpc("app_create_workflow", { p_org: i.orgId, p_actor: i.actor, p_project: i.projectId, p_title: i.title, p_steps: i.steps, p_ceiling: i.ceilingUnits });
      return r.ok ? { ok: true, value: String(r.value) } : r;
    },
    approve: (i) => rpc("app_approve_workflow", { p_workflow: i.workflowId, p_actor: i.actor, p_sha256: i.sha256 }),
    continue: (i) => rpc("app_continue_workflow", { p_workflow: i.workflowId, p_actor: i.actor }),
    cancel: (i) => rpc("app_cancel_workflow", { p_workflow: i.workflowId, p_actor: i.actor }),
  };
  return { ctx: ctx as AppContext & { current: NonNullable<AppContext["current"]> }, deps };
}

const Steps = z.array(z.object({ title: z.string(), notes: z.string().optional(), checkpoint: z.boolean().optional(), together: z.boolean().optional() })).max(8);

/**
 * Creates a workflow and a task per step (ADR 0092). Each step's run is
 * capped at the chosen share of the period's usage; the ceiling is that
 * times the number of steps.
 */
export async function createWorkflowAction(_previous: WorkflowState, form: FormData): Promise<WorkflowState> {
  const parsed = z
    .object({ projectId: z.uuid(), title: z.string().max(200), steps: z.string().max(40_000), cap: z.enum(CAP_CHOICES).exclude(["plan"]) })
    .safeParse({ projectId: form.get("projectId"), title: form.get("title"), steps: form.get("steps"), cap: form.get("cap") });
  if (!parsed.success) return { status: "error", message: "Choose a project, give the workflow a title and add its steps." };
  let steps: z.infer<typeof Steps>;
  try {
    steps = Steps.parse(JSON.parse(parsed.data.steps));
  } catch {
    return { status: "error", message: "The steps couldn't be read. Reload the page and try again." };
  }
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error };
  const stepCap = runCapUnits(w.ctx.current, "balanced", parsed.data.cap);
  if (stepCap === null) return { status: "error", message: "This workspace's usage for the period can't be estimated, so a run cap can't be set." };
  const r = await createWorkflow(w.deps, {
    orgId: w.ctx.current.id,
    userId: w.ctx.user.id,
    projectId: parsed.data.projectId,
    draft: { title: parsed.data.title, steps, ceilingUnits: Math.min(5_000_000, Math.max(1_000, stepCap * steps.length)) },
  });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/app/workflows");
  redirect(`/app/workflows/${r.value}`);
}

/** Approves the workflow, bound to its exact steps and contracts, and starts the first step. Owners and admins. */
export async function approveWorkflowAction(_previous: WorkflowState, form: FormData): Promise<WorkflowState> {
  const id = z.uuid().safeParse(form.get("workflowId"));
  if (!id.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error };
  const r = await approveWorkflow(w.deps, { orgId: w.ctx.current.id, userId: w.ctx.user.id, workflowId: id.data });
  if (!r.ok) return { status: "error", message: r.message };
  const next = await advanceWorkflowNow({ id: id.data, orgId: w.ctx.current.id });
  revalidatePath(`/app/workflows/${id.data}`);
  return { status: "done", message: `Approved. ${next ? (ADVANCE_WORDS[next] ?? "It carries on from here.") : "It starts within the hour."}` };
}

/** Releases a checkpoint: the workflow carries on with the next step. */
export async function continueWorkflowAction(_previous: WorkflowState, form: FormData): Promise<WorkflowState> {
  const id = z.uuid().safeParse(form.get("workflowId"));
  if (!id.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error };
  const r = await continueWorkflow(w.deps, { orgId: w.ctx.current.id, userId: w.ctx.user.id, workflowId: id.data });
  if (!r.ok) return { status: "error", message: r.message };
  const next = await advanceWorkflowNow({ id: id.data, orgId: w.ctx.current.id });
  revalidatePath(`/app/workflows/${id.data}`);
  return { status: "done", message: next === "started" ? "Carrying on: the next step's run has started." : next === "halted" ? ADVANCE_WORDS.halted! : "Carrying on." };
}

/** Stops the workflow for good. A run already working finishes its own step. */
export async function cancelWorkflowAction(_previous: WorkflowState, form: FormData): Promise<WorkflowState> {
  const id = z.uuid().safeParse(form.get("workflowId"));
  if (!id.success) return { status: "error", message: "Reload the page and try again." };
  const w = await writer();
  if ("error" in w) return { status: "error", message: w.error };
  const r = await cancelWorkflow(w.deps, { orgId: w.ctx.current.id, userId: w.ctx.user.id, workflowId: id.data });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/workflows/${id.data}`);
  return { status: "done", message: "Cancelled. Steps already verified stay as they are." };
}
