"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export type WatchState = { status: "idle" } | { status: "error"; message: string };

/** Turns a project's outcome watch on or off (ADR 0080). */
export async function setOutcomeWatchAction(_previous: WatchState, form: FormData): Promise<WatchState> {
  const parsed = z.object({ projectId: z.uuid(), on: z.enum(["true", "false"]) }).safeParse({ projectId: form.get("projectId"), on: form.get("on") });
  if (!parsed.success) return { status: "error", message: "That project couldn't be found. Reload the page." };
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.current || !ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { status: "error", message: "Viewers can't change the watch." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "error", message: "The server isn't configured for this yet." };
  const { error } = await admin.rpc("app_set_outcome_watch", { p_org: ctx.current.id, p_actor: ctx.user.id, p_project: parsed.data.projectId, p_on: parsed.data.on === "true" });
  if (error) return { status: "error", message: error.message.includes("NOT_FOUND") ? "That project doesn't exist, or it's archived." : "The watch couldn't be changed. Try again." };
  revalidatePath(`/app/projects/${parsed.data.projectId}/launch`);
  return { status: "idle" };
}
