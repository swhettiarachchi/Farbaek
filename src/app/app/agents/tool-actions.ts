"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { loadAppContext } from "@/server/workspace/context";
import { MANAGER_ROLES } from "@/server/workspace/types";

export type ToolReviewState = { status: "idle" } | { status: "error"; message: string } | { status: "done" };

/**
 * Approves the tools an agent sent that differ from its pin (ADR 0133),
 * bound to the hash of the set that was reviewed. Owners and admins; the
 * database checks again and refuses a set that changed after the review.
 */
export async function approveAgentToolsAction(input: { agentId: string; manifestId: string }): Promise<ToolReviewState> {
  const parsed = z.object({ agentId: z.uuid(), manifestId: z.string().regex(/^[0-9a-f]{64}$/) }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const ctx = await loadAppContext();
  if (!ctx?.current) return { status: "error", message: "Open a workspace first." };
  if (ctx.mode !== "live") return { status: "error", message: "The demo workspace is read-only." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.role || !MANAGER_ROLES.includes(ctx.role)) return { status: "error", message: "Only owners and admins can approve an agent's tools." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { status: "error", message: "The server isn't configured for this." };
  const { error } = await admin.rpc("app_approve_agent_tools", { p_agent: parsed.data.agentId, p_actor: ctx.user.id, p_manifest_id: parsed.data.manifestId });
  if (error) {
    const message = /TOOLS_CHANGED_AGAIN/.test(error.message)
      ? "The agent's tools changed again since this page loaded. Reload and review the new change."
      : /FORBIDDEN/.test(error.message)
        ? "Only owners and admins can approve an agent's tools."
        : "The tools couldn't be approved. Try again.";
    return { status: "error", message };
  }
  revalidatePath("/app/agents");
  return { status: "done" };
}
