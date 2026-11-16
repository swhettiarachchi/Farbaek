/**
 * Opening a shared chat by its link (stage 199, ADR 0213). Only the SHA-256 of a link's token is stored; the database says whether
 * the link is live, and for a workspace link whether the person opening it is in the workspace. Opens are counted per address, as
 * for project links, so a link can't be hammered.
 */
import { z } from "zod";
import type { ChatFile } from "@/core/chat/protocol";
import { invitationTokenHash, isInvitationToken } from "@/core/workspace/invitations";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { countShareOpen } from "@/server/workspace/share-access";

export type SharedChatState = "none" | "revoked" | "expired" | "paused" | "suspended" | "sign_in" | "members_only" | "limited" | "unavailable";

export interface SharedChat {
  title: string;
  audience: "workspace" | "anyone";
  messages: { id: string; role: "user" | "assistant"; kind: "text" | "image"; content: string; status: string; model: string | null; createdAt: string; files: ChatFile[] }[];
}

const fileSchema = z.object({ id: z.string(), name: z.string(), kind: z.enum(["image", "pdf", "text"]), mime: z.string(), size: z.number(), width: z.number().nullable(), height: z.number().nullable(), generated: z.boolean() });
const liveSchema = z.object({
  state: z.literal("live"),
  audience: z.enum(["workspace", "anyone"]),
  title: z.string().nullable(),
  messages: z.array(
    z.object({ id: z.string(), role: z.enum(["user", "assistant"]), kind: z.enum(["text", "image"]), content: z.string(), status: z.string(), model: z.string().nullable(), created_at: z.string(), files: z.array(fileSchema) }),
  ),
});

/** The signed-in person opening the link, if any: a workspace link needs them. */
async function viewer(): Promise<string | null> {
  const client = await createSupabaseServerClient().catch(() => null);
  if (!client) return null;
  const { data } = await client.auth.getClaims().catch(() => ({ data: null }));
  const sub = data?.claims?.sub;
  return typeof sub === "string" ? sub : null;
}

export async function openSharedChat(token: string): Promise<{ ok: true; chat: SharedChat } | { ok: false; state: SharedChatState }> {
  if (!isInvitationToken(token)) return { ok: false, state: "none" };
  const counted = await countShareOpen("view");
  if (counted !== "ok") return { ok: false, state: counted === "limited" ? "limited" : "unavailable" };
  const admin = createSupabaseAdminClient();
  if (!admin) return { ok: false, state: "unavailable" };
  const { data, error } = await admin.rpc("app_chat_for_share", { p_token_sha256: await invitationTokenHash(token), p_viewer: await viewer() });
  if (error || !data) return { ok: false, state: "unavailable" };
  const live = liveSchema.safeParse(data);
  if (!live.success) {
    const state = (data as { state?: unknown }).state;
    return { ok: false, state: typeof state === "string" && ["none", "revoked", "expired", "paused", "suspended", "sign_in", "members_only"].includes(state) ? (state as SharedChatState) : "unavailable" };
  }
  return {
    ok: true,
    chat: {
      title: live.data.title || "Shared chat",
      audience: live.data.audience,
      messages: live.data.messages.map((m) => ({ id: m.id, role: m.role, kind: m.kind, content: m.content, status: m.status, model: m.model, createdAt: m.created_at, files: m.files })),
    },
  };
}

/** One file of a shared chat, or null. */
export async function openSharedChatFile(token: string, fileId: string): Promise<{ name: string; mime: string; kind: string; bytes: Buffer } | null> {
  if (!isInvitationToken(token) || !z.uuid().safeParse(fileId).success) return null;
  if ((await countShareOpen("view")) !== "ok") return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  const { data, error } = await admin.rpc("app_chat_share_file", { p_token_sha256: await invitationTokenHash(token), p_viewer: await viewer(), p_file: fileId });
  if (error || !data) return null;
  const f = z.object({ name: z.string(), mime: z.string(), kind: z.string(), content: z.string() }).safeParse(data);
  return f.success ? { name: f.data.name, mime: f.data.mime, kind: f.data.kind, bytes: Buffer.from(f.data.content, "base64") } : null;
}
