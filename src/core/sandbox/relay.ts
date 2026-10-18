/**
 * The signed preview relay (ADR 0023). Some runtimes, like Vercel Sandbox,
 * serve a sandbox's exposed ports on public addresses with no sign-in. To
 * keep previews private there, Farbaek exposes one port only, where a small
 * relay runs inside the sandbox. The relay forwards a request to an app on a
 * local port only when Farbaek signed it:
 *
 * - the key is derived per sandbox from the preview secret, so one
 *   sandbox's key opens nothing else;
 * - the signature covers the method, the path, the target port, a
 *   timestamp and a nonce: requests are fresh for 60 seconds and work once;
 * - it forwards to 127.0.0.1 only, never to its own port, and refuses
 *   upgrades (WebSockets aren't relayed).
 *
 * Farbaek's preview gateway signs each request after it has checked the
 * person's access, so the public address alone opens nothing.
 */

export const RELAY_PORT = 3999;
export const RELAY_MAX_SKEW_SECONDS = 60;
export const RELAY_DIR = "/tmp/farbaek";
export const RELAY_SCRIPT_PATH = `${RELAY_DIR}/relay.mjs`;
export const RELAY_KEY_PATH = `${RELAY_DIR}/relay.key`;

export const RELAY_HEADERS = {
  ts: "x-farbaek-relay-ts",
  nonce: "x-farbaek-relay-nonce",
  port: "x-farbaek-relay-port",
  sig: "x-farbaek-relay-sig",
} as const;

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

async function hmac(key: string, message: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, enc.encode(message)));
}

/** The relay key for one sandbox. It lives only inside that sandbox and on Farbaek's server. */
export function relayKey(previewSecret: string, sandboxId: string): Promise<string> {
  return hmac(previewSecret, `farbaek-relay:v1:${sandboxId}`);
}

export function relayMessage(r: { method: string; path: string; port: number; ts: number; nonce: string }): string {
  return `${r.method.toUpperCase()}\n${r.path}\n${r.port}\n${r.ts}\n${r.nonce}`;
}

/** The headers that let one request through the relay. */
export async function signRelayRequest(key: string, r: { method: string; path: string; port: number; now?: number; nonce?: string }): Promise<Record<string, string>> {
  const ts = Math.floor((r.now ?? Date.now()) / 1000);
  const nonce = r.nonce ?? hex(crypto.getRandomValues(new Uint8Array(16)).buffer as ArrayBuffer);
  const sig = await hmac(key, relayMessage({ method: r.method, path: r.path, port: r.port, ts, nonce }));
  return { [RELAY_HEADERS.ts]: String(ts), [RELAY_HEADERS.nonce]: nonce, [RELAY_HEADERS.port]: String(r.port), [RELAY_HEADERS.sig]: sig };
}

/**
 * The relay itself: a dependency-free Node script written into the sandbox.
 * It reads its key from a file only the sandbox's user can read, and its
 * port from FARBAEK_RELAY_PORT.
 */
export const RELAY_SCRIPT = `// Farbaek preview relay. Forwards only requests Farbaek signed. Do not edit.
import http from "node:http";
import crypto from "node:crypto";
import fs from "node:fs";

const PORT = Number(process.env.FARBAEK_RELAY_PORT || ${RELAY_PORT});
const KEY = fs.readFileSync(process.env.FARBAEK_RELAY_KEY_FILE || "${RELAY_KEY_PATH}", "utf8").trim();
const SKEW = ${RELAY_MAX_SKEW_SECONDS};
const H = ${JSON.stringify(RELAY_HEADERS)};
const seen = new Map();

function deny(res, status, text) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
  res.end(text);
}

function verify(req) {
  const ts = Number(req.headers[H.ts]);
  const nonce = String(req.headers[H.nonce] || "");
  const port = Number(req.headers[H.port]);
  const sig = String(req.headers[H.sig] || "");
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(ts) || Math.abs(now - ts) > SKEW) return { error: [401, "This request isn't signed by Farbaek, or its signature is too old."] };
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(nonce)) return { error: [401, "This request isn't signed by Farbaek."] };
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || port === PORT) return { error: [400, "That port can't be previewed."] };
  const expected = crypto.createHmac("sha256", KEY).update(req.method.toUpperCase() + "\\n" + req.url + "\\n" + port + "\\n" + ts + "\\n" + nonce).digest("hex");
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return { error: [401, "This request isn't signed by Farbaek."] };
  const t = Date.now();
  for (const [k, until] of seen) if (until < t) seen.delete(k);
  if (seen.has(nonce)) return { error: [401, "This request was already used."] };
  if (seen.size > 100000) return { error: [503, "The relay is busy."] };
  seen.set(nonce, t + (SKEW * 2 + 5) * 1000);
  return { port };
}

const server = http.createServer((req, res) => {
  if (req.headers.upgrade) return deny(res, 501, "Upgrades aren't relayed.");
  const checked = verify(req);
  if (checked.error) return deny(res, checked.error[0], checked.error[1]);
  const headers = { ...req.headers };
  for (const name of Object.values(H)) delete headers[name];
  headers.host = "127.0.0.1:" + checked.port;
  const upstream = http.request({ host: "127.0.0.1", port: checked.port, method: req.method, path: req.url, headers }, (u) => {
    res.writeHead(u.statusCode || 502, u.headers);
    u.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) deny(res, 502, "Nothing answered on port " + checked.port + ".");
    else res.destroy();
  });
  req.pipe(upstream);
});
server.on("upgrade", (_req, socket) => socket.end("HTTP/1.1 501 Not Implemented\\r\\nConnection: close\\r\\n\\r\\n"));
server.listen(PORT, "0.0.0.0");
`;
