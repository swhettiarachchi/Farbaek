import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createAnthropicToolModel, toModelStep } from "./anthropic";
import { createGeminiToolModel } from "./gemini";
import { FarbaekApiError, type ModelStepRequest } from "../farbaek-client";
import { createFarbaekToolModel } from "./farbaek";

const tools = [{ name: "read_file", description: "Read a file.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }];

function message(content: unknown[], stop: string): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content,
    stop_reason: stop,
    usage: { input_tokens: 100, output_tokens: 20, cache_creation_input_tokens: 10, cache_read_input_tokens: 900 },
  } as unknown as Anthropic.Message;
}

describe("Claude adapter", () => {
  it("maps tool calls, stop reasons and usage, cached input included", () => {
    const step = toModelStep(message([{ type: "thinking", thinking: "", signature: "sig" }, { type: "text", text: "Reading." }, { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a" } }], "tool_use"));
    expect(step).toEqual({ text: "Reading.", toolCalls: [{ id: "toolu_1", name: "read_file", input: { path: "a" } }], stop: "tool_use", usage: { inputTokens: 1010, outputTokens: 20 }, model: "claude-opus-5-5" });
    expect(toModelStep(message([], "refusal")).stop).toBe("refusal");
    expect(toModelStep(message([], "model_context_window_exceeded")).stop).toBe("context_full");
  });

  it("keeps the assistant's content unchanged and sends tool results first", async () => {
    const requests: Anthropic.MessageCreateParams[] = [];
    const replies = [
      message([{ type: "thinking", thinking: "", signature: "sig-1" }, { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a" } }], "tool_use"),
      message([{ type: "text", text: "Done." }], "end_turn"),
    ];
    const client = {
      messages: {
        stream(params: Anthropic.MessageCreateParams) {
          requests.push(structuredClone(params));
          const reply = replies[requests.length - 1]!;
          return { finalMessage: async () => reply };
        },
      },
    } as unknown as Anthropic;
    const conversation = createAnthropicToolModel({ client }).begin({ system: "sys", message: "brief", tools });
    await conversation.send({});
    await conversation.send({ toolResults: [{ id: "toolu_1", content: "file text", isError: false }], text: "note" });

    expect(requests[0]).toMatchObject({ model: "claude-opus-5-5", thinking: { type: "adaptive" }, cache_control: { type: "ephemeral" }, tools: [{ name: "read_file", eager_input_streaming: true }] });
    const second = requests[1]!.messages;
    expect(second).toHaveLength(3);
    expect(second[1]).toEqual({ role: "assistant", content: replies[0]!.content });
    expect(second[2]).toEqual({
      role: "user",
      content: [
        { type: "tool_result", tool_use_id: "toolu_1", content: "file text", is_error: false },
        { type: "text", text: "note" },
      ],
    });
  });
});

describe("Gemini adapter", () => {
  it("sends the key in a header, keeps thought signatures, and answers calls by name", async () => {
    const bodies: { contents: { role: string; parts: Record<string, unknown>[] }[] }[] = [];
    const urls: string[] = [];
    const headers: Record<string, string>[] = [];
    const replies = [
      { candidates: [{ content: { role: "model", parts: [{ functionCall: { name: "read_file", args: { path: "a" } }, thoughtSignature: "ts-1" }] }, finishReason: "STOP" }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 5, thoughtsTokenCount: 7 } },
      { candidates: [{ content: { role: "model", parts: [{ text: "Done." }] }, finishReason: "STOP" }] },
    ];
    const fetchFake = (async (url: string, init: RequestInit) => {
      urls.push(url);
      headers.push(init.headers as Record<string, string>);
      bodies.push(JSON.parse(init.body as string));
      return new Response(JSON.stringify(replies[bodies.length - 1]), { status: 200 });
    }) as unknown as typeof fetch;
    const conversation = createGeminiToolModel({ apiKey: "test-key", fetch: fetchFake }).begin({ system: "sys", message: "brief", tools });
    const first = await conversation.send({});
    expect(first).toMatchObject({ stop: "tool_use", usage: { inputTokens: 50, outputTokens: 12 }, toolCalls: [{ name: "read_file", input: { path: "a" } }] });
    const second = await conversation.send({ toolResults: [{ id: first.toolCalls[0]!.id, content: "file text", isError: false }] });
    expect(second).toMatchObject({ stop: "end_turn", text: "Done." });

    expect(urls[0]).not.toContain("test-key");
    expect(headers[0]!["x-goog-api-key"]).toBe("test-key");
    const history = bodies[1]!.contents;
    expect(history[1]).toEqual({ role: "model", parts: [{ functionCall: { name: "read_file", args: { path: "a" } }, thoughtSignature: "ts-1" }] });
    expect(history[2]).toEqual({ role: "user", parts: [{ functionResponse: { name: "read_file", response: { result: "file text" } } }] });
  });
});

describe("Farbaek gateway adapter", () => {
  const reply = (content: unknown[], stop: string) => ({
    message: { id: "msg_1", model: "claude-sonnet-5-5", content: content as { type: string }[], stop_reason: stop, usage: { input_tokens: 100, output_tokens: 20, cache_read_input_tokens: 900 } },
    routedModel: "claude-sonnet-5-5",
    note: null,
    usage: { percent: 12 },
  });

  it("sends the conversation to the gateway with no key, and keeps the model's content unchanged", async () => {
    const requests: ModelStepRequest[] = [];
    const replies = [reply([{ type: "thinking", thinking: "", signature: "sig-1" }, { type: "tool_use", id: "toolu_1", name: "read_file", input: { path: "a" } }], "tool_use"), reply([{ type: "text", text: "Done." }], "end_turn")];
    const seen: { percent: number | null }[] = [];
    const client = { modelStep: async (r: ModelStepRequest) => (requests.push(structuredClone(r)), replies[requests.length - 1]!) };
    const model = createFarbaekToolModel({ client, taskId: "t1", effort: "deep", onUsage: (u) => seen.push(u) });
    expect(model).toMatchObject({ provider: "farbaek", model: "auto" });
    const conversation = model.begin({ system: "sys", message: "brief", tools });
    const first = await conversation.send({});
    expect(first).toMatchObject({ stop: "tool_use", model: "claude-sonnet-5-5", usage: { inputTokens: 1000, outputTokens: 20 } });
    await conversation.send({ toolResults: [{ id: "toolu_1", content: "file text", isError: false }] });

    expect(requests[0]).toMatchObject({ taskId: "t1", effort: "deep", step: "write", system: "sys", tools: [{ name: "read_file", input_schema: tools[0]!.inputSchema }] });
    expect(JSON.stringify(requests)).not.toMatch(/api[_-]?key/i);
    expect(requests[1]!.messages[1]).toEqual({ role: "assistant", content: replies[0]!.message.content });
    expect(requests[1]!.messages[2]).toEqual({ role: "user", content: [{ type: "tool_result", tool_use_id: "toolu_1", content: "file text", is_error: false }] });
    expect(seen).toHaveLength(2);
  });

  it("turns Farbaek's answers into model errors the loop understands", async () => {
    const failing = (error: Error) => createFarbaekToolModel({ client: { modelStep: async () => Promise.reject(error) }, taskId: "t1", effort: "balanced" }).begin({ system: "s", message: "m", tools });
    await expect(failing(new FarbaekApiError(402, "QUOTA_EXCEEDED", "There isn't enough AI usage left this month for this.")).send({})).rejects.toMatchObject({ kind: "usage", message: expect.stringContaining("AI usage") });
    await expect(failing(new FarbaekApiError(401, "UNAUTHENTICATED", "x")).send({})).rejects.toMatchObject({ kind: "auth" });
    await expect(failing(new FarbaekApiError(503, "AI_BUSY", "Busy.")).send({})).rejects.toMatchObject({ kind: "busy" });
    await expect(failing(new FarbaekApiError(0, "NETWORK", "Offline.")).send({})).rejects.toMatchObject({ kind: "network" });
    const controller = new AbortController();
    controller.abort();
    await expect(failing(new FarbaekApiError(0, "NETWORK", "x")).send({}, controller.signal)).rejects.toMatchObject({ kind: "cancelled" });
  });
});
