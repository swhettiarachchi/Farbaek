import { describe, expect, it } from "vitest";
import type { ChatMessage, TurnEvent, TurnRequest } from "@/core/chat/protocol";
import { sourceOf } from "@/core/web/context";
import { fitSearchMeta } from "@/core/web/sources";
import type { ChatModel, ChatOutcome } from "@/server/ai/chat-model";
import type { ImageGenerator, ImageOutcome } from "@/server/ai/gemini-image";
import type { AiUsageDeps, UsageContext } from "@/server/workspace/ai-usage";
import type { ChatWrites } from "./store";
import { fitContext, prepareTurn, type TurnDeps } from "./turn";

const PNG = new Uint8Array(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const CONV = "00000000-0000-4000-8000-0000000000c1";
const Q1 = "00000000-0000-4000-8000-0000000000a1";
const A1 = "00000000-0000-4000-8000-0000000000b1";

const msg = (id: string, role: "user" | "assistant", over: Partial<ChatMessage> = {}): ChatMessage => ({
  id,
  parentId: null,
  role,
  kind: "text",
  content: role === "user" ? "Question" : "Answer",
  status: "complete",
  modelName: null,
  error: null,
  rating: null,
  thinkingMs: null,
  meta: {},
  createdAt: "2026-11-16T10:00:00Z",
  siblings: [id],
  files: [],
  ...over,
});

function fakeModel(chunks: string[], outcome: (written: string) => ChatOutcome, opts: { thinking?: boolean; title?: string | null; throwAfter?: number } = {}): ChatModel & { requests: unknown[] } {
  const m = {
    provider: "anthropic" as const,
    requests: [] as unknown[],
    async stream(request: unknown, handlers: { onThinking(s: string): void; onText(d: string): void }, signal: AbortSignal): Promise<ChatOutcome> {
      m.requests.push(request);
      if (opts.thinking) handlers.onThinking("Weighing it up.");
      let written = "";
      for (const [i, c] of chunks.entries()) {
        if (signal.aborted) return { ok: false, failure: "PROVIDER_ERROR", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 3 }, aborted: true };
        if (opts.throwAfter === i) return outcome(written);
        handlers.onText(c);
        written += c;
      }
      return outcome(written);
    },
    async title() {
      return { title: opts.title === undefined ? '"Naming a bakery."' : opts.title, usage: { model: "claude-sonnet-5-5", inputTokens: 50, outputTokens: 5 } };
    },
  };
  return m;
}

function fakeDeps(over: { model?: ChatModel | null; images?: ImageGenerator | null; reserveError?: string; path?: ChatMessage[]; plan?: "free" | "pro"; pending?: Awaited<ReturnType<TurnDeps["reads"]["pendingFiles"]>>; titleApplied?: boolean } = {}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the spy records inputs of several shapes
  const calls: { name: string; input: any }[] = [];
  const usage: UsageContext & AiUsageDeps = {
    billing: async () => (over.plan === "pro" ? { state: "active", paidPlanId: "pro" } : { state: "free" }) as never,
    now: () => new Date("2026-11-16T10:00:00Z"),
    newEventId: () => "e1",
    listUsageGrants: async () => [],
    reserveUsage: async (input) => (calls.push({ name: "reserve", input }), over.reserveError ? { ok: false, error: over.reserveError } : { ok: true, value: "entry-1" }),
    settleUsage: async (input) => (calls.push({ name: "settle", input }), { ok: true, value: null }),
  };
  const writes: ChatWrites = {
    start: async (input) => (calls.push({ name: "start", input }), { ok: true, value: CONV }),
    addQuestion: async (input) => (calls.push({ name: "addQuestion", input }), { ok: true, value: Q1 }),
    beginReply: async (input) => (calls.push({ name: "beginReply", input }), { ok: true, value: A1 }),
    writeReply: async (input) => (calls.push({ name: "writeReply", input }), { ok: true, value: null }),
    reopenReply: async (input) => (calls.push({ name: "reopenReply", input }), { ok: true, value: "Half" }),
    saveFile: async (input) => (calls.push({ name: "saveFile", input }), { ok: true, value: "file-1" }),
    autoTitle: async (input) => (calls.push({ name: "autoTitle", input }), { ok: true, value: over.titleApplied ?? true }),
    beginTurn: async (input) => (calls.push({ name: "beginTurn", input }), { ok: true, value: { conversation: CONV, question: Q1, answer: A1 } }),
  };
  const deps: TurnDeps = {
    claudeUsage: usage,
    usage,
    writes,
    reads: {
      // Reading one message back is reading the question just written; anything longer is the branch the test set.
      path: async (_c, leaf, n) => (n === 1 && leaf ? [msg(leaf, "user", { content: "What is a good name for a bakery?" })] : (over.path ?? [])),
      files: async () => [],
      pendingFiles: async () => over.pending ?? [],
      conversation: async () => ({ id: CONV, titled: false, title: "A chat", projectId: null }),
      projectExists: async () => true,
    },
    claude: over.model === undefined ? fakeModel(["Try ", "Rise and Crumb."], () => ({ ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20 } })) : over.model,
    openai: null,
    images: over.images ?? null,
    imagesOff: over.images ? null : "Image generation isn't connected on this server yet.",
    openaiConnected: false,
    now: () => Date.parse("2026-11-16T10:00:00Z"),
  };
  return { deps, calls };
}

const send = (over: Partial<Extract<TurnRequest, { action: "send" }>> = {}): TurnRequest => ({
  action: "send",
  conversationId: null,
  parentId: null,
  text: "What is a good name for a bakery?",
  files: [],
  model: "auto",
  effort: "balanced",
  mode: "text",
  aspect: "1:1",
  projectId: null,
  ...over,
});

async function run(deps: TurnDeps, request: TurnRequest, abortAfter?: number) {
  const prepared = await prepareTurn(deps, { orgId: "o1", userId: "u1", request });
  if (!prepared.ok) return { prepared, events: [] as TurnEvent[] };
  const events: TurnEvent[] = [];
  const controller = new AbortController();
  await prepared.run((e) => {
    events.push(e);
    if (abortAfter !== undefined && events.filter((x) => x.type === "text").length === abortAfter) controller.abort();
  }, controller.signal);
  return { prepared, events };
}

