"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { WORKSPACE_COOKIE, isDemoMode, loadAppContext, type AppContext } from "@/server/workspace/context";
import { mapCreateOrganizationError } from "@/server/workspace/organizations";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { MANAGER_ROLES } from "@/server/workspace/types";
import { EMPTY_CONTRACT_FORM, type ContractFormValues } from "@/core/realityloop/contract-form";
import { approveContract, archiveProject, cancelTask, createProject, createTask, saveContract, type ProjectAdminDeps, type WriteDeps } from "@/server/workspace/use-cases";
import { draftContractWithAi, type AiCreditDeps } from "@/server/workspace/ai-drafting";
import { deleteProjectFile, importProjectFiles, saveProjectFile, type FileDeps, type ImportSummary } from "@/server/workspace/files";
import { WORKSPACE_LIMITS } from "@/config/workspace";
import { createChangeProposer, createContractDrafter } from "@/server/ai/providers";
import { MAX_CONTEXT_FILES, applyProposal, discardProposal, proposeChange, type ProposalDeps } from "@/server/workspace/proposals";
import { recoverChange, type RecoveryDeps } from "@/server/workspace/recovery";
import { acceptInvitation, createInvitation, revokeInvitation, type InvitationDeps } from "@/server/workspace/invitations";
import { createAgentPairing, revokeAgent, type AgentAdminDeps } from "@/server/workspace/agents";
import { loadUsageMeters } from "@/server/workspace/usage-summary";
import { STARTERS, getStarter } from "@/content/starters";
import type { UsageMeter } from "@/core/billing/usage-view";
import { siteUrl } from "@/server/supabase/config";
import { resolveAiProvider } from "@/server/ai/config";
import { currentExecutionMode } from "@/server/execution/sandbox";

export type FormState = { status: "idle" } | { status: "error"; message: string; values?: Record<string, string> } | { status: "done"; message: string };

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

async function requireContext(): Promise<AppContext> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

/** Resolves write dependencies, or the honest reason writes are unavailable. */
async function writeDeps(ctx: AppContext): Promise<{ deps: WriteDeps & AiCreditDeps & FileDeps & ProposalDeps & ProjectAdminDeps & RecoveryDeps & InvitationDeps & AgentAdminDeps; orgId: string } | { error: string }> {
  if (!ctx.writes.enabled) return { error: ctx.writes.reason };
  if (!ctx.current) return { error: "Create a workspace first." };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: "The server isn't configured for writes." };
  return { deps: createSupabaseWriteDeps(user, admin, ctx.user.id), orgId: ctx.current.id };
}

export async function createOrganization(_previous: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  if (name.length < 1 || name.length > 80) return { status: "error", message: "Use a name between 1 and 80 characters.", values: { name } };
  if (isDemoMode()) return { status: "error", message: "The demo workspace is read-only.", values: { name } };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Supabase isn't connected in this environment.", values: { name } };
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/sign-in");

  // The database function enforces email verification, ownership and the one-trial-per-user rule.
  const { data, error } = await supabase.rpc("create_organization", { p_name: name });
  if (error) return { status: "error", message: mapCreateOrganizationError(error.message).message, values: { name } };

  const id = z.string().safeParse(data);
  if (id.success) (await cookies()).set(WORKSPACE_COOKIE, id.data, COOKIE_OPTIONS);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function switchWorkspace(form: FormData) {
  const ctx = await requireContext();
  const orgId = String(form.get("orgId") ?? "");
  // Only workspaces the user can already read are accepted.
  if (ctx.workspaces.some((w) => w.id === orgId)) (await cookies()).set(WORKSPACE_COOKIE, orgId, COOKIE_OPTIONS);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export async function createProjectAction(_previous: FormState, form: FormData): Promise<FormState> {
  const starter = getStarter(form.get("starter")) ?? STARTERS[0]!;
  const values = { name: String(form.get("name") ?? ""), description: String(form.get("description") ?? ""), starter: starter.id };
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error, values };

  const result = await createProject(w.deps, { orgId: w.orgId, userId: ctx.user.id, name: values.name, description: values.description });
  if (!result.ok) return { status: "error", message: result.message, values };
  revalidatePath("/app", "layout");
  if (starter.files.length > 0) {
    // The starter goes through the same screening and limits as any import. If it fails, the empty project stays and its page says so.
    const imported = await importProjectFiles(w.deps, { orgId: w.orgId, userId: ctx.user.id, projectId: result.value, files: starter.files });
    if (!imported.ok) redirect(`/app/projects/${result.value}?starter=failed`);
  }
  redirect(`/app/projects/${result.value}`);
}

export async function createTaskAction(_previous: FormState, form: FormData): Promise<FormState> {
  const values = { title: String(form.get("title") ?? "") };
  const projectId = String(form.get("projectId") ?? "");
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error, values };

  const result = await createTask(w.deps, { orgId: w.orgId, userId: ctx.user.id, projectId, title: values.title });
  if (!result.ok) return { status: "error", message: result.message, values };
  revalidatePath("/app", "layout");
  redirect(`/app/tasks/${result.value}`);
}

