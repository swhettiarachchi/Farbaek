/**
 * Farbaek Chat's reads and writes (stage 199, ADR 0213). Reads go through the person's own Supabase client, so row level security
 * shows them only their conversations; writes go through the service-role app_chat_* functions, which check the person, the
 * workspace and the conversation again.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { modelName } from "@/core/billing/model-names";
import type { ChatFile, ChatMessage, ConversationSummary, MessageStatus } from "@/core/chat/protocol";
import type { RpcResult } from "@/server/workspace/use-cases";

const ok = <T>(value: T): RpcResult<T> => ({ ok: true, value });
const err = (error: { message?: string } | null | undefined): RpcResult<never> => ({ ok: false, error: error?.message ?? "UNKNOWN" });

export interface ChatWrites {
  start(i: { orgId: string; actor: string; projectId: string | null; title: string }): Promise<RpcResult<string>>;
  addQuestion(i: { orgId: string; actor: string; conversationId: string; parentId: string | null; content: string; files: string[] }): Promise<RpcResult<string>>;
  beginReply(i: { orgId: string; actor: string; conversationId: string; parentId: string; kind: "text" | "image"; model: string }): Promise<RpcResult<string>>;
  writeReply(i: { orgId: string; actor: string; messageId: string; content: string; status: MessageStatus; model: string | null; error: string | null; thinkingMs: number | null; meta: Record<string, unknown> | null }): Promise<RpcResult<null>>;
  reopenReply(i: { orgId: string; actor: string; messageId: string }): Promise<RpcResult<string>>;
  saveFile(i: { orgId: string; actor: string; messageId: string | null; name: string; kind: ChatFile["kind"]; mime: string; size: number; sha256: string; content: string; width: number | null; height: number | null }): Promise<RpcResult<string>>;
  autoTitle(i: { orgId: string; actor: string; conversationId: string; title: string }): Promise<RpcResult<null>>;
}

export function createChatWrites(admin: SupabaseClient): ChatWrites {
  const call = async <T>(fn: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<RpcResult<T>> => {
    const { data, error } = await admin.rpc(fn, args);
    if (error) return err(error);
    const parsed = schema.safeParse(data);
    return parsed.success ? ok(parsed.data) : err({ message: "INVALID_RESPONSE" });
  };
  const nothing = z.null().or(z.undefined()).transform(() => null);
  return {
    start: (i) => call("app_chat_start", { p_org: i.orgId, p_actor: i.actor, p_project: i.projectId, p_title: i.title }, z.string()),
    addQuestion: (i) => call("app_chat_add_user_message", { p_org: i.orgId, p_actor: i.actor, p_conversation: i.conversationId, p_parent: i.parentId, p_content: i.content, p_attachments: i.files }, z.string()),
    beginReply: (i) => call("app_chat_begin_reply", { p_org: i.orgId, p_actor: i.actor, p_conversation: i.conversationId, p_parent: i.parentId, p_kind: i.kind, p_model: i.model }, z.string()),
    writeReply: (i) =>
      call(
        "app_chat_write_reply",
        { p_org: i.orgId, p_actor: i.actor, p_message: i.messageId, p_content: i.content, p_status: i.status, p_model: i.model, p_error: i.error, p_thinking_ms: i.thinkingMs, p_meta: i.meta },
        nothing,
      ),
    reopenReply: (i) => call("app_chat_reopen_reply", { p_org: i.orgId, p_actor: i.actor, p_message: i.messageId }, z.string()),
    saveFile: (i) =>
      call(
        "app_chat_save_attachment",
        { p_org: i.orgId, p_actor: i.actor, p_message: i.messageId, p_name: i.name, p_kind: i.kind, p_mime: i.mime, p_size: i.size, p_sha256: i.sha256, p_content: i.content, p_width: i.width, p_height: i.height },
        z.string(),
      ),
    autoTitle: (i) => call("app_chat_auto_title", { p_org: i.orgId, p_actor: i.actor, p_conversation: i.conversationId, p_title: i.title }, nothing),
  };
}

// ---------------------------------------------------------------- reads

const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: z.enum(["image", "pdf", "text"]),
  mime: z.string(),
  size: z.number(),
  width: z.number().nullable().optional(),
  height: z.number().nullable().optional(),
  generated: z.boolean(),
});

const rowSchema = z.object({
  id: z.string(),
  parent_id: z.string().nullable(),
  role: z.enum(["user", "assistant"]),
  kind: z.enum(["text", "image"]),
  content: z.string(),
  status: z.enum(["streaming", "complete", "stopped", "failed"]),
  model: z.string().nullable(),
  error: z.string().nullable(),
  rating: z.number().nullable(),
  thinking_ms: z.number().nullable(),
  meta: z.record(z.string(), z.unknown()).nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  siblings: z.array(z.string()).nullable(),
  files: z.array(fileSchema).nullable(),
});

/** An answer whose server stopped writing it over two minutes ago is shown as stopped: the stream that was writing it is gone. */
const STALE_MS = 2 * 60_000;

