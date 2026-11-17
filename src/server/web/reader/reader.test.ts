import http from "node:http";
import type { AddressInfo } from "node:net";
import zlib from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { guardLookup, isPublicIp } from "./address.mjs";
import { extractPage } from "./extract.mjs";
import { fetchPage, refuseUrl, testNet } from "./fetch.mjs";
import { createReader } from "./read.mjs";
import { parseRobots, robotsAllow, robotsFromResponse, robotsPermit } from "./robots.mjs";

describe("the address policy (stage 205)", () => {
  it.each([
    ["8.8.8.8", true],
    ["2606:4700:4700::1111", true],
    ["10.0.0.1", false],
    ["172.18.0.3", false],
    ["192.168.0.1", false],
    ["127.0.0.1", false],
    ["169.254.169.254", false],
    ["100.64.0.1", false],
    ["198.18.0.1", false],
    ["::1", false],
    ["::ffff:10.0.0.1", false],
    ["::ffff:7f00:1", false],
    ["64:ff9b::a00:1", false],
    ["2002:a00:1::1", false],
    ["2001:0:4136:e378::1", false],
    ["fd12::1", false],
    ["fe80::1%eth0", false],
    ["ff02::1", false],
  ])("%s public: %s", (ip, expected) => {
    expect(isPublicIp(ip)).toBe(expected);
  });

  it("refuses a name if any address it resolves to isn't public, in both ways Node asks", async () => {
    const resolver = ((_h: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) => cb(null, [{ address: "93.184.215.14", family: 4 }, { address: "10.0.0.9", family: 4 }])) as never;
    const lookup = guardLookup(resolver);
    const one = await new Promise<string>((resolve) => lookup("mixed.example.org", {}, (e) => resolve(e?.message ?? "ok")));
    const all = await new Promise<string>((resolve) => lookup("mixed.example.org", { all: true }, (e) => resolve(e?.message ?? "ok")));
    expect(one).toMatch(/refused/);
    expect(all).toMatch(/refused/);
  });

  it("production rules refuse local names, addresses, odd ports, credentials and other schemes", () => {
    for (const url of ["http://localhost/", "http://127.0.0.1/", "http://[::1]/", "http://supabase-gw:8000/", "http://reader/", "https://example.com:8443/", "ftp://example.com/", "https://user:pw@example.com/", "https://intranet.corp/"]) {
      expect(refuseUrl(url), url).not.toBeNull();
    }
    expect(refuseUrl("https://www.example.com/news?id=1")).toBeNull();
  });
});

