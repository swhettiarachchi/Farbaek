/**
 * A scheduled run's Chat turn (stage 271, ADR 0278), made through the real turn with the database and the model standing in: a first
 * run starts its conversation with its question, later runs carry on in it, and a conversation that is empty, put away, gone or full
 * is replaced by a new one rather than failing the run. The first version made the conversation ahead of its question, which the
 * turn refuses: every run failed before reaching a model, and no test here ran the real turn. SYNTHETIC values.
 */
import { describe, expect, it, vi } from "vitest";
import type { ChatMessage } from "@/core/chat/protocol";
import type { ChatModel, ChatOutcome } from "@/server/ai/chat-model";
import type { ChatWrites } from "@/server/chat/store";
import type { TurnDeps } from "@/server/chat/turn";
import type { AiUsageDeps, UsageContext } from "@/server/workspace/ai-usage";
import { runHeadlessTurn, type HeadlessEnv, type HeadlessTurn } from "./headless-chat";

vi.mock("server-only", () => ({}));

const ORG = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";
const OLD = "00000000-0000-4000-8000-0000000000c1";
const NEW = "00000000-0000-4000-8000-0000000000c2";
const LEAF = "00000000-0000-4000-8000-0000000000b0";
const Q = "00000000-0000-4000-8000-0000000000a1";
const A = "00000000-0000-4000-8000-0000000000b1";

const message = (id: string, role: "user" | "assistant", over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  parentId: null,
  role,
  kind: "text",
  content: role === "user" ? "Research the latest news and summarise it." : "Here is the news.",
  status: "complete",
  modelName: null,
  error: null,
  rating: null,
  thinkingMs: null,
  meta: {},
  createdAt: "2026-11-24T03:30:00Z",
  siblings: [id],
  files: [],
  ...over,
});

/** What the model was last asked, as the turn sent it. */
const asked: { messages: { role: string; parts: { type: string; text?: string }[] }[] }[] = [];

const model: ChatModel = {
  provider: "anthropic",
  async stream(request: unknown, handlers: { onThinking(s: string): void; onText(d: string): void }): Promise<ChatOutcome> {
    asked.push(request as (typeof asked)[number]);
    handlers.onText("Today's news, ");
    handlers.onText("in short.");
    return { ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20 } };
  },
  async title() {
    return { title: "News", usage: { model: "claude-sonnet-5-5", inputTokens: 50, outputTokens: 5 } };
  },
} as ChatModel;

interface World {
  /** The task's earlier conversation, as the database holds it; null when it is gone. */
  conversation: { leafId: string | null; archived: boolean } | null;
  /** The earlier conversation can't take another message. */
  full?: boolean;
  reserveError?: string;
  refuse?: { status: number; message: string };
}

function setup(world: World) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const usage: UsageContext & AiUsageDeps = {
    billing: async () => ({ state: "active", paidPlanId: "pro" }) as never,
    now: () => new Date("2026-11-25T03:31:00Z"),
    newEventId: () => "e1",
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), world.reserveError ? { ok: false, error: world.reserveError } : { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
  };
  const ok = async (name: string, input: unknown, value: unknown) => (calls.push({ name, input }), { ok: true as const, value });
  const writes = {
    start: (input) => ok("start", input, NEW),
    addQuestion: (input) => ok("addQuestion", input, Q),
    beginReply: (input) => ok("beginReply", input, A),
    writeReply: (input) => ok("writeReply", input, null),
    reopenReply: (input) => ok("reopenReply", input, ""),
    saveFile: (input) => ok("saveFile", input, "file-1"),
    autoTitle: (input) => ok("autoTitle", input, false),
    beginTurn: async (input) => {
      calls.push({ name: "beginTurn", input });
      if (input.conversationId === OLD && world.full) return { ok: false, error: "CHAT_LIMIT" };
      return { ok: true, value: { conversation: input.conversationId ?? NEW, question: Q, answer: A } };
    },
    saveSummary: (input) => ok("saveSummary", input, null),
    remember: (input) => ok("remember", input, "memory-1"),
    forget: (input) => ok("forget", input, 1),
  } as ChatWrites;
  const deps: TurnDeps = {
    claudeUsage: usage,
    usage,
    writes,
    reads: {
      // Reading one message back is the question just written; a longer read is the earlier conversation's branch.
      path: async (conversationId, leaf, n) => (n === 1 ? [message(leaf ?? Q, "user")] : conversationId === OLD && world.conversation ? [message(Q, "user"), message(LEAF, "assistant")] : null),
      files: async () => [],
      pendingFiles: async () => [],
      conversation: async (id) => (id === OLD && world.conversation ? { id, titled: true, title: "Morning news", projectId: null } : id === NEW ? { id, titled: false, title: "", projectId: null } : null),
      projectExists: async () => false,
    },
    claude: model,
    openai: null,
    images: null,
    imagesOff: "Image generation isn't connected on this server yet.",
    openaiConnected: false,
    now: () => Date.parse("2026-11-25T03:31:00Z"),
  };
  const named: { conversationId: string; title: string }[] = [];
  const linked: string[] = [];
  const env: HeadlessEnv = {
    conversation: async (_org, _user, id) => (id === OLD && world.conversation ? { id, leafId: world.conversation.leafId, archived: world.conversation.archived, titled: true, title: "Morning news", projectId: null } : null),
    nameConversation: async (_org, _user, conversationId, title) => void named.push({ conversationId, title }),
    turnDeps: async () => (world.refuse ? { ok: false, ...world.refuse } : { ok: true, deps }),
    onConversation: async (id) => void linked.push(id),
  };
  const began = () => calls.filter((c) => c.name === "beginTurn").map((c) => ({ conversationId: c.input.conversationId, parentId: c.input.parentId }));
  return { env, calls, named, linked, began };
}