export function toMessage(row: z.infer<typeof rowSchema>, now = Date.now()): ChatMessage {
  const meta = row.meta ?? {};
  const stale = row.status === "streaming" && now - Date.parse(row.updated_at) > STALE_MS;
  return {
    id: row.id,
    parentId: row.parent_id,
    role: row.role,
    kind: row.kind,
    content: row.content,
    status: stale ? "stopped" : row.status,
    modelName: row.model ? modelName(row.model) : null,
    error: row.error,
    rating: row.rating === 1 || row.rating === -1 ? row.rating : null,
    thinkingMs: row.thinking_ms,
    meta: {
      aspect: typeof meta.aspect === "string" ? meta.aspect : undefined,
      prompt: typeof meta.prompt === "string" ? meta.prompt : undefined,
      stop: meta.stop === "length" || meta.stop === "refusal" ? meta.stop : undefined,
    },
    createdAt: row.created_at,
    siblings: row.siblings ?? [row.id],
    files: (row.files ?? []).map((f) => ({ ...f, width: f.width ?? null, height: f.height ?? null })),
  };
}

/** The branch showing (or the one ending at `leaf`), oldest first, at most `limit` messages from its end. */
export async function readPath(client: SupabaseClient, conversationId: string, leaf: string | null, limit: number): Promise<ChatMessage[] | null> {
  const { data, error } = await client.rpc("chat_path", { p_conversation: conversationId, p_leaf: leaf, p_limit: limit });
  if (error) return null;
  const rows = z.array(rowSchema).safeParse(data);
  if (!rows.success) return null;
  const now = Date.now();
  return rows.data.map((r) => toMessage(r, now));
}

export interface ConversationRow {
  id: string;
  title: string;
  titled: boolean;
  leafId: string | null;
  projectId: string | null;
  pinned: boolean;
  archived: boolean;
  messageCount: number;
  updatedAt: string;
}

export async function readConversation(client: SupabaseClient, orgId: string, id: string): Promise<ConversationRow | null> {
  const { data, error } = await client
    .from("chat_conversations")
    .select("id, title, titled, leaf_id, project_id, pinned_at, archived_at, message_count, updated_at")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    title: data.title,
    titled: data.titled,
    leafId: data.leaf_id,
    projectId: data.project_id,
    pinned: data.pinned_at !== null,
    archived: data.archived_at !== null,
    messageCount: data.message_count,
    updatedAt: data.updated_at,
  };
}

