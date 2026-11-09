"use server";

/**
 * The prompt-first flow (ADR 0027): one sentence becomes a project, a task
 * and a drafted plan, and one approval starts the agent. Every step goes
 * through the same server rules as doing it by hand.
 */
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getBuiltInSkill } from "@/content/skills";
import { getStarter } from "@/content/starters";
import { CAP_CHOICES } from "@/core/agent/run-cap";
import { EFFORTS } from "@/core/agent/routing";
import { createContractDrafter } from "@/server/ai/providers";
import { aiForWorkspace } from "@/server/ai/workspace-ai";
import { kitTierFor } from "@/core/media/kit-tier";
import { SITE_THEMES } from "@/core/media/studio-kit";
import { startCloudRun } from "@/server/cloud-agent/executor";
import { cloudRunDeps } from "@/server/cloud-agent/wiring";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { WORKSPACE_COOKIE, isDemoMode, loadAppContext } from "@/server/workspace/context";
import { mapCreateOrganizationError } from "@/server/workspace/organizations";
import { runCapUnits, runKindFor } from "@/server/workspace/plan-card-data";
import { startFromPrompt } from "@/server/workspace/start-from-prompt";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { approveContract } from "@/server/workspace/use-cases";

export type PromptStartState = { status: "idle" } | { status: "error"; message: string };

const COOKIE_OPTIONS = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 };

/**
 * Turns a prompt into a project, a task and a plan, then opens the plan card.
 * Someone without a workspace gets "My workspace" first (the database applies
 * the email and one-trial rules); the browser then sends the kept prompt again.
 */
export async function startFromPromptAction(_previous: PromptStartState, form: FormData): Promise<PromptStartState> {
  const effort = z.enum(EFFORTS).catch("balanced").parse(form.get("effort"));
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in?next=/app/new");
  if (ctx.mode === "demo" || isDemoMode()) return { status: "error", message: "The demo workspace is read-only. Sign in to build for real." };

  if (!ctx.current) {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return { status: "error", message: "Sign-in isn't connected in this environment." };
    const { data, error } = await supabase.rpc("create_organization", { p_name: "My workspace" });
    if (error) return { status: "error", message: mapCreateOrganizationError(error.message).message };
    const id = z.string().safeParse(data);
    if (id.success) (await cookies()).set(WORKSPACE_COOKIE, id.data, COOKIE_OPTIONS);
    revalidatePath("/app", "layout");
    redirect("/app/new?resume=1");
  }

  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };
  const deps = createSupabaseWriteDeps(user, admin, ctx.user.id);

  // The workspace's own AI key when it has one (ADR 0125), otherwise Farbaek's provider.
  const ai = await aiForWorkspace(ctx.current.id, deps, { timeout: 90_000 });
  const drafter =
    "error" in ai
      ? { unavailable: `${ai.error} You can write the plan yourself.` }
      : { family: ai.provider, create: (s: Parameters<typeof createContractDrafter>[1]) => createContractDrafter(ai.provider, s, ai.client) };
  const draftDeps = "error" in ai ? deps : ai.deps;

  // A follow-up names its project; it must be one this person can see in this workspace, and not archived.
  let existing: { id: string; name: string; description: string | null; paths: string[] } | undefined;
  const projectId = form.get("projectId");
  if (typeof projectId === "string" && projectId) {
    if (!z.uuid().safeParse(projectId).success) return { status: "error", message: "That project doesn't exist." };
    const project = await ctx.reader.getProject(ctx.current.id, projectId);
    if (!project) return { status: "error", message: "That project doesn't exist in this workspace." };
    if (project.archivedAt) return { status: "error", message: "This project is archived, so it can't take new work." };
    const files = await ctx.reader.listFiles(ctx.current.id, project.id).catch(() => []);
    existing = { id: project.id, name: project.name, description: project.description ?? null, paths: files.map((f) => f.path) };
  }

  // A template chosen in the gallery; only known starters are accepted, and a follow-up never gets one.
  const starter = existing ? undefined : (getStarter(form.get("starter"))?.id ?? undefined);
  const result = await startFromPrompt(draftDeps, drafter, { orgId: ctx.current.id, userId: ctx.user.id, prompt: form.get("prompt"), effort, existing, starter });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  redirect(`/app/new/${result.value.taskId}`);
}

export type ApproveBuildState = { status: "idle" } | { status: "error"; message: string; approved?: boolean };

/** Approves the exact plan version the person read (hash-bound), then starts the agent on it. */
export async function approveAndBuildAction(_previous: ApproveBuildState, form: FormData): Promise<ApproveBuildState> {
  const parsed = z
    .object({
      taskId: z.uuid(),
      version: z.coerce.number().int().positive(),
      expectedTaskVersion: z.coerce.number().int().nonnegative(),
      sha256: z.string().regex(/^[0-9a-f]{64}$/),
      effort: z.enum(EFFORTS).catch("balanced"),
      cap: z.enum(CAP_CHOICES).catch("double"),
      theme: z.enum(SITE_THEMES).catch("light"),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };

  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.current || !ctx.role) return { status: "error", message: "Create or join a workspace first." };
  if (!ctx.writes.enabled) return { status: "error", message: ctx.writes.reason };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };

  const { taskId, version, expectedTaskVersion, sha256, effort, cap, theme } = parsed.data;
  const approved = await approveContract(createSupabaseWriteDeps(user, admin, ctx.user.id), { orgId: ctx.current.id, userId: ctx.user.id, taskId, expectedTaskVersion, version, sha256 });
  if (!approved.ok) return { status: "error", message: approved.message };
  revalidatePath("/app", "layout");

  const person = { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions };
  const wiring = await cloudRunDeps(person);
  if (!wiring.ok) return { status: "error", approved: true, message: `The plan is approved. The agent couldn't start: ${wiring.reason}` };
  // Skills chosen on the plan card (ADR 0030): only Farbaek's own ids are accepted.
  const skills = form.getAll("skills").flatMap((v) => (typeof v === "string" && getBuiltInSkill(v) ? [v] : []));
  // A site's first build or a design upgrade: Sonnet on Free and a whole site's estimate (ADR 0158).
  const kind = await runKindFor(ctx.reader, ctx.current.id, taskId);
  const started = await startCloudRun(wiring.deps, { person, taskId, effort, skills, capUnits: runCapUnits(ctx.current, effort, cap, new Date(), kind), kitTier: kitTierFor(ctx.current.plan), designPass: kind.designPass, theme });
  if (!started.ok) return { status: "error", approved: true, message: `The plan is approved. The agent couldn't start: ${started.message}` };
  revalidatePath("/app/build");
  redirect(`/app/build/${started.value.runId}`);
}
