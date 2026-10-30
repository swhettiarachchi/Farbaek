"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { FAILURE_KINDS } from "@/core/realityloop/failure-futures";
import { startFailureFuture } from "@/server/failure-futures/runner";
import { failureDeps } from "@/server/failure-futures/wiring";
import { loadAppContext } from "@/server/workspace/context";

export type FailureTrialState = { status: "idle" } | { status: "started" } | { status: "error"; message: string };

/** Tries one failure scenario against a change waiting for review (ADR 0135). Nothing is applied. */
export async function tryFailureAction(_previous: FailureTrialState, form: FormData): Promise<FailureTrialState> {
  const parsed = z.object({ proposalId: z.uuid(), taskId: z.uuid(), kind: z.enum(FAILURE_KINDS) }).safeParse({ proposalId: form.get("proposalId"), taskId: form.get("taskId"), kind: form.get("kind") });
  if (!parsed.success) return { status: "error", message: "That scenario couldn't be found. Reload the page." };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only. Sign in to try failures on your own changes." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { status: "error", message: "Create or join a workspace first." };
  const person = { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions };
  const wiring = await failureDeps(person);
  if (!wiring.ok) return { status: "error", message: wiring.reason };
  const r = await startFailureFuture(wiring.deps, person, { proposalId: parsed.data.proposalId, kind: parsed.data.kind });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/tasks/${parsed.data.taskId}`);
  return { status: "started" };
}
