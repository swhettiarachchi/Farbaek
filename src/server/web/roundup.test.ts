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
const readerOf = (fn: ReaderClient["read"]): ReaderClient => ({ read: fn, picture: async () => null });
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

  it("gives nothing when the reader refused, sent nothing, sent too much, or didn't answer", async () => {
    expect(await client(() => new Response(JSON.stringify({ ok: false, reason: "not a picture" }), { status: 404 })).reader.picture("https://x.example/a", options)).toBeNull();
    expect(await client(() => new Response(new Uint8Array(), { status: 200, headers: { "content-type": "image/png" } })).reader.picture("https://x.example/a", options)).toBeNull();
    expect(await client(() => new Response(new Uint8Array(8), { status: 200, headers: { "content-type": "image/png", "content-length": String(PICTURE_MAX_BYTES + 1) } })).reader.picture("https://x.example/a", options)).toBeNull();
    expect(await client(() => Promise.reject(new Error("down"))).reader.picture("https://x.example/a", options)).toBeNull();
  });
});
