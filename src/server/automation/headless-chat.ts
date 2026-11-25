import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatEffort, TurnEvent, TurnRequest } from "@/core/chat/protocol";
import { imageGeneration } from "@/server/ai/image-config";
import { openAiKey } from "@/server/ai/openai-second-checker";
import { providerHealth, recordProviderResult } from "@/server/ai/provider-health";
import { chatModels } from "@/server/chat/setup";
import { createChatWrites, readPath, readSummaries } from "@/server/chat/store";
import { prepareTurn, type TurnDeps } from "@/server/chat/turn";
import { platformModels } from "@/server/platform/state";
import { webResearch } from "@/server/web/wiring";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";

/**
 * One Chat turn made on the server with no page open (stage 271, ADR 0278): the same turn the Chat page makes (the same routing,
 * research, memory and metering), for work that runs by itself. There is no session, so every read names the person and the
 * workspace itself: the server's key passes row-level security, and nothing here may read another person's conversation.
 */

export interface HeadlessTurn {
  orgId: string;
  userId: string;
  /** The conversation to carry on, or null to start one. A conversation that is gone, archived or someone else's starts a new one. */
  conversationId: string | null;
  /** The name a new conversation is given. */
  title: string;
  text: string;
  web: boolean;
  effort: ChatEffort;
}

export type HeadlessResult =
  /** The turn ran: `status` says how it ended. */
  | { ok: true; conversationId: string; messageId: string | null; status: "complete" | "stopped" | "failed"; error: string | null; chars: number }
  /** The turn was refused before it started, with the status the Chat page would have answered with. */
  | { ok: false; status: number; message: string; conversationId: string | null };

export interface HeadlessEnv {
  /** The person's own conversation in this workspace, or null. */
  conversation(orgId: string, userId: string, id: string): Promise<{ id: string; leafId: string | null; archived: boolean; titled: boolean; title: string; projectId: string | null } | null>;
  /** Starts a conversation with a name that stays; null when it couldn't be made. */
  startConversation(orgId: string, userId: string, title: string): Promise<string | null>;
  /** The turn's own dependencies for this person, or why AI can't be used. */
  turnDeps(orgId: string, userId: string): Promise<{ ok: true; deps: TurnDeps } | { ok: false; status: number; message: string }>;
  /** Told as soon as the conversation is known, so a turn that is cut off and tried again writes into the same one. */
  onConversation?(conversationId: string): Promise<void>;
}

export async function runHeadlessTurn(env: HeadlessEnv, i: HeadlessTurn, signal: AbortSignal): Promise<HeadlessResult> {
  const built = await env.turnDeps(i.orgId, i.userId);
  if (!built.ok) return { ok: false, status: built.status, message: built.message, conversationId: i.conversationId };

  // The task's own conversation, when it's still the person's and not put away; otherwise a new one under the task's name.
  let conversation = i.conversationId ? await env.conversation(i.orgId, i.userId, i.conversationId) : null;
  if (conversation?.archived) conversation = null;
  let conversationId = conversation?.id ?? null;
  if (!conversationId) {
    conversationId = await env.startConversation(i.orgId, i.userId, i.title);
    if (!conversationId) return { ok: false, status: 503, message: "A conversation for the answer couldn't be started.", conversationId: null };
  }
  await env.onConversation?.(conversationId);

  const request: TurnRequest = {
    action: "send",
    conversationId,
    parentId: conversation?.leafId ?? null,
    text: i.text,
    files: [],
    model: "auto",
    effort: i.effort,
    memory: true,
    web: i.web,
    research: "auto",
    mode: "text",
    aspect: "1:1",
    projectId: null,
  };
  const prepared = await prepareTurn(built.deps, { orgId: i.orgId, userId: i.userId, request });
  if (!prepared.ok) return { ok: false, status: prepared.status, message: prepared.message, conversationId };

  let messageId: string | null = null;
  let chars = 0;
  let done: Extract<TurnEvent, { type: "done" }> | null = null;
  const emit = (e: TurnEvent) => {
    if (e.type === "start") messageId = e.answer.id;
    else if (e.type === "text") chars += e.v.length;
    else if (e.type === "done") done = e;
  };
  try {
    await prepared.run(emit, signal);
  } catch (e) {
    return { ok: true, conversationId: prepared.conversationId, messageId, status: "failed", error: e instanceof Error ? e.name : "The answer couldn't be written.", chars };
  }
  const end = done as Extract<TurnEvent, { type: "done" }> | null;
  if (!end) return { ok: true, conversationId: prepared.conversationId, messageId, status: "failed", error: "The answer ended without saying how.", chars };
  return { ok: true, conversationId: prepared.conversationId, messageId, status: end.status, error: end.error, chars };
}

