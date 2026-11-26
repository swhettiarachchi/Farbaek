/**
 * Research for a roundup, and a source's picture on its way to an answer (stage 278, ADR 0285), with the search service and the
 * page reader standing in. SYNTHETIC values; nothing here reaches a network.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { NeedReading } from "@/core/web/intent";
import { PICTURE_MAX_BYTES, pictureSrc } from "@/core/web/pictures";
import type { SearchResult } from "@/core/web/sources";
import type { ChatModel } from "@/server/ai/chat-model";
import { pictureKey, verifyPicture } from "./picture";
import { planSearch } from "./planner";
import { createReaderClient, type ReaderClient } from "./reader-client";
import { research, type ResearchDeps } from "./research";
import { createBreaker } from "./search/health";
import type { SearchProvider, SearchRequest } from "./search/provider";
import { createSearxng } from "./search/searxng";

const NOW = Date.parse("2026-11-26T03:00:00Z");
const KEY = pictureKey({ SUPABASE_SECRET_KEY: "a-made-up-secret-for-tests-only-0001" })!;
const SEARCH: NeedReading = { need: "search", explicit: false, why: "test" };
const longText = "A real paragraph about technology news with enough words to count as read. ".repeat(10);
const result = (url: string, extra: Partial<SearchResult> = {}): SearchResult => ({ url, title: `Tech news at ${new URL(url).hostname}`, snippet: "Technology news of the day.", published: "2026-11-25T10:00:00Z", kind: "web", ...extra });
const page = (url: string, extra: Record<string, unknown> = {}) => ({ ok: true as const, url, title: `Tech news: the page at ${new URL(url).hostname}`, site: "Some Site Name", text: longText, published: "2026-11-25T10:00:00Z", updated: null, lang: "en", optOut: false, ...extra });
const provider = (fn: SearchProvider["search"]): SearchProvider => ({ name: "fake", search: fn });
const readerOf = (fn: ReaderClient["read"]): ReaderClient => ({ read: fn, picture: async () => null, feed: async () => null });
function deps(search: SearchProvider, reader: ReaderClient, over: Partial<ResearchDeps> = {}): ResearchDeps {
  return { search, reader, breaker: createBreaker({ now: () => NOW }), now: () => NOW, tag: () => "tag", pictureKey: KEY, ...over };
}
const model = (answers: string[]): ChatModel => ({ complete: async () => ({ text: answers.shift() ?? null, usage: null }) }) as unknown as ChatModel;
const base = { earlier: [], need: SEARCH, plannerModel: null, plannerModelId: null, budgetChars: 9_000, signal: new AbortController().signal };

describe("research for a roundup", () => {
  const ROUNDUP_PLAN = '{"need":"search","topic":"technology news","queries":["AI news","tech company news","cybersecurity news"],"freshness":"day","news":true,"roundup":true}';
  const many = (req: SearchRequest) => Array.from({ length: 6 }, (_, i) => result(`https://site${i}-${req.kind}-${req.query.split(" ")[0]!.toLowerCase()}.example/story`, { kind: req.kind }));

  it("looks in news for every part of it, not only the first", async () => {
    const asked: string[] = [];
    const search = provider(async (req) => (asked.push(`${req.kind}:${req.query}`), many(req)));
    await research(deps(search, readerOf(async (url) => page(url))), { ...base, question: "mata ada tech updates kiyanna", local: false, plannerModel: model([ROUNDUP_PLAN]), plannerModelId: "x" });
    expect(asked.filter((a) => a.startsWith("news:")).sort()).toEqual(["news:AI news", "news:cybersecurity news", "news:tech company news"]);
    expect(asked.filter((a) => a.startsWith("web:"))).toHaveLength(3);
  });

  it("keeps more sources and opens more of them than a question with one answer, says so in its facts, and asks for stories", async () => {
    const read: string[] = [];
    const search = provider(async (req) => many(req));
    const r = await research(deps(search, readerOf(async (url) => (read.push(url), page(url)))), { ...base, question: "mata ada tech updates kiyanna", local: false, plannerModel: model([ROUNDUP_PLAN]), plannerModelId: "x" });
    expect(r.meta.sources).toHaveLength(10);
    // Six: as many as the reader opens at once, so none waits behind the others.
    expect(read).toHaveLength(6);
    expect(r.meta.roundup).toBe(true);
    expect(r.context).toContain("### A new chip for phones [3]");
    // A question with one answer is researched as before.
    const plain = await research(deps(search, readerOf(async (url) => page(url))), { ...base, question: "What is new in Node.js?", local: true });
    expect(plain.meta.sources.length).toBeLessThanOrEqual(6);
    expect(plain.meta).not.toHaveProperty("roundup");
    expect(plain.context).not.toContain("roundup");
  });

  it("is read from the message's own words when the planner model doesn't say it, and never for a deep task", async () => {
    const plain = '{"need":"search","topic":"technology news","queries":["tech news"],"freshness":"day","news":true}';
    const said = await planSearch({ question: "ada tech puwath kiyanna", earlier: [], need: SEARCH, local: false, model: model([plain]), modelId: "x", signal: new AbortController().signal, now: NOW });
    expect(said.plan?.roundup).toBe(true);
    const one = await planSearch({ question: "did the launch happen today", earlier: [], need: SEARCH, local: false, model: model([plain]), modelId: "x", signal: new AbortController().signal, now: NOW });
    expect(one.plan && "roundup" in one.plan).toBe(false);
    // The model read the whole conversation: its plain "no" stands against a word in the message.
    const no = '{"need":"search","topic":"fox news owner","queries":["Fox News owner"],"freshness":"any","news":false,"roundup":false}';
    const overruled = await planSearch({ question: "tell me about Fox News", earlier: [], need: SEARCH, local: false, model: model([no]), modelId: "x", signal: new AbortController().signal, now: NOW });
    expect(overruled.plan && "roundup" in overruled.plan).toBe(false);
    const deep = await planSearch({ question: "a full report on this year's AI news", earlier: [], need: { need: "deep", explicit: true, why: "test" }, local: false, model: model([ROUNDUP_PLAN]), modelId: "x", signal: new AbortController().signal, now: NOW });
    expect(deep.plan?.depth).toBe("deep");
    expect(deep.plan && "roundup" in deep.plan).toBe(false);
  });
});

describe("a roundup read from the newsrooms' own feeds", () => {
  const PLAN = '{"need":"search","topic":"technology news","queries":["AI news","tech company news","cybersecurity news"],"freshness":"day","news":true,"roundup":true}';
  // What the search gives for these words: front pages, whose titles are the words themselves.
  const hubs = provider(async (req) => [result(`https://www.reuters.com/technology/?q=${req.kind}`, { title: "Tech News | Today's Latest Technology News", snippet: "Tech news.", published: null }), result("https://techcrunch.com/", { title: "TechCrunch | Startup and Technology News", snippet: "Technology news.", published: null })]);
  const story = (host: string, n: number, extra: Record<string, unknown> = {}) => ({ title: `Story ${n} from ${host}`, url: `https://${host}/2026/11/25/story-${n}/`, published: "2026-11-25T08:00:00.000Z", summary: `What happened in story ${n}, in three sentences of summary from the feed.`, image: `https://cdn.${host}/${n}.jpg`, ...extra });
  function feedReader(o: { fail?: boolean; items?: (url: string) => ReturnType<typeof story>[] | null } = {}) {
    const asked: string[] = [];
    const reader: ReaderClient = {
      read: async () => ({ ok: false, reason: "the site's robots.txt doesn't allow it" }),
      picture: async () => null,
      feed: async (url) => {
        asked.push(url);
        if (o.fail) throw new Error("down");
        if (o.items) return o.items(url);
        const host = new URL(url).hostname.replace(/^(?:feeds|www)\./, "");
        return [story(host, 1), story(host, 2), story(host, 3)];
      },
    };
    return { reader, asked };
  }
  const ask = (reader: ReaderClient, search: SearchProvider = hubs, question = "mata aluth tech updates denna ada", plan = PLAN) => research(deps(search, reader), { ...base, question, local: false, plannerModel: model([plan]), plannerModelId: "x", deepBudgetChars: 36_000 });

  it("is written from dated stories with their summaries and pictures, not from the front pages the search found", async () => {
    const f = feedReader();
    const r = await ask(f.reader);
    // A few feeds that fit the subject, each a fixed address from Farbaek's own list.
    expect(f.asked.length).toBeGreaterThanOrEqual(3);
    expect(f.asked.length).toBeLessThanOrEqual(6);
    for (const url of f.asked) expect(url).toMatch(/^https:\/\//);
    const stories = r.meta.sources.filter((s) => /\/2026\/11\/25\/story-/.test(s.url));
    expect(stories.length).toBeGreaterThanOrEqual(7);
    // No page could be opened, and each story still gives the model its summary to write from, and its day.
    expect(r.context).toContain("What happened in story 1, in three sentences of summary from the feed.");
    expect(r.context).toContain("published 2026-11-25");
    // Each carries its picture, signed.
    expect(stories.every((s) => s.image && s.imageSig && verifyPicture(s.image, s.imageSig, KEY))).toBe(true);
    // At most two from one newsroom.
    const perSite = new Map<string, number>();
    for (const s of r.meta.sources) perSite.set(s.site, (perSite.get(s.site) ?? 0) + 1);
    expect(Math.max(...perSite.values())).toBeLessThanOrEqual(2);
  });

  it("takes only stories from the days the roundup covers, and none without a date", async () => {
    const f = feedReader({ items: (url) => [story("old.example", 1, { url: `https://old.example/2026/10/01/${encodeURIComponent(url).slice(-12)}/`, published: "2026-10-01T08:00:00.000Z" }), story("undated.example", 2, { url: `https://undated.example/2026/11/25/${encodeURIComponent(url).slice(-12)}/`, published: null })] });
    const r = await ask(f.reader);
    expect(r.meta.sources.some((s) => /old\.example|undated\.example/.test(s.site))).toBe(false);
  });

  it("is still answered from the searches when no feed answers, or when the reader has no feeds at all", async () => {
    const down = await ask(feedReader({ fail: true }).reader);
    expect(down.meta.status).toBe("done");
    expect(down.meta.sources.length).toBeGreaterThan(0);
    const none = await ask(readerOf(async (url) => page(url)));
    expect(none.meta.status).toBe("done");
    // A reader from before feeds existed (it has no such method) changes nothing.
    const old = { read: async (url: string) => page(url) } as unknown as ReaderClient;
    expect((await ask(old)).meta.status).toBe("done");
  });

  it("reads no feed for a question with one answer, a deep task, or a subject no feed is about", async () => {
    const plain = feedReader();
    await research(deps(hubs, plain.reader), { ...base, question: "What is new in Node.js?", local: true });
    expect(plain.asked).toEqual([]);
    const other = feedReader();
    await ask(other.reader, hubs, "knitting news", '{"need":"search","topic":"knitting patterns","queries":["knitting news"],"freshness":"week","news":true,"roundup":true}');
    expect(other.asked).toEqual([]);
  });

  it("gives a roundup the room a deep task has, so ten sources each keep enough to write from", async () => {
    const long = "A sentence of the article that says something specific, with a number like 42. ".repeat(80);
    const reader: ReaderClient = { ...feedReader().reader, read: async (url) => page(url, { text: long }) };
    const roundup = await research(deps(hubs, reader), { ...base, question: "tech news today", local: false, plannerModel: model([PLAN]), plannerModelId: "x", budgetChars: 9_000, deepBudgetChars: 36_000 });
    const plain = await research(deps(hubs, reader), { ...base, question: "What is new in Node.js?", local: true, budgetChars: 9_000, deepBudgetChars: 36_000 });
    expect(roundup.context.length).toBeGreaterThan(20_000);
    expect(plain.context.length).toBeLessThan(12_000);
  });
});

describe("a source as research hands it on", () => {
  const search = provider(async () => [result("https://www.theverge.com/a"), result("https://abcnews.go.com/b"), result("https://blog.example.org/c", { image: "https://thumbs.search.example/c.jpg" })]);
  const run = (reader: ReaderClient, over: Partial<ResearchDeps> = {}) => research(deps(search, reader, over), { ...base, question: "tech news today", local: true });

  it("is named by its address, never by what the page calls itself", async () => {
    // A page may call itself anything: "go" was shown as a source's name, and a rewrite could call itself a newsroom.
    const r = await run(readerOf(async (url) => page(url, { site: url.includes("abcnews") ? "go" : "Reuters" })));
    expect(r.meta.sources.map((s) => s.site).sort()).toEqual(["abcnews.go.com", "blog.example.org", "theverge.com"]);
    expect(r.context).not.toContain("| Reuters |");
    expect(r.context).toContain("| abcnews.go.com |");
  });

  it("carries the page's own picture for previews, signed by this server, and the search's picture when the page names none", async () => {
    const r = await run(readerOf(async (url) => page(url, url.includes("theverge") ? { image: "https://cdn.theverge.example/lead.jpg" } : {})));
    const by = new Map(r.meta.sources.map((s) => [s.site, s]));
    const verge = by.get("theverge.com")!;
    expect(verge.image).toBe("https://cdn.theverge.example/lead.jpg");
    expect(verifyPicture(verge.image!, verge.imageSig!, KEY)).toBe(true);
    expect(pictureSrc(verge)).toContain("/app/chat/api/picture?u=");
    const blog = by.get("blog.example.org")!;
    expect(blog.image).toBe("https://thumbs.search.example/c.jpg");
    expect(verifyPicture(blog.image!, blog.imageSig!, KEY)).toBe(true);
    expect(by.get("abcnews.go.com")).not.toHaveProperty("image");
    // The model is never given a picture's address: it has nothing to do with one.
    expect(r.context).not.toContain("lead.jpg");
    expect(r.context).not.toContain("thumbs.search.example");
  });

  it("carries no picture at all for a page that asks for no picture preview: not its own, and not the search's thumbnail of it", async () => {
    const r = await run(readerOf(async (url) => page(url, { image: null, noPicture: true })));
    // blog.example.org came with a thumbnail from the search; the page said no, so it has none.
    expect(r.meta.sources.every((s) => !s.image && !s.imageSig)).toBe(true);
    // A page that only names no picture still gets the search's.
    const named = await run(readerOf(async (url) => page(url, { image: null, noPicture: false })));
    expect(named.meta.sources.filter((s) => s.image).map((s) => s.site)).toEqual(["blog.example.org"]);
  });

  it("carries no picture from a page that asked not to be used, from an address it wouldn't fetch, or without a key", async () => {
    const optedOut = await run(readerOf(async (url) => page(url, { optOut: true, text: "", image: "https://cdn.example.org/x.jpg" })));
    expect(optedOut.meta.sources.every((s) => !s.image && !s.imageSig)).toBe(true);
    const bad = await run(readerOf(async (url) => page(url, { image: "http://169.254.169.254/latest" })));
    expect(bad.meta.sources.filter((s) => s.image).map((s) => s.site)).toEqual(["blog.example.org"]);
    const noKey = await run(readerOf(async (url) => page(url, { image: "https://cdn.example.org/x.jpg" })), { pictureKey: null });
    expect(noKey.meta.sources.every((s) => !s.image && !s.imageSig)).toBe(true);
  });
});

describe("a shared chat", () => {
  it("is given its sources without their pictures: anyone with the link can read it, so it carries no picture address or signature", () => {
    // The reader of a shared chat asks the database itself, so what it hands on is pinned here by its own words.
    const reader = readFileSync("src/server/chat/share.ts", "utf8");
    expect(reader).toContain("search: withoutPictures(search.data)");
    expect(reader).not.toMatch(/search:s*search.data/);
  });
});

describe("the search service's own picture", () => {
  const ask = (results: unknown[]) =>
    createSearxng("http://searxng:8080", (async () => new Response(JSON.stringify({ results }))) as unknown as typeof fetch, () => NOW).search({ query: "tech news", kind: "news", freshness: "day", language: "en", signal: new AbortController().signal });

  it("is kept as an https address when a result has one, and left out when it has none or a bad one", async () => {
    const results = await ask([
      { url: "https://a.example/1", title: "A", content: "x", thumbnail: "https://thumbs.example/a.jpg" },
      { url: "https://b.example/2", title: "B", content: "x", img_src: "//thumbs.example/b.png" },
      { url: "https://c.example/3", title: "C", content: "x", thumbnail: "http://thumbs.example/c.jpg", img_src: "https://thumbs.example/c2.jpg" },
      { url: "https://d.example/4", title: "D", content: "x", thumbnail: "data:image/png;base64,AAAA" },
      { url: "https://e.example/5", title: "E", content: "x", thumbnail: 42 },
      { url: "https://f.example/6", title: "F", content: "x" },
    ]);
    expect(results.map((r) => r.image ?? null)).toEqual(["https://thumbs.example/a.jpg", "https://thumbs.example/b.png", "https://thumbs.example/c2.jpg", null, null, null]);
    expect(results[5]).not.toHaveProperty("image");
  });
});

describe("asking the page reader for a picture", () => {
  const client = (answer: () => Response | Promise<Response>) => {
    const asked: { url: string; body: string }[] = [];
    const reader = createReaderClient("http://reader:8080", (async (url: string, init: RequestInit) => (asked.push({ url, body: String(init.body) }), answer())) as unknown as typeof fetch);
    return { reader, asked };
  };
  const options = { timeoutMs: 2_000, signal: new AbortController().signal };

  it("gives the bytes and their kind as the reader sent them", async () => {
    const c = client(() => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "content-type": "image/webp" } }));
    expect(await c.reader.picture("https://cdn.example.org/a.webp", options)).toEqual({ bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" });
    expect(c.asked).toEqual([{ url: "http://reader:8080/picture", body: JSON.stringify({ url: "https://cdn.example.org/a.webp", timeoutMs: 2_000 }) }]);
  });

  it("reads a feed's stories as plain facts, and drops anything in the answer that isn't one", async () => {
    const body = { ok: true, items: [{ title: "A story", url: "https://news.example.org/a", published: "2026-11-25T08:00:00.000Z", summary: "Words.", image: "https://cdn.example.org/a.jpg" }, { title: 42, url: "https://news.example.org/b" }, { title: "No address", url: "javascript:alert(1)" }, null, "text", { title: "T".repeat(900), url: "https://news.example.org/c", summary: 7, image: 9 }] };
    const c = client(() => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
    const items = await c.reader.feed("https://news.example.org/feed/", options);
    expect(items).toEqual([
      { title: "A story", url: "https://news.example.org/a", published: "2026-11-25T08:00:00.000Z", summary: "Words.", image: "https://cdn.example.org/a.jpg" },
      { title: "T".repeat(300), url: "https://news.example.org/c", published: null, summary: "", image: null },
    ]);
    expect(c.asked).toEqual([{ url: "http://reader:8080/feed", body: JSON.stringify({ url: "https://news.example.org/feed/", timeoutMs: 2_000 }) }]);
    for (const answer of [{ ok: false, reason: "not a feed" }, { ok: true, items: [] }, { ok: true }, "nonsense", null]) {
      expect(await client(() => new Response(JSON.stringify(answer), { status: 200 })).reader.feed("https://news.example.org/feed/", options)).toBeNull();
    }
    expect(await client(() => new Response("oops", { status: 500 })).reader.feed("https://news.example.org/feed/", options)).toBeNull();
    expect(await client(() => Promise.reject(new Error("down"))).reader.feed("https://news.example.org/feed/", options)).toBeNull();
  });

  it("gives nothing when the reader refused, sent nothing, sent too much, or didn't answer", async () => {
    expect(await client(() => new Response(JSON.stringify({ ok: false, reason: "not a picture" }), { status: 404 })).reader.picture("https://x.example/a", options)).toBeNull();
    expect(await client(() => new Response(new Uint8Array(), { status: 200, headers: { "content-type": "image/png" } })).reader.picture("https://x.example/a", options)).toBeNull();
    expect(await client(() => new Response(new Uint8Array(8), { status: 200, headers: { "content-type": "image/png", "content-length": String(PICTURE_MAX_BYTES + 1) } })).reader.picture("https://x.example/a", options)).toBeNull();
    expect(await client(() => Promise.reject(new Error("down"))).reader.picture("https://x.example/a", options)).toBeNull();
  });
});
