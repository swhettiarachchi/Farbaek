/**
 * Gemini adapter tests against a fake fetch (test-only). Live behaviour is
 * checked once a key is configured, by drafting a contract in the app.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveAiProvider, geminiModel, DEFAULT_GEMINI_MODEL } from "./config";
import { createGeminiChangeProposer, createGeminiContractDrafter, toGeminiSchema } from "./gemini";

const draft = {
  outcome: "Owners can archive a project.",
  resources: ["src/app/app/projects"],
  allowedOperations: ["files.edit"],
  forbiddenOperations: ["files.delete"],
  protectedFields: [],
  protectedInvariants: ["Nothing is deleted."],
  acceptanceCriteria: [{ statement: "Archiving needs an owner or admin.", verification: "test" }],
  requiredChecks: ["pnpm test"],
  assumptions: [],
  openQuestions: [],
  recovery: "Clear archived_at.",
  maxRecords: null,
};

const brief = { taskTitle: "Archive projects", projectName: "Farbaek", projectDescription: null, notes: {} };

function fakeFetch(...responses: (Response | (() => Response))[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  let i = 0;
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = responses[Math.min(i++, responses.length - 1)]!;
    return typeof r === "function" ? r() : r.clone();
  }) as unknown as typeof fetch;
  return { f, calls };
}

const ok = (payload: unknown, extra: Record<string, unknown> = {}) =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: "thinking...", thought: true }, { text: JSON.stringify(payload) }] }, finishReason: "STOP" }],
      usageMetadata: { promptTokenCount: 812, candidatesTokenCount: 240, thoughtsTokenCount: 60 },
      modelVersion: "gemini-3.8-flash-001",
      ...extra,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Gemini contract drafter", () => {
  it("sends the key in a header, asks for schema-shaped JSON and validates the answer", async () => {
    const { f, calls } = fakeFetch(ok(draft));
    const drafter = createGeminiContractDrafter({ apiKey: "AIza-test-key", model: "gemini-3.8-flash", fetch: f });
    const r = await drafter.draft(brief);
    expect(r).toMatchObject({ ok: true, usage: { model: "gemini-3.8-flash-001", inputTokens: 812, outputTokens: 300 } });
    const call = calls[0]!;
    expect(call.url).toBe("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent");
    expect(call.url).not.toContain("AIza");
    expect(new Headers(call.init.headers).get("x-goog-api-key")).toBe("AIza-test-key");
    const body = JSON.parse(String(call.init.body));
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    expect(body.generationConfig.responseJsonSchema.properties.outcome.type).toBe("string");
    expect(JSON.stringify(body.generationConfig.responseJsonSchema)).not.toContain("$schema");
    expect(body.systemInstruction.parts[0].text).toContain("intent contracts");
    expect(JSON.parse(body.contents[0].parts[0].text)).toMatchObject({ task: { title: "Archive projects" } });
  });

  it("treats blocked prompts and safety stops as refusals", async () => {
    const blocked = new Response(JSON.stringify({ promptFeedback: { blockReason: "SAFETY" }, usageMetadata: { promptTokenCount: 10 } }), { status: 200 });
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(blocked).f }).draft(brief)).toMatchObject({ ok: false, failure: "REFUSED" });
    const stopped = ok({}, { candidates: [{ content: { parts: [] }, finishReason: "PROHIBITED_CONTENT" }] });
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(stopped).f }).draft(brief)).toMatchObject({ ok: false, failure: "REFUSED" });
  });

  it("reports cut-off, malformed or off-schema output as incomplete, never as a draft", async () => {
    const cut = ok(draft, { candidates: [{ content: { parts: [{ text: '{"outcome": "x"' }] }, finishReason: "MAX_TOKENS" }] });
    const notJson = ok({}, { candidates: [{ content: { parts: [{ text: "Sure! Here is your contract." }] }, finishReason: "STOP" }] });
    const offSchema = ok({ outcome: 42 });
    for (const res of [cut, notJson, offSchema]) {
      expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(res).f }).draft(brief)).toMatchObject({ ok: false, failure: "INCOMPLETE" });
    }
  });

  it("maps rate limits and outages to busy, and other errors to provider errors", async () => {
    const busy = new Response("{}", { status: 429 });
    const down = new Response("{}", { status: 503 });
    const badKey = new Response(JSON.stringify({ error: { message: "API key not valid. Please pass a valid API key." } }), { status: 400 });
    const forbidden = new Response("{}", { status: 403 });
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(busy).f }).draft(brief)).toMatchObject({ failure: "PROVIDER_BUSY" });
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(down).f }).draft(brief)).toMatchObject({ failure: "PROVIDER_BUSY" });
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(badKey).f }).draft(brief)).toMatchObject({ failure: "PROVIDER_ERROR" });
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: fakeFetch(forbidden).f }).draft(brief)).toMatchObject({ failure: "PROVIDER_ERROR" });
    const thrown = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: thrown }).draft(brief)).toMatchObject({ failure: "PROVIDER_ERROR" });
  });

  it("retries once in plain JSON mode when the schema field is rejected, and still validates", async () => {
    const rejected = new Response(JSON.stringify({ error: { message: 'Invalid JSON payload received. Unknown name "responseJsonSchema" at generation_config' } }), { status: 400 });
    const { f, calls } = fakeFetch(rejected, ok(draft));
    const r = await createGeminiContractDrafter({ apiKey: "k", model: "m", fetch: f }).draft(brief);
    expect(r.ok).toBe(true);
    expect(calls).toHaveLength(2);
    const second = JSON.parse(String(calls[1]!.init.body));
    expect(second.generationConfig.responseJsonSchema).toBeUndefined();
    expect(second.systemInstruction.parts[0].text).toContain("matching this JSON Schema");
  });
});

describe("Gemini change proposer", () => {
  it("returns validated proposals", async () => {
    const output = { summary: "Adds an archive card.", steps: ["Add the card"], risks: [], changes: [], checks: ["pnpm test"] };
    const { f, calls } = fakeFetch(ok(output));
    const proposer = createGeminiChangeProposer({ apiKey: "k", model: "gemini-3.8-flash", fetch: f });
    const r = await proposer.propose({
      contract: { ...draft, maxRecords: null } as never,
      taskTitle: "Archive projects",
      projectName: "Farbaek",
      paths: ["README.md"],
      files: [{ path: "README.md", content: "# Farbaek\n" }],
      notes: "",
    });
    expect(r).toMatchObject({ ok: true, output: { summary: "Adds an archive card." } });
    expect(JSON.parse(String(calls[0]!.init.body)).systemInstruction.parts[0].text).toContain("targeted changes");
  });
});

describe("schema reduction", () => {
  it("keeps only documented JSON Schema keywords", () => {
    expect(
      toGeminiSchema({
        $schema: "https://json-schema.org/draft/2020-12/schema",
        type: "object",
        properties: { a: { type: "string", minLength: 1, pattern: "x", description: "d" }, b: { anyOf: [{ type: "integer" }, { type: "null" }] } },
        required: ["a"],
        additionalProperties: false,
      }),
    ).toEqual({
      type: "object",
      properties: { a: { type: "string", description: "d" }, b: { anyOf: [{ type: "integer" }, { type: "null" }] } },
      required: ["a"],
      additionalProperties: false,
    });
  });
});

describe("provider selection", () => {
  it("prefers Claude, falls back to Gemini when only its key exists, and honours AI_PROVIDER", () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("GEMINI_API_KEY", "");
    vi.stubEnv("AI_PROVIDER", "");
    expect(resolveAiProvider()).toEqual({ provider: null, reason: "AI isn't connected on this server yet." });
    vi.stubEnv("GEMINI_API_KEY", "AIza-x");
    expect(resolveAiProvider()).toEqual({ provider: "gemini", label: "Gemini" });
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant-x");
    expect(resolveAiProvider()).toEqual({ provider: "anthropic", label: "Claude" });
    vi.stubEnv("AI_PROVIDER", "gemini");
    expect(resolveAiProvider()).toEqual({ provider: "gemini", label: "Gemini" });
    vi.stubEnv("GEMINI_API_KEY", "");
    expect(resolveAiProvider()).toMatchObject({ provider: null, reason: expect.stringContaining("GEMINI_API_KEY") });
    vi.stubEnv("AI_PROVIDER", "openai");
    expect(resolveAiProvider()).toMatchObject({ provider: null, reason: expect.stringContaining("anthropic or gemini") });
  });

  it("uses a valid GEMINI_MODEL or the default", () => {
    vi.stubEnv("GEMINI_MODEL", "");
    expect(geminiModel()).toBe(DEFAULT_GEMINI_MODEL);
    vi.stubEnv("GEMINI_MODEL", "gemini-3.5-flash-lite");
    expect(geminiModel()).toBe("gemini-3.5-flash-lite");
    vi.stubEnv("GEMINI_MODEL", "../../evil");
    expect(geminiModel()).toBe(DEFAULT_GEMINI_MODEL);
  });
});