export async function cancelTaskAction(_previous: FormState, form: FormData): Promise<FormState> {
  const taskId = String(form.get("taskId") ?? "");
  const expectedVersion = Number(form.get("expectedVersion"));
  if (!Number.isInteger(expectedVersion) || expectedVersion < 0) return { status: "error", message: "Reload the page and try again." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };

  const result = await cancelTask(w.deps, { orgId: w.orgId, userId: ctx.user.id, taskId, expectedVersion });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", message: "Task cancelled." };
}

function contractValues(form: FormData): ContractFormValues {
  const values = { ...EMPTY_CONTRACT_FORM };
  for (const key of Object.keys(values) as (keyof ContractFormValues)[]) values[key] = String(form.get(key) ?? "").slice(0, 4000);
  return values;
}

export async function saveContractAction(_previous: FormState, form: FormData): Promise<FormState> {
  const values = contractValues(form);
  const taskId = String(form.get("taskId") ?? "");
  const expectedTaskVersion = Number(form.get("expectedTaskVersion"));
  const basedOn = Number(form.get("basedOn"));
  if (![expectedTaskVersion, basedOn].every((n) => Number.isInteger(n) && n >= 0)) {
    return { status: "error", message: "Reload the page and try again.", values: { ...values } };
  }

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error, values: { ...values } };

  const result = await saveContract(w.deps, { orgId: w.orgId, userId: ctx.user.id, taskId, expectedTaskVersion, basedOn, form: values });
  if (!result.ok) return { status: "error", message: result.message, values: { ...values } };
  revalidatePath("/app", "layout");
  return { status: "done", message: `Contract version ${result.value} saved. Review it, then approve this exact version.` };
}

export async function approveContractAction(_previous: FormState, form: FormData): Promise<FormState> {
  const taskId = String(form.get("taskId") ?? "");
  const expectedTaskVersion = Number(form.get("expectedTaskVersion"));
  const version = Number(form.get("version"));
  const sha256 = String(form.get("sha256") ?? "");
  if (![expectedTaskVersion, version].every((n) => Number.isInteger(n) && n >= 0)) return { status: "error", message: "Reload the page and try again." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };

  const result = await approveContract(w.deps, { orgId: w.orgId, userId: ctx.user.id, taskId, expectedTaskVersion, version, sha256 });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", message: "Contract approved." };
}

export type AiDraftState =
  | { status: "error"; message: string }
  | { status: "done"; values: ContractFormValues; model: string; usage: { percent: number | null } };

/**
 * Drafts contract fields with AI for the person to review. Nothing is saved:
 * the editor is prefilled and the normal save and approval steps still apply.
 */
export async function draftContractWithAiAction(form: FormData): Promise<AiDraftState> {
  const taskId = String(form.get("taskId") ?? "");
  const notes = Object.fromEntries(Object.entries(contractValues(form)).filter(([, v]) => v.trim() !== ""));

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const ai = resolveAiProvider();
  if (!ai.provider) return { status: "error", message: `${ai.reason} You can still write the contract yourself.` };

  // Read through Row Level Security: the task and project must be visible to this user.
  const found = await ctx.reader.getTask(w.orgId, taskId);
  if (!found) return { status: "error", message: "That task doesn't exist or isn't in this workspace." };
  const project = await ctx.reader.getProject(w.orgId, found.task.projectId);

  const result = await draftContractWithAi(w.deps, createContractDrafter(ai.provider), {
    orgId: w.orgId,
    userId: ctx.user.id,
    taskId: found.task.id,
    brief: { taskTitle: found.task.title, projectName: project?.name ?? "Project", projectDescription: project?.description ?? null, notes },
  });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", values: result.value.form, model: result.value.model, usage: result.value.usage };
}

