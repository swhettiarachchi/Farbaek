"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/ui/confirm-action";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { deleteProjectFile, saveProjectFile } from "@/server/workspace/files";
import { guestSession, loadGuestProject, type GuestProject } from "@/server/workspace/guest-context";
import { acceptGuestInvitation, leaveSharedProject } from "@/server/workspace/sharing";
import { createSupabaseSharingDeps } from "@/server/workspace/sharing-wiring";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { MESSAGES, createTask } from "@/server/workspace/use-cases";

export type AcceptGuestState = { status: "idle" } | { status: "error"; message: string };
export type GuestFileState = { status: "idle" } | { status: "error"; message: string } | { status: "saved"; revision: number; path: string };
export type GuestTaskState = { status: "idle" } | { status: "error"; message: string } | { status: "created"; title: string };

const NO_SERVER = "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com.";

/** Joins one project as a guest. The server checks the invitation, the signed-in address and the seats again. */
export async function acceptGuestInvitationAction(_previous: AcceptGuestState, form: FormData): Promise<AcceptGuestState> {
  const token = String(form.get("token") ?? "");
  const session = await guestSession(`/invite/${token}`);
  const admin = createSupabaseAdminClient();
  if (!session || !admin) return { status: "error", message: NO_SERVER };
  const r = await acceptGuestInvitation(createSupabaseSharingDeps(admin), { userId: session.user.id, token });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/shared");
  redirect(`/shared/${r.value.projectId}`);
}

/** Leaves a shared project. Only the guest themselves, for themselves. */
export async function leaveSharedProjectAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const guest = await loadGuestProject(String(form.get("projectId") ?? ""));
  const admin = createSupabaseAdminClient();
  if (!guest) return { status: "error", message: "That project wasn't found." };
  if (!admin) return { status: "error", message: NO_SERVER };
  const r = await leaveSharedProject(createSupabaseSharingDeps(admin), { userId: guest.user.id, projectId: guest.project.id });
  if (!r.ok) return { status: "error", message: r.message };
  revalidatePath("/shared");
  redirect("/shared");
}

type Editor = { error: string } | { guest: GuestProject; deps: ReturnType<typeof createSupabaseWriteDeps> };

/** Writes per guest an hour: plenty for real work, too few to flood someone else's workspace with revisions or tasks. */
const GUEST_WRITES_PER_HOUR = { file: 200, task: 30 } as const;

async function editorDeps(projectId: string, kind: keyof typeof GUEST_WRITES_PER_HOUR): Promise<Editor> {
  const guest = await loadGuestProject(projectId);
  if (!guest) return { error: "That project wasn't found." };
  if (!guest.writes.enabled) return { error: guest.writes.reason };
  const [user, admin] = [await createSupabaseServerClient(), createSupabaseAdminClient()];
  if (!user || !admin) return { error: NO_SERVER };
  // Fails closed: a limiter that can't answer refuses the write.
  const limit = await admin.rpc("app_rate_limit", { p_key: `guest-${kind}:${guest.user.id}`, p_window_seconds: 3600, p_limit: GUEST_WRITES_PER_HOUR[kind] });
  if (limit.error) return { error: "Saving isn't available right now. Try again in a few minutes." };
  if (limit.data !== true) return { error: `You can make ${GUEST_WRITES_PER_HOUR[kind]} ${kind === "file" ? "file changes" : "tasks"} an hour in a shared project. Try again later.` };
  return { guest, deps: createSupabaseWriteDeps(user, admin, guest.user.id) };
}

const SaveInput = z.object({
  projectId: z.uuid(),
  path: z.string().min(1).max(300),
  content: z.string().max(600_000),
  expectedRevision: z.coerce.number().int().min(0),
});

/** Saves one text file as a new revision under the guest's name. FILE_CHANGED means someone saved it first. */
export async function guestSaveFileAction(_previous: GuestFileState, form: FormData): Promise<GuestFileState> {
  const parsed = SaveInput.safeParse({ projectId: form.get("projectId"), path: form.get("path"), content: form.get("content"), expectedRevision: form.get("expectedRevision") });
  if (!parsed.success) return { status: "error", message: "Give the file a path and some text." };
  const e = await editorDeps(parsed.data.projectId, "file");
  if ("error" in e) return { status: "error", message: e.error };
  const r = await saveProjectFile(e.deps, {
    orgId: e.guest.orgId,
    userId: e.guest.user.id,
    projectId: e.guest.project.id,
    path: parsed.data.path.trim(),
    content: parsed.data.content,
    expectedRevision: parsed.data.expectedRevision,
    guest: { access: e.guest.access },
  });
  if (!r.ok) {
    if (r.code === "FILE_CHANGED") return { status: "error", message: "Someone saved this file after you opened it. Copy your text, reload the page, and make your change again." };
    return { status: "error", message: r.message };
  }
  revalidatePath(`/shared/${e.guest.project.id}`);
  // A new file opens on its own page, so the next save there edits it and the new-file form starts clean.
  if (form.get("isNew") === "1") redirect(`/shared/${e.guest.project.id}/file?path=${encodeURIComponent(parsed.data.path.trim())}`);
  return { status: "saved", revision: r.value, path: parsed.data.path.trim() };
}

/** Adds a task for the workspace's people to plan. No AI runs: drafting a plan stays with the workspace. */
export async function guestCreateTaskAction(_previous: GuestTaskState, form: FormData): Promise<GuestTaskState> {
  const projectId = String(form.get("projectId") ?? "");
  const title = String(form.get("title") ?? "");
  const e = await editorDeps(projectId, "task");
  if ("error" in e) return { status: "error", message: e.error };
  const r = await createTask(e.deps, { orgId: e.guest.orgId, userId: e.guest.user.id, projectId: e.guest.project.id, title, guest: { access: e.guest.access } });
  if (!r.ok) return { status: "error", message: r.code === "INVALID_TITLE" ? MESSAGES.INVALID_TITLE : r.message };
  revalidatePath(`/shared/${e.guest.project.id}`);
  return { status: "created", title: title.trim() };
}

/** Deletes one file. Its history keeps every earlier version, so the workspace can bring it back. */
export async function guestDeleteFileAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const parsed = z.object({ projectId: z.uuid(), path: z.string().min(1).max(300), expectedRevision: z.coerce.number().int().min(1) }).safeParse({
    projectId: form.get("projectId"),
    path: form.get("path"),
    expectedRevision: form.get("expectedRevision"),
  });
  if (!parsed.success) return { status: "error", message: "That file wasn't found." };
  const e = await editorDeps(parsed.data.projectId, "file");
  if ("error" in e) return { status: "error", message: e.error };
  const r = await deleteProjectFile(e.deps, {
    orgId: e.guest.orgId,
    userId: e.guest.user.id,
    projectId: e.guest.project.id,
    path: parsed.data.path,
    expectedRevision: parsed.data.expectedRevision,
    guest: { access: e.guest.access },
  });
  if (!r.ok) return { status: "error", message: r.code === "FILE_CHANGED" ? "Someone changed this file after you opened it. Reload the page first." : r.message };
  revalidatePath(`/shared/${e.guest.project.id}`);
  redirect(`/shared/${e.guest.project.id}`);
}