/** The person's conversations in this workspace, newest first; pinned ones come first on screen. */
export async function listConversations(
  client: SupabaseClient,
  orgId: string,
  options: { archived: boolean; limit: number; before?: string | null; search?: string | null; projectId?: string | null },
): Promise<ConversationSummary[] | null> {
  let query = client
    .from("chat_conversations")
    .select("id, title, pinned_at, archived_at, project_id, updated_at, chat_share_links(id, revoked_at, expires_at)")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(options.limit);
  query = options.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  if (options.before) query = query.lt("updated_at", options.before);
  if (options.projectId) query = query.eq("project_id", options.projectId);
  const search = options.search?.trim();
  if (search) query = query.ilike("title", `%${search.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
  const { data, error } = await query;
  if (error || !data) return null;
  const now = Date.now();
  return data.map((c) => ({
    id: c.id,
    title: c.title || "New chat",
    pinned: c.pinned_at !== null,
    archived: c.archived_at !== null,
    projectId: c.project_id,
    updatedAt: c.updated_at,
    shared: ((c.chat_share_links as { revoked_at: string | null; expires_at: string | null }[] | null) ?? []).some((l) => l.revoked_at === null && (l.expires_at === null || Date.parse(l.expires_at) > now)),
  }));
}

/** Conversations whose messages mention the words (titles are searched by listConversations). Newest first. */
export async function searchMessages(client: SupabaseClient, orgId: string, words: string, limit: number): Promise<{ conversationId: string; snippet: string }[]> {
  const q = words.trim();
  if (q.length < 2) return [];
  const { data, error } = await client
    .from("chat_messages")
    .select("conversation_id, content, created_at")
    .eq("org_id", orgId)
    .ilike("content", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`)
    .order("created_at", { ascending: false })
    .limit(limit * 3);
  if (error || !data) return [];
  const seen = new Set<string>();
  const out: { conversationId: string; snippet: string }[] = [];
  for (const row of data) {
    if (seen.has(row.conversation_id)) continue;
    seen.add(row.conversation_id);
    const at = row.content.toLowerCase().indexOf(q.toLowerCase());
    const from = Math.max(0, at - 40);
    out.push({ conversationId: row.conversation_id, snippet: `${from > 0 ? "…" : ""}${row.content.slice(from, at + q.length + 60).replace(/\s+/g, " ").trim()}…` });
    if (out.length >= limit) break;
  }
  return out;
}

export interface StoredFile {
  id: string;
  name: string;
  kind: ChatFile["kind"];
  mime: string;
  size: number;
  content: string;
  messageId: string | null;
}

/** File contents, for sending to the model or downloading. Only the person's own (row level security). */
export async function readFiles(client: SupabaseClient, ids: string[]): Promise<StoredFile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.from("chat_attachments").select("id, name, kind, mime, size_bytes, content, message_id").in("id", ids);
  if (error || !data) return [];
  return data.map((f) => ({ id: f.id, name: f.name, kind: f.kind as ChatFile["kind"], mime: f.mime, size: f.size_bytes, content: f.content, messageId: f.message_id }));
}

/** Files waiting to be sent, without their contents: so a question can be checked before it's sent. */
export async function readPendingFiles(client: SupabaseClient, ids: string[]): Promise<{ id: string; kind: ChatFile["kind"]; size: number; messageId: string | null; conversationId: string | null }[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client.from("chat_attachments").select("id, kind, size_bytes, message_id, conversation_id, generated").in("id", ids);
  if (error || !data) return [];
  return data.filter((f) => !f.generated).map((f) => ({ id: f.id, kind: f.kind as ChatFile["kind"], size: f.size_bytes, messageId: f.message_id, conversationId: f.conversation_id }));
}

export interface GalleryImage {
  id: string;
  name: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  conversationId: string | null;
  messageId: string | null;
  prompt: string | null;
}

/** Images the AI made for this person in this workspace, newest first. */
export async function listGeneratedImages(client: SupabaseClient, orgId: string, limit: number, before?: string | null): Promise<GalleryImage[] | null> {
  let query = client
    .from("chat_attachments")
    .select("id, name, width, height, created_at, conversation_id, message_id, chat_messages(meta)")
    .eq("org_id", orgId)
    .eq("generated", true)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (before) query = query.lt("created_at", before);
  const { data, error } = await query;
  if (error || !data) return null;
  return data.map((r) => {
    const meta = (Array.isArray(r.chat_messages) ? r.chat_messages[0] : r.chat_messages) as { meta?: { prompt?: unknown } } | null;
    return {
      id: r.id,
      name: r.name,
      width: r.width,
      height: r.height,
      createdAt: r.created_at,
      conversationId: r.conversation_id,
      messageId: r.message_id,
      prompt: typeof meta?.meta?.prompt === "string" ? meta.meta.prompt : null,
    };
  });
}

/** Whether a conversation has a link that works now. */
export async function isShared(client: SupabaseClient, conversationId: string): Promise<boolean> {
  const { data } = await client.from("chat_share_links").select("expires_at").eq("conversation_id", conversationId).is("revoked_at", null);
  const now = Date.now();
  return (data ?? []).some((l: { expires_at: string | null }) => l.expires_at === null || Date.parse(l.expires_at) > now);
}
