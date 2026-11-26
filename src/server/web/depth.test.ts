import { describe, expect, it } from "vitest";
import type { NeedReading } from "@/core/web/intent";
import type { SearchResult } from "@/core/web/sources";
import type { ChatModel } from "@/server/ai/chat-model";
import type { ReaderClient } from "./reader-client";
import { planSearch } from "./planner";
import { research, type ResearchDeps } from "./research";
import { withSearchCache } from "./search/cache";
import { createBreaker } from "./search/health";
import type { SearchProvider } from "./search/provider";

const NOW = Date.parse("2026-11-17T09:00:00Z");
// Titles carry the question's words: a result with none of them is noise, and is left out (rank.ts).
const result = (url: string, extra: Partial<SearchResult> = {}): SearchResult => ({ url, title: `Node.js news at ${url}`, snippet: `Snippet of ${url}`, published: null, kind: "web", ...extra });
const longText = "A real paragraph about the topic with enough words to count as read. ".repeat(10);
const page = (url: string) => ({ ok: true as const, url, title: `Read ${url}`, site: "Site", text: longText, published: null, updated: null, lang: "en", optOut: false });
const unread = async () => ({ ok: false as const, reason: "x" });

function deps(search: SearchProvider | null, reader: ReaderClient | null, over: Partial<ResearchDeps> = {}): ResearchDeps {
  return { search, reader, breaker: createBreaker({ now: () => NOW }), now: () => NOW, tag: () => "tag", ...over };
}
const provider = (fn: SearchProvider["search"]): SearchProvider => ({ name: "fake", search: fn });
const readerOf = (fn: ReaderClient["read"]): ReaderClient => ({ read: fn, picture: async () => null, feed: async () => null });
const SEARCH: NeedReading = { need: "search", explicit: false, why: "test" };
const UNSURE: NeedReading = { need: "unsure", explicit: false, why: "test" };
const input = { question: "What is new in Node.js?", earlier: [], need: SEARCH, local: true, plannerModel: null, plannerModelId: null, budgetChars: 9_000, signal: new AbortController().signal };

const usage = { model: "gpt-6-luna", inputTokens: 200, outputTokens: 20 };
function model(answers: (string | null)[]): ChatModel & { calls: string[] } {
  const calls: string[] = [];
  return {
    provider: "openai",
    calls,
    stream: async () => ({}) as never,
    title: async () => ({ title: null, usage: null }),
    complete: async (request: { input: string }) => {
      calls.push(request.input);
      return { text: answers[calls.length - 1] ?? null, usage };
    },
  } as ChatModel & { calls: string[] };
}
const SINGLISH = "mata ada tech industire eka aluth details denna";
const planWith = (m: ChatModel, need: NeedReading, question = SINGLISH) => planSearch({ question, earlier: [], need, local: false, model: m, modelId: "gpt-6-luna", signal: new AbortController().signal, now: NOW });

