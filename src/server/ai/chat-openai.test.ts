import { describe, expect, it } from "vitest";
import { createOpenAiChat } from "./chat-openai";

/** A fetch that records the request and answers with these server-sent events. */
function fakeFetch(events: object[], status = 200) {
  const sent: { url: string; body: Record<string, unknown> }[] = [];
  const fetcher = (async (url: string, init: { body: string }) => {
    sent.push({ url, body: JSON.parse(init.body) });
    const text = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("");
    return new Response(new Blob([text]).stream(), { status, headers: { "content-type": "text/event-stream" } });
  }) as unknown as typeof fetch;
  return { fetcher, sent };
}

const handlers = () => {
  const seen = { text: "", thinking: "" };
  return { seen, h: { onText: (d: string) => void (seen.text += d), onThinking: (d: string) => void (seen.thinking += d) } };
};

describe("OpenAI's chat answers (stage 203)", () => {
  it("asks for the thinking the route chose, and never stores the conversation at OpenAI", async () => {
    const { fetcher, sent } = fakeFetch([
      { type: "response.output_text.delta", delta: "Hello" },
      { type: "response.completed", response: { usage: { input_tokens: 120, output_tokens: 8, input_tokens_details: { cached_tokens: 20 } } } },
    ]);
    const chat = createOpenAiChat({ key: "test-key", fetcher });
    const { seen, h } = handlers();
    const outcome = await chat.stream({ model: "gpt-6-luna", thinking: "medium", system: "You are Farbaek AI.", messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }], maxOutputTokens: 4_000 }, h, new AbortController().signal);
    expect(sent[0]!.body).toMatchObject({ model: "gpt-6-luna", reasoning: { effort: "medium" }, store: false, stream: true, max_output_tokens: 4_000 });
    expect(seen.text).toBe("Hello");
    expect(outcome).toMatchObject({ ok: true, stop: "end", usage: { model: "gpt-6-luna", inputTokens: 100, cacheReadTokens: 20, outputTokens: 8 } });
  });

  it("passes OpenAI's thinking summaries to the Thinking display, when OpenAI sends them", async () => {
    const { fetcher } = fakeFetch([
      { type: "response.reasoning_summary_text.delta", delta: "Working it out." },
      { type: "response.output_text.delta", delta: "42" },
      { type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 30 } } },
    ]);
    const { seen, h } = handlers();
    await createOpenAiChat({ key: "test-key", fetcher }).stream({ model: "gpt-6.1-sol", thinking: "high", system: "s", messages: [{ role: "user", parts: [{ type: "text", text: "6 x 7?" }] }], maxOutputTokens: 1_000 }, h, new AbortController().signal);
    expect(seen.thinking).toBe("Working it out.");
    expect(seen.text).toBe("42");
  });

  it("puts the language note after the system prompt and sends the person's message unchanged (stage 204)", async () => {
    const { fetcher, sent } = fakeFetch([{ type: "response.completed", response: { usage: { input_tokens: 10, output_tokens: 1 } } }]);
    const { h } = handlers();
    const text = "Mata website ekak hadaganna one";
    await createOpenAiChat({ key: "test-key", fetcher }).stream({ model: "gpt-6-luna", thinking: "low", system: "You are Farbaek AI.", guidance: "Language note.", messages: [{ role: "user", parts: [{ type: "text", text }] }], maxOutputTokens: 100 }, h, new AbortController().signal);
    expect(sent[0]!.body.instructions).toBe("You are Farbaek AI.\n\nLanguage note.");
    expect(JSON.stringify(sent[0]!.body.input)).toContain(text);
  });

  it("reads a busy OpenAI as busy, so another model can take the question", async () => {
    const { fetcher } = fakeFetch([], 429);
    const { h } = handlers();
    const outcome = await createOpenAiChat({ key: "test-key", fetcher }).stream({ model: "gpt-6-luna", thinking: "low", system: "s", messages: [{ role: "user", parts: [{ type: "text", text: "Hi" }] }], maxOutputTokens: 100 }, h, new AbortController().signal);
    expect(outcome).toMatchObject({ ok: false, failure: "PROVIDER_BUSY" });
  });
});
