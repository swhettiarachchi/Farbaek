"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { startSecurityCheck } from "@/server/security/runner";
import { listSecurityReports } from "@/server/security/store";
import { securityCheckDeps } from "@/server/security/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { createTask } from "@/server/workspace/use-cases";

export type SecurityActionState = { status: "idle" } | { status: "error"; message: string } | { status: "started" };

async function person() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current || !ctx.role) return { error: "Create or join a workspace first." };
  return { ctx, person: { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role } };
}

/** Starts a security check on a project (ADR 0024). Every check is made again on the server. */
export async function startSecurityCheckAction(_previous: SecurityActionState, form: FormData): Promise<SecurityActionState> {
  const projectId = z.uuid().safeParse(form.get("projectId"));
  if (!projectId.success) return { status: "error", message: "That project doesn't exist." };
  const p = await person();
  if ("error" in p) return { status: "error", message: p.error! };
  const wiring = await securityCheckDeps(p.person);
  if (!wiring.ok) return { status: "error", message: wiring.reason };
  const started = await startSecurityCheck(wiring.deps, p.person, projectId.data);
  if (!started.ok) return { status: "error", message: started.message };
  revalidatePath(`/app/projects/${projectId.data}/security`);
  return { status: "started" };
}

/** Turns one finding into a task in the project, ready for a contract and the agent. */
export async function fixWithAgentAction(form: FormData): Promise<void> {
  const parsed = z.object({ projectId: z.uuid(), reportId: z.uuid(), findingId: z.string().regex(/^F\d{3}$/) }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return;
  const p = await person();
  if ("error" in p) return;
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return;
  const report = (await listSecurityReports(user, p.person.orgId, parsed.data.projectId, 20)).find((r) => r.id === parsed.data.reportId);
  const finding = report?.statement?.predicate.findings.find((f) => f.id === parsed.data.findingId);
  if (!finding) return;
  const where = finding.file ? ` in ${finding.file}${finding.line ? `:${finding.line}` : ""}` : "";
  const title = `Fix: ${finding.title}${where}`.slice(0, 200);
  const created = await createTask(createSupabaseWriteDeps(user, admin, p.person.userId), { orgId: p.person.orgId, userId: p.person.userId, projectId: parsed.data.projectId, title });
  if (created.ok) {
    revalidatePath("/app", "layout");
    redirect(`/app/tasks/${created.value}`);
  }
}
