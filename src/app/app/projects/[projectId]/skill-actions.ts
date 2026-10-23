"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isProjectSkillPath, parseSkill, SKILL_LIMITS } from "@/core/agent/skills";
import { sha256Hex } from "@/core/trust/canonical-json";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { deleteProjectFile, saveProjectFile } from "@/server/workspace/files";
import { pinProjectSkill, unpinProjectSkill } from "@/server/workspace/skill-pins";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type SkillState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

async function writer(projectId: string) {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode !== "live") return { error: "Skills need a real workspace." };
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current) return { error: "Create or join a workspace first." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "The server isn't configured for writes." };
  // Read through Row Level Security: the project must be in this workspace.
  const project = await ctx.reader.getProject(ctx.current.id, projectId);
  if (!project) return { error: "That project doesn't exist in this workspace." };
  if (project.archivedAt) return { error: "This project is archived." };
  return { ctx, deps: createSupabaseWriteDeps(user, admin, ctx.user.id), orgId: ctx.current.id };
}

/**
 * Adds (or replaces) a skill in the project as `.farbaek/skills/<name>/SKILL.md`
 * (ADR 0030). It's an ordinary project file, so it goes through the same
 * screening, limits and revision history as any file.
 */
export async function addSkillAction(_previous: SkillState, form: FormData): Promise<SkillState> {
  const parsed = z.object({ projectId: z.uuid(), content: z.string().max(SKILL_LIMITS.bodyChars + 4_000) }).safeParse({ projectId: form.get("projectId"), content: form.get("content") });
  if (!parsed.success) return { status: "error", message: `Keep a skill under ${SKILL_LIMITS.bodyChars.toLocaleString("en-US")} characters of instructions.` };
  const skill = parseSkill(parsed.data.content, "", "project");
  if (!skill) return { status: "error", message: "Give the skill a name (in a frontmatter block or the first line) and some instructions." };
  const w = await writer(parsed.data.projectId);
  if ("error" in w) return { status: "error", message: w.error! };

  const path = `.farbaek/skills/${skill.id}/SKILL.md`;
  const existing = await w.ctx.reader.getFile(w.orgId, parsed.data.projectId, path).catch(() => null);
  const r = await saveProjectFile(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path, content: parsed.data.content, expectedRevision: existing?.revision ?? 0 });
  if (!r.ok) return { status: "error", message: r.message };
  // The person wrote this version here, so it's approved as written (ADR 0043).
  const pinned = await pinProjectSkill(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path, revision: r.value, sha256: await sha256Hex(parsed.data.content) });
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  if (!pinned.ok) return { status: "done", message: `Saved the ${skill.name} skill, but it wasn't approved: ${pinned.message} Review it below to approve it.` };
  return { status: "done", message: existing ? `Updated and approved the ${skill.name} skill.` : `Added the ${skill.name} skill. It applies to this project's next build.` };
}

/**
 * Approves a skill at the exact revision and hash the person reviewed
 * (ADR 0043). Runs use a project skill only in its approved version.
 */
export async function pinSkillAction(_previous: SkillState, form: FormData): Promise<SkillState> {
  const parsed = z
    .object({ projectId: z.uuid(), path: z.string().max(300), revision: z.coerce.number().int().positive(), sha256: z.string().regex(/^[0-9a-f]{64}$/) })
    .safeParse({ projectId: form.get("projectId"), path: form.get("path"), revision: form.get("revision"), sha256: form.get("sha256") });
  if (!parsed.success || !isProjectSkillPath(parsed.data.path)) return { status: "error", message: "That isn't a skill file of this project." };
  const w = await writer(parsed.data.projectId);
  if ("error" in w) return { status: "error", message: w.error! };
  const r = await pinProjectSkill(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, ...parsed.data });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  return { status: "done", message: "Approved. The next build in this project uses this version." };
}

/** Removes a project skill's SKILL.md (its history stays in the file's revisions). */
export async function removeSkillAction(form: FormData): Promise<void> {
  const parsed = z.object({ projectId: z.uuid(), path: z.string().max(300), revision: z.coerce.number().int().positive() }).safeParse({ projectId: form.get("projectId"), path: form.get("path"), revision: form.get("revision") });
  if (!parsed.success || !isProjectSkillPath(parsed.data.path)) return;
  const w = await writer(parsed.data.projectId);
  if ("error" in w) return;
  const removed = await deleteProjectFile(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path: parsed.data.path, expectedRevision: parsed.data.revision });
  // A removed skill keeps no approval, so a file added later at the same path is reviewed afresh.
  if (removed.ok) await unpinProjectSkill(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path: parsed.data.path });
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
}