const turn = (conversationId: string | null): HeadlessTurn => ({ orgId: ORG, userId: USER, conversationId, title: "Morning news", text: "Research the latest news and summarise it.", web: false, effort: "balanced" });
const go = (s: ReturnType<typeof setup>, conversationId: string | null) => runHeadlessTurn(s.env, turn(conversationId), new AbortController().signal);

describe("a scheduled run's Chat turn", () => {
  it("starts the task's conversation with its first question, names it by the task and remembers it", async () => {
    const s = setup({ conversation: null });
    const r = await go(s, null);
    expect(r).toMatchObject({ ok: true, status: "complete", conversationId: NEW, messageId: A });
    // The conversation is made with the question, in one write: never ahead of it.
    expect(s.began()).toEqual([{ conversationId: null, parentId: null }]);
    expect(s.calls.some((c) => c.name === "start")).toBe(false);
    expect(s.named).toEqual([{ conversationId: NEW, title: "Morning news" }]);
    expect(s.linked).toEqual([NEW]);
    expect(s.calls.some((c) => c.name === "settle")).toBe(true);
  });

  it("carries on in the task's conversation from its last answer on later runs", async () => {
    const s = setup({ conversation: { leafId: LEAF, archived: false } });
    const r = await go(s, OLD);
    expect(r).toMatchObject({ ok: true, status: "complete", conversationId: OLD });
    expect(s.began()).toEqual([{ conversationId: OLD, parentId: LEAF }]);
    expect(s.named).toEqual([]);
    expect(s.linked).toEqual([]);
  });

  it("starts a new conversation when the task's is empty, put away or gone", async () => {
    for (const conversation of [{ leafId: null, archived: false }, { leafId: LEAF, archived: true }, null]) {
      const s = setup({ conversation });
      const r = await go(s, OLD);
      expect(r).toMatchObject({ ok: true, status: "complete", conversationId: NEW });
      expect(s.began()).toEqual([{ conversationId: null, parentId: null }]);
      expect(s.linked).toEqual([NEW]);
    }
  });

  it("starts a new conversation when the task's is as long as one can be, as a person would", async () => {
    const s = setup({ conversation: { leafId: LEAF, archived: false }, full: true });
    const r = await go(s, OLD);
    expect(r).toMatchObject({ ok: true, status: "complete", conversationId: NEW });
    expect(s.began()).toEqual([
      { conversationId: OLD, parentId: LEAF },
      { conversationId: null, parentId: null },
    ]);
    expect(s.named).toEqual([{ conversationId: NEW, title: "Morning news" }]);
  });

  it("tells the model the turn is a scheduled run, beside the person's words and never as them", async () => {
    const note = "This message is a task the person scheduled in Farbaek, and it is due now.";
    const s = setup({ conversation: null });
    asked.length = 0;
    await runHeadlessTurn(s.env, { ...turn(null), note }, new AbortController().signal);
    const said = asked.at(-1)!.messages.findLast((m) => m.role === "user")!;
    // The note travels as context for the model; the person's own text is still their instruction, word for word.
    expect(said.parts.filter((p) => p.type === "context").map((p) => p.text)).toContain(note);
    expect(said.parts.find((p) => p.type === "text")?.text).toBe("Research the latest news and summarise it.");
    // What is saved as the question in the chat is the instruction alone.
    expect(s.calls.find((c) => c.name === "beginTurn")!.input.content).toBe("Research the latest news and summarise it.");
    // Without a note, nothing is added beside the message.
    asked.length = 0;
    await go(setup({ conversation: null }), null);
    expect(asked.at(-1)!.messages.findLast((m) => m.role === "user")!.parts.some((p) => p.type === "context" && p.text === note)).toBe(false);
  });

  it("answers as the Chat page would when usage has run out or the person can't use AI here, and makes nothing", async () => {
    const used = setup({ conversation: null, reserveError: "QUOTA_EXCEEDED" });
    expect(await go(used, null)).toMatchObject({ ok: false, status: 402, conversationId: null });
    expect(used.began()).toEqual([]);
    expect(used.named).toEqual([]);
    const gone = setup({ conversation: null, refuse: { status: 403, message: "You can no longer use AI in this workspace, so this didn't run." } });
    expect(await go(gone, null)).toMatchObject({ ok: false, status: 403 });
    expect(gone.calls).toEqual([]);
  });
});