describe("a chat turn (stage 199)", () => {
  it("reserves usage before writing, streams the answer, names the chat and settles to the real cost", async () => {
    const { deps, calls } = fakeDeps();
    const { prepared, events } = await run(deps, send());
    expect(prepared.ok).toBe(true);
    expect(calls.map((c) => c.name).slice(0, 2)).toEqual(["reserve", "beginTurn"]);
    expect(calls[0]!.input).toMatchObject({ operation: "chat", taskId: null });
    // With no live web search set up here, the search says so (stage 205) before the answer streams.
    expect(events.map((e) => e.type)).toEqual(["start", "search", "text", "text", "done", "title"]);
    expect(events[0]).toMatchObject({ type: "start", conversationId: CONV, created: true, answer: { id: A1, status: "streaming" } });
    const final = calls.filter((c) => c.name === "writeReply").at(-1)!.input;
    expect(final).toMatchObject({ status: "complete", content: "Try Rise and Crumb." });
    expect(calls.find((c) => c.name === "autoTitle")!.input).toMatchObject({ title: "Naming a bakery" });
    // The title's tokens are paid with the answer's, on the same model.
    expect(calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "settled", usage: { inputTokens: 150, outputTokens: 25 } });
  });

  it("writes nothing when the plan's usage can't hold the answer", async () => {
    const { deps, calls } = fakeDeps({ reserveError: "QUOTA_EXCEEDED" });
    const { prepared } = await run(deps, send());
    expect(prepared).toMatchObject({ ok: false, status: 402 });
    expect(calls.map((c) => c.name)).toEqual(["reserve"]);
  });

  it("keeps what was written when the answer is stopped, and pays only for that", async () => {
    const model = fakeModel(["One ", "two ", "three ", "four."], () => ({ ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20 } }));
    const { deps, calls } = fakeDeps({ model });
    const { events } = await run(deps, send(), 2);
    expect(events.at(-1)).toMatchObject({ type: "done", status: "stopped" });
    expect(calls.filter((c) => c.name === "writeReply").at(-1)!.input).toMatchObject({ status: "stopped", content: "One two " });
    expect(calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "settled" });
    expect(calls.some((c) => c.name === "autoTitle")).toBe(false);
  });

  it("refunds a failed answer and keeps its words with the reason", async () => {
    const model = fakeModel(["Partial ", "answer"], () => ({ ok: false, failure: "PROVIDER_BUSY", usage: null, aborted: false }), { throwAfter: 1 });
    const { deps, calls } = fakeDeps({ model });
    const { events } = await run(deps, send());
    expect(events.at(-1)).toMatchObject({ type: "done", status: "failed", error: expect.stringContaining("busy") });
    expect(calls.filter((c) => c.name === "writeReply").at(-1)!.input).toMatchObject({ status: "failed", content: "Partial " });
    expect(calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "refunded", refundReason: "failed" });
  });

  it("refunds a refusal with nothing written", async () => {
    const model = fakeModel([], () => ({ ok: true, stop: "refusal", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 0 } }));
    const { deps, calls } = fakeDeps({ model });
    const { events } = await run(deps, send());
    expect(events.at(-1)).toMatchObject({ type: "done", status: "failed", error: expect.stringContaining("declined") });
    expect(calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "refunded" });
  });

  it("says when a chosen model isn't in the plan, and answers with one that is", async () => {
    const model = fakeModel(["Hi"], () => ({ ok: true, stop: "end", usage: { model: "claude-haiku-5-5", inputTokens: 10, outputTokens: 2 } }));
    const { deps, calls } = fakeDeps({ model });
    const { events } = await run(deps, send({ model: "claude-opus-5-5" }));
    expect(events[0]).toMatchObject({ type: "start", note: expect.stringContaining("chose for you") });
    expect(calls.find((c) => c.name === "beginTurn")!.input.model).toBe("claude-haiku-5-5");
  });

  it("hands a question to the other provider when the first fails before writing, and says so (stage 201)", async () => {
    // GPT-6 Luna answers first by default (stage 203); here it's busy, and Claude Haiku takes the question.
    const gpt = { ...fakeModel([], () => ({ ok: false, failure: "PROVIDER_BUSY", usage: null, aborted: false })), provider: "openai" as const };
    const haiku = fakeModel(["From the other model."], () => ({ ok: true, stop: "end", usage: { model: "claude-haiku-5-5", inputTokens: 100, outputTokens: 5 } }));
    const { deps, calls } = fakeDeps({ model: haiku, plan: "pro" });
    const health: [string, boolean][] = [];
    const routed = { ...deps, openai: gpt, openaiConnected: true, recordHealth: (p: string, ok: boolean) => void health.push([p, ok]) };
    const { events } = await run(routed, send());
    expect(calls.find((c) => c.name === "beginTurn")!.input.model).toBe("gpt-6-luna");
    expect(events.find((e) => e.type === "route")).toMatchObject({ type: "route", modelName: "Claude Haiku 5.5" });
    expect(events.find((e) => e.type === "done")).toMatchObject({ status: "complete", modelName: "Claude Haiku 5.5" });
    expect(health).toEqual([["openai", false], ["anthropic", true]]);
    const last = calls.filter((c) => c.name === "writeReply").at(-1)!.input;
    expect(last).toMatchObject({ content: "From the other model.", model: "claude-haiku-5-5", meta: { route: { fallback: true, tier: "fast", provider: "anthropic" } } });
    expect(calls.find((c) => c.name === "settle")).toBeTruthy();
  });

  it("tries a hard question's three candidates in turn, ending on a faster model, and says so (stage 203)", async () => {
    let claudeCalls = 0;
    const claude = fakeModel(["The faster answer."], () => (++claudeCalls === 1 ? { ok: false, failure: "PROVIDER_BUSY", usage: null, aborted: false } : { ok: true, stop: "end", usage: { model: "claude-haiku-5-5", inputTokens: 100, outputTokens: 5 } }));
    // The first call writes nothing: the busy reply comes before the text.
    const quietFirst = { ...claude, async stream(r: Parameters<typeof claude.stream>[0], h: Parameters<typeof claude.stream>[1], sig: AbortSignal) { return claudeCalls === 0 ? (claudeCalls++, { ok: false as const, failure: "PROVIDER_BUSY" as const, usage: null, aborted: false }) : claude.stream(r, h, sig); } };
    const gpt = { ...fakeModel([], () => ({ ok: false, failure: "PROVIDER_ERROR", usage: null, aborted: false })), provider: "openai" as const };
    const { deps, calls } = fakeDeps({ model: quietFirst, plan: "pro" });
    const { events } = await run({ ...deps, openai: gpt, openaiConnected: true }, send({ text: "Fix the bug in this function:\n```ts\nconst f = () => { throw new Error('x') }\n```" }));
    expect(calls.find((c) => c.name === "beginTurn")!.input.model).toBe("claude-sonnet-5-5");
    const routes = events.filter((e) => e.type === "route");
    expect(routes.map((e) => (e.type === "route" ? e.modelName : ""))).toEqual(["GPT-6.1 Sol", "Claude Haiku 5.5"]);
    expect(routes.at(-1)).toMatchObject({ note: expect.stringContaining("a faster one did") });
    expect(events.find((e) => e.type === "done")).toMatchObject({ status: "complete", modelName: "Claude Haiku 5.5" });
    // Enough was reserved for the costliest of the three.
    expect(calls.find((c) => c.name === "reserve")!.input.units).toBeGreaterThan(0);
  });

  it("asks the other provider for a second opinion when a question is asked again (stage 203)", async () => {
    const gpt = { ...fakeModel(["Luna's."], () => ({ ok: true, stop: "end", usage: { model: "gpt-6-luna", inputTokens: 1, outputTokens: 1 } })), provider: "openai" as const };
    const { deps, calls } = fakeDeps({ plan: "pro", path: [msg(Q1, "user", { content: "What is a good name for a bakery?" })] });
    await run({ ...deps, openai: gpt, openaiConnected: true }, { action: "regenerate", conversationId: CONV, messageId: Q1, model: "auto", effort: "balanced", mode: "text", aspect: "1:1" } as TurnRequest);
    const begun = calls.find((c) => c.name === "beginReply")!.input;
    expect(begun.model).toBe("claude-sonnet-5-5");
    expect(gpt.requests).toHaveLength(0);
  });

  it("keeps a conversation on the provider that answered last above the fast tier, from what that answer recorded (stage 203)", async () => {
    const gpt = { ...fakeModel(["Sol's."], () => ({ ok: true, stop: "end", usage: { model: "gpt-6.1-sol", inputTokens: 1, outputTokens: 1 } })), provider: "openai" as const };
    const earlier = [msg(Q1, "user"), msg(A1, "assistant", { parentId: Q1, modelName: "Claude Sonnet 5.5", meta: { tier: "standard", provider: "anthropic" } })];
    const { deps, calls } = fakeDeps({ plan: "pro", path: earlier });
    // Maths would lead with OpenAI, but the conversation stays with the provider that answered at this tier.
    await run({ ...deps, openai: gpt, openaiConnected: true }, send({ conversationId: CONV, parentId: A1, text: "Prove that the square root of 2 is irrational." }));
    expect(calls.find((c) => c.name === "beginTurn")!.input.model).toBe("claude-sonnet-5-5");
    expect(gpt.requests).toHaveLength(0);
  });

  it("gives the second opinion from the other provider than the answer it replaces (stage 203)", async () => {
    const gpt = { ...fakeModel(["Sol's."], () => ({ ok: true, stop: "end", usage: { model: "gpt-6.1-sol", inputTokens: 1, outputTokens: 1 } })), provider: "openai" as const };
    const replaced = msg(A1, "assistant", { parentId: Q1, modelName: "Claude Sonnet 5.5", meta: { tier: "standard", provider: "anthropic" } });
    const { deps, calls } = fakeDeps({ plan: "pro", path: [msg(Q1, "user", { content: "Why does my sourdough not rise?" })] });
    const reads = { ...deps.reads, path: async (c: string, leaf: string | null, n: number) => (leaf === A1 && n === 1 ? [replaced] : deps.reads.path(c, leaf, n)) };
    await run({ ...deps, reads, openai: gpt, openaiConnected: true }, { action: "regenerate", conversationId: CONV, messageId: Q1, replacing: A1, model: "auto", effort: "balanced", mode: "text", aspect: "1:1" } as TurnRequest);
    expect(calls.find((c) => c.name === "beginReply")!.input.model).toMatch(/^gpt-6/);
  });

  it("never hands over an answer that has started, or a workspace's own Claude key (stage 201)", async () => {
    // GPT-6 Luna starts the answer and then fails: what was written stays, and nothing else is asked.
    const half = { ...fakeModel(["Half an"], () => ({ ok: false, failure: "PROVIDER_ERROR", usage: null, aborted: false })), provider: "openai" as const };
    const claude = fakeModel(["Other."], () => ({ ok: true, stop: "end", usage: { model: "claude-haiku-5-5", inputTokens: 1, outputTokens: 1 } }));
    const started = fakeDeps({ model: claude, plan: "pro" });
    const a = await run({ ...started.deps, openai: half, openaiConnected: true }, send());
    expect(a.events.some((e) => e.type === "route")).toBe(false);
    expect(a.events.find((e) => e.type === "done")).toMatchObject({ status: "failed" });
    expect(claude.requests).toHaveLength(0);

    const gpt = { ...fakeModel(["Other."], () => ({ ok: true, stop: "end", usage: { model: "gpt-6-luna", inputTokens: 1, outputTokens: 1 } })), provider: "openai" as const };
    const busy = fakeModel([], () => ({ ok: false, failure: "PROVIDER_BUSY", usage: null, aborted: false }));
    const own = fakeDeps({ model: busy, plan: "pro" });
    const b = await run({ ...own.deps, openai: gpt, openaiConnected: true, claudeOwnKey: true }, send());
    expect(b.events.some((e) => e.type === "route")).toBe(false);
    expect(gpt.requests).toHaveLength(0);
  });

  it("won't ask again under an answer that's still being written", async () => {
    const { deps, calls } = fakeDeps({ path: [msg(Q1, "user"), msg(A1, "assistant", { status: "streaming", parentId: Q1 })] });
    const { prepared } = await run(deps, send({ conversationId: CONV, parentId: A1 }));
    expect(prepared).toMatchObject({ ok: false, status: 409 });
    expect(calls).toEqual([]);
  });

  it("continues a stopped answer from where it was", async () => {
    const stopped = msg(A1, "assistant", { content: "Half", status: "stopped", parentId: Q1 });
    const model = fakeModel([" and the rest."], () => ({ ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 5 } }));
    const { deps, calls } = fakeDeps({ model, path: [msg(Q1, "user"), stopped] });
    const { events } = await run(deps, { action: "continue", conversationId: CONV, messageId: A1, model: "auto", effort: "balanced" });
    expect(calls.map((c) => c.name)).toContain("reopenReply");
    expect(events.find((e) => e.type === "done")).toMatchObject({ type: "done", status: "complete" });
    expect(calls.filter((c) => c.name === "writeReply").at(-1)!.input).toMatchObject({ content: "Half and the rest." });
  });

  it("makes an image, saves it with the answer and settles; refunds when it isn't made", async () => {
    const gen = (outcome: ImageOutcome): ImageGenerator => ({ model: "gemini-3.1-flash-lite-image", generate: async () => outcome });
    const ok = fakeDeps({ images: gen({ ok: true, bytes: PNG, mimeType: "image/png", usage: { model: "gemini-3.1-flash-lite-image", inputTokens: 20, outputTokens: 1120 } }) });
    const made = await run(ok.deps, send({ mode: "image", text: "A loaf on a wooden table", aspect: "3:2" }));
    expect(made.events.map((e) => e.type)).toEqual(["start", "image", "done"]);
    expect(ok.calls.find((c) => c.name === "reserve")!.input).toMatchObject({ operation: "image_generation" });
    expect(ok.calls.find((c) => c.name === "beginTurn")!.input).toMatchObject({ kind: "image" });
    expect(ok.calls.find((c) => c.name === "saveFile")!.input).toMatchObject({ messageId: A1, kind: "image", mime: "image/png", width: 1, height: 1 });
    expect(ok.calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "settled" });

    const no = fakeDeps({ images: gen({ ok: false, failure: "REFUSED", usage: null }) });
    const refused = await run(no.deps, send({ mode: "image", text: "Something declined" }));
    expect(refused.events.at(-1)).toMatchObject({ type: "done", status: "failed", error: expect.stringContaining("declined") });
    expect(no.calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "refunded" });
  });

  it("says why images are off instead of reserving anything", async () => {
    const { deps, calls } = fakeDeps();
    const { prepared } = await run(deps, send({ mode: "image", text: "A loaf" }));
    expect(prepared).toMatchObject({ ok: false, status: 503, message: "Image generation isn't connected on this server yet." });
    expect(calls).toEqual([]);
  });
});

