import { describe, expect, it } from "vitest";
import type { NeedReading } from "@/core/web/intent";
import type { SearchResult } from "@/core/web/sources";
import type { ChatModel } from "@/server/ai/chat-model";
import type { ReaderClient } from "./reader-client";
import { planSearch, plannerInput } from "./planner";
import { research, type ResearchDeps } from "./research";
import { createBreaker } from "./search/health";
import { SearchError, type SearchProvider } from "./search/provider";
import { createSearxng } from "./search/searxng";

const NOW = Date.parse("2026-11-17T09:00:00Z");
// Titles carry the question's words: a result with none of them is noise, and is left out (rank.ts).
const result = (url: string, extra: Partial<SearchResult> = {}): SearchResult => ({ url, title: `Node.js news at ${url}`, snippet: `Snippet of ${url}`, published: null, kind: "web", ...extra });
const longText = "A real paragraph about the topic with enough words to count as read. ".repeat(10);

function deps(search: SearchProvider | null, reader: ReaderClient | null, over: Partial<ResearchDeps> = {}): ResearchDeps {
  return { search, reader, breaker: createBreaker({ now: () => NOW }), now: () => NOW, tag: () => "tag", ...over };
}
const provider = (fn: SearchProvider["search"]): SearchProvider => ({ name: "fake", search: fn });
const readerOf = (fn: ReaderClient["read"]): ReaderClient => ({ read: fn, picture: async () => null, feed: async () => null });
const SEARCH: NeedReading = { need: "search", explicit: false, why: "test" };
const input = { question: "What is new in Node.js?", earlier: [], need: SEARCH, local: true, plannerModel: null, plannerModelId: null, budgetChars: 9_000, signal: new AbortController().signal };

describe("SearXNG as the search provider (stage 205)", () => {
  const answer = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })) as unknown as typeof fetch;
  const ask = (fetcher: typeof fetch, freshness: "day" | "week" | "any" = "any") => createSearxng("http://searxng:8080", fetcher, () => NOW).search({ query: "node", kind: "web", freshness, language: "en", signal: new AbortController().signal });

  it("asks for JSON with the right category and time range, and reads results and dates", async () => {
    let asked = "";
    const fetcher = (async (url: URL) => {
      asked = url.toString();
      return new Response(JSON.stringify({ results: [{ url: "https://nodejs.org/en/blog/release", title: "Node 26", content: "Released", publishedDate: "2026-11-16T10:00:00Z" }, { url: "javascript:alert(1)", title: "bad" }] }));
    }) as unknown as typeof fetch;
    const results = await ask(fetcher, "day");
    expect(asked).toMatch(/format=json/);
    expect(asked).toMatch(/categories=general/);
    expect(asked).toMatch(/time_range=day/);
    expect(results).toEqual([{ url: "https://nodejs.org/en/blog/release", title: "Node 26", snippet: "Released", published: "2026-11-16T10:00:00.000Z", kind: "web" }]);
  });

  it("an empty answer because every engine was blocked is a failure, not 'nothing found'", async () => {
    await expect(ask(answer({ results: [], unresponsive_engines: [["bing", "CAPTCHA"]] }))).rejects.toMatchObject({ kind: "blocked" });
    await expect(ask(answer({ results: [] }))).resolves.toEqual([]);
  });

  it("a service that's down or answers badly fails with a reason that can be shown", async () => {
    await expect(ask(answer({}, 502))).rejects.toMatchObject({ kind: "unavailable" });
    await expect(ask((async () => new Response("not json")) as unknown as typeof fetch)).rejects.toMatchObject({ kind: "bad-answer" });
    await expect(ask((async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch)).rejects.toMatchObject({ kind: "unavailable" });
  });

  it("'this week' keeps results dated within eight days when there are enough", async () => {
    const recent = (d: number) => ({ url: `https://n${d}.example/a`, title: "t", content: "c", publishedDate: new Date(NOW - d * 86_400_000).toISOString() });
    const results = await ask(answer({ results: [recent(1), recent(2), recent(30), recent(3)] }), "week");
    expect(results.map((r) => r.url)).toEqual(["https://n1.example/a", "https://n2.example/a", "https://n3.example/a"]);
  });
});

