"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { cancelHandoff, createSupabaseHandoffStore, requestHandoff, type HandoffPerson } from "@/server/agent/handoffs";
import { createSupabaseAgentStore } from "@/server/agent/supabase-store";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";

export type HandoffState = { status: "idle" } | { status: "sent" } | { status: "error"; message: string };

async function person(): Promise<{ error: string } | { admin: NonNullable<ReturnType<typeof createSupabaseAdminClient>>; person: HandoffPerson }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { error: "The demo workspace is read-only. Sign in to hand your own tasks to your computer." };
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { error: "Create or join a workspace first." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Accounts aren't configured on this server." };
  return { admin, person: { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions } };
}

/** Hands a task to one of the workspace's computers (ADR 0139): it runs the checks there and reports back. */
export async function requestHandoffAction(_previous: HandoffState, form: FormData): Promise<HandoffState> {
  const parsed = z
    .object({ taskId: z.uuid(), agentId: z.uuid(), note: z.string().trim().max(500) })
    .safeParse({ taskId: form.get("taskId"), agentId: form.get("agentId"), note: form.get("note") ?? "" });
  if (!parsed.success) return { status: "error", message: parsed.error.issues.some((i) => i.path[0] === "note") ? "Keep the note under 500 characters." : "Choose a computer, then try again." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error };
  const r = await requestHandoff({ handoffs: createSupabaseHandoffStore(p.admin), checks: createSupabaseAgentStore(p.admin) }, p.person, { taskId: parsed.data.taskId, agentId: parsed.data.agentId, note: parsed.data.note || null });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/tasks/${parsed.data.taskId}`);
  return { status: "sent" };
}

export type WithdrawState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

/** Takes a handoff back before the computer picks it up. Says when it's too late. */
export async function cancelHandoffAction(_previous: WithdrawState, form: FormData): Promise<WithdrawState> {
  const parsed = z.object({ taskId: z.uuid(), handoffId: z.uuid() }).safeParse({ taskId: form.get("taskId"), handoffId: form.get("handoffId") });
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error };
  const r = await cancelHandoff({ handoffs: createSupabaseHandoffStore(p.admin) }, p.person, parsed.data.handoffId);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/tasks/${parsed.data.taskId}`);
  return { status: "done", message: "Withdrawn. The computer won't run these checks." };
}