describe("whether the web is needed (stage 206)", () => {
  it("the planner may say the web isn't needed, and then nothing is searched", async () => {
    let searched = 0;
    const search = provider(async () => {
      searched++;
      return [];
    });
    const r = await research(deps(search, readerOf(unread)), { ...input, question: "Explain how photosynthesis works", need: UNSURE, local: false, plannerModel: model(['{"need":"none"}']), plannerModelId: "gpt-6-luna" });
    expect(searched).toBe(0);
    expect(r.meta).toMatchObject({ status: "skipped", sources: [] });
    expect(r.context).toMatch(/didn't check the live web/);
    expect(r.plannerUsage).toEqual(usage);
    expect(r.docs).toEqual([]);
  });

  it("the planner can't skip a search the person's own words asked for", async () => {
    const r = await planWith(model(['{"need":"none"}']), SEARCH);
    expect(r).toMatchObject({ via: "fallback", miss: "overruled" });
    expect(r.plan?.queries).toEqual(["today tech industire latest"]);
  });

  it("a planner that is late or fails never sends Sinhala in English letters to the search engines", async () => {
    const r = await planWith(model([null]), UNSURE);
    expect(r).toMatchObject({ via: "fallback", miss: "no-answer" });
    expect(r.plan?.queries.join(" ")).not.toMatch(/mata|denna|eka/);
    expect(r.plan).toMatchObject({ freshness: "day", news: true });
  });

  it("a query the model wrote in Sinhala typed in English letters is read into search words", async () => {
    const r = await planWith(model(['{"need":"search","topic":"technology news","queries":["mata ada tech news kiyanna","technology industry news today"],"freshness":"day","news":true}']), UNSURE);
    expect(r.plan?.queries).toEqual(["today tech news", "technology industry news today"]);
    expect(r.plan?.depth).toBe("standard");
  });

  it("the question's own words can ask for fresher results than the model noticed", async () => {
    const r = await planWith(model(['{"need":"search","topic":"tech","queries":["technology industry"],"freshness":"any","news":false}']), UNSURE);
    expect(r.plan).toMatchObject({ freshness: "day", news: true });
  });

  it("the planner is told today's date and the conversation", async () => {
    const m = model(['{"need":"search","queries":["Pixel 11 price"],"freshness":"any"}']);
    await planSearch({ question: "and its price?", earlier: [{ role: "user", text: "Tell me about the Pixel 11" }], need: UNSURE, local: false, model: m, modelId: "x", signal: new AbortController().signal, now: NOW });
    expect(m.calls[0]).toContain("Today is 2026-11-17.");
    expect(m.calls[0]).toContain("Person: Tell me about the Pixel 11");
  });
});

describe("what comes back from a search (stage 206)", () => {
  it("results that carry none of the plan's words are left out when others do", async () => {
    const search = provider(async () => [result("https://junk.example/metastone", { title: "Metastone", snippet: "EMMAS Australia" }), result("https://a.example/1"), result("https://b.example/2"), result("https://c.example/3")]);
    const r = await research(deps(search, readerOf(async (url) => page(url))), input);
    expect(r.meta.sources.map((s) => s.url)).toEqual(["https://a.example/1", "https://b.example/2", "https://c.example/3"]);
  });

  it("when nothing found is about the question, the model is told so instead of being handed noise", async () => {
    const search = provider(async () => [result("https://x.example/1", { title: "Metastone", snippet: "EMMAS Australia" }), result("https://y.example/2", { title: "Mata, the future of agriculture", snippet: "Farming" })]);
    const r = await research(deps(search, readerOf(async (url) => page(url))), input);
    expect(r.meta).toMatchObject({ status: "done", sources: [], reason: "nothing found" });
    expect(r.context).toMatch(/none of the pages it found were about it/);
  });

  it("a dated search that comes back nearly empty is run once more without its date limit", async () => {
    const asked: string[] = [];
    const search = provider(async (req) => {
      asked.push(`${req.kind}:${req.freshness}`);
      return req.freshness === "any" ? [result("https://a.example/1"), result("https://b.example/2"), result("https://c.example/3")] : [];
    });
    const r = await research(deps(search, readerOf(async (url) => page(url))), input);
    expect(asked).toEqual(["web:week", "web:any"]);
    expect(r.meta.sources).toHaveLength(3);
  });

  it("on the general web a question about today asks for recent pages, and news keeps the day", async () => {
    const asked: string[] = [];
    const search = provider(async (req) => {
      asked.push(`${req.kind}:${req.freshness}`);
      return [result(`https://${req.kind}.example/1`, { title: "Colombo weather today" }), result(`https://${req.kind}.example/2`, { title: "Weather in Colombo" })];
    });
    await research(deps(search, readerOf(async (url) => page(url))), { ...input, question: "What is the weather in Colombo today?" });
    expect(asked.sort()).toEqual(["news:day", "web:week"]);
  });

  it("a query in a script of its own is searched in that language; one in English letters lets the engines decide", async () => {
    const asked: [string, string | null][] = [];
    const search = provider(async (req) => {
      asked.push([req.query, req.language]);
      return [];
    });
    const m = model(['{"need":"search","topic":"Sri Lanka fuel price","queries":["Sri Lanka fuel price today","ශ්‍රී ලංකාවේ තෙල් මිල"],"freshness":"any","news":false}']);
    await research(deps(search, readerOf(unread)), { ...input, question: "තෙල් මිල කීයද?", need: UNSURE, local: false, plannerModel: m, plannerModelId: "x" });
    expect(asked.slice(0, 2)).toEqual([
      ["Sri Lanka fuel price today", null],
      ["ශ්‍රී ලංකාවේ තෙල් මිල", "si"],
    ]);
  });
});

describe("a deep task (stage 206)", () => {
  it("searches every part, then looks again for what the first round missed", async () => {
    const queries: string[] = [];
    const search = provider(async (req) => {
      // The first search also runs in news, since the task is about the latest developments: counted once here.
      if (req.kind === "web") queries.push(req.query);
      const slug = req.query.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      return [result(`https://${slug}.example/1`, { title: `AI agents: ${req.query}` }), result(`https://${slug}.example/2`, { title: `Report on AI agents, ${req.query}` })];
    });
    const m = model([
      '{"need":"deep","topic":"AI agents developments","queries":["AI agents new models 2026","AI agents regulation 2026","AI agents enterprise adoption"],"freshness":"month","news":false}',
      '{"queries":["AI agents safety incidents 2026","AI agents new models 2026"]}',
    ]);
    const stages: string[] = [];
    const r = await research(deps(search, readerOf(async (url) => page(url))), {
      ...input,
      question: "Research the latest developments in AI agents across the world",
      need: { need: "deep", explicit: false, why: "test" },
      local: false,
      plannerModel: m,
      plannerModelId: "gpt-6-luna",
      deepBudgetChars: 30_000,
      onStage: (s) => stages.push(s.stage === "searching" || s.stage === "reading" ? `${s.stage}${s.round ?? ""}` : s.stage),
    });
    // The second round's only new search: one it repeated from the first round isn't run twice.
    expect(queries).toEqual(["AI agents new models 2026", "AI agents regulation 2026", "AI agents enterprise adoption", "AI agents safety incidents 2026"]);
    expect(stages).toEqual(["planning", "searching1", "reading1", "checking", "searching2", "reading2"]);
    expect(r.meta).toMatchObject({ status: "done", depth: "deep", rounds: 2 });
    expect(r.meta.queries).toHaveLength(4);
    expect(r.meta.sources.length).toBeGreaterThan(6);
    expect(r.meta.sources.map((s) => s.n)).toEqual(r.meta.sources.map((_, i) => i + 1));
    expect(r.context).toContain("in 2 rounds");
    // Both small calls are counted.
    expect(r.plannerUsage).toMatchObject({ inputTokens: 400, outputTokens: 40 });
    // The second call reads the task, the searches and the titles: never page text.
    expect(m.calls[1]).toContain("Pages found (titles only)");
    expect(m.calls[1]).not.toContain("A real paragraph about the topic");
  });

  it("stays at one round when the pages already cover the task", async () => {
    const search = provider(async (req) => [result(`https://one.example/${encodeURIComponent(req.query)}`, { title: `AI agents ${req.query}` })]);
    const m = model(['{"need":"deep","topic":"AI agents","queries":["AI agents models","AI agents rules","AI agents use"],"freshness":"any","news":false}', '{"queries":[]}']);
    const r = await research(deps(search, readerOf(async (url) => page(url))), { ...input, question: "Research AI agents", need: { need: "deep", explicit: false, why: "test" }, local: false, plannerModel: m, plannerModelId: "x" });
    expect(r.meta.depth).toBe("deep");
    expect(r.meta.rounds).toBeUndefined();
  });
});

describe("searches kept for a short while (stage 206)", () => {
  it("answers the same search from memory inside its time, with the time it really ran, and asks again after", async () => {
    let now = NOW;
    let calls = 0;
    const kept = withSearchCache(
      provider(async () => {
        calls++;
        return [result("https://a.example/1")];
      }),
      { now: () => now },
    );
    const ask = (freshness: "day" | "any") => kept.search({ query: "Node News", kind: "web", freshness, language: null, signal: new AbortController().signal });
    expect((await ask("day"))[0]!.fetchedAt).toBeUndefined();
    now += 60_000;
    expect((await ask("day"))[0]!.fetchedAt).toBe(NOW);
    expect(calls).toBe(1);
    now += 90_000;
    await ask("day");
    expect(calls).toBe(2);
    // A different freshness is a different search.
    await ask("any");
    expect(calls).toBe(3);
  });

  it("never keeps an empty search", async () => {
    let calls = 0;
    const kept = withSearchCache(provider(async () => (calls++ === 0 ? [] : [result("https://a.example/1")])));
    const ask = () => kept.search({ query: "q", kind: "web", freshness: "any", language: null, signal: new AbortController().signal });
    expect(await ask()).toEqual([]);
    expect(await ask()).toHaveLength(1);
  });

  it("the answer says when the web was really checked", async () => {
    const earlier = NOW - 5 * 60_000;
    const search = provider(async () => [result("https://a.example/1", { fetchedAt: earlier }), result("https://b.example/2", { fetchedAt: earlier }), result("https://c.example/3", { fetchedAt: earlier })]);
    const r = await research(deps(search, readerOf(unread)), input);
    expect(r.meta.at).toBe(new Date(earlier).toISOString());
  });
});

describe("the fresh review's research cases (stage 206)", () => {
  it("nothing stays in memory past an hour, and a question about today reuses a search for two minutes only", async () => {
    let now = NOW;
    let calls = 0;
    const kept = withSearchCache(
      provider(async (req) => {
        calls++;
        return [result(`https://a.example/${encodeURIComponent(req.query)}`)];
      }),
      { now: () => now },
    );
    const ask = (query: string, keep?: "day") => kept.search({ query, kind: "web", freshness: "week", keep, language: null, signal: new AbortController().signal });
    await ask("first");
    // The general web was asked for the last week on behalf of a question about today: reused for two minutes, not ten.
    now += 3 * 60_000;
    await ask("first", "day");
    expect(calls).toBe(2);
    await ask("first");
    expect(calls).toBe(2);
    await ask("second");
    expect(kept.size()).toBe(2);
    now += 61 * 60_000;
    await ask("third");
    expect(kept.size()).toBe(1);
  });

  it("a page that redirects isn't read again under a second number in the second round", async () => {
    const search = provider(async (req) =>
      req.query.includes("safety")
        ? [result("https://short.example/a", { title: "AI agents safety" }), result("https://new.example/b", { title: "AI agents safety report" })]
        : [result("https://short.example/a", { title: "AI agents overview" })],
    );
    const reader = readerOf(async (url) => ({ ...page(url), url: url.includes("short.example") ? "https://long.example/landing" : url }));
    const m = model(['{"need":"deep","topic":"AI agents","queries":["AI agents overview","AI agents uses","AI agents rules"],"freshness":"any","news":false}', '{"queries":["AI agents safety"]}']);
    const r = await research(deps(search, reader), { ...input, question: "Research AI agents", need: { need: "deep", explicit: false, why: "test" }, local: false, plannerModel: m, plannerModelId: "x" });
    expect(r.meta.sources.map((s) => s.url)).toEqual(["https://long.example/landing", "https://new.example/b"]);
  });

  it("when the plan has nothing to search for, nothing is searched and the question as typed is never sent", async () => {
    const asked: string[] = [];
    const search = provider(async (req) => {
      asked.push(req.query);
      return [];
    });
    const r = await research(deps(search, readerOf(unread)), { ...input, question: "mata kiyanna", need: UNSURE });
    expect(asked).toEqual([]);
    expect(r.meta).toMatchObject({ status: "skipped", reason: "there was nothing in the message to search for" });
  });
});
