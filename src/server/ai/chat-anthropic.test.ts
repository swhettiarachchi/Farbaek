import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { createAnthropicChat } from "./chat-anthropic";

/** A Claude client that records what it's asked and answers with nothing. */
function fakeClient() {
  const sent: Record<string, unknown>[] = [];
  const client = {
    beta: {
      messages: {
        stream: (params: Record<string, unknown>) => {
          sent.push(params);
          return {
            async *[Symbol.asyncIterator]() {},
            finalMessage: async () => ({ model: "claude-haiku-5-5", stop_reason: "end_turn", content: [], usage: { input_tokens: 10, output_tokens: 1 } }),
          };
        },
      },
    },
  };
  return { client: client as unknown as Anthropic, sent };
}

describe("Claude's chat answers", () => {
  it("keeps the system prompt as the first, cached block, puts the language note after it, and sends the message unchanged (stage 204)", async () => {
    const { client, sent } = fakeClient();
    const text = "Mata website ekak hadaganna one";
    const outcome = await createAnthropicChat(client).stream(
      { model: "claude-haiku-5-5", thinking: "low", system: "You are Farbaek AI.", guidance: "Language note.", messages: [{ role: "user", parts: [{ type: "text", text }] }], maxOutputTokens: 100 },
      { onText: () => undefined, onThinking: () => undefined },
      new AbortController().signal,
    );
    expect(outcome.ok).toBe(true);
    expect(sent[0]!.system).toEqual([
      { type: "text", text: "You are Farbaek AI." },
      { type: "text", text: "Language note." },
    ]);
    expect(sent[0]!.cache_control).toEqual({ type: "ephemeral" });
    expect(JSON.stringify(sent[0]!.messages)).toContain(text);
  });

  it("sends one system block when there's no language note", async () => {
    const { client, sent } = fakeClient();
    await createAnthropicChat(client).stream(
      { model: "claude-haiku-5-5", thinking: "low", system: "You are Farbaek AI.", messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }], maxOutputTokens: 100 },
      { onText: () => undefined, onThinking: () => undefined },
      new AbortController().signal,
    );
    expect(sent[0]!.system).toEqual([{ type: "text", text: "You are Farbaek AI." }]);
  });
});