describe("a chat turn, at its edges (review fixes)", () => {
  it("charges a stop during thinking, with nothing written yet, instead of refunding it", async () => {
    const thinker: ChatModel = {
      provider: "anthropic",
      async stream(_request, handlers, signal) {
        handlers.onThinking("Working through the numbers step by step.");
        await new Promise((r) => setTimeout(r, 5));
        return signal.aborted ? { ok: false, failure: "PROVIDER_ERROR", usage: null, aborted: true } : { ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 1, outputTokens: 1 } };
      },
      async title() {
        return { title: null, usage: null };
      },
    };
    const { deps, calls } = fakeDeps({ model: thinker });
    const prepared = await prepareTurn(deps, { orgId: "o1", userId: "u1", request: send() });
    if (!prepared.ok) throw new Error("refused");
    const controller = new AbortController();
    const events: TurnEvent[] = [];
    await prepared.run((e) => {
      events.push(e);
      if (e.type === "thinking") controller.abort();
    }, controller.signal);
    expect(events.at(-1)).toMatchObject({ type: "done", status: "stopped" });
    const settle = calls.find((c) => c.name === "settle")!.input;
    expect(settle).toMatchObject({ status: "settled" });
    // The context is paid for even though the provider reported nothing.
    expect(settle.usage.inputTokens).toBeGreaterThan(0);
    expect(settle.usage.outputTokens).toBeGreaterThan(0);
  });

  it("asks once more without earlier questions' files when the provider can't read one", async () => {
    let calls = 0;
    const picky: ChatModel = {
      provider: "anthropic",
      async stream(request, handlers) {
        calls++;
        const parts = (request as { messages: { parts: { type: string }[] }[] }).messages.flatMap((m) => m.parts);
        if (parts.some((part) => part.type === "pdf")) return { ok: false, failure: "INCOMPLETE", usage: null, aborted: false };
        handlers.onText("Fine without the old file.");
        return { ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 10, outputTokens: 5 } };
      },
      async title() {
        return { title: null, usage: null };
      },
    };
    const oldPdf = { id: "f1", name: "old.pdf", kind: "pdf" as const, mime: "application/pdf", size: 1_000, width: null, height: null, generated: false };
    const OLD_Q = "00000000-0000-4000-8000-0000000000a0";
    const OLD_A = "00000000-0000-4000-8000-0000000000b0";
    const path = [msg(OLD_Q, "user", { files: [oldPdf] }), msg(OLD_A, "assistant", { parentId: OLD_Q })];
    const { deps } = fakeDeps({ model: picky, path });
    deps.reads.files = async (ids) => ids.map((id) => ({ id, name: "old.pdf", kind: "pdf" as const, mime: "application/pdf", size: 1_000, content: "JVBERi0=", messageId: OLD_Q }));
    const { events } = await run(deps, send({ conversationId: CONV, parentId: OLD_A, text: "And now?" }));
    expect(calls).toBe(2);
    expect(events.at(-1)).toMatchObject({ type: "done", status: "complete" });
  });

  it("names a chat with the first answer that finishes, after a first one that failed", async () => {
    const { deps, calls } = fakeDeps({ path: [msg(Q1, "user", { content: "Bakery names?" })] });
    const { events } = await run(deps, { action: "regenerate", conversationId: CONV, messageId: Q1, model: "auto", effort: "balanced", mode: "text", aspect: "1:1" });
    expect(events.some((e) => e.type === "title")).toBe(true);
    expect(calls.some((c) => c.name === "autoTitle")).toBe(true);
  });

  it("doesn't announce the AI's name for a chat the person renamed meanwhile", async () => {
    const { deps } = fakeDeps({ titleApplied: false });
    const { events } = await run(deps, send());
    expect(events.some((e) => e.type === "title")).toBe(false);
  });

  it("starts a new picture from one made here, without attaching it, and refuses it as a file for a text question", async () => {
    const made = [{ id: "m1", kind: "image" as const, size: 10, messageId: A1, conversationId: CONV, generated: true }];
    const gen: ImageGenerator & { refs: number } = {
      model: "gemini-3.1-flash-lite-image",
      refs: 0,
      async generate(input) {
        gen.refs = input.references?.length ?? 0;
        return { ok: true, bytes: PNG, mimeType: "image/png", usage: { model: "gemini-3.1-flash-lite-image", inputTokens: 20, outputTokens: 1120 } };
      },
    };
    const image = fakeDeps({ images: gen, pending: made, path: [msg(Q1, "user"), msg(A1, "assistant", { parentId: Q1, kind: "image" })] });
    image.deps.reads.files = async (ids) => ids.map((id) => ({ id, name: "made.png", kind: "image" as const, mime: "image/png", size: 10, content: "iVBO", messageId: A1 }));
    await run(image.deps, send({ conversationId: CONV, parentId: A1, mode: "image", text: "Make it brighter", files: ["m1"] }));
    expect(image.calls.find((c) => c.name === "beginTurn")!.input.files).toEqual([]);
    expect(gen.refs).toBe(1);

    const text = fakeDeps({ pending: made, path: [msg(Q1, "user"), msg(A1, "assistant", { parentId: Q1 })] });
    const { prepared } = await run(text.deps, send({ conversationId: CONV, parentId: A1, text: "What's in it?", files: ["m1"] }));
    expect(prepared).toMatchObject({ ok: false, status: 400 });
  });
});

