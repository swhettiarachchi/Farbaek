import { describe, expect, it } from "vitest";
import type { SecondCheckRequest } from "@/core/trust/second-check";
import { OPENAI_SECOND_CHECK_MODEL, createOpenAiSecondChecker, openAiKey } from "./openai-second-checker";

const KEY = "test-key-not-real";
const request: SecondCheckRequest = {
  contract: { outcome: "Reject fractional quantities.", resources: ["src/cart.ts"], allowedOperations: ["files.edit"], forbiddenOperations: [], protectedInvariants: [], acceptanceCriteria: [], requiredChecks: [] },
  plan: { summary: "Validate.", steps: [], risks: [], checks: [] },
  policy: null,
  violations: [],
  changes: [{ path: "src/cart.ts", kind: "edit", reason: "Validate", diff: "@@ -1,0 +1,1 @@\n+check();" }],
};
const answer = { verdict: "concerns", summary: "One risk.", findings: [{ topic: "risk", severity: "concern", path: "src/cart.ts", detail: "No test." }], uncertainty: "" };

/** A labelled fake of OpenAI's Responses API: it never reaches the network. */
function fakeOpenAi(reply: { status?: number; body?: unknown; throws?: boolean }) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    if (reply.throws) throw new TypeError("network");
    return new Response(typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body ?? {}), { status: reply.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fetcher, calls };
}

const completed = (text: string, extra: Record<string, unknown> = {}) => ({
  status: "completed",
  output: [{ type: "reasoning" }, { type: "message", content: [{ type: "output_text", text }] }],
  usage: { input_tokens: 5_000, output_tokens: 700, input_tokens_details: { cached_tokens: 1_000 } },
  ...extra,
});

describe("the second check on OpenAI", () => {
  it("asks with a strict schema, stores nothing at OpenAI, and splits cached tokens out of input", async () => {
    const f = fakeOpenAi({ body: completed(JSON.stringify(answer)) });
    const r = await createOpenAiSecondChecker({ key: KEY, fetcher: f.fetcher }).check(request);
    expect(r).toEqual({ ok: true, output: answer, usage: { model: OPENAI_SECOND_CHECK_MODEL, inputTokens: 4_000, outputTokens: 700, cacheWriteTokens: 0, cacheReadTokens: 1_000 } });
    expect(f.calls[0]!.url).toBe("https://api.openai.com/v1/responses");
    expect((f.calls[0]!.init.headers as Record<string, string>).authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(f.calls[0]!.init.body));
    expect(body).toMatchObject({ model: OPENAI_SECOND_CHECK_MODEL, store: false, text: { format: { type: "json_schema", strict: true } } });
    expect(JSON.parse(body.input)).toEqual(request);
  });

  it("cuts over-long text to the limits instead of failing a paid check", async () => {
    const long = { ...answer, summary: "x".repeat(900), findings: Array.from({ length: 20 }, () => answer.findings[0]) };
    const r = await createOpenAiSecondChecker({ key: KEY, fetcher: fakeOpenAi({ body: completed(JSON.stringify(long)) }).fetcher }).check(request);
    expect(r.ok && r.output.summary.length).toBe(600);
    expect(r.ok && r.output.findings.length).toBe(12);
  });

  it("reports refusals, cut-off answers, busy and failing providers", async () => {
    const run = (reply: Parameters<typeof fakeOpenAi>[0]) => createOpenAiSecondChecker({ key: KEY, fetcher: fakeOpenAi(reply).fetcher }).check(request);
    expect(await run({ body: { status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "No." }] }], usage: { input_tokens: 10, output_tokens: 2 } } })).toMatchObject({ ok: false, failure: "REFUSED" });
    expect(await run({ body: completed(JSON.stringify(answer), { status: "incomplete" }) })).toMatchObject({ ok: false, failure: "INCOMPLETE", usage: { outputTokens: 700 } });
    expect(await run({ body: completed("not json") })).toMatchObject({ ok: false, failure: "INCOMPLETE" });
    expect(await run({ body: completed(JSON.stringify({ verdict: "maybe" })) })).toMatchObject({ ok: false, failure: "INCOMPLETE" });
    expect(await run({ status: 429 })).toEqual({ ok: false, failure: "PROVIDER_BUSY", usage: null });
    expect(await run({ status: 503 })).toEqual({ ok: false, failure: "PROVIDER_BUSY", usage: null });
    expect(await run({ status: 401 })).toEqual({ ok: false, failure: "PROVIDER_ERROR", usage: null });
    expect(await run({ throws: true })).toEqual({ ok: false, failure: "PROVIDER_BUSY", usage: null });
    expect(await run({ body: "<html>" })).toEqual({ ok: false, failure: "INCOMPLETE", usage: null });
  });

  it("reads the key only from the environment, and treats a blank one as none", () => {
    expect(openAiKey({ OPENAI_API_KEY: "  " })).toBeNull();
    expect(openAiKey({})).toBeNull();
    expect(openAiKey({ OPENAI_API_KEY: ` ${KEY} ` })).toBe(KEY);
  });
});