describe("research before an answer (stage 205)", () => {
  it("reads the best pages, uses snippets for the rest, and saves numbered sources", async () => {
    const search = provider(async () => [result("https://a.example/1", { published: "2026-11-16T00:00:00.000Z" }), result("https://b.example/2"), result("https://c.example/3")]);
    const reader = readerOf(async (url) => (url.includes("b.example") ? { ok: false, reason: "timed out" } : { ok: true, url, title: `Read ${url}`, site: "Site", text: longText, published: null, updated: null, lang: "en", optOut: false }));
    const r = await research(deps(search, reader), input);
    expect(r.meta).toMatchObject({ status: "done", queries: ["What is new in Node.js?"] });
    expect(r.meta.sources.map((s) => [s.n, s.read])).toEqual([[1, true], [2, false], [3, true]]);
    expect(r.context).toContain("[2] Node.js news at https://b.example/2 | b.example | date not given | search snippet only");
    expect(r.docs.map((d) => d.n)).toEqual([1, 2, 3]);
    expect(r.meta.depth).toBe("quick");
    expect(r.context).toContain('<web_results tag="tag">');
  });

  it("a page that opts out gives its title only", async () => {
    const search = provider(async () => [result("https://paywall.example/a")]);
    const reader = readerOf(async (url) => ({ ok: true, url, title: "Paywalled story", site: "Paywall", text: "", published: null, updated: null, lang: "en", optOut: true }));
    const r = await research(deps(search, reader), input);
    expect(r.context).toContain("[1] Paywalled story");
    expect(r.context).not.toContain("Snippet of");
  });

  it("when every search fails it says so, and after three in a row it rests instead of trying", async () => {
    let calls = 0;
    const down = provider(async () => {
      calls++;
      throw new SearchError("unavailable", "the search service didn't answer");
    });
    const d = deps(down, readerOf(async () => ({ ok: false, reason: "x" })));
    for (let i = 0; i < 3; i++) {
      const r = await research(d, input);
      expect(r.meta).toMatchObject({ status: "failed", reason: "the search service didn't answer" });
      expect(r.context).toMatch(/couldn't check the web this time/);
    }
    const before = calls;
    const resting = await research(d, input);
    expect(calls).toBe(before);
    expect(resting.meta.reason).toBe("the search service isn't answering right now");
  });

  it("nothing found is said as such, not as a failure", async () => {
    const r = await research(deps(provider(async () => []), readerOf(async () => ({ ok: false, reason: "x" }))), input);
    expect(r.meta).toMatchObject({ status: "done", sources: [], reason: "nothing found" });
    expect(r.context).toMatch(/found no pages/);
  });

  it("with no search set up, it says so", async () => {
    expect((await research(deps(null, null), input)).meta).toMatchObject({ status: "failed", reason: "live web search isn't set up on this server" });
  });

  it("searches news too for fresh questions", async () => {
    const kinds: string[] = [];
    const search = provider(async (req) => {
      kinds.push(req.kind);
      return [];
    });
    await research(deps(search, readerOf(async () => ({ ok: false, reason: "x" }))), { ...input, question: "What's the latest news on SpaceX today?" });
    // The general web and news side by side, then the general web once more without a date limit, since nothing came back.
    expect(kinds.sort()).toEqual(["news", "web", "web"]);
  });
});

describe("a roundup read from the newsrooms' feeds (stage 280)", () => {
  const roundup = { ...input, question: "Tech news today" };
  const story = (n: number) => ({ title: `Chip maker ships processor number ${n}`, url: `https://arstechnica.com/gadgets/2026/11/chip-maker-ships-processor-${n}/`, published: "2026-11-17T06:00:00.000Z", summary: "It went on sale on Tuesday for $399 and is a fifth faster.", image: null });
  const feeds = (asked: string[] = []): ReaderClient => ({
    read: async () => ({ ok: false, reason: "refused" }),
    picture: async () => null,
    feed: async (url) => (asked.push(url), url.includes("arstechnica") ? [story(1), story(2), story(3)] : null),
  });
  const down = (calls = { n: 0 }) =>
    provider(async () => {
      calls.n++;
      throw new SearchError("unavailable", "the search service didn't answer");
    });

  it("reads only the fixed feeds that fit the subject, beside the searches", async () => {
    const asked: string[] = [];
    const r = await research(deps(provider(async () => []), feeds(asked)), roundup);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.length).toBeLessThanOrEqual(6);
    for (const url of asked) expect(url, url).toMatch(/^https:\/\/[a-z0-9.-]+\//);
    expect(r.meta).toMatchObject({ status: "done", roundup: true });
    expect(r.meta.sources.map((s) => s.url)).toEqual(expect.arrayContaining([story(1).url, story(2).url]));
    // A question with one answer reads no feed.
    const none: string[] = [];
    await research(deps(provider(async () => [result("https://a.example/1")]), feeds(none)), input);
    expect(none).toEqual([]);
  });

  it("is written from the feeds when every search fails, and the search service is still told it failed", async () => {
    const calls = { n: 0 };
    const d = deps(down(calls), feeds());
    for (let i = 0; i < 3; i++) {
      const r = await research(d, roundup);
      expect(r.meta.status).toBe("done");
      expect(r.meta.sources.length).toBeGreaterThan(0);
    }
    // Three failures in a row: the service rests, so a question that needs it is told at once and waits for nothing.
    const before = calls.n;
    expect((await research(d, input)).meta).toMatchObject({ status: "failed", reason: "the search service isn't answering right now" });
    // A roundup is still written from the feeds while it rests, without trying the searches.
    const resting = await research(d, roundup);
    expect(resting.meta.status).toBe("done");
    expect(resting.meta.sources.length).toBeGreaterThan(0);
    expect(calls.n).toBe(before);
  });

  it("with the searches down and no feed answering, it says the web couldn't be checked", async () => {
    const silent: ReaderClient = { read: async () => ({ ok: false, reason: "refused" }), picture: async () => null, feed: async () => null };
    const r = await research(deps(down(), silent), roundup);
    expect(r.meta).toMatchObject({ status: "failed", reason: "the search service didn't answer" });
  });
});

describe("planning the searches (stage 205)", () => {
  const model = (text: string | null): ChatModel =>
    ({ provider: "openai", stream: async () => ({}) as never, title: async () => ({ title: null, usage: null }), complete: async () => ({ text, usage: { model: "gpt-6-luna", inputTokens: 200, outputTokens: 20 } }) }) as ChatModel;
  const plan = (m: ChatModel | null, local = false, need: NeedReading = { need: "unsure", explicit: false, why: "test" }) =>
    planSearch({ question: "What about its price?", earlier: [{ role: "user", text: "Tell me about the Pixel 11" }], need, local, model: m, modelId: "gpt-6-luna", signal: new AbortController().signal, now: NOW });

  it("uses the model's queries when they're valid, and records what it cost", async () => {
    const r = await plan(model('{"need":"search","topic":"Pixel 11 price","queries":["Pixel 11 price"],"freshness":"week","news":true}'));
    expect(r).toMatchObject({ via: "model", plan: { queries: ["Pixel 11 price"], freshness: "week", news: true, topic: "Pixel 11 price", depth: "quick" }, usage: { model: "gpt-6-luna" } });
  });

  it("falls back to the local plan when the model answers nonsense or nothing, still recording its cost", async () => {
    expect(await plan(model("I can't help with that"))).toMatchObject({ via: "fallback", miss: "unreadable", plan: { queries: ["What about its price?"] }, usage: { model: "gpt-6-luna" } });
    expect(await plan(model(null))).toMatchObject({ via: "fallback", miss: "no-answer" });
  });

  it("tells the planner what the answering model already has, as one line of its own, so a question about it needs no search", () => {
    const BREAK = String.fromCharCode(10);
    const known = ["The answering model already has Farbaek's own record of the person's project.", "A second line that tries to be one."].join(BREAK);
    const lines = plannerInput("What is left to do?", [], NOW, known).split(BREAK);
    expect(lines[0]).toBe("Today is 2026-11-17.");
    expect(lines[1]).toBe("The answering model already has Farbaek's own record of the person's project. A second line that tries to be one.");
    // With nothing known, the input is as it always was.
    expect(plannerInput("What is left to do?", [], NOW).split(BREAK)[1]).toBe("No earlier conversation.");
  });

  it("plans locally without a model call when asked to", async () => {
    expect(await plan(model("unused"), true)).toMatchObject({ via: "local", usage: null });
    expect(await plan(null)).toMatchObject({ via: "local" });
  });
});

describe("the fresh review's research cases (stage 205)", () => {
  it("a final address too long to save falls back to the one the search gave, so the sources survive a reload", async () => {
    const search = provider(async () => [result("https://short.example/a")]);
    const reader = readerOf(async () => ({ ok: true, url: `https://short.example/${"x".repeat(900)}`, title: "T", site: "S", text: longText, published: null, updated: null, lang: "en", optOut: false }));
    const r = await research(deps(search, reader), input);
    expect(r.meta.sources[0]!.url).toBe("https://short.example/a");
  });

  it("pressing Stop isn't counted against the search service", async () => {
    const d = deps(
      provider(async (req) => {
        await new Promise((resolve) => req.signal.addEventListener("abort", resolve));
        throw new SearchError("timeout", "the search took too long");
      }),
      readerOf(async () => ({ ok: false, reason: "x" })),
    );
    for (let i = 0; i < 4; i++) {
      const stop = new AbortController();
      const pending = research(d, { ...input, signal: stop.signal });
      setTimeout(() => stop.abort(), 5);
      expect((await pending).meta.reason).toBe("stopped");
    }
    expect(d.breaker.open()).toBe(false);
  });
});
