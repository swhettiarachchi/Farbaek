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
import { approveContract, cancelTask, createProject, createTask, saveContract, type WriteDeps } from "@/server/workspace/use-cases";

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
async function writeDeps(ctx: AppContext): Promise<{ deps: WriteDeps; orgId: string } | { error: string }> {
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
  const values = { name: String(form.get("name") ?? ""), description: String(form.get("description") ?? "") };
  const ctx = await requireContext();
  const w = await writeDeps(ctx);
  if ("error" in w) return { status: "error", message: w.error, values };

  const result = await createProject(w.deps, { orgId: w.orgId, userId: ctx.user.id, name: values.name, description: values.description });
  if (!result.ok) return { status: "error", message: result.message, values };
  revalidatePath("/app", "layout");
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

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  redirect("/sign-in");
}
