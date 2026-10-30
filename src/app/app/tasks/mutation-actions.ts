"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { startMutationRun } from "@/server/mutation/runner";
import { mutationDeps } from "@/server/mutation/wiring";
import { loadAppContext } from "@/server/workspace/context";

export type MutationState = { status: "idle" } | { status: "started" } | { status: "error"; message: string };

/** Runs a mutation trial on a change waiting for review (ADR 0136). Nothing is applied. */
export async function runMutationAction(_previous: MutationState, form: FormData): Promise<MutationState> {
  const parsed = z.object({ proposalId: z.uuid(), taskId: z.uuid() }).safeParse({ proposalId: form.get("proposalId"), taskId: form.get("taskId") });
  if (!parsed.success) return { status: "error", message: "That change couldn't be found. Reload the page." };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only. Sign in to run trials on your own changes." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { status: "error", message: "Create or join a workspace first." };
  const person = { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions };
  const wiring = await mutationDeps(person);
  if (!wiring.ok) return { status: "error", message: wiring.reason };
  const r = await startMutationRun(wiring.deps, person, parsed.data.proposalId);
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/tasks/${parsed.data.taskId}`);
  return { status: "started" };
}