describe("fitContext", () => {
  it("drops the oldest messages first and keeps files for the last few questions only", () => {
    const big = "x".repeat(300_000);
    const messages = [
      { id: "1", role: "user" as const, kind: "text" as const, content: big, status: "complete" as const, files: [] },
      { id: "2", role: "assistant" as const, kind: "text" as const, content: big, status: "complete" as const, files: [] },
      { id: "3", role: "user" as const, kind: "text" as const, content: "short", status: "complete" as const, files: [{ id: "f", name: "a.pdf", kind: "pdf" as const, size: 1_000, generated: false }] },
    ];
    const fit = fitContext(messages);
    expect(fit.kept.map((m) => m.id)).toEqual(["3"]);
    expect([...fit.withFiles]).toEqual(["3"]);
  });
});

describe("the language a turn answers in (stage 204)", () => {
  const SINGLISH = "Mata website ekak hadaganna one";
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake model records requests of the adapter's shape
  const sentTo = (deps: TurnDeps) => (deps.claude as unknown as { requests: any[] }).requests;

  it("sends the person's message unchanged, with a language note beside the unchanged system prompt", async () => {
    const { deps } = fakeDeps();
    await run(deps, send({ text: SINGLISH }));
    const request = sentTo(deps)[0];
    // The person's words first, unchanged; this turn's web context after them (stage 205).
    expect(request.messages.at(-1).parts[0]).toEqual({ type: "text", text: SINGLISH });
    expect(request.messages.at(-1).parts.slice(1).map((p: { type: string }) => p.type)).toEqual(["context"]);
    expect(request.guidance).toContain("Answer in Sinhala, written in Sinhala script.");
    expect(request.guidance).toContain("isn't English");
    expect(request.system).not.toContain("Sinhala, written in");
  });

  it("a short follow-up keeps the conversation's language", async () => {
    const { deps } = fakeDeps({ path: [msg(Q1, "user", { content: SINGLISH }), msg(A1, "assistant", { parentId: Q1, content: "හරි" })] });
    await run(deps, send({ conversationId: CONV, parentId: A1, text: "ok" }));
    expect(sentTo(deps)[0].guidance).toContain("Answer in Sinhala");
  });

  it("follows the answer language chosen in settings, checked by the server", async () => {
    const { deps } = fakeDeps();
    await run(deps, send({ text: SINGLISH, language: { answer: "en", script: "native" } }));
    expect(sentTo(deps)[0].guidance).toContain("Answer in English.");
  });

  it("asked again, reads the question being answered", async () => {
    const { deps } = fakeDeps({ path: [msg(Q1, "user", { content: SINGLISH })] });
    await run(deps, { action: "regenerate", conversationId: CONV, messageId: Q1, model: "auto", effort: "balanced", mode: "text", aspect: "1:1" });
    expect(sentTo(deps)[0].guidance).toContain("Answer in Sinhala");
  });

  it("adds no note when there's nothing to say", async () => {
    const { deps } = fakeDeps();
    await run(deps, send({ text: "Hi" }));
    expect(sentTo(deps)[0].guidance).toBeUndefined();
  });
});

