/**
 * A newsroom's feed, read as text (stage 280, ADR 0288): RSS, Atom and RDF give their newest stories with a date, a summary and
 * a picture; nothing in a feed is expanded, run or fetched. The feeds below are made up for this test.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decodeEntities, FEED_ITEMS, parseFeed } from "./feed.mjs";
import { testNet } from "./fetch.mjs";
import { createReader } from "./read.mjs";

const NOW = Date.parse("2026-11-26T06:00:00Z");
const FEED = "https://news.example.org/feed/";

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Example News</title>
  <link>https://news.example.org/</link>
  <item>
    <title><![CDATA[A new chip for phones & tablets]]></title>
    <link>https://news.example.org/2026/11/25/new-chip/?utm_source=rss</link>
    <pubDate>Wed, 25 Nov 2026 09:30:00 GMT</pubDate>
    <description><![CDATA[<p>The company <b>announced</b> the chip on Wednesday. It is 30% faster.</p><img src="https://cdn.example.org/inline.jpg">]]></description>
    <media:thumbnail url="https://cdn.example.org/thumb.jpg" width="240" height="135"/>
  </item>
  <item>
    <title>Second story &amp; its &#8220;quote&#8221;</title>
    <link>/2026/11/24/second-story/</link>
    <dc:date>2026-11-24T18:00:00Z</dc:date>
    <description>Plain text &lt;i&gt;with escaped markup&lt;/i&gt; inside.</description>
    <enclosure url="https://cdn.example.org/second.png" type="image/png" length="1000"/>
  </item>
  <item>
    <title>A story with a picture only in its text</title>
    <link>https://news.example.org/2026/11/24/third/</link>
    <pubDate>Tue, 24 Nov 2026 08:00:00 GMT</pubDate>
    <content:encoded><![CDATA[<figure><img src="/img/third.webp" alt=""></figure><p>The text of the third story.</p>]]></content:encoded>
  </item>
  <item><title></title><link>https://news.example.org/no-title/</link></item>
  <item><title>No address</title></item>
</channel>
</rss>`;

const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/">
  <title>Example Atom</title>
  <link href="https://atom.example.org/" rel="alternate"/>
  <entry>
    <title type="html">An Atom story</title>
    <link rel="replies" href="https://atom.example.org/comments/1"/>
    <link rel="alternate" type="text/html" href="https://atom.example.org/2026/atom-story"/>
    <published>2026-11-25T12:00:00+05:30</published>
    <updated>2026-11-25T13:00:00+05:30</updated>
    <summary type="html">&lt;p&gt;What the Atom story says.&lt;/p&gt;</summary>
    <media:content url="https://cdn.example.org/atom.jpg" medium="image"/>
  </entry>
  <entry>
    <title>An entry whose link has no rel</title>
    <link href="https://atom.example.org/2026/second"/>
    <updated>2026-11-24T10:00:00Z</updated>
    <content type="html">&lt;p&gt;Body text.&lt;/p&gt;</content>
  </entry>
</feed>`;

const RDF = `<?xml version="1.0"?>
<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <channel rdf:about="https://journal.example.org/"><title>Journal</title></channel>
  <item rdf:about="https://journal.example.org/articles/d41586-026-00001-1">
    <title>A paper is published</title>
    <link>https://journal.example.org/articles/d41586-026-00001-1</link>
    <dc:date>2026-11-25</dc:date>
    <description>What the paper found.</description>
  </item>
</rdf:RDF>`;

describe("a feed's stories", () => {
  it("are read from RSS: title, address, date, summary as plain words, and the picture the feed gives", () => {
    const items = parseFeed(RSS, FEED, NOW);
    expect(items).toHaveLength(3);
    expect(items[0]).toEqual({
      title: "A new chip for phones & tablets",
      url: "https://news.example.org/2026/11/25/new-chip/?utm_source=rss",
      published: "2026-11-25T09:30:00.000Z",
      summary: "The company announced the chip on Wednesday. It is 30% faster.",
      image: "https://cdn.example.org/thumb.jpg",
    });
    // A relative address is made whole against the feed's own; markup that was escaped is taken out too.
    expect(items[1]).toEqual({
      title: "Second story & its “quote”",
      url: "https://news.example.org/2026/11/24/second-story/",
      published: "2026-11-24T18:00:00.000Z",
      summary: "Plain text with escaped markup inside.",
      image: "https://cdn.example.org/second.png",
    });
    // No media tag: the first picture in the story's own text.
    expect(items[2]).toMatchObject({ summary: "The text of the third story.", image: "https://news.example.org/img/third.webp" });
  });

  it("are read from Atom, taking the link that leads to the story and not the one to its comments", () => {
    const items = parseFeed(ATOM, "https://atom.example.org/feed.atom", NOW);
    expect(items).toEqual([
      { title: "An Atom story", url: "https://atom.example.org/2026/atom-story", published: "2026-11-25T06:30:00.000Z", summary: "What the Atom story says.", image: "https://cdn.example.org/atom.jpg" },
      { title: "An entry whose link has no rel", url: "https://atom.example.org/2026/second", published: "2026-11-24T10:00:00.000Z", summary: "Body text.", image: null },
    ]);
  });

  it("are read from RSS 1.0, as a journal's feed is written", () => {
    expect(parseFeed(RDF, "https://journal.example.org/feed.rss", NOW)).toEqual([
      { title: "A paper is published", url: "https://journal.example.org/articles/d41586-026-00001-1", published: "2026-11-25T00:00:00.000Z", summary: "What the paper found.", image: null },
    ]);
  });

  it("are none for anything that isn't a feed", () => {
    for (const not of ["", "<html><body><item><title>x</title><link>https://a.example/b</link></item></body></html>", "{\"items\":[]}", null, undefined, 42]) {
      expect(parseFeed(not, FEED, NOW)).toEqual([]);
    }
  });

  it("are at most the newest few, each once, however long the feed is", () => {
    const many = `<rss><channel>${Array.from({ length: 400 }, (_, i) => `<item><title>Story ${i}</title><link>https://news.example.org/s/${i % 300}</link></item>`).join("")}</channel></rss>`;
    const items = parseFeed(many, FEED, NOW);
    expect(items).toHaveLength(FEED_ITEMS);
    expect(new Set(items.map((i) => i.url)).size).toBe(FEED_ITEMS);
    expect(items[0]!.title).toBe("Story 0");
  });
});

describe("what a feed can't do", () => {
  it("expands no entity but the usual few and numbered characters: a declared one stays as it was written", () => {
    const bomb = `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY a "aaaaaaaaaa"><!ENTITY b "&a;&a;&a;&a;&a;&a;&a;&a;"><!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel><item><title>&b; &xxe; ok</title><link>https://news.example.org/x</link><description>&b;</description></item></channel></rss>`;
    const [item] = parseFeed(bomb, FEED, NOW);
    expect(item!.title).toBe("&b; &xxe; ok");
    expect(item!.summary).toBe("&b;");
    expect(decodeEntities("&amp;&lt;&gt;&quot;&apos;&#65;&#x42;&nbsp;&unknown;&#0;&#xD800;")).toBe("&<>\"'AB &unknown;  ");
  });

  it("gives no script, markup or hidden character: only words", () => {
    const zero = String.fromCharCode(0x200b);
    const rtl = String.fromCharCode(0x202e);
    const feed = `<rss><channel><item><title>Title<script>alert(1)</script>${zero}</title><link>https://news.example.org/y</link><description><![CDATA[<script>steal()</script><style>p{}</style><a href="javascript:x" onclick="y()">Read</a> the${rtl} story<iframe src="//evil.example"></iframe>]]></description></item></channel></rss>`;
    const [item] = parseFeed(feed, FEED, NOW);
    expect(item!.title).toBe("Title");
    expect(item!.summary).toBe("Read the story");
    expect(JSON.stringify(item)).not.toMatch(/script|onclick|javascript|iframe|steal/);
  });

  it("gives no address it wouldn't open, and no picture that isn't https", () => {
    const feed = `<rss xmlns:media="http://search.yahoo.com/mrss/"><channel>
      <item><title>Script link</title><link>javascript:alert(1)</link></item>
      <item><title>Local link</title><link>https://intranet/secret</link></item>
      <item><title>With a password</title><link>https://user:pw@news.example.org/a</link></item>
      <item><title>Fine</title><link>https://news.example.org/fine</link><media:thumbnail url="http://cdn.example.org/plain.jpg"/><media:content url="data:image/png;base64,AAAA" medium="image"/><enclosure url="https://cdn.example.org/audio.mp3" type="audio/mpeg"/></item>
    </channel></rss>`;
    expect(parseFeed(feed, FEED, NOW)).toEqual([{ title: "Fine", url: "https://news.example.org/fine", published: null, summary: "", image: null }]);
  });

  it("gives no date from the future or from nowhere", () => {
    const feed = `<rss><channel><item><title>Future</title><link>https://news.example.org/f</link><pubDate>Wed, 25 Nov 2099 09:30:00 GMT</pubDate></item><item><title>Nonsense</title><link>https://news.example.org/n</link><pubDate>soon</pubDate></item></channel></rss>`;
    expect(parseFeed(feed, FEED, NOW).map((i) => i.published)).toEqual([null, null]);
  });

  it("is read in one pass over a long line of anything, without hanging", () => {
    const junk = `<rss><channel><item><title>${"<".repeat(60_000)}</title><link>https://news.example.org/j</link><description>${"&#".repeat(50_000)}</description></item></channel></rss>`;
    const started = Date.now();
    parseFeed(junk, FEED, NOW);
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  const item = (inside: string) => `<rss><channel><item>${inside}<link>https://news.example.org/a</link></item></channel></rss>`;

  it("costs time by its length however it is written: an opening with no end is looked for once, not once for every opening", () => {
    const cases: [string, string][] = [
      ["items that never close", `<rss>${"<item ".repeat(40_000)}`],
      ["items inside items", `<rss><channel>${"<item>".repeat(40_000)}`],
      ["entries that never close", `<feed>${"<entry><title>t</title>".repeat(20_000)}`],
      ["titles that never close", item("<title>".repeat(20_000))],
      ["scripts that never close", item(`<title>t</title><description>${"<script".repeat(8_000)}</description>`)],
      ["CDATA that never closes", item(`<title>${"<![CDATA[".repeat(6_000)}</title>`)],
      ["a long line of angle brackets", item(`<title>${"<".repeat(59_000)}</title>`)],
      ["tags with no end", item(`<title>t</title><description>${"<a ".repeat(19_000)}</description>`)],
    ];
    for (const [name, xml] of cases) {
      const started = performance.now();
      parseFeed(xml, FEED, NOW);
      // Each is a few milliseconds. Read with patterns that look again from every opening, the first took half a second at half
      // this length and four times as long for each doubling.
      expect(performance.now() - started, name).toBeLessThan(1_000);
    }
  });

  it("still reads what is well made beside what isn't: an entry too long to be a story is left out, and the next is read", () => {
    const long = `<item><title>Too long</title><link>https://news.example.org/long</link><description>${"word ".repeat(50_000)}</description></item>`;
    const xml = `<rss><channel>${long}<items>not an item</items><item><title>A <![CDATA[story]]> told</title><link/><link>https://news.example.org/story</link></item></channel></rss>`;
    expect(parseFeed(xml, FEED, NOW).map((i) => [i.title, i.url])).toEqual([["A story told", "https://news.example.org/story"]]);
    // A CDATA section that never ends loses its mark and keeps its words.
    expect(parseFeed(item("<title>Open <![CDATA[ended nowhere</title>"), FEED, NOW)[0]?.title).toBe("Open ended nowhere");
  });
});

describe("reading a feed through the reader", () => {
  let server: http.Server;
  let port = 0;
  const hits = new Map<string, number>();
  const resolver = ((_host: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: "127.0.0.1", family: 4 }])) as never;
  const net = () => testNet(resolver, (ip) => ip === "127.0.0.1", [String(port)]);
  const at = (path: string, host = "news.example.org") => `http://${host}:${port}${path}`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? "/";
      hits.set(path, (hits.get(path) ?? 0) + 1);
      const send = (type: string, body: string) => {
        res.writeHead(200, { "content-type": type });
        res.end(body);
      };
      if (path === "/robots.txt" && req.headers.host?.startsWith("closed.")) return send("text/plain", "User-agent: *\nDisallow: /");
      if (path === "/feed.xml") return send("application/rss+xml; charset=utf-8", RSS);
      if (path === "/as-html") return send("text/html; charset=utf-8", RSS);
      if (path === "/atom") return send("application/atom+xml", ATOM);
      // Never answers: the reader's own time limit ends it.
      if (path === "/slow") return;
      if (path === "/page") return send("text/html", "<html><body><p>Not a feed.</p></body></html>");
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("gives the feed's stories, whatever the site calls the file", async () => {
    const reader = createReader({ net: net() });
    const feed = await reader.feed(at("/feed.xml"));
    expect(feed.ok && feed.items.map((i) => i.title)).toEqual(["A new chip for phones & tablets", "Second story & its “quote”", "A story with a picture only in its text"]);
    expect((await reader.feed(at("/as-html"))).ok).toBe(true);
    expect((await reader.feed(at("/atom"))).ok).toBe(true);
  });

  it("fetches a feed once for everyone asking, and keeps it for a while", async () => {
    const reader = createReader({ net: net() });
    hits.clear();
    const all = await Promise.all([reader.feed(at("/feed.xml")), reader.feed(at("/feed.xml")), reader.feed(at("/feed.xml"))]);
    expect(all.every((f) => f.ok)).toBe(true);
    await reader.feed(at("/feed.xml"));
    expect(hits.get("/feed.xml")).toBe(1);
  });

  it("never holds a page's place: feeds wait in a pool of their own", async () => {
    // One place for pages and one for feeds. A feed that hangs until its time runs out must not make a page wait.
    const reader = createReader({ net: net(), maxConcurrent: 1, perHost: 1, maxFeeds: 1 });
    const slow = reader.feed(at("/slow"), { timeoutMs: 900 });
    const second = reader.feed(at("/atom"));
    await new Promise((r) => setTimeout(r, 60));
    expect(reader.stats()).toMatchObject({ feedsActive: 1, feedsWaiting: 1, active: 0 });
    const started = Date.now();
    await reader.read(at("/page"), { timeoutMs: 800 });
    expect(Date.now() - started).toBeLessThan(600);
    expect(await slow).toEqual({ ok: false, reason: "timed out" });
    expect((await second).ok).toBe(true);
    expect(reader.stats()).toMatchObject({ feedsActive: 0, feedsWaiting: 0 });
  });

  it("says why when there is no feed: a page, a missing file, a site that says no, an address it won't open", async () => {
    const reader = createReader({ net: net() });
    expect(await reader.feed(at("/page"))).toEqual({ ok: false, reason: "not a feed, or an empty one" });
    expect(await reader.feed(at("/missing"))).toEqual({ ok: false, reason: "answered 404" });
    expect(await reader.feed(at("/feed.xml", "closed.example.org"))).toEqual({ ok: false, reason: "the site's robots.txt doesn't allow it" });
    const strict = createReader();
    expect(await strict.feed("https://127.0.0.1/feed.xml")).toEqual({ ok: false, reason: "not a public address" });
    expect(await strict.feed("not an address")).toEqual({ ok: false, reason: "not a web address" });
  });
});
