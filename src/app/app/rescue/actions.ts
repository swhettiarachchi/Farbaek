"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { startSecurityCheck } from "@/server/security/runner";
import { securityCheckDeps } from "@/server/security/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { rescueImport } from "@/server/workspace/rescue";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type RescueState = { status: "error"; message: string };

const RescueInput = z.object({
  name: z.string().trim().min(1).max(80),
  files: z
    .array(z.object({ path: z.string().max(1000), content: z.string() }))
    .min(1)
    .max(WORKSPACE_LIMITS.maxProjectFiles),
});

/**
 * Makes a project from files unpacked in the browser and starts a security
 * check on it (Phase D). The browser's screening is advisory: the import
 * screens every file again on the server, under the same limits.
 */
export async function rescueImportAction(input: { name: string; files: { path: string; content: string }[] }): Promise<RescueState> {
  const parsed = RescueInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "The files couldn't be read. Try the zip again, or a smaller one." };

  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/rescue");
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only. Sign in to check your own app." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { status: "error", message: "Create or join a workspace first." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "The server isn't configured for writes." };

  const person = { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions };
  const wiring = await securityCheckDeps(person);
  const startCheck = wiring.ok ? (projectId: string) => startSecurityCheck(wiring.deps, person, projectId) : { unavailable: wiring.reason };

  const result = await rescueImport(createSupabaseWriteDeps(user, admin, ctx.user.id), startCheck, { orgId: person.orgId, userId: person.userId, ...parsed.data });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");

  const { projectId, imported, check } = result.value;
  // The security page shows the running check, or why one didn't start, and offers to run it again.
  if ("error" in imported) redirect(`/app/projects/${projectId}?rescue=import_failed`);
  redirect(`/app/projects/${projectId}/security${"reportId" in check ? "" : "?rescue=not_started"}`);
}
