import { describe, expect, it } from "vitest";
import { checkLocalModelUrl, createLocalToolModel, listLocalModels } from "./local";
import { ModelError } from "./types";

/** A labelled fake of a local OpenAI-compatible server (Ollama and the like): it never reaches the network. */
function fakeLocal(replies: (object | { status: number; body: object } | "down")[]) {
  const requests: { url: string; body: { model: string; messages: { role: string; content: string | null; tool_call_id?: string }[]; tools: { function: { name: string } }[] } }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    requests.push({ url, body: init.body ? JSON.parse(String(init.body)) : null });
    const next = replies.shift();
    if (next === "down" || next === undefined) throw new TypeError("fetch failed");
    if ("status" in next) return new Response(JSON.stringify((next as { body: object }).body), { status: (next as { status: number }).status });
    return new Response(JSON.stringify(next), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetcher, requests };
}

const tools = [{ name: "read_file", description: "Read one text file from the project.", inputSchema: { type: "object", properties: { path: { type: "string" } }, required: ["path"] } }];

describe("the local model address (ADR 0134)", () => {
  it("accepts only this computer", () => {
    expect(checkLocalModelUrl("http://127.0.0.1:11434/v1/")).toEqual({ ok: true, base: "http://127.0.0.1:11434/v1" });
    expect(checkLocalModelUrl("http://localhost:1234/v1")).toEqual({ ok: true, base: "http://localhost:1234/v1" });
    expect(checkLocalModelUrl("http://[::1]:8080/v1").ok).toBe(true);
    for (const bad of ["https://api.example.com/v1", "http://192.168.1.10:11434/v1", "http://10.0.0.2/v1", "ftp://127.0.0.1/v1", "http://user:pw@127.0.0.1:11434/v1", "http://127.0.0.1:11434/v1?x=1", "not a url"]) {
      expect(checkLocalModelUrl(bad).ok, bad).toBe(false);
    }
    expect(() => createLocalToolModel({ base: "https://api.example.com/v1", model: "x" })).toThrow(ModelError);
  });
});

describe("a run on a local model", () => {
  it("sends the tools, parses tool calls, and passes tool results back in order", async () => {
    const f = fakeLocal([
      { model: "qwen3-coder:30b", choices: [{ message: { role: "assistant", content: "", tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: '{"path":"src/cart.ts"}' } }] }, finish_reason: "tool_calls" }], usage: { prompt_tokens: 900, completion_tokens: 40 } },
      { model: "qwen3-coder:30b", choices: [{ message: { role: "assistant", content: "Done." }, finish_reason: "stop" }], usage: { prompt_tokens: 1000, completion_tokens: 5 } },
    ]);
    const model = createLocalToolModel({ base: "http://127.0.0.1:11434/v1", model: "qwen3-coder:30b", fetch: f.fetcher });
    expect(model).toMatchObject({ provider: "local", model: "local:qwen3-coder:30b" });
    const convo = model.begin({ system: "You are the agent.", message: "Fix the cart.", tools });
    const first = await convo.send({});
    expect(first).toEqual({ text: "", toolCalls: [{ id: "c1", name: "read_file", input: { path: "src/cart.ts" } }], stop: "tool_use", usage: { inputTokens: 900, outputTokens: 40 }, model: "local:qwen3-coder:30b" });
    expect(f.requests[0]!.url).toBe("http://127.0.0.1:11434/v1/chat/completions");
    expect(f.requests[0]!.body.tools.map((t) => t.function.name)).toEqual(["read_file"]);
    const second = await convo.send({ toolResults: [{ id: "c1", content: "export const max = 1;", isError: false }] });
    expect(second).toMatchObject({ text: "Done.", toolCalls: [], stop: "end_turn" });
    expect(f.requests[1]!.body.messages.map((m) => m.role)).toEqual(["system", "user", "assistant", "tool"]);
    expect(f.requests[1]!.body.messages[3]).toMatchObject({ role: "tool", tool_call_id: "c1", content: "export const max = 1;" });
  });

  it("turns unreadable arguments into an input the registry refuses, and says why a step failed", async () => {
    const bad = fakeLocal([{ choices: [{ message: { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: "{oops" } }] }, finish_reason: "tool_calls" }] }]);
    const step = await createLocalToolModel({ base: "http://127.0.0.1:11434/v1", model: "m", fetch: bad.fetcher }).begin({ system: "s", message: "m", tools }).send({});
    expect(step.toolCalls[0]!.input).toEqual({ _unreadable: "{oops" });

    const down = createLocalToolModel({ base: "http://127.0.0.1:11434/v1", model: "m", fetch: fakeLocal(["down"]).fetcher });
    await expect(down.begin({ system: "s", message: "m", tools }).send({})).rejects.toMatchObject({ kind: "network", message: expect.stringMatching(/couldn't reach the local model/) });
    const missing = createLocalToolModel({ base: "http://127.0.0.1:11434/v1", model: "nope", fetch: fakeLocal([{ status: 404, body: { error: { message: "model 'nope' not found" } } }]).fetcher });
    await expect(missing.begin({ system: "s", message: "m", tools }).send({})).rejects.toMatchObject({ kind: "bad_request", message: expect.stringMatching(/ollama pull/) });
  });

  it("lists the models a local server offers", async () => {
    expect(await listLocalModels("http://127.0.0.1:11434/v1", fakeLocal([{ data: [{ id: "qwen3-coder:30b" }, { id: "llama4:latest" }, { id: "bad name!" }] }]).fetcher)).toEqual({ ok: true, models: ["qwen3-coder:30b", "llama4:latest"] });
    expect(await listLocalModels("http://127.0.0.1:11434/v1", fakeLocal(["down"]).fetcher)).toMatchObject({ ok: false, reason: expect.stringMatching(/Nothing answered/) });
    expect(await listLocalModels("https://api.example.com/v1")).toMatchObject({ ok: false });
  });
});