export type ImportState = { status: "error"; message: string } | { status: "done"; summary: ImportSummary };

const ImportInput = z.object({
  projectId: z.uuid(),
  files: z
    .array(z.object({ path: z.string().max(1000), content: z.string() }))
    .min(1)
    .max(WORKSPACE_LIMITS.maxProjectFiles),
});

/** Imports text files into a project. The browser's preview is advisory; the server screens again. */
export async function importFilesAction(input: { projectId: string; files: { path: string; content: string }[] }): Promise<ImportState> {
  const parsed = ImportInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "The selected files couldn't be read. Try again with fewer files." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  // Read through Row Level Security: the project must be in the current workspace.
  const project = await ctx.reader.getProject(w.orgId, parsed.data.projectId);
  if (!project) return { status: "error", message: "That project doesn't exist or isn't in this workspace." };

  const result = await importProjectFiles(w.deps, { orgId: w.orgId, userId: ctx.user.id, projectId: project.id, files: parsed.data.files });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/app/projects/${project.id}`, "layout");
  return { status: "done", summary: result.value };
}

export type SaveFileState = { status: "error"; message: string } | { status: "done"; revision: number; path: string };

const SaveFileInput = z.object({
  projectId: z.uuid(),
  path: z.string().min(1).max(1000),
  content: z.string().max(WORKSPACE_LIMITS.maxFileBytes * 4),
  expectedRevision: z.number().int().min(0),
});

/** Saves one file as a new revision. The person has already reviewed the diff in the editor. */
export async function saveFileAction(input: { projectId: string; path: string; content: string; expectedRevision: number }): Promise<SaveFileState> {
  const parsed = SaveFileInput.safeParse(input);
  if (!parsed.success) return { status: "error", message: "The file couldn't be read. Reload the page and try again." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const project = await ctx.reader.getProject(w.orgId, parsed.data.projectId);
  if (!project) return { status: "error", message: "That project doesn't exist or isn't in this workspace." };

  const result = await saveProjectFile(w.deps, { orgId: w.orgId, userId: ctx.user.id, ...parsed.data, projectId: project.id, path: parsed.data.path.trim() });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/app/projects/${project.id}`, "layout");
  return { status: "done", revision: result.value, path: parsed.data.path.trim().replace(/^\.\//, "") };
}

/** Restores an earlier revision by saving its content as the next revision. History is never rewritten. */
export async function restoreRevisionAction(input: { projectId: string; path: string; revision: number; expectedRevision: number }): Promise<SaveFileState> {
  const parsed = z
    .object({ projectId: z.uuid(), path: z.string().min(1).max(1000), revision: z.number().int().min(1), expectedRevision: z.number().int().min(0) })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const project = await ctx.reader.getProject(w.orgId, parsed.data.projectId);
  if (!project) return { status: "error", message: "That project doesn't exist or isn't in this workspace." };
  const content = await ctx.reader.getFileRevision(w.orgId, project.id, parsed.data.path, parsed.data.revision);
  if (content === null) return { status: "error", message: "That revision has no content to restore." };

  const result = await saveProjectFile(w.deps, {
    orgId: w.orgId,
    userId: ctx.user.id,
    projectId: project.id,
    path: parsed.data.path,
    content,
    expectedRevision: parsed.data.expectedRevision,
  });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/app/projects/${project.id}`, "layout");
  return { status: "done", revision: result.value, path: parsed.data.path };
}

export async function deleteFileAction(_previous: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId") ?? "");
  const path = String(form.get("path") ?? "");
  const expectedRevision = Number(form.get("expectedRevision"));
  if (!Number.isInteger(expectedRevision) || expectedRevision < 1) return { status: "error", message: "Reload the page and try again." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const project = await ctx.reader.getProject(w.orgId, projectId);
  if (!project) return { status: "error", message: "That project doesn't exist or isn't in this workspace." };

  const result = await deleteProjectFile(w.deps, { orgId: w.orgId, userId: ctx.user.id, projectId: project.id, path, expectedRevision });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath(`/app/projects/${project.id}`, "layout");
  redirect(`/app/projects/${project.id}/files`);
}

export type ProposeState = { status: "error"; message: string } | { status: "done"; proposalId: string; outcome: "pending" | "blocked" };

/** Asks the agent for a change under the approved contract. Nothing is applied until a person approves it. */
export async function proposeChangeAction(input: { taskId: string; contextPaths: string[]; notes: string }): Promise<ProposeState> {
  const parsed = z
    .object({ taskId: z.uuid(), contextPaths: z.array(z.string().max(1000)).max(MAX_CONTEXT_FILES * 2), notes: z.string().max(4000) })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "Choose up to 20 files and keep the notes under 4,000 characters." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const ai = resolveAiProvider();
  if (!ai.provider) return { status: "error", message: `${ai.reason} You can still edit the files yourself.` };
  const found = await ctx.reader.getTask(w.orgId, parsed.data.taskId);
  if (!found) return { status: "error", message: "That task doesn't exist or isn't in this workspace." };
  const project = await ctx.reader.getProject(w.orgId, found.task.projectId);

  const result = await proposeChange(w.deps, createChangeProposer(ai.provider), {
    orgId: w.orgId,
    userId: ctx.user.id,
    taskId: found.task.id,
    contextPaths: parsed.data.contextPaths,
    notes: parsed.data.notes,
    taskTitle: found.task.title,
    projectName: project?.name ?? "Project",
  });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", proposalId: result.value.proposalId, outcome: result.value.status };
}

export type ApplyState = { status: "error"; message: string } | { status: "done"; written: number };

/** Applies the exact content the person accepted in the review, as new file revisions. */
export async function applyProposalAction(input: { proposalId: string; reviewedSha256: string; files: { path: string; content: string }[] }): Promise<ApplyState> {
  const parsed = z
    .object({
      proposalId: z.uuid(),
      reviewedSha256: z.string().regex(/^[0-9a-f]{64}$/),
      files: z.array(z.object({ path: z.string().max(1000), content: z.string().max(WORKSPACE_LIMITS.maxFileBytes * 4) })).min(1).max(30),
    })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and review the proposal again." };

  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const result = await applyProposal(w.deps, { orgId: w.orgId, userId: ctx.user.id, ...parsed.data, execution: currentExecutionMode() });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", written: result.value.written };
}

export type RecoverState = { status: "error"; message: string } | { status: "done"; restored: number; complete: boolean };

/** Undoes an applied change for the files the person chose, bound to the plan they reviewed. */
export async function recoverChangeAction(input: { proposalId: string; planSha256: string; paths: string[] }): Promise<RecoverState> {
  const parsed = z
    .object({ proposalId: z.uuid(), planSha256: z.string().regex(/^[0-9a-f]{64}$/), paths: z.array(z.string().min(1).max(1000)).max(30) })
    .safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and review the undo again." };
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const result = await recoverChange(w.deps, { orgId: w.orgId, userId: ctx.user.id, ...parsed.data });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", restored: result.value.restored, complete: result.value.status === "recovered" };
}

export async function discardProposalAction(input: { proposalId: string }): Promise<ApplyState> {
  const parsed = z.object({ proposalId: z.uuid() }).safeParse(input);
  if (!parsed.success) return { status: "error", message: "Reload the page and try again." };
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const result = await discardProposal(w.deps, { orgId: w.orgId, userId: ctx.user.id, proposalId: parsed.data.proposalId });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  return { status: "done", written: 0 };
}

export async function archiveProjectAction(_previous: FormState, form: FormData): Promise<FormState> {
  const projectId = String(form.get("projectId") ?? "");
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const project = await ctx.reader.getProject(w.orgId, projectId);
  if (!project) return { status: "error", message: "That project doesn't exist or isn't in this workspace." };
  const result = await archiveProject(w.deps, { orgId: w.orgId, userId: ctx.user.id, projectId: project.id });
  if (!result.ok) return { status: "error", message: result.message };
  revalidatePath("/app", "layout");
  redirect("/app/projects");
}

export async function renameWorkspaceAction(_previous: FormState, form: FormData): Promise<FormState> {
  const name = String(form.get("name") ?? "").trim();
  const values = { name };
  if (name.length < 1 || name.length > 80) return { status: "error", message: "Use a name between 1 and 80 characters.", values };

  const ctx = await requireContext();
  if (ctx.mode === "demo") return { status: "error", message: "The demo workspace is read-only.", values };
  if (!ctx.current || !ctx.role || !MANAGER_ROLES.includes(ctx.role)) {
    return { status: "error", message: "Only owners and admins can rename this workspace.", values };
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Supabase isn't connected in this environment.", values };
  // Row Level Security allows this update for owners and admins only.
  const { data, error } = await supabase.from("organizations").update({ name }).eq("id", ctx.current.id).select("id");
  if (error || !data?.length) return { status: "error", message: "The name couldn't be saved. Nothing was changed.", values };
  revalidatePath("/app", "layout");
  return { status: "done", message: "Workspace renamed." };
}

export type InviteState = { status: "idle" } | { status: "error"; message: string } | { status: "created"; link: string; email: string; role: string; expiresAt: string };

/** Creates a one-time invitation link for an email address and role. The link is returned once and never stored. */
export async function inviteMemberAction(_previous: InviteState, form: FormData): Promise<InviteState> {
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const r = await createInvitation(w.deps, { orgId: w.orgId, userId: ctx.user.id, email: form.get("email"), role: form.get("role") });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/app/settings");
  return { status: "created", link: `${siteUrl()}/invite/${r.value.token}`, email: r.value.email, role: r.value.role, expiresAt: r.value.expiresAt };
}

export async function revokeInvitationAction(form: FormData): Promise<void> {
  const parsed = z.uuid().safeParse(form.get("invitationId"));
  if (!parsed.success) return;
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return;
  await revokeInvitation(w.deps, { orgId: w.orgId, userId: ctx.user.id, invitationId: parsed.data });
  revalidatePath("/app/settings");
}

export type AcceptInviteState = { status: "idle" } | { status: "error"; message: string };

/** Joins the workspace an invitation is for, as the signed-in person, then opens it. */
export async function acceptInvitationAction(_previous: AcceptInviteState, form: FormData): Promise<AcceptInviteState> {
  const token = String(form.get("token") ?? "");
  const ctx = await loadAppContext();
  if (!ctx) redirect(`/sign-in?next=${encodeURIComponent(`/invite/${token}`)}`);
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { status: "error", message: "The server isn't configured for this yet." };
  const r = await acceptInvitation({ ...createSupabaseWriteDeps(user, admin, ctx.user.id), now: () => new Date() }, { userId: ctx.user.id, token });
  if (!r.ok) return { status: "error", message: r.message };
  (await cookies()).set(WORKSPACE_COOKIE, r.value.orgId, COOKIE_OPTIONS);
  revalidatePath("/app", "layout");
  redirect("/app");
}

export type PairAgentState = { status: "idle" } | { status: "error"; message: string } | { status: "created"; code: string; expiresAt: string };

/** Creates a one-time pairing code for the desktop app. The code is returned once; only its hash is stored. */
export async function pairAgentAction(): Promise<PairAgentState> {
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error };
  const r = await createAgentPairing(w.deps, { orgId: w.orgId, userId: ctx.user.id });
  if (!r.ok) return { status: "error", message: r.message };
  return { status: "created", code: r.value.code, expiresAt: r.value.expiresAt };
}

export async function revokeAgentAction(form: FormData): Promise<void> {
  const parsed = z.uuid().safeParse(form.get("agentId"));
  if (!parsed.success) return;
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return;
  await revokeAgent(w.deps, { orgId: w.orgId, userId: ctx.user.id, agentId: parsed.data });
  revalidatePath("/app/agents");
}

/** Usage for the sidebar panel, read when it opens. Percentages and reset times only; counts stay on the server. */
export async function loadUsageAction(): Promise<{ ok: true; meters: UsageMeter[] } | { ok: false }> {
  const ctx = await loadAppContext();
  if (!ctx?.current) return { ok: false };
  try {
    return { ok: true, meters: await loadUsageMeters(ctx, ctx.current) };
  } catch {
    return { ok: false };
  }
}

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in");
}