describe("fetching a page (stage 205)", () => {
  let server: http.Server;
  let port = 0;
  // Names the test site answers to; "inside.example.org" resolves to a private address, as a rebinding name would.
  const resolver = ((host: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
    cb(null, [{ address: host === "inside.example.org" ? "10.0.0.9" : "127.0.0.1", family: 4 }])) as never;
  const net = () => testNet(resolver, (ip) => ip === "127.0.0.1", [String(port)]);
  const at = (path: string, host = "site.example.org") => `http://${host}:${port}${path}`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? "/";
      if (path === "/page") {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        return res.end("<html><head><title>Hello</title></head><body><p>Hello from the test site.</p></body></html>");
      }
      if (path === "/to-inside") {
        res.writeHead(302, { location: `http://inside.example.org:${port}/page` });
        return res.end();
      }
      if (path === "/to-literal") {
        res.writeHead(302, { location: `http://127.0.0.1:${port}/page` });
        return res.end();
      }
      if (path === "/loop") {
        res.writeHead(302, { location: "/loop" });
        return res.end();
      }
      if (path === "/bomb") {
        const zipped = zlib.gzipSync(Buffer.alloc(5_000_000, 0x61));
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip", "content-length": zipped.length });
        return res.end(zipped);
      }
      if (path === "/trickle") {
        res.writeHead(200, { "content-type": "text/html" });
        const timer = setInterval(() => res.write("."), 100);
        res.on("close", () => clearInterval(timer));
        return;
      }
      if (path === "/pdf") {
        res.writeHead(200, { "content-type": "application/pdf" });
        return res.end("%PDF-1.7");
      }
      if (path === "/sjis") {
        res.writeHead(200, { "content-type": "text/html; charset=Shift_JIS" });
        return res.end(Buffer.from([0x3c, 0x70, 0x3e, 0x93, 0xfa, 0x96, 0x7b, 0x8c, 0xea, 0x3c, 0x2f, 0x70, 0x3e]));
      }
      if (path === "/robots.txt") {
        res.writeHead(200, { "content-type": "text/plain" });
        return res.end("User-agent: *\nDisallow: /private\n\nUser-agent: FarbaekBot\nDisallow: /no-farbaek\n");
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => server.close());

  it("reads an HTML page", async () => {
    const r = await fetchPage(at("/page"), { net: net() });
    expect(r).toMatchObject({ ok: true, status: 200 });
    if (r.ok) expect(r.text).toContain("Hello from the test site.");
  });

  it("refuses a redirect to a name that resolves to a private address", async () => {
    expect(await fetchPage(at("/to-inside"), { net: net() })).toMatchObject({ ok: false, reason: "not a public address" });
  });

  it("refuses a redirect to an address written as a number", async () => {
    expect(await fetchPage(at("/to-literal"), { net: net() })).toMatchObject({ ok: false });
  });

  it("stops after three redirects", async () => {
    expect(await fetchPage(at("/loop"), { net: net() })).toMatchObject({ ok: false, reason: "too many redirects" });
  });

  it("caps size after decompression, so a small gzip bomb can't grow past it", async () => {
    expect(await fetchPage(at("/bomb"), { net: net() })).toMatchObject({ ok: false, reason: "too large" });
  });

  it("gives up on a page that trickles in, at the deadline", async () => {
    const started = Date.now();
    expect(await fetchPage(at("/trickle"), { net: net(), timeoutMs: 600 })).toMatchObject({ ok: false, reason: "timed out" });
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("refuses what isn't a web page", async () => {
    expect(await fetchPage(at("/pdf"), { net: net() })).toMatchObject({ ok: false, reason: "not a web page" });
  });

  it("decodes the page's own character set", async () => {
    const r = await fetchPage(at("/sjis"), { net: net() });
    expect(r.ok && r.text).toContain("日本語");
  });

  it("follows the site's robots.txt for FarbaekBot", async () => {
    const reader = createReader({ net: net() });
    expect(await reader.read(at("/no-farbaek"))).toMatchObject({ ok: false, reason: "the site's robots.txt doesn't allow it" });
    expect(await reader.read(at("/page"))).toMatchObject({ ok: true, title: "Hello" });
  });
});

describe("robots.txt rules (RFC 9309)", () => {
  const groups = parseRobots("User-agent: *\nDisallow: /\nAllow: /news/\nDisallow: /news/drafts\nAllow: /*.html$\n\n# farbaek\nUser-agent: FarbaekBot/1.0\nUser-agent: other\nDisallow: /secret\n");

  it("uses the group that names FarbaekBot, not the * group", () => {
    expect(robotsAllow(groups, "/anything")).toBe(true);
    expect(robotsAllow(groups, "/secret/x")).toBe(false);
  });

  it("longest match wins, Allow wins a tie, * and $ work", () => {
    expect(robotsAllow(groups, "/news/today", "somebot")).toBe(true);
    expect(robotsAllow(groups, "/news/drafts/1", "somebot")).toBe(false);
    expect(robotsAllow(groups, "/page.html", "somebot")).toBe(true);
    expect(robotsAllow(groups, "/page.html?x", "somebot")).toBe(false);
    expect(robotsAllow(parseRobots("User-agent: *\nDisallow: /a\nAllow: /a\n"), "/a")).toBe(true);
  });

  it("no robots.txt allows everything; an unreachable one disallows everything", () => {
    expect(robotsPermit(robotsFromResponse({ ok: false, status: 404 }), "https://x.example/a")).toBe(true);
    expect(robotsPermit(robotsFromResponse({ ok: false, status: 503 }), "https://x.example/a")).toBe(false);
    expect(robotsPermit(robotsFromResponse({ ok: false }), "https://x.example/a")).toBe(false);
  });
});

describe("reading the article (stage 205)", () => {
  const story = Array.from({ length: 6 }, (_, i) => `<p>Paragraph ${i + 1}: the council approved the new bridge budget and work starts next spring, officials said on Monday.</p>`).join("");

  it("takes the article, its title, site and the page's own dates", () => {
    const html = `<html lang="en"><head><title>Bridge approved | City Times</title><meta property="og:site_name" content="City Times"><meta property="article:published_time" content="2026-11-16T07:00:00Z"></head><body><nav>Menu</nav><article><h1>Bridge approved</h1>${story}</article></body></html>`;
    const page = extractPage(html, "https://citytimes.example/bridge");
    expect(page).toMatchObject({ site: "City Times", published: "2026-11-16T07:00:00.000Z", optOut: false, lang: "en" });
    expect(page.text).toContain("Paragraph 3");
    expect(page.text).not.toContain("Menu");
  });

  it("keeps only the title of a page that opts out", () => {
    expect(extractPage(`<html><head><title>T</title><meta name="robots" content="noai"></head><body>${story}</body></html>`, "https://a.example/x")).toMatchObject({ optOut: true, text: "" });
    expect(extractPage(`<html><body>${story}</body></html>`, "https://a.example/x", { tdm: "1" }).optOut).toBe(true);
    expect(extractPage(`<html><body>${story}</body></html>`, "https://a.example/x", { robotsTag: "googlebot: noai" }).optOut).toBe(false);
  });

  it("never takes a date from the future or from nowhere", () => {
    const future = `<html><head><meta property="article:published_time" content="2099-01-01T00:00:00Z"></head><body>${story}</body></html>`;
    expect(extractPage(future, "https://a.example/x").published).toBeNull();
  });
});

describe("the reader's limits (stage 205)", () => {
  it("reads at most two pages of one site at a time, and six in all", async () => {
    let now = 0;
    let peak = 0;
    let peakHost = 0;
    const perHost = new Map<string, number>();
    const fetcher = (async (url: string) => {
      if (url.endsWith("/robots.txt")) return { ok: false, reason: "answered 404", status: 404 };
      const host = new URL(url).hostname;
      now++;
      peak = Math.max(peak, now);
      perHost.set(host, (perHost.get(host) ?? 0) + 1);
      peakHost = Math.max(peakHost, perHost.get(host)!);
      await new Promise((r) => setTimeout(r, 20));
      now--;
      perHost.set(host, perHost.get(host)! - 1);
      return { ok: true, url, status: 200, contentType: "text/html", robotsTag: "", tdm: "", text: "<p>x</p>" };
    }) as never;
    const reader = createReader({ fetcher });
    await Promise.all(Array.from({ length: 20 }, (_, i) => reader.read(`https://site${i % 3}.example.org/p${i}`)));
    // Reads really happened, two at a time from a site and never more than six.
    expect(peakHost).toBe(2);
    expect(peak).toBeLessThanOrEqual(6);
  });
});

describe("the fresh review's reader cases (stage 205)", () => {
  it("a hostile robots.txt rule can't freeze the reader", () => {
    const groups = parseRobots(`User-agent: *\nDisallow: /${"*a".repeat(30)}*b\nDisallow: /${"*-".repeat(14)}x\n`);
    const started = performance.now();
    expect(robotsAllow(groups, `/${"a".repeat(2_000)}`)).toBe(true);
    expect(robotsAllow(groups, `/${"word-".repeat(400)}`)).toBe(true);
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("one reader stopping doesn't make the site's robots.txt 'disallow everything' for the next", async () => {
    let robotsAsked = 0;
    const fetcher = (async (url: string, options: { signal?: AbortSignal }) => {
      if (url.endsWith("/robots.txt")) {
        robotsAsked++;
        await new Promise((r) => setTimeout(r, 30));
        // A signal on the shared robots.txt request would make this fail for everyone waiting on it.
        if (options.signal?.aborted) return { ok: false, reason: "stopped" };
        return { ok: true, url, status: 200, contentType: "text/plain", robotsTag: "", tdm: "", text: "User-agent: *\nAllow: /\n" };
      }
      return { ok: true, url, status: 200, contentType: "text/html", robotsTag: "", tdm: "", text: "<p>Page text.</p>" };
    }) as never;
    const reader = createReader({ fetcher });
    const stop = new AbortController();
    const first = reader.read("https://shared.example.org/a", { signal: stop.signal });
    stop.abort();
    await first;
    expect(await reader.read("https://shared.example.org/b")).toMatchObject({ ok: true });
    expect(robotsAsked).toBe(1);
  });

  it("the server's own public address is refused, like a private one", async () => {
    const { denyAddresses } = await import("./address.mjs");
    expect(isPublicIp("2.25.88.188")).toBe(true);
    denyAddresses("2.25.88.188, not-an-address");
    expect(isPublicIp("2.25.88.188")).toBe(false);
    expect(isPublicIp("8.8.8.8")).toBe(true);
  });
});
