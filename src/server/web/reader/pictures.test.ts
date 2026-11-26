/**
 * Pictures through the page reader (stage 278, ADR 0285): which picture a page names for previews, and that fetching one keeps
 * every rule a page fetch keeps. A local stand-in site, reached through test network rules; nothing here leaves the machine.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { extractPage } from "./extract.mjs";
import { fetchPage, fetchPicture, pictureKind, testNet } from "./fetch.mjs";
import { createReader } from "./read.mjs";

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]), Buffer.alloc(64, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x24, 0, 0, 0]), Buffer.from("WEBPVP8 "), Buffer.alloc(32, 2)]);
const GIF = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(32, 3)]);
const AVIF = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from("ftypavif"), Buffer.alloc(32, 4)]);
const HTML = Buffer.from("<html><body><script>alert(1)</script>".padEnd(80, " "));
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'.padEnd(80, " "));

describe("the kind of picture a file is", () => {
  it("is read from how the file begins, for the four kinds passed on", () => {
    expect([pictureKind(JPEG), pictureKind(PNG), pictureKind(WEBP), pictureKind(AVIF)]).toEqual(["image/jpeg", "image/png", "image/webp", "image/avif"]);
    // AVIF may name itself only among the kinds it is compatible with.
    const mif1 = Buffer.concat([Buffer.from([0, 0, 0, 0x1c]), Buffer.from("ftypmif1"), Buffer.from([0, 0, 0, 0]), Buffer.from("mif1avifmiaf"), Buffer.alloc(16, 4)]);
    expect(pictureKind(mif1)).toBe("image/avif");
    // Any bytes, not only Node's own buffers.
    expect(pictureKind(new Uint8Array(JPEG))).toBe("image/jpeg");
  });

  it("is none for a page, an SVG, a moving GIF, another kind of file, a short file or nothing", () => {
    const heic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(40, 5)]);
    for (const bytes of [HTML, SVG, GIF, heic, Buffer.from([0xff, 0xd8]), Buffer.alloc(0), null, undefined]) expect(pictureKind(bytes)).toBeNull();
  });
});

describe("the picture a page names for previews", () => {
  const page = (head: string, body = "<article><p>" + "Words of the story. ".repeat(30) + "</p></article>") => `<html><head><title>T</title>${head}</head><body>${body}</body></html>`;
  const URL_ = "https://news.example.org/2026/story";

  it("is its og:image, as an https address made whole against the page", () => {
    expect(extractPage(page('<meta property="og:image" content="https://cdn.example.org/lead.jpg">'), URL_).image).toBe("https://cdn.example.org/lead.jpg");
    expect(extractPage(page('<meta property="og:image" content="/img/lead.jpg#x">'), URL_).image).toBe("https://news.example.org/img/lead.jpg");
    expect(extractPage(page('<meta name="twitter:image" content="//cdn.example.org/card.png">'), URL_).image).toBe("https://cdn.example.org/card.png");
    // The secure address wins when both are given.
    expect(extractPage(page('<meta property="og:image" content="http://cdn.example.org/a.jpg"><meta property="og:image:secure_url" content="https://cdn.example.org/a.jpg">'), URL_).image).toBe("https://cdn.example.org/a.jpg");
  });

  it("is none when the page names none, or one Farbaek wouldn't fetch", () => {
    for (const head of [
      "",
      '<meta property="og:image" content="">',
      '<meta property="og:image" content="http://cdn.example.org/a.jpg">',
      '<meta property="og:image" content="data:image/png;base64,AAAA">',
      '<meta property="og:image" content="javascript:alert(1)">',
      '<meta property="og:image" content="https://user:pw@cdn.example.org/a.jpg">',
      `<meta property="og:image" content="https://cdn.example.org/${"a".repeat(420)}.jpg">`,
    ]) {
      expect(extractPage(page(head), URL_).image ?? null, head.slice(0, 60)).toBeNull();
    }
  });

  it("is none when the page asks for no picture preview, in its own words or in a header", () => {
    const og = '<meta property="og:image" content="https://cdn.example.org/lead.jpg">';
    expect(extractPage(page(`${og}<meta name="robots" content="max-image-preview:none">`), URL_).image).toBeNull();
    expect(extractPage(page(`${og}<meta name="robots" content="index, Max-Image-Preview: None">`), URL_).image).toBeNull();
    expect(extractPage(page(`${og}<meta name="farbaekbot" content="noimageindex">`), URL_).image).toBeNull();
    expect(extractPage(page(og), URL_, { robotsTag: "max-image-preview:none" }).image).toBeNull();
    expect(extractPage(page(og), URL_, { robotsTag: "farbaekbot: max-image-preview:none" }).image).toBeNull();
    // An instruction for another crawler, or one that allows a preview, changes nothing.
    expect(extractPage(page(og), URL_, { robotsTag: "otherbot: max-image-preview:none" }).image).toBe("https://cdn.example.org/lead.jpg");
    expect(extractPage(page(`${og}<meta name="robots" content="max-image-preview:large">`), URL_).image).toBe("https://cdn.example.org/lead.jpg");
  });

  it("is none for a page that asks not to be used at all, and for plain text", () => {
    const og = '<meta property="og:image" content="https://cdn.example.org/lead.jpg">';
    const out = extractPage(page(`${og}<meta name="robots" content="noai">`), URL_);
    expect([out.optOut, out.image, out.noPicture]).toEqual([true, null, true]);
    expect(extractPage("just text", URL_, { plain: true }).image).toBeNull();
  });

  it("says when the page asked for none, apart from when it only named none, so no other picture of it is shown either", () => {
    const og = '<meta property="og:image" content="https://cdn.example.org/lead.jpg">';
    expect(extractPage(page(`${og}<meta name="robots" content="max-image-preview:none">`), URL_)).toMatchObject({ image: null, noPicture: true });
    expect(extractPage(page(og), URL_, { robotsTag: "noimageindex" })).toMatchObject({ image: null, noPicture: true });
    expect(extractPage(page(""), URL_)).toMatchObject({ image: null, noPicture: false });
    expect(extractPage(page(og), URL_)).toMatchObject({ image: "https://cdn.example.org/lead.jpg", noPicture: false });
  });
});

describe("fetching a picture", () => {
  let server: http.Server;
  let port = 0;
  const hits = new Map<string, number>();
  const resolver = ((host: string, _o: unknown, cb: (e: null, a: { address: string; family: number }[]) => void) =>
    cb(null, [{ address: host === "inside.example.org" ? "10.0.0.9" : "127.0.0.1", family: 4 }])) as never;
  const net = () => testNet(resolver, (ip) => ip === "127.0.0.1", [String(port)]);
  const at = (path: string, host = "cdn.example.org") => `http://${host}:${port}${path}`;

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const path = req.url ?? "/";
      hits.set(path, (hits.get(path) ?? 0) + 1);
      const send = (type: string, body: Buffer) => {
        res.writeHead(200, { "content-type": type, "content-length": body.length });
        res.end(body);
      };
      if (path === "/robots.txt" && req.headers.host?.startsWith("closed.")) return send("text/plain", Buffer.from("User-agent: *\nDisallow: /"));
      if (path === "/robots.txt") {
        res.writeHead(404);
        return res.end();
      }
      if (path === "/a.jpg") return send("image/jpeg", JPEG);
      if (path === "/unnamed.jpg") return send("application/octet-stream", JPEG);
      if (path === "/a.jpg-as-jpg") return send("image/jpg", JPEG);
      if (path === "/a.gif") return send("image/gif", GIF);
      if (path === "/page") return send("text/html; charset=utf-8", Buffer.from(`<html><head><title>T</title></head><body><article><p>${"Words of a page. ".repeat(40)}</p></article></body></html>`));
      if (path === "/a.png") return send("image/png; charset=binary", PNG);
      if (path === "/a.webp") return send("image/webp", WEBP);
      if (path === "/page-named-png") return send("image/png", HTML);
      if (path === "/svg-named-png") return send("image/png", SVG);
      if (path === "/a.svg") return send("image/svg+xml", SVG);
      if (path === "/a.html") return send("text/html", HTML);
      if (path === "/big.jpg") return send("image/jpeg", Buffer.concat([JPEG, Buffer.alloc(3_000, 9)]));
      if (path === "/to-inside") {
        res.writeHead(302, { location: `http://inside.example.org:${port}/a.jpg` });
        return res.end();
      }
      if (path === "/moved") {
        res.writeHead(301, { location: "/a.jpg" });
        return res.end();
      }
      if (path === "/slow.jpg") {
        res.writeHead(200, { "content-type": "image/jpeg" });
        res.write(JPEG.subarray(0, 4));
        return;
      }
      res.writeHead(404);
      res.end();
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("gives a picture's bytes as they came, with its kind read from the bytes", async () => {
    const jpeg = await fetchPicture(at("/a.jpg"), { net: net() });
    expect(jpeg.ok && jpeg.contentType).toBe("image/jpeg");
    expect(jpeg.ok && Buffer.compare(jpeg.bytes, JPEG)).toBe(0);
    const png = await fetchPicture(at("/a.png"), { net: net() });
    expect(png.ok && png.contentType).toBe("image/png");
    expect((await fetchPicture(at("/a.webp"), { net: net() })).ok).toBe(true);
    expect((await fetchPicture(at("/moved"), { net: net() })).ok).toBe(true);
    // A real picture a site calls "image/jpg" or gives no name: the bytes decide.
    expect(await fetchPicture(at("/unnamed.jpg"), { net: net() })).toMatchObject({ ok: true, contentType: "image/jpeg" });
    expect(await fetchPicture(at("/a.jpg-as-jpg"), { net: net() })).toMatchObject({ ok: true, contentType: "image/jpeg" });
  });

  it("refuses what isn't a picture, whatever the site calls it", async () => {
    for (const path of ["/a.html", "/a.svg", "/a.gif", "/page-named-png", "/svg-named-png"]) {
      expect(await fetchPicture(at(path), { net: net() }), path).toEqual({ ok: false, reason: "not a picture" });
    }
  });

  it("keeps the rules a page fetch keeps: size, time, and public addresses on every hop", async () => {
    expect(await fetchPicture(at("/big.jpg"), { net: net(), maxBytes: 1_000 })).toEqual({ ok: false, reason: "too large" });
    expect(await fetchPicture(at("/slow.jpg"), { net: net(), timeoutMs: 300 })).toEqual({ ok: false, reason: "timed out" });
    // Refused for being a private address, not merely because nothing answered there: the reason is the guard's own.
    expect(await fetchPicture(at("/to-inside"), { net: net() })).toEqual({ ok: false, reason: "not a public address" });
    expect(await fetchPicture(at("/a.jpg", "inside.example.org"), { net: net() })).toEqual({ ok: false, reason: "not a public address" });
    // Under production rules each is refused by name, before anything is asked.
    for (const [url, reason] of [
      ["https://127.0.0.1/a.jpg", "not a public address"],
      ["https://169.254.169.254/a.jpg", "not a public address"],
      ["https://localhost/a.jpg", "not a public host name"],
      ["https://cdn.example.org:8443/a.jpg", "not a standard port"],
      ["file:///etc/passwd", "not http or https"],
      ["http://cdn.example.org/a.jpg", "not https"],
    ] as const) {
      expect(await fetchPicture(url), url).toEqual({ ok: false, reason });
    }
  });

  it("is https on every hop: a redirect may not take it to plain http", async () => {
    // The stand-in site is plain http, so with the rule on, its first hop is refused; under production rules the rule is always on.
    expect(await fetchPage(at("/a.jpg"), { net: net(), bytes: true, types: null, httpsOnly: true })).toEqual({ ok: false, reason: "not https" });
    expect((await fetchPage(at("/a.jpg"), { net: net(), bytes: true, types: null })).ok).toBe(true);
  });

  it("never holds a page's place: pictures wait in a pool of their own", async () => {
    // One place for pages and one for pictures. A picture that hangs until its time runs out must not make a page wait.
    const reader = createReader({ net: net(), maxConcurrent: 1, perHost: 1, maxPictures: 1 });
    const slow = reader.picture(at("/slow.jpg"), { timeoutMs: 900 });
    const second = reader.picture(at("/a.png"));
    await new Promise((r) => setTimeout(r, 60));
    expect(reader.stats()).toMatchObject({ picturesActive: 1, picturesWaiting: 1, active: 0 });
    const started = Date.now();
    const read = await reader.read(at("/page"), { timeoutMs: 800 });
    expect(read.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(600);
    expect(await slow).toEqual({ ok: false, reason: "timed out" });
    expect((await second).ok).toBe(true);
    expect(reader.stats()).toMatchObject({ picturesActive: 0, picturesWaiting: 0 });
  });

  it("is fetched once for everyone asking at the same moment, and kept for the next", async () => {
    const reader = createReader({ net: net() });
    hits.clear();
    const [a, b, c] = await Promise.all([reader.picture(at("/a.jpg")), reader.picture(at("/a.jpg")), reader.picture(at("/a.jpg"))]);
    expect([a.ok, b.ok, c.ok]).toEqual([true, true, true]);
    expect(hits.get("/a.jpg")).toBe(1);
    expect((await reader.picture(at("/a.jpg"))).ok).toBe(true);
    expect(hits.get("/a.jpg")).toBe(1);
    expect(reader.stats()).toMatchObject({ pictures: 1, pictureBytes: JPEG.length });
  });

  it("follows the site's robots.txt, and remembers a refusal for a short while", async () => {
    const reader = createReader({ net: net() });
    hits.clear();
    expect(await reader.picture(at("/a.jpg", "closed.example.org"))).toEqual({ ok: false, reason: "the site's robots.txt doesn't allow it" });
    expect(hits.get("/a.jpg")).toBeUndefined();
    expect((await reader.picture(at("/a.html"))).ok).toBe(false);
    expect((await reader.picture(at("/a.html"))).ok).toBe(false);
    expect(hits.get("/a.html")).toBe(1);
  });

  it("holds no more pictures than its room, the oldest going first", async () => {
    const reader = createReader({ net: net(), pictureRoomBytes: JPEG.length + PNG.length });
    await reader.picture(at("/a.jpg"));
    await reader.picture(at("/a.png"));
    await reader.picture(at("/a.webp"));
    const stats = reader.stats();
    expect(stats.pictures).toBe(2);
    expect(stats.pictureBytes).toBeLessThanOrEqual(JPEG.length + PNG.length);
    // The first one went, so it is fetched again.
    hits.clear();
    await reader.picture(at("/a.jpg"));
    expect(hits.get("/a.jpg")).toBe(1);
  });

  it("refuses an address that isn't one, and anything but https under production rules", async () => {
    const strict = createReader();
    expect(await strict.picture("not an address")).toEqual({ ok: false, reason: "not a web address" });
    expect(await strict.picture("http://cdn.example.org/a.jpg")).toEqual({ ok: false, reason: "not https" });
    expect((await strict.picture("https://10.0.0.1/a.jpg")).ok).toBe(false);
  });
});
