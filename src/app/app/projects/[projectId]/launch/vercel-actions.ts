"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getPlan } from "@/core/billing/catalog";
import { PLAN_LIMITS, filesToRead, planLaunch } from "@/core/launch/planner";
import { vercelSettings } from "@/core/launch/vercel";
import { authorizeVercelLaunch, connectVercel, disconnectVercel } from "@/server/launch/provider-launch";
import { launchDeps } from "@/server/launch/provider-wiring";
import { loadAppContext } from "@/server/workspace/context";

export type VercelState = { status: "idle" } | { status: "done"; message: string } | { status: "error"; message: string };

async function context() {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { error: "The demo workspace is read-only. Sign in to connect your own hosting." } as const;
  if (!ctx.writes.enabled) return { error: ctx.writes.reason } as const;
  if (!ctx.current || !ctx.role) return { error: "Create or join a workspace first." } as const;
  const deps = launchDeps(ctx);
  if (!deps) return { error: "The server isn't configured for this yet." } as const;
  return { ctx, deps, person: { orgId: ctx.current.id, userId: ctx.user.id, role: ctx.role, permissions: ctx.permissions } } as const;
}

/** Connects the workspace's own Vercel account (ADR 0078). The token is sealed on the server and never shown again. */
export async function connectVercelAction(_previous: VercelState, form: FormData): Promise<VercelState> {
  const projectId = z.uuid().safeParse(form.get("projectId"));
  const c = await context();
  if ("error" in c) return { status: "error", message: c.error ?? "" };
  const limit = getPlan(c.ctx.current!.plan.planId).limits.integrations;
  const r = await connectVercel(c.deps, c.person, { token: String(form.get("token") ?? ""), teamId: String(form.get("teamId") ?? "") || null, limit });
  if (!r.ok) return { status: "error", message: r.message };
  if (projectId.success) revalidatePath(`/app/projects/${projectId.data}/launch`);
  return { status: "done", message: `Connected to Vercel as ${r.value.accountName}.` };
}

export async function disconnectVercelAction(form: FormData): Promise<void> {
  const projectId = z.uuid().safeParse(form.get("projectId"));
  const c = await context();
  if ("error" in c) return;
  await disconnectVercel(c.deps, c.person);
  if (projectId.success) revalidatePath(`/app/projects/${projectId.data}/launch`);
}

/**
 * Authorizes and starts one launch of the project's current files to Vercel.
 * The form's key makes a repeated press return the same launch.
 */
export async function launchVercelAction(_previous: VercelState, form: FormData): Promise<VercelState> {
  const parsed = z
    .object({ projectId: z.uuid(), key: z.uuid(), target: z.string().max(100), confirm: z.string().max(100), reason: z.string().max(600).optional() })
    .safeParse({ projectId: form.get("projectId"), key: form.get("key"), target: form.get("target"), confirm: form.get("confirm"), reason: form.get("reason") ?? undefined });
  if (!parsed.success) return { status: "error", message: "The launch form couldn't be read. Reload the page." };
  const c = await context();
  if ("error" in c) return { status: "error", message: c.error ?? "" };
  const { projectId } = parsed.data;
  const project = await c.ctx.reader.getProject(c.person.orgId, projectId);
  if (!project) return { status: "error", message: "That project doesn't exist in this workspace." };

  // The plan is read again from the files as they are now, exactly as the page showed it.
  const contents = await c.ctx.reader.getProjectContents(c.person.orgId, projectId);
  const wanted = new Set(filesToRead(contents.map((f) => f.path)));
  const plan = planLaunch({ paths: contents.map((f) => f.path), texts: Object.fromEntries(contents.filter((f) => wanted.has(f.path)).map((f) => [f.path, f.content.slice(0, PLAN_LIMITS.bytesPerFile)])) });

  const r = await authorizeVercelLaunch(c.deps, c.person, {
    projectId,
    key: parsed.data.key,
    target: parsed.data.target.trim(),
    confirm: parsed.data.confirm,
    overrideReason: parsed.data.reason?.trim() || null,
    plan,
    settings: vercelSettings(plan),
  });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${projectId}/launch`);
  return { status: "done", message: "Launch started. Vercel is building it now; this page follows along." };
}
