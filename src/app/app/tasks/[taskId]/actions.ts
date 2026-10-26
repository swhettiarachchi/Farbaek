"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { loadAppContext } from "@/server/workspace/context";
import { startTaskVerification } from "@/server/verification/runner";
import { verificationDeps } from "@/server/verification/wiring";

export type VerifyActionState = { status: "idle" } | { status: "error"; message: string } | { status: "started" };

/** Runs an applied change's checks in one step (ADR 0047). Every check is made again on the server and in the database. */
export async function startVerificationAction(_previous: VerifyActionState, form: FormData): Promise<VerifyActionState> {
  const taskId = z.uuid().safeParse(form.get("taskId"));
  if (!taskId.success) return { status: "error", message: "That task doesn't exist." };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { status: "error", message: "Create or join a workspace first." };
  const person = { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions };
  const wiring = await verificationDeps(person);
  if (!wiring.ok) return { status: "error", message: wiring.reason };
  const started = await startTaskVerification(wiring.deps, person, taskId.data, "person");
  if (!started.ok) return { status: "error", message: started.message };
  revalidatePath(`/app/tasks/${taskId.data}`);
  return { status: "started" };
}