/** The real environment: Farbaek's models and the database, through the server's key, scoped to the person in every read. */
export function headlessEnv(admin: SupabaseClient, onConversation?: (conversationId: string) => Promise<void>): HeadlessEnv {
  const writes = createChatWrites(admin);
  const own = async (orgId: string, userId: string, id: string) => {
    const { data, error } = await admin
      .from("chat_conversations")
      .select("id, title, titled, leaf_id, project_id, archived_at")
      .eq("id", id)
      .eq("org_id", orgId)
      // The owner, named: this client isn't held to the person's own rows by row-level security.
      .eq("owner_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return { id: data.id as string, leafId: (data.leaf_id as string | null) ?? null, archived: data.archived_at !== null, titled: Boolean(data.titled), title: String(data.title ?? ""), projectId: (data.project_id as string | null) ?? null };
  };
  return {
    conversation: own,
    async startConversation(orgId, userId, title) {
      const started = await writes.start({ orgId, actor: userId, projectId: null, title });
      if (!started.ok) return null;
      // Named by the person's task, so Chat doesn't rename it from its first answer.
      await admin.rpc("app_chat_update", { p_org: orgId, p_actor: userId, p_conversation: started.value, p_title: title.slice(0, 120), p_pinned: null, p_archived: null, p_project_set: false, p_project: null });
      return started.value;
    },
    async turnDeps(orgId, userId) {
      // The server's client, scoped by workspace and person in every query, as a background run has no session.
      const base = createSupabaseWriteDeps(admin, admin, userId);
      const models = await chatModels(orgId, base);
      if (!models.claude && !models.openai) return { ok: false, status: 503, message: models.error ?? "AI isn't connected on this server yet." };
      const images = imageGeneration();
      const deps: TurnDeps = {
        claudeUsage: models.claudeUsage,
        usage: base,
        writes,
        reads: {
          // Only ever a conversation `own` has returned for this person: the path is read after that check.
          path: async (conversationId, leaf, n) => ((await own(orgId, userId, conversationId)) ? readPath(admin, conversationId, leaf, n) : null),
          files: async () => [],
          pendingFiles: async () => [],
          conversation: async (id) => own(orgId, userId, id),
          projectExists: async () => false,
          summaries: (ids) => readSummaries(admin, ids),
          memories: async () => {
            const { data, error } = await admin.from("chat_memories").select("content, created_at").eq("org_id", orgId).eq("owner_id", userId).order("created_at", { ascending: false }).limit(50);
            return error || !data ? [] : data.map((m) => String(m.content));
          },
        },
        claude: models.claude,
        openai: models.openai,
        images: images.generator,
        imagesOff: images.reason,
        openaiConnected: openAiKey() !== null,
        claudeOwnKey: models.claudeOwnKey,
        health: () => providerHealth(),
        recordHealth: recordProviderResult,
        overrides: platformModels(),
        research: webResearch(),
        // No response to finish first: what Chat does after an answer (a long conversation's summary) runs on its own.
        later: (work) => void work().catch(() => undefined),
        now: () => Date.now(),
      };
      return { ok: true, deps };
    },
    ...(onConversation ? { onConversation } : {}),
  };
}
