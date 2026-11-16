"use server";

/**
 * Farbaek Chat's actions besides sending (stage 199, ADR 0213): rename, pin, archive, move into a project, delete, rate an answer,
 * switch branches, share by link, search, and read more. Every write goes through an app_chat_* function that checks the person
 * and the conversation again; reads go through the person's own client.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { CHAT_LIMITS, type ChatMessage, type ConversationSummary } from "@/core/chat/protocol";
import { invitationTokenHash, newInvitationToken } from "@/core/workspace/invitations";
import { isLinkLifetime, linkExpiry } from "@/core/workspace/sharing";
import { listConversations, readPath, searchMessages } from "@/server/chat/store";
import { chatFailure } from "@/server/chat/turn";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { loadAppContext } from "@/server/workspace/context";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

export type ChatActionResult<T = null> = { ok: true; value: T } | { ok: false; message: string };

interface Writer {
  admin: SupabaseClient;
  user: SupabaseClient;
  orgId: string;
  actor: string;
}

async function writer(): Promise<{ ok: true; w: Writer } | { ok: false; message: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo") return { ok: false, message: "The demo workspace is read-only, so nothing here is saved." };
  if (!ctx.current) return { ok: false, message: "Create a workspace first." };
  if (!ctx.writes.enabled) return { ok: false, message: ctx.writes.reason ?? "Changes are off for this workspace right now." };
  if (!ctx.role || !CONTRIBUTOR_ROLES.includes(ctx.role)) return { ok: false, message: "Viewers can read the workspace but can't use its AI." };
  const admin = createSupabaseAdminClient();
  const user = await createSupabaseServerClient();
  if (!admin || !user) return { ok: false, message: "Chat isn't set up on this server." };
  return { ok: true, w: { admin, user, orgId: ctx.current.id, actor: ctx.user.id } };
}

/** The signed-in person's own client for reading, in any mode with a database. */
async function reader(): Promise<{ ok: true; user: SupabaseClient; orgId: string } | { ok: false; message: string }> {
  const ctx = await loadAppContext();
  if (!ctx) redirect("/sign-in");
  if (ctx.mode === "demo" || !ctx.current) return { ok: false, message: "There's nothing more to show in the demo workspace." };
  const user = await createSupabaseServerClient();
  if (!user) return { ok: false, message: "Chat isn't set up on this server." };
  return { ok: true, user, orgId: ctx.current.id };
}

const uuid = z.uuid();

async function rpc(w: Writer, fn: string, args: Record<string, unknown>): Promise<ChatActionResult> {
  const { error } = await w.admin.rpc(fn, { p_org: w.orgId, p_actor: w.actor, ...args });
  if (error) return { ok: false, message: chatFailure(error.message).message };
  return { ok: true, value: null };
}

export async function renameChatAction(id: string, title: string): Promise<ChatActionResult> {
  const name = title.replace(/\s+/g, " ").trim();
  if (!uuid.safeParse(id).success) return { ok: false, message: "That conversation doesn't exist." };
  if (name.length < 1 || name.length > CHAT_LIMITS.title) return { ok: false, message: `Give it a name of 1 to ${CHAT_LIMITS.title} characters.` };
  const g = await writer();
  if (!g.ok) return g;
  return rpc(g.w, "app_chat_update", { p_conversation: id, p_title: name, p_pinned: null, p_archived: null, p_project_set: false, p_project: null });
}

export async function pinChatAction(id: string, pinned: boolean): Promise<ChatActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "That conversation doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  return rpc(g.w, "app_chat_update", { p_conversation: id, p_title: null, p_pinned: pinned, p_archived: null, p_project_set: false, p_project: null });
}

export async function archiveChatAction(id: string, archived: boolean): Promise<ChatActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "That conversation doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  return rpc(g.w, "app_chat_update", { p_conversation: id, p_title: null, p_pinned: archived ? false : null, p_archived: archived, p_project_set: false, p_project: null });
}

export async function moveChatAction(id: string, projectId: string | null): Promise<ChatActionResult> {
  if (!uuid.safeParse(id).success || (projectId !== null && !uuid.safeParse(projectId).success)) return { ok: false, message: "That project doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  return rpc(g.w, "app_chat_update", { p_conversation: id, p_title: null, p_pinned: null, p_archived: null, p_project_set: true, p_project: projectId });
}

export async function deleteChatAction(id: string): Promise<ChatActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "That conversation doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  const r = await rpc(g.w, "app_chat_delete", { p_conversation: id });
  if (r.ok) revalidatePath("/app/chat", "layout");
  return r;
}

