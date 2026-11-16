import { describe, expect, it } from "vitest";
import type { ChatMessage, TurnEvent, TurnRequest } from "@/core/chat/protocol";
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
    billing: async () => (over.plan === "pro" ? { state: "subscribed", planId: "pro", subscriptionStartedAt: "2026-11-01T00:00:00Z" } : { state: "free" }) as never,
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
    expect(events.map((e) => e.type)).toEqual(["start", "text", "text", "done", "title"]);
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
    expect(events[0]).toMatchObject({ type: "start", note: expect.stringContaining("chose one for you") });
    expect(calls.find((c) => c.name === "beginTurn")!.input.model).toBe("claude-haiku-5-5");
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
    expect(events.at(-1)).toMatchObject({ type: "done", status: "complete" });
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