describe("live web search before the answer (stage 205)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake model records requests of the adapter's shape
  const sentTo = (deps: TurnDeps) => (deps.claude as unknown as { requests: any[] }).requests;
  const meta = (status: "done" | "failed") => ({
    at: "2026-11-16T10:00:00.000Z",
    status,
    queries: ["bakery names 2026"],
    ...(status === "failed" ? { reason: "the search service didn't answer" } : {}),
    sources: status === "done" ? [{ n: 1, url: "https://example.org/names", title: "Bakery names", site: "example.org", published: "2026-11-15T08:00:00.000Z", read: true }] : [],
  });
  function withResearch(deps: TurnDeps, result: { context: string; status: "done" | "failed"; usage?: { model: string; inputTokens: number; outputTokens: number } }) {
    const calls: unknown[] = [];
    deps.research = async (input) => {
      calls.push(input);
      input.onStage?.({ stage: "searching", queries: ["bakery names 2026"] });
      input.onStage?.({ stage: "reading", pages: 1 });
      return { context: result.context, meta: meta(result.status), plannerUsage: result.usage ?? null, docs: [] };
    };
    return calls;
  }

  it("searches first, gives the model the results after the question, and saves the sources with the answer", async () => {
    const { deps, calls } = fakeDeps();
    const researched = withResearch(deps, { context: "<web_results>[1] Bakery names</web_results>", status: "done" });
    const { events } = await run(deps, send());
    expect(researched).toHaveLength(1);
    expect(events.filter((e) => e.type === "search").map((e) => (e as { stage: string }).stage)).toEqual(["searching", "reading", "done", "done"]);
    const parts = sentTo(deps)[0].messages.at(-1).parts;
    expect(parts[0]).toEqual({ type: "text", text: "What is a good name for a bakery?" });
    expect(parts.at(-1)).toEqual({ type: "context", text: "<web_results>[1] Bakery names</web_results>" });
    const final = calls.filter((c) => c.name === "writeReply").at(-1)!.input;
    // The second "done" follows the answer: its citations have been read, and this answer cites nothing.
    expect(final.meta.search).toMatchObject({ status: "done", sources: [{ n: 1, url: "https://example.org/names", cited: false }], checks: { cited: 0, matched: 0, unmatched: 0, invalid: 0 } });
  });

  it("when the search fails, the model is told and the answer records why", async () => {
    const { deps, calls } = fakeDeps();
    withResearch(deps, { context: "Farbaek tried to check the live web ... it didn't work", status: "failed" });
    const { events } = await run(deps, send());
    expect(events.find((e) => e.type === "search" && (e as { stage: string }).stage === "failed")).toBeTruthy();
    expect(sentTo(deps)[0].messages.at(-1).parts.at(-1).text).toMatch(/didn't work/);
    expect(calls.filter((c) => c.name === "writeReply").at(-1)!.input.meta.search).toMatchObject({ status: "failed", reason: "the search service didn't answer" });
  });

  it("with no search set up, it says so instead of pretending", async () => {
    const { deps } = fakeDeps();
    const { events } = await run(deps, send());
    expect(events.find((e) => e.type === "search")).toMatchObject({ stage: "failed", search: { reason: "live web search isn't set up on this server" } });
    expect(sentTo(deps)[0].messages.at(-1).parts.at(-1).text).toMatch(/couldn't check the web this time/);
  });

  it("switched off, it doesn't search and tells the model not to claim it did", async () => {
    const { deps, calls } = fakeDeps();
    const researched = withResearch(deps, { context: "x", status: "done" });
    const { events } = await run(deps, send({ web: false }));
    expect(researched).toHaveLength(0);
    expect(events.find((e) => e.type === "search")).toMatchObject({ stage: "off" });
    expect(sentTo(deps)[0].messages.at(-1).parts.at(-1).text).toMatch(/switched off web search/);
    expect(calls.filter((c) => c.name === "writeReply").at(-1)!.input.meta.search).toMatchObject({ status: "off" });
  });

  it("a bare thank-you doesn't search", async () => {
    const { deps } = fakeDeps();
    const researched = withResearch(deps, { context: "x", status: "done" });
    const { events } = await run(deps, send({ text: "Thanks!" }));
    expect(researched).toHaveLength(0);
    expect(events.some((e) => e.type === "search")).toBe(false);
    expect(sentTo(deps)[0].messages.at(-1).parts).toEqual([{ type: "text", text: "Thanks!" }]);
  });

  it("continuing an answer doesn't search again, and keeps citing its sources", async () => {
    const stopped = msg(A1, "assistant", { parentId: Q1, content: "Half", status: "stopped", meta: { search: meta("done") as never } });
    const { deps } = fakeDeps({ path: [msg(Q1, "user", { content: "Bakery names?" }), stopped] });
    const researched = withResearch(deps, { context: "x", status: "done" });
    const { events } = await run(deps, { action: "continue", conversationId: CONV, messageId: A1, model: "auto", effort: "balanced" });
    expect(researched).toHaveLength(0);
    // The sources stay on screen while it carries on.
    expect(events[0]).toMatchObject({ type: "start", answer: { meta: { search: { status: "done" } } } });
    const last = sentTo(deps)[0].messages.at(-1).parts;
    expect(last.at(-1)).toMatchObject({ type: "context" });
    expect(last.at(-1).text).toContain("https://example.org/names");
  });

  it("reserves room for the web text, and a follow-up's planner gets its own reservation, settled to what it used", async () => {
    const off = fakeDeps();
    await run(off.deps, send({ web: false }));
    const on = fakeDeps();
    withResearch(on.deps, { context: "x", status: "done" });
    await run(on.deps, send());
    const units = (c: { calls: { name: string; input: { units: number } }[] }) => c.calls.find((x) => x.name === "reserve")!.input.units;
    expect(units(on)).toBeGreaterThan(units(off));

    const follow = fakeDeps({ path: [msg(Q1, "user", { content: "Name ideas for my bakery?" }), msg(A1, "assistant", { parentId: Q1, content: "Rise and Crumb." })] });
    (follow.deps.claude as unknown as { complete: unknown }).complete = async () => ({ text: '{"queries":["bakery"],"freshness":"any"}', usage: null });
    withResearch(follow.deps, { context: "x", status: "done", usage: { model: "claude-haiku-5-5", inputTokens: 300, outputTokens: 40 } });
    await run(follow.deps, send({ conversationId: CONV, parentId: A1, text: "Which of them is taken already?" }));
    expect(follow.calls.filter((c) => c.name === "reserve")).toHaveLength(2);
    expect(follow.calls.filter((c) => c.name === "settle").some((c) => c.input.usage?.model === "claude-haiku-5-5")).toBe(true);
  });

  it("stopping during the search ends the answer as stopped, with nothing charged", async () => {
    const { deps, calls } = fakeDeps();
    deps.research = (input) =>
      new Promise((resolve) => {
        input.signal.addEventListener("abort", () => resolve({ context: "stopped", meta: meta("failed"), plannerUsage: null, docs: [] }));
      });
    const prepared = await prepareTurn(deps, { orgId: "o1", userId: "u1", request: send() });
    if (!prepared.ok) throw new Error("not prepared");
    const controller = new AbortController();
    const done = prepared.run(() => undefined, controller.signal);
    setTimeout(() => controller.abort(), 10);
    await done;
    expect(calls.filter((c) => c.name === "writeReply").at(-1)!.input.status).toBe("stopped");
    expect(calls.find((c) => c.name === "settle")!.input).toMatchObject({ status: "refunded" });
  });
});

describe("whether the web is checked at all (stage 206)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake model records requests of the adapter's shape
  const sentTo = (deps: TurnDeps) => (deps.claude as unknown as { requests: any[] }).requests;
  const source = { n: 1, url: "https://example.org/rain", title: "Rain in Colombo", site: "example.org", published: "2026-11-15T08:00:00.000Z", read: true };
  type Asked = Parameters<NonNullable<TurnDeps["research"]>>[0];
  function withResearch(deps: TurnDeps, pages: string[] = []) {
    const asked: Asked[] = [];
    deps.research = async (input) => {
      asked.push(input);
      return {
        context: "<web_results>[1] Rain in Colombo</web_results>",
        meta: { at: "2026-11-16T10:00:00.000Z", status: "done", queries: ["colombo rain"], sources: [source] },
        plannerUsage: null,
        docs: pages.map((text) => ({ ...source, updated: null, text })),
      };
    };
    return asked;
  }
  const withPlanner = (deps: TurnDeps) => {
    (deps.claude as unknown as { complete: unknown }).complete = async () => ({ text: null, usage: null });
  };
  const lastParts = (deps: TurnDeps) => sentTo(deps)[0].messages.at(-1).parts;
  const savedSearch = (calls: { name: string; input: { meta?: { search?: unknown } } }[]) => calls.filter((c) => c.name === "writeReply").at(-1)!.input.meta!.search;
  const reserved = (calls: { name: string; input: { units: number } }[]) => calls.find((c) => c.name === "reserve")!.input.units;

  it("a greeting starts at once: nothing is searched, the model is told, and the answer records it", async () => {
    const { deps, calls } = fakeDeps();
    const asked = withResearch(deps);
    const { events } = await run(deps, send({ text: "kohomada machan" }));
    expect(asked).toHaveLength(0);
    expect(events.find((e) => e.type === "search")).toMatchObject({ stage: "skipped" });
    expect(lastParts(deps).at(-1).text).toMatch(/didn't check the live web/);
    expect(savedSearch(calls)).toMatchObject({ status: "skipped", sources: [] });
    // No room is kept for web text that won't be read.
    const searched = fakeDeps();
    withResearch(searched.deps);
    await run(searched.deps, send({ text: "What is the weather in Colombo today?" }));
    expect(reserved(searched.calls)).toBeGreaterThan(reserved(calls));
  });

  it("Check the web searches whatever the message looks like", async () => {
    const { deps } = fakeDeps({ path: [msg(Q1, "user", { content: "Write a poem about the sea" })] });
    const asked = withResearch(deps);
    await run(deps, { action: "regenerate", conversationId: CONV, messageId: Q1, model: "auto", effort: "balanced", mode: "text", aspect: "1:1", research: "search" });
    expect(asked).toHaveLength(1);
    expect(asked[0]!.need).toMatchObject({ need: "search", explicit: true });
    // Asked again without it, the poem is written at once.
    const plain = fakeDeps({ path: [msg(Q1, "user", { content: "Write a poem about the sea" })] });
    const again = withResearch(plain.deps);
    await run(plain.deps, { action: "regenerate", conversationId: CONV, messageId: Q1, model: "auto", effort: "balanced", mode: "text", aspect: "1:1" });
    expect(again).toHaveLength(0);
  });

  it("a short English question that plainly needs the web is planned without a model; an unclear one is the planner's to decide", async () => {
    const { deps, calls } = fakeDeps();
    withPlanner(deps);
    const asked = withResearch(deps);
    await run(deps, send({ text: "What is the weather in Colombo today?" }));
    expect(asked[0]).toMatchObject({ local: true, need: { need: "search" } });
    expect(calls.filter((c) => c.name === "reserve")).toHaveLength(1);

    const unsure = fakeDeps();
    withPlanner(unsure.deps);
    const open = withResearch(unsure.deps);
    await run(unsure.deps, send({ text: "Explain how AI agents work." }));
    expect(open[0]).toMatchObject({ local: false, need: { need: "unsure" } });
    expect(unsure.calls.filter((c) => c.name === "reserve")).toHaveLength(2);
  });

  it("a Sinhala question in English letters goes to the planner with its need already read, and the answer gets the Sinhala style note", async () => {
    const { deps } = fakeDeps();
    withPlanner(deps);
    const asked = withResearch(deps);
    await run(deps, send({ text: "mata ada tech industire eka aluth details denna" }));
    expect(asked[0]).toMatchObject({ local: false, need: { need: "search" }, question: "mata ada tech industire eka aluth details denna" });
    expect(sentTo(deps)[0].guidance).toContain("Answer in Sinhala");
    expect(sentTo(deps)[0].guidance).toContain("How to write Sinhala here");
  });

  it("a request to act on the computer isn't searched, and the model is told what it can't do", async () => {
    const { deps, calls } = fakeDeps();
    const asked = withResearch(deps);
    await run(deps, send({ text: "Open my browser and visit the official website." }));
    expect(asked).toHaveLength(0);
    const note = lastParts(deps).at(-1).text;
    expect(note).toMatch(/you can't act on their computer/);
    expect(note).toMatch(/never say or imply that you opened/);
    expect(savedSearch(calls)).toMatchObject({ status: "skipped", reason: "this was a request to act on the computer" });
    // Asking how to do it is a question like any other.
    const how = fakeDeps();
    const question = withResearch(how.deps);
    await run(how.deps, send({ text: "How do I create a folder on my desktop?" }));
    expect(question).toHaveLength(1);
    expect(lastParts(how.deps).at(-1).text).not.toMatch(/act on their computer/);
  });

  it("the finished answer's citations are checked against the pages, saved, and sent to the screen before the answer ends", async () => {
    const model = fakeModel(["Colombo had 84 mm of rain on Thursday [1]. ", "An invented source says more [4]."], () => ({ ok: true, stop: "end", usage: { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20 } }));
    const { deps, calls } = fakeDeps({ model });
    withResearch(deps, ["Colombo recorded 84 mm of rain on Thursday, the Met Department said."]);
    const { events } = await run(deps, send({ text: "How much rain did Colombo get this week?" }));
    const saved = savedSearch(calls);
    expect(saved).toMatchObject({ status: "done", sources: [{ n: 1, cited: true, support: "matched" }], checks: { cited: 1, matched: 1, unmatched: 0, invalid: 1 } });
    const searches = events.filter((e) => e.type === "search") as { search?: unknown }[];
    expect(searches.at(-1)!.search).toEqual(saved);
    expect(events.findLastIndex((e) => e.type === "search")).toBeLessThan(events.findIndex((e) => e.type === "done"));
  });

  it("research keeps the answer marked as live while it runs", async () => {
    const { deps, calls } = fakeDeps();
    let now = Date.parse("2026-11-16T10:00:00Z");
    deps.now = () => now;
    deps.research = async (input) => {
      // A deep task: ten seconds pass before the second round is announced.
      now += 10_000;
      input.onStage?.({ stage: "checking" });
      return { context: "x", meta: { at: "2026-11-16T10:00:00.000Z", status: "done", queries: ["q"], sources: [source] }, plannerUsage: null, docs: [] };
    };
    await run(deps, send({ text: "Research the latest developments in AI agents across the world" }));
    expect(calls.filter((c) => c.name === "writeReply" && c.input.status === "streaming").length).toBeGreaterThan(0);
  });
});

describe("the fresh review's turn cases (stage 206)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the fake model records requests of the adapter's shape
  const sentTo = (deps: TurnDeps) => (deps.claude as unknown as { requests: any[] }).requests;
  const usage = { model: "claude-sonnet-5-5", inputTokens: 100, outputTokens: 20 };

  it("a source the model read and cites is kept even when the saved list had no room for it", async () => {
    // Twelve pages with long addresses: more than the saved list can hold, so the first fit drops the last ones.
    const pages = Array.from({ length: 12 }, (_, i) => ({ n: i + 1, url: `https://site${i + 1}.example/${"p".repeat(520)}`, title: `Colombo rain report ${i + 1}`, site: `site${i + 1}.example`, published: null, updated: null, read: true, text: "Colombo recorded 84 mm of rain on Thursday." }));
    const fitted = fitSearchMeta({ at: "2026-11-16T10:00:00.000Z", status: "done", queries: ["colombo rain"], sources: pages.map(sourceOf) });
    expect(fitted.sources.length).toBeLessThan(11);
    const model = fakeModel(["Colombo had 84 mm of rain on Thursday [11][12]."], () => ({ ok: true, stop: "end", usage }));
    const { deps, calls } = fakeDeps({ model });
    deps.research = async () => ({ context: "x", meta: fitted, plannerUsage: null, docs: pages });
    await run(deps, send({ text: "How much rain did Colombo get this week?" }));
    const saved = calls.filter((c) => c.name === "writeReply").at(-1)!.input.meta.search as { checks: unknown; sources: { n: number; cited?: boolean; support?: string }[] };
    expect(saved.checks).toMatchObject({ cited: 2, matched: 2, invalid: 0 });
    expect(saved.sources.filter((s) => s.cited).map((s) => s.n)).toEqual([11, 12]);
    expect(new TextEncoder().encode(JSON.stringify(saved)).length).toBeLessThanOrEqual(5_500);
  });

  it("a request to act that also asks about now is still searched, and carries the note", async () => {
    const { deps } = fakeDeps();
    let searched = 0;
    deps.research = async () => {
      searched++;
      return { context: "<web_results>x</web_results>", meta: { at: "2026-11-16T10:00:00.000Z", status: "done", queries: ["q"], sources: [] }, plannerUsage: null, docs: [] };
    };
    await run(deps, send({ text: "Open my browser and check today's news" }));
    expect(searched).toBe(1);
    const context = sentTo(deps)[0].messages.at(-1).parts.at(-1).text;
    expect(context).toMatch(/you can't act on their computer/);
    expect(context).toContain("<web_results>x</web_results>");
  });

  it("an ordinary request that only mentions a computer word gets no such note", async () => {
    for (const text of ["Write a press release for me about our new product", "Update the app to use React 19", "Use the browser's localStorage API to save the theme"]) {
      const { deps } = fakeDeps();
      await run(deps, send({ text }));
      const parts = sentTo(deps)[0].messages.at(-1).parts;
      expect(parts.map((p: { text?: string }) => p.text ?? "").join("\n"), text).not.toMatch(/act on their computer/);
    }
  });
});
