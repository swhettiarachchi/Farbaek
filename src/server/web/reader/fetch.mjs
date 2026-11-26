// Fetching one web page for the reader (stage 205, ADR 0222), safely: http or https on the standard ports only, public
// addresses only (checked on the URL, on every resolved address and on the connected socket), at most three redirects, each
// checked again, one deadline for the whole page however slowly it trickles in, a size cap counted after decompression, HTML or
// plain text only, decoded in the page's own character set. Nothing here runs a page's scripts.
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { isIP } from "node:net";
import { guardLookup, isLocalName, isPublicIp, publicLookup } from "./address.mjs";

export const USER_AGENT = "FarbaekBot/1.0 (+https://farbaek.com/bot)";
const PAGE_TYPES = ["text/html", "application/xhtml+xml", "text/plain"];
/** The kinds of picture passed on (stage 278, ADR 0285). Never SVG, which can carry script, and never GIF, which is usually moving. */
export const PICTURE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];
/**
 * What a site may call a picture for it to be read at all: any image, or bytes with no name ("image/jpg" and
 * "application/octet-stream" are common for real pictures). The name only spares reading what is plainly a page; the kind
 * passed on is decided by the bytes.
 */
const PICTURE_NAMES = ["image/", "application/octet-stream", "binary/octet-stream"];

/** Production network rules. Tests pass their own resolver, allowed addresses and ports, to reach a local stand-in site. */
export const PUBLIC_NET = Object.freeze({ lookup: publicLookup, isAllowed: isPublicIp, ports: ["", "80", "443"], allowLocalNames: false });

/** Network rules for tests: a resolver, the addresses it may use and the ports. */
export function testNet(resolver, isAllowed, ports) {
  return { lookup: guardLookup(resolver, isAllowed, true), isAllowed, ports, allowLocalNames: true };
}

/** Why a URL may not be fetched, or null when it may. */
export function refuseUrl(raw, net = PUBLIC_NET) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return "not a web address";
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return "not http or https";
  if (url.username || url.password) return "has a user name or password";
  if (!net.ports.includes(url.port)) return "not a standard port";
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) return net.isAllowed(host) ? "an address, not a name" : "not a public address";
  if (!net.allowLocalNames && isLocalName(host)) return "not a public host name";
  return null;
}

