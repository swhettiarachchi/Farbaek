import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ChatEffort, TurnEvent, TurnRequest } from "@/core/chat/protocol";
import { imageGeneration } from "@/server/ai/image-config";
import { openAiKey } from "@/server/ai/openai-second-checker";
import { providerHealth, recordProviderResult } from "@/server/ai/provider-health";
import { chatModels } from "@/server/chat/setup";
import { createChatWrites, readPath, readSummaries } from "@/server/chat/store";
import { CONVERSATION_FULL, prepareTurn, type TurnDeps } from "@/server/chat/turn";
import { platformModels } from "@/server/platform/state";
import { webResearch } from "@/server/web/wiring";
import { createSupabaseWriteDeps } from "@/server/workspace/supabase-writer";
import { CONTRIBUTOR_ROLES } from "@/server/workspace/types";

/**
 * One Chat turn made on the server with no page open (stage 271, ADR 0278): the same turn the Chat page makes (the same routing,
 * research, memory and metering), for work that runs by itself. There is no session, so every read names the person and the
 * workspace itself: the server's key passes row-level security, and nothing here may read another person's conversation.
 */

export interface HeadlessTurn {
  orgId: string;
  userId: string;
  /** The conversation to carry on, or null to start one. A conversation that is gone, archived, full or someone else's starts a new one. */
  conversationId: string | null;
  /** The name a new conversation is given. */
  title: string;
  text: string;
  web: boolean;
  effort: ChatEffort;
  /** Said to the model beside the message, and never shown as the person's words: what kind of run this is. */
  note?: string;
}

export type HeadlessResult =
  /** The turn ran: `status` says how it ended. */
  | { ok: true; conversationId: string; messageId: string | null; status: "complete" | "stopped" | "failed"; error: string | null; chars: number }
  /** The turn was refused before it started, with the status the Chat page would have answered with. */
  | { ok: false; status: number; message: string; conversationId: string | null };

export interface HeadlessEnv {
  /** The person's own conversation in this workspace, or null. */
  conversation(orgId: string, userId: string, id: string): Promise<{ id: string; leafId: string | null; archived: boolean; titled: boolean; title: string; projectId: string | null } | null>;
  /** Gives a conversation the turn has just started a name that stays, so Chat doesn't rename it from its first answer. */
  nameConversation(orgId: string, userId: string, conversationId: string, title: string): Promise<void>;
  /** The turn's own dependencies for this person, or why AI can't be used. */
  turnDeps(orgId: string, userId: string): Promise<{ ok: true; deps: TurnDeps } | { ok: false; status: number; message: string }>;
  /** Told as soon as the conversation is known, so a turn that is cut off and tried again writes into the same one. */
  onConversation?(conversationId: string): Promise<void>;
}

export async function runHeadlessTurn(env: HeadlessEnv, i: HeadlessTurn, signal: AbortSignal): Promise<HeadlessResult> {
  const built = await env.turnDeps(i.orgId, i.userId);
  if (!built.ok) return { ok: false, status: built.status, message: built.message, conversationId: i.conversationId };

  // The task's own conversation, when it's still the person's, not put away, and has an answer to carry on from. Otherwise the turn
  // starts a new one with the question, as the first message of a new chat does: a conversation is never made ahead of its question.
  let conversation = i.conversationId ? await env.conversation(i.orgId, i.userId, i.conversationId) : null;
  if (conversation?.archived || !conversation?.leafId) conversation = null;
  const request = (carryOn: typeof conversation): TurnRequest => ({
    action: "send",
    conversationId: carryOn?.id ?? null,
    parentId: carryOn?.leafId ?? null,
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
  });
  const note = i.note ? { note: i.note } : {};
  let prepared = await prepareTurn(built.deps, { orgId: i.orgId, userId: i.userId, request: request(conversation), ...note });
  // A conversation that has gone since it was read, or is as long as one can be, isn't a reason to fail: a person would start a new
  // chat, and so does the run.
  if (!prepared.ok && conversation && (prepared.status === 404 || prepared.message === CONVERSATION_FULL)) {
    conversation = null;
    prepared = await prepareTurn(built.deps, { orgId: i.orgId, userId: i.userId, request: request(null), ...note });
  }
  if (!prepared.ok) return { ok: false, status: prepared.status, message: prepared.message, conversationId: conversation?.id ?? null };
  if (!conversation) {
    // Named by the person's task, and remembered at once: a run that is cut off and tried again carries on in the same one.
    await env.nameConversation(i.orgId, i.userId, prepared.conversationId, i.title).catch(() => undefined);
    await env.onConversation?.(prepared.conversationId).catch(() => undefined);
  }

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
    async nameConversation(orgId, userId, conversationId, title) {
      await admin.rpc("app_chat_update", { p_org: orgId, p_actor: userId, p_conversation: conversationId, p_title: title.slice(0, 120), p_pinned: null, p_archived: null, p_project_set: false, p_project: null });
    },
    async turnDeps(orgId, userId) {
      // The server's client, scoped by workspace and person in every query, as a background run has no session.
      const base = createSupabaseWriteDeps(admin, admin, userId);
      // What the Chat page checks from the person's session before a turn, checked here from the database: they are still in the
      // workspace with a role that may use its AI, and Farbaek hasn't paused the workspace. Lost access isn't worth trying again.
      const role = await base.role(orgId);
      if (!role || !CONTRIBUTOR_ROLES.includes(role)) return { ok: false, status: 403, message: "You can no longer use AI in this workspace, so this didn't run." };
      const org = await admin.from("organizations").select("suspended_at").eq("id", orgId).maybeSingle();
      if (org.error) return { ok: false, status: 503, message: "The workspace couldn't be read just now." };
      if (!org.data || org.data.suspended_at) return { ok: false, status: 403, message: "Farbaek has paused this workspace, so this didn't run." };
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
