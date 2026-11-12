"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { ActionState } from "@/components/ui/confirm-action";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { siteUrl } from "@/server/supabase/config";
import { loadAppContext, type AppContext } from "@/server/workspace/context";
import { changeGuestAccess, createShareLink, inviteGuest, removeGuest, revokeGuestInvitation, revokeShareLink } from "@/server/workspace/sharing";
import { createSupabaseSharingDeps } from "@/server/workspace/sharing-wiring";
import type { SharingDeps } from "@/server/workspace/sharing";
import type { Project } from "@/server/workspace/types";

export type GuestInviteState = { status: "idle" } | { status: "error"; message: string } | { status: "created"; link: string; email: string; access: string; expiresAt: string };
export type ShareLinkState = { status: "idle" } | { status: "error"; message: string } | { status: "created"; link: string; expiresAt: string | null };

const Id = z.uuid();

/**
 * The person, the sharing deps, and the project, only when it's in their
 * current workspace. `forClosing` lets someone turn a link off or revoke an
 * invitation even while saving is paused (the database allows it too).
 */
type Sharing = { error: string } | { ctx: AppContext; project: Project; deps: SharingDeps };

async function sharingFor(projectId: unknown, forClosing = false): Promise<Sharing> {
  const ctx: AppContext | null = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode !== "live" || !ctx.current) return { error: "Sharing needs a real workspace. This is the demo with sample data." };
  if (!forClosing && !ctx.writes.enabled) return { error: ctx.writes.reason };
  const id = Id.safeParse(projectId);
  if (!id.success) return { error: "That project wasn't found." };
  const project = await ctx.reader.getProject(ctx.current.id, id.data);
  if (!project) return { error: "That project wasn't found." };
  const admin = createSupabaseAdminClient();
  if (!admin) return { error: "Farbaek's server isn't set up to save changes yet. Write to support@farbaek.com." };
  return { ctx, project, deps: createSupabaseSharingDeps(admin) };
}

const refresh = (projectId: string) => revalidatePath(`/app/projects/${projectId}/share`);

export async function inviteGuestAction(_previous: GuestInviteState, form: FormData): Promise<GuestInviteState> {
  const s = await sharingFor(form.get("projectId"));
  if ("error" in s) return { status: "error", message: s.error };
  if (s.project.archivedAt) return { status: "error", message: "This project is archived, so it can't be shared." };
  const r = await inviteGuest(s.deps, { userId: s.ctx.user.id, projectId: s.project.id, email: form.get("email"), access: form.get("access") });
  if (!r.ok) return { status: "error", message: r.message };
  refresh(s.project.id);
  return { status: "created", link: `${siteUrl()}/invite/${r.value.token}`, email: r.value.email, access: r.value.access, expiresAt: r.value.expiresAt };
}

export async function revokeGuestInviteAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const s = await sharingFor(form.get("projectId"), true);
  if ("error" in s) return { status: "error", message: s.error };
  const invitation = Id.safeParse(form.get("invitationId"));
  if (!invitation.success) return { status: "error", message: "That invitation wasn't found." };
  const r = await revokeGuestInvitation(s.deps, { userId: s.ctx.user.id, invitationId: invitation.data });
  if (!r.ok) return { status: "error", message: r.message };
  refresh(s.project.id);
  return { status: "done", message: "Revoked. The link no longer works." };
}

export async function changeGuestAccessAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const s = await sharingFor(form.get("projectId"));
  if ("error" in s) return { status: "error", message: s.error };
  const guest = Id.safeParse(form.get("guestId"));
  if (!guest.success) return { status: "error", message: "That person wasn't found." };
  const r = await changeGuestAccess(s.deps, { userId: s.ctx.user.id, projectId: s.project.id, guestId: guest.data, access: form.get("access") });
  if (!r.ok) return { status: "error", message: r.message };
  refresh(s.project.id);
  return { status: "done", message: form.get("access") === "edit" ? "They can edit now." : "They can view now, and no longer change anything." };
}

export async function removeGuestAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const s = await sharingFor(form.get("projectId"), true);
  if ("error" in s) return { status: "error", message: s.error };
  const guest = Id.safeParse(form.get("guestId"));
  if (!guest.success) return { status: "error", message: "That person wasn't found." };
  const r = await removeGuest(s.deps, { userId: s.ctx.user.id, projectId: s.project.id, guestId: guest.data });
  if (!r.ok) return { status: "error", message: r.message };
  refresh(s.project.id);
  return { status: "done", message: "Removed. They can't open this project any more." };
}

export async function createShareLinkAction(_previous: ShareLinkState, form: FormData): Promise<ShareLinkState> {
  const s = await sharingFor(form.get("projectId"));
  if ("error" in s) return { status: "error", message: s.error };
  if (s.project.archivedAt) return { status: "error", message: "This project is archived, so it can't be shared." };
  const r = await createShareLink(s.deps, { userId: s.ctx.user.id, projectId: s.project.id, lifetime: form.get("lifetime"), allowDownload: form.get("allowDownload") === "on" });
  if (!r.ok) return { status: "error", message: r.message };
  refresh(s.project.id);
  return { status: "created", link: `${siteUrl()}/share/${r.value.token}`, expiresAt: r.value.expiresAt };
}

export async function revokeShareLinkAction(_previous: ActionState, form: FormData): Promise<ActionState> {
  const s = await sharingFor(form.get("projectId"), true);
  if ("error" in s) return { status: "error", message: s.error };
  const link = Id.safeParse(form.get("linkId"));
  if (!link.success) return { status: "error", message: "That link wasn't found." };
  const r = await revokeShareLink(s.deps, { userId: s.ctx.user.id, linkId: link.data });
  if (!r.ok) return { status: "error", message: r.message };
  refresh(s.project.id);
  return { status: "done", message: "Turned off. Anyone opening it now sees that it was turned off." };
}