function charsetOf(contentType, head) {
  const fromHeader = /charset\s*=\s*["']?([\w.:-]+)/i.exec(contentType ?? "")?.[1];
  if (fromHeader) return fromHeader;
  const sniff = head.toString("latin1");
  return /<meta[^>]+charset\s*=\s*["']?([\w.:-]+)/i.exec(sniff)?.[1] ?? "utf-8";
}

function decode(bytes, label) {
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
}

function decompressor(encoding) {
  const e = (encoding ?? "").trim().toLowerCase();
  if (e === "gzip" || e === "x-gzip") return zlib.createGunzip();
  if (e === "deflate") return zlib.createInflate();
  if (e === "br") return zlib.createBrotliDecompress();
  if (e === "" || e === "identity") return null;
  return undefined;
}

/** One request, no redirects followed. Resolves to the response's facts and its decoded body, or a reason it failed. */
function requestOnce(url, { deadline, maxBytes, types, signal, net, bytes: wantBytes = false }) {
  return new Promise((resolve) => {
    let settled = false;
    let timer;
    const done = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const remaining = deadline - Date.now();
    if (remaining <= 0) return done({ ok: false, reason: "timed out" });
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(url, {
      method: "GET",
      agent: false,
      lookup: net.lookup,
      headers: {
        "user-agent": USER_AGENT,
        accept: wantBytes ? "image/avif,image/webp,image/jpeg,image/png,image/gif;q=0.9" : "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.1",
        "accept-encoding": "gzip, deflate, br",
        "accept-language": "en;q=0.8, *;q=0.5",
      },
      signal,
    });
    timer = setTimeout(() => {
      req.destroy();
      done({ ok: false, reason: "timed out" });
    }, remaining);
    // The address the socket really connected to, after any lookup: the last word on where the request went.
    req.on("socket", (socket) => {
      const check = () => {
        if (!net.isAllowed(socket.remoteAddress ?? "")) {
          req.destroy();
          done({ ok: false, reason: "not a public address" });
        }
      };
      socket.once("connect", check);
      socket.once("secureConnect", check);
    });
    req.on("error", (error) => done({ ok: false, reason: /refused/.test(error?.message ?? "") ? "not a public address" : signal?.aborted ? "stopped" : "couldn't connect" }));
    req.on("response", (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400) {
        res.resume();
        return done({ ok: true, redirect: res.headers.location ?? null, status });
      }
      if (status < 200 || status >= 300) {
        res.resume();
        return done({ ok: false, reason: `answered ${status}`, status });
      }
      const contentType = String(res.headers["content-type"] ?? "").toLowerCase();
      if (types && !types.some((t) => contentType.startsWith(t))) {
        res.destroy();
        return done({ ok: false, reason: "not a web page" });
      }
      const declared = Number(res.headers["content-length"] ?? 0);
      const unzip = decompressor(res.headers["content-encoding"]);
      if (unzip === undefined) {
        res.destroy();
        return done({ ok: false, reason: "unknown compression" });
      }
      if (!unzip && declared > maxBytes) {
        res.destroy();
        return done({ ok: false, reason: "too large" });
      }
      const body = unzip ? res.pipe(unzip) : res;
      const chunks = [];
      let size = 0;
      body.on("data", (chunk) => {
        size += chunk.length;
        // Counted after decompression, so a small compressed page can't grow past the cap.
        if (size > maxBytes) {
          res.destroy();
          body.destroy?.();
          return done({ ok: false, reason: "too large" });
        }
        chunks.push(chunk);
      });
      body.on("error", () => done({ ok: false, reason: "couldn't read the page" }));
      body.on("end", () => {
        const bytes = Buffer.concat(chunks);
        // A picture is passed on as it came: never decoded, never read as text.
        if (wantBytes) return done({ ok: true, status, contentType, bytes });
        const text = decode(bytes, charsetOf(contentType, bytes.subarray(0, 2048)));
        done({ ok: true, status, contentType, robotsTag: String(res.headers["x-robots-tag"] ?? ""), tdm: String(res.headers["tdm-reservation"] ?? ""), text });
      });
    });
    req.end();
  });
}

/**
 * Fetches a page, following up to `maxRedirects` redirects, each checked like the first. One deadline covers the whole thing.
 * Resolves to { ok: true, url, status, contentType, robotsTag, tdm, text } or { ok: false, reason }.
 */
export async function fetchPage(rawUrl, { timeoutMs = 4_000, maxBytes = 1_500_000, maxRedirects = 3, types = PAGE_TYPES, signal, net = PUBLIC_NET, bytes = false, httpsOnly = false } = {}) {
  const deadline = Date.now() + timeoutMs;
  let current = rawUrl;
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const refused = refuseUrl(current, net);
    if (refused) return { ok: false, reason: refused };
    const url = new URL(current);
    // A picture is asked for over https, and a redirect may not take it anywhere else.
    if (httpsOnly && url.protocol !== "https:") return { ok: false, reason: "not https" };
    const result = await requestOnce(url, { deadline, maxBytes, types, signal, net, bytes });
    if (!result.ok) return result;
    if (result.redirect === undefined) return { ...result, url: url.toString() };
    if (!result.redirect) return { ok: false, reason: "redirect without a destination" };
    current = new URL(result.redirect, url).toString();
  }
  return { ok: false, reason: "too many redirects" };
}

/**
 * Fetches one picture (stage 278, ADR 0285) under the same rules as a page: public addresses only, checked on every redirect
 * and on the connected socket, https on every hop, one deadline, a size cap, and only the kinds of picture in
 * `PICTURE_TYPES`, decided by how its first bytes begin. Resolves to { ok: true, contentType, bytes } or { ok: false, reason }.
 */
export async function fetchPicture(rawUrl, { timeoutMs = 5_000, maxBytes = 1_000_000, signal, net = PUBLIC_NET } = {}) {
  // Test network rules reach a local stand-in over http; production rules never do.
  const result = await fetchPage(rawUrl, { timeoutMs, maxBytes, maxRedirects: 3, types: PICTURE_NAMES, signal, net, bytes: true, httpsOnly: !net.allowLocalNames });
  if (!result.ok) return { ok: false, reason: result.reason === "not a web page" ? "not a picture" : result.reason };
  const kind = pictureKind(result.bytes);
  // What the bytes are decides, not what the site called them: a page named image/png is still a page.
  if (!kind) return { ok: false, reason: "not a picture" };
  return { ok: true, contentType: kind, bytes: result.bytes };
}

/** The kind of picture a file is, from how it begins, or null when it is none of the kinds passed on. */
export function pictureKind(bytes) {
  if (!bytes || bytes.length < 12) return null;
  // Any bytes, not only Node's own buffers.
  const head = Buffer.from(bytes.buffer, bytes.byteOffset, Math.min(bytes.byteLength, 40));
  const hex = head.subarray(0, 12).toString("hex");
  const ascii = head.toString("latin1");
  if (hex.startsWith("ffd8ff")) return "image/jpeg";
  if (hex.startsWith("89504e470d0a1a0a")) return "image/png";
  if (ascii.startsWith("RIFF") && ascii.slice(8, 12) === "WEBP") return "image/webp";
  // AVIF names itself as the file's main brand or among the brands it is compatible with, all within the first box.
  if (ascii.slice(4, 8) === "ftyp" && /avi[fs]/.test(ascii.slice(8, 40))) return "image/avif";
  return null;
}
