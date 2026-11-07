"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { isProjectSkillPath, parseSkill, SKILL_LIMITS } from "@/core/agent/skills";
import { libraryFiles, skillFilePath, skillFolder } from "@/core/agent/skill-library";
import { sha256Hex } from "@/core/trust/canonical-json";
import { getLibrarySkill } from "@/content/skills/library";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { deleteProjectFile, saveProjectFile } from "@/server/workspace/files";
import { importSkillFromLink } from "@/server/workspace/skill-import";
import { pinProjectSkill, unpinProjectSkill } from "@/server/workspace/skill-pins";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

export type SkillState = { status: "idle" } | { status: "error"; message: string } | { status: "done"; message: string };

const TOO_MANY = `A build uses at most ${SKILL_LIMITS.projectSkills} of a project's skills. Remove one before adding another.`;

/** The project's files, and whether one more skill at `path` would pass what a build uses. */
async function skillRoom(w: Exclude<Awaited<ReturnType<typeof writer>>, { error: string }>, projectId: string, path: string) {
  const files = await w.ctx.reader.listFiles(w.orgId, projectId);
  const skills = files.filter((f) => isProjectSkillPath(f.path));
  return { files, full: !skills.some((f) => f.path === path) && skills.length >= SKILL_LIMITS.projectSkills };
}

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

  const path = skillFilePath(skill.id);
  if ((await skillRoom(w, parsed.data.projectId, path)).full) return { status: "error", message: TOO_MANY };
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
  // A licence that came with it goes too, so nothing is left behind that no skill needs.
  const licence = `${parsed.data.path.replace(/\/SKILL\.md$/i, "")}/LICENSE.txt`;
  const kept = removed.ok ? await w.ctx.reader.getFile(w.orgId, parsed.data.projectId, licence).catch(() => null) : null;
  if (kept) await deleteProjectFile(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path: licence, expectedRevision: kept.revision });
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  revalidatePath("/app/skills");
}

/**
 * Adds a skill from Farbaek's library (ADR 0179): its SKILL.md and its licence, as ordinary project files. The
 * person chose it from the library, where its text can be read, so it's approved as added, like a pasted skill.
 * A project's own edited copy is never overwritten.
 */
export async function addLibrarySkillAction(_previous: SkillState, form: FormData): Promise<SkillState> {
  const parsed = z.object({ projectId: z.uuid(), skillId: z.string().max(64) }).safeParse({ projectId: form.get("projectId"), skillId: form.get("skillId") });
  if (!parsed.success) return { status: "error", message: "Choose a project to add the skill to." };
  const entry = getLibrarySkill(parsed.data.skillId);
  if (!entry) return { status: "error", message: "That skill isn't in the library any more. Reload the page." };
  const w = await writer(parsed.data.projectId);
  if ("error" in w) return { status: "error", message: w.error! };

  const path = skillFilePath(entry.id);
  const room = await skillRoom(w, parsed.data.projectId, path);
  if (room.full) return { status: "error", message: TOO_MANY };
  const project = await w.ctx.reader.getProject(w.orgId, parsed.data.projectId);
  const where = project ? ` to ${project.name}` : "";
  let revision = 0;
  for (const file of libraryFiles(entry)) {
    const existing = room.files.find((f) => f.path === file.path);
    const sha = await sha256Hex(file.content);
    if (existing?.sha256 === sha) {
      if (file.path === path) revision = existing.revision;
      continue;
    }
    if (existing && file.path === path) {
      return { status: "error", message: `This project already has its own version of ${entry.label}. Remove it first to add the library's.` };
    }
    const r = await saveProjectFile(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path: file.path, content: file.content, expectedRevision: existing?.revision ?? 0 });
    if (!r.ok) return { status: "error", message: r.message };
    if (file.path === path) revision = r.value;
  }
  const pinned = await pinProjectSkill(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path, revision, sha256: await sha256Hex(entry.markdown) });
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  revalidatePath("/app/skills");
  if (!pinned.ok) return { status: "done", message: `Added ${entry.label}${where}, but it wasn't approved: ${pinned.message} Review it on the project's page.` };
  return { status: "done", message: `Added ${entry.label}${where}. Its next build follows it.` };
}

/**
 * Brings a skill in from a GitHub link (ADR 0179). It arrives from outside, so like a skill in an import it
 * waits for a person to read and approve it before any build uses it (ADR 0043).
 */
export async function importSkillAction(_previous: SkillState, form: FormData): Promise<SkillState> {
  const parsed = z.object({ projectId: z.uuid(), link: z.string().trim().min(1).max(500) }).safeParse({ projectId: form.get("projectId"), link: form.get("link") });
  if (!parsed.success) return { status: "error", message: "Paste a GitHub link to a skill." };
  const w = await writer(parsed.data.projectId);
  if ("error" in w) return { status: "error", message: w.error! };
  const found = await importSkillFromLink(fetch, parsed.data.link);
  if (!found.ok) return { status: "error", message: found.message };
  const { skill, text, label, licence } = found.value;

  const path = skillFilePath(skill.id);
  const room = await skillRoom(w, parsed.data.projectId, path);
  if (room.full) return { status: "error", message: TOO_MANY };
  const existing = room.files.find((f) => f.path === path);
  const saved = await saveProjectFile(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path, content: text, expectedRevision: existing?.revision ?? 0 });
  if (!saved.ok) return { status: "error", message: saved.message };
  if (licence) {
    const at = `${skillFolder(skill.id)}/LICENSE.txt`;
    const old = room.files.find((f) => f.path === at);
    await saveProjectFile(w.deps, { orgId: w.orgId, userId: w.ctx.user.id, projectId: parsed.data.projectId, path: at, content: licence.text, expectedRevision: old?.revision ?? 0 });
  }
  revalidatePath(`/app/projects/${parsed.data.projectId}`);
  revalidatePath("/app/skills");
  const long = text.length > SKILL_LIMITS.bodyChars ? ` It's longer than a build reads, so builds use its first ${SKILL_LIMITS.bodyChars.toLocaleString("en-US")} characters.` : "";
  const terms = licence
    ? ` Its licence${licence.name ? ` (${licence.name})` : ""} is saved beside it.`
    : " No licence was found beside it or in the repository, so check you're allowed to use it before approving.";
  return { status: "done", message: `Brought in ${skill.name} from ${label}. Read it below and approve it, and builds start using it.${long}${terms}` };
}