export async function rateAnswerAction(messageId: string, rating: -1 | 1 | null): Promise<ChatActionResult> {
  if (!uuid.safeParse(messageId).success || (rating !== null && rating !== 1 && rating !== -1)) return { ok: false, message: "That answer doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  return rpc(g.w, "app_chat_rate", { p_message: messageId, p_rating: rating });
}

/** Shows another branch (an edited question or another answer) and returns its messages. */
export async function switchBranchAction(conversationId: string, messageId: string): Promise<ChatActionResult<ChatMessage[]>> {
  if (!uuid.safeParse(conversationId).success || !uuid.safeParse(messageId).success) return { ok: false, message: "That message doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  const { data, error } = await g.w.admin.rpc("app_chat_set_leaf", { p_org: g.w.orgId, p_actor: g.w.actor, p_conversation: conversationId, p_message: messageId });
  if (error || typeof data !== "string") return { ok: false, message: chatFailure(error?.message ?? "NOT_FOUND").message };
  const path = await readPath(g.w.user, conversationId, data, CHAT_LIMITS.page);
  return path ? { ok: true, value: path } : { ok: false, message: "That conversation couldn't be read. Reload the page." };
}

/** Earlier messages of the branch, above the oldest one showing. */
export async function earlierMessagesAction(conversationId: string, beforeParentId: string): Promise<ChatActionResult<ChatMessage[]>> {
  if (!uuid.safeParse(conversationId).success || !uuid.safeParse(beforeParentId).success) return { ok: false, message: "That conversation doesn't exist." };
  const r = await reader();
  if (!r.ok) return r;
  const path = await readPath(r.user, conversationId, beforeParentId, CHAT_LIMITS.page);
  return path ? { ok: true, value: path } : { ok: false, message: "Earlier messages couldn't be read. Try again." };
}

/** More conversations for the sidebar: older ones, archived ones, or ones whose name or messages match the words. */
export async function listChatsAction(options: { archived: boolean; before: string | null; search: string | null }): Promise<ChatActionResult<{ chats: ConversationSummary[]; matches: { conversationId: string; snippet: string }[] }>> {
  if (options.before !== null && Number.isNaN(Date.parse(options.before))) return { ok: false, message: "That list couldn't be read." };
  const search = options.search?.slice(0, 100) ?? null;
  const r = await reader();
  if (!r.ok) return r;
  const chats = await listConversations(r.user, r.orgId, { archived: options.archived, limit: CHAT_LIMITS.list, before: options.before, search });
  if (!chats) return { ok: false, message: "Your chats couldn't be read. Try again." };
  const matches = search ? await searchMessages(r.user, r.orgId, search, 20) : [];
  return { ok: true, value: { chats, matches } };
}

export type ShareResult = ChatActionResult<{ link: string; audience: "workspace" | "anyone"; expiresAt: string | null }>;

/** A read-only link to the branch showing now. Only the SHA-256 of its token is kept, so the link is shown once. */
export async function shareChatAction(id: string, audience: string, lifetime: string): Promise<ShareResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "That conversation doesn't exist." };
  if (audience !== "workspace" && audience !== "anyone") return { ok: false, message: "Choose who can open the link." };
  if (!isLinkLifetime(lifetime)) return { ok: false, message: "Choose how long the link works." };
  const g = await writer();
  if (!g.ok) return g;
  const token = newInvitationToken();
  const expires = linkExpiry(lifetime, new Date());
  const { error } = await g.w.admin.rpc("app_chat_share", {
    p_org: g.w.orgId,
    p_actor: g.w.actor,
    p_conversation: id,
    p_token_sha256: await invitationTokenHash(token),
    p_audience: audience,
    p_expires_at: expires?.toISOString() ?? null,
  });
  if (error) {
    if (error.message.includes("STILL_ANSWERING")) return { ok: false, message: "Wait for the answer to finish, then share." };
    if (error.message.includes("NOTHING_TO_SHARE")) return { ok: false, message: "There's nothing in this conversation to share yet." };
    return { ok: false, message: chatFailure(error.message).message };
  }
  return { ok: true, value: { link: `${siteUrl()}/share/chat/${token}`, audience, expiresAt: expires?.toISOString() ?? null } };
}

export async function unshareChatAction(id: string): Promise<ChatActionResult> {
  if (!uuid.safeParse(id).success) return { ok: false, message: "That conversation doesn't exist." };
  const g = await writer();
  if (!g.ok) return g;
  return rpc(g.w, "app_chat_unshare", { p_conversation: id });
}
