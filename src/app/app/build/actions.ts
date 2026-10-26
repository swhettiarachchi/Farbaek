"use server";

/**
 * Starting, answering and stopping cloud agent runs (ADR 0022). Every check
 * is made again on the server: the person's role, the task's approved
 * contract, the wallet on each model step, and the sandbox guard on each
 * command.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CAP_CHOICES } from "@/core/agent/run-cap";
import { EFFORTS } from "@/core/agent/routing";
import { answerRunApproval, cancelCloudRun, sendRunMessage, startCloudRun } from "@/server/cloud-agent/executor";
import { cloudRunDeps } from "@/server/cloud-agent/wiring";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { runCapUnits } from "@/server/workspace/plan-card-data";

export type BuildActionState = { status: "idle" } | { status: "error"; message: string } | { status: "done" };

async function person(): Promise<{ ctx: AppContext; person: { orgId: string; userId: string; role: NonNullable<AppContext["role"]>; permissions: AppContext["permissions"] } } | { error: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { error: "Create or join a workspace first." };
  return { ctx, person: { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions } };
}

export async function startBuildRunAction(_previous: BuildActionState, form: FormData): Promise<BuildActionState> {
  const parsed = z
    .object({ taskId: z.uuid(), effort: z.enum(EFFORTS).catch("balanced"), cap: z.enum(CAP_CHOICES).catch("double") })
    .safeParse({ taskId: form.get("taskId"), effort: form.get("effort"), cap: form.get("cap") ?? undefined });
  if (!parsed.success) return { status: "error", message: "Choose a task with an approved contract." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error };
  const wiring = await cloudRunDeps(p.person);
  if (!wiring.ok) return { status: "error", message: wiring.reason };
  const capUnits = p.ctx.current ? runCapUnits(p.ctx.current, parsed.data.effort, parsed.data.cap) : null;
  const started = await startCloudRun(wiring.deps, { person: p.person, taskId: parsed.data.taskId, effort: parsed.data.effort, capUnits });
  if (!started.ok) return { status: "error", message: started.message };
  revalidatePath("/app/build");
  redirect(`/app/build/${started.value.runId}`);
}

export async function answerBuildApprovalAction(input: { runId: string; requestId: string; approved: boolean; bindingHash: string }): Promise<BuildActionState> {
  const parsed = z.object({ runId: z.uuid(), requestId: z.string().min(1).max(200), approved: z.boolean(), bindingHash: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "That answer isn't valid." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error };
  const r = answerRunApproval(p.person, parsed.data);
  return r.ok ? { status: "done" } : { status: "error", message: r.message };
}

/** A message for the running agent, read at its next step (ADR 0027). */
export async function sendRunMessageAction(input: { runId: string; text: string }): Promise<BuildActionState> {
  const parsed = z.object({ runId: z.uuid(), text: z.string().max(2_000) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "That message can't be sent." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error };
  const r = sendRunMessage(p.person, parsed.data);
  return r.ok ? { status: "done" } : { status: "error", message: r.message };
}

export async function cancelBuildRunAction(runId: string): Promise<BuildActionState> {
  if (!z.uuid().safeParse(runId).success) return { status: "error", message: "That run doesn't exist." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error };
  const r = cancelCloudRun(p.person, runId);
  return r.ok ? { status: "done" } : { status: "error", message: r.message };
}
