"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { log } from "@/server/observability/log";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { startFix, type FixDeps } from "@/server/workspace/fixes";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

const Checks = z.object({ predicate: z.object({ checks: z.array(z.object({ name: z.string(), status: z.string() })) }) });

/**
 * Starts a fix for a task whose checks failed (ADR 0101), then opens it so
 * the person reviews its contract. Every rule is checked again on the server
 * and in the database.
 */
export async function startFixAction(form: FormData): Promise<void> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  const source = String(form.get("taskId") ?? "");
  const back = (error: string) => redirect(`/app/tasks/${encodeURIComponent(source)}?fix_error=${encodeURIComponent(error.slice(0, 160))}#fix`);
  if (!ctx.current || !ctx.role) redirect("/app");
  if (!ctx.writes.enabled) back(ctx.writes.reason);
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) back("The server isn't configured for writes.");
  const orgId = ctx.current!.id;

  const deps: FixDeps = {
    write: createSupabaseWriteDeps(user!, admin!, ctx.user.id),
    task: async (o, id) => (await ctx.reader.getTask(o, id))?.task ?? null,
    contract: (o, id) => ctx.reader.getContract(o, id),
    fixFor: (o, id) => ctx.reader.getFixFor(o, id),
    async failedChecks(o, id) {
      const { data } = await admin!.from("sandbox_receipts").select("statement").eq("org_id", o).eq("task_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      const parsed = Checks.safeParse((data as { statement?: unknown } | null)?.statement);
      return parsed.success ? parsed.data.predicate.checks.filter((c) => c.status !== "passed").map((c) => c.name.slice(0, 60)) : [];
    },
    async link(input) {
      const { error } = await admin!.rpc("app_link_fix_task", { p_org: input.orgId, p_actor: input.actor, p_task: input.taskId, p_source: input.sourceId });
      return error ? { ok: false, error: error.message } : { ok: true, value: null };
    },
  };
  const r = await startFix(deps, { orgId, userId: ctx.user.id, role: ctx.role!, permissions: ctx.permissions }, source);
  if (!r.ok) {
    log("warn", "fix.start_refused", { task: source, code: r.code });
    back(r.message);
  }
  redirect(`/app/tasks/${r.ok ? r.value.taskId : source}`);
}
