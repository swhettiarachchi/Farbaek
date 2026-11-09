/**
 * The preview gateway. Requests for `p-<id>.<preview domain>` arrive here
 * (src/proxy.ts rewrites them) and are forwarded to the app running inside
 * the sandbox, after these checks on every request:
 *
 * - the host is a preview host for this deployment's preview domain;
 * - the request carries this preview's access cookie, signed by Farbaek and
 *   bound to the person who opened it;
 * - the preview record is still open (not revoked, not expired), the
 *   person is still a member of the workspace, and the session runs.
 *
 * The upstream URL is built by the runtime adapter from the stored sandbox
 * id and the preview's port, never from anything in the request, so the
 * gateway can't be pointed at other hosts (SSRF). The runtime's traffic
 * token is added here and never reaches the browser. Farbaek and Supabase
 * cookies never exist on preview hosts and are stripped anyway.
 */
import {
  forwardableCookies,
  PREVIEW_COOKIE,
  PREVIEW_COOKIE_DEV,
  PREVIEW_LAUNCH_PATH,
  PICKER_MAX_HTML_BYTES,
  PICKER_PATH,
  injectPicker,
  previewIdFromHost,
  rewriteLocation,
  signPreviewToken,
  STRIPPED_REQUEST_HEADERS,
  STRIPPED_RESPONSE_HEADERS,
  STRIPPED_RESPONSE_PREFIXES,
  verifyPreviewToken,
} from "@/core/sandbox/preview";
import type { SandboxRuntime } from "@/core/sandbox/runtime";
import { pickerScript } from "@/core/studio/picker-script";
import { log } from "@/server/observability/log";
import type { SandboxServerConfig } from "./config";
import type { SandboxStore } from "./types";

export const GATEWAY_PREFIX = "/sandbox-preview";
const MAX_BODY_BYTES = 10 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 60_000;

export interface GatewayDeps {
  config: SandboxServerConfig;
  store: SandboxStore;
  runtime: SandboxRuntime | null;
  now(): Date;
  /** The app's own origin: the only page allowed to frame previews, and the "back" link. */
  appOrigin: string;
  fetch?: typeof fetch;
}

function page(status: number, title: string, body: string, appOrigin: string): Response {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fbfbfc;color:#121317;font:15px/1.6 system-ui,sans-serif}main{max-width:34rem;padding:2rem}h1{font-size:1.25rem;font-weight:500;margin:0 0 .5rem}p{color:#474c56;margin:0 0 1rem}a{color:#2450f0}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(body)}</p><p><a href="${esc(appOrigin)}/app/sandbox" target="_top" rel="noopener">Back to Farbaek Test space</a></p></main></body></html>`;
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; style-src 'unsafe-inline'; frame-ancestors ${appOrigin}`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

function cookieName(config: SandboxServerConfig): string {
  return config.preview.protocol === "https" ? PREVIEW_COOKIE : PREVIEW_COOKIE_DEV;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

/** The path the browser asked for on the preview host (the proxy prefixes it with GATEWAY_PREFIX). */
export function originalPath(url: URL): string {
  const p = url.pathname.startsWith(GATEWAY_PREFIX) ? url.pathname.slice(GATEWAY_PREFIX.length) : url.pathname;
  return (p.startsWith("/") ? p : `/${p}`) + url.search;
}

type Target =
  | { kind: "session"; until: number; sessionId: string; sandboxId: string; port: number }
  | { kind: "project"; until: number; orgId: string; projectId: string };

const accessCache = new Map<string, Target>();

const CONTENT_TYPES: Record<string, string> = {
  html: "text/html; charset=utf-8",
  htm: "text/html; charset=utf-8",
  css: "text/css; charset=utf-8",
  js: "text/javascript; charset=utf-8",
  mjs: "text/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  webmanifest: "application/manifest+json; charset=utf-8",
  svg: "image/svg+xml; charset=utf-8",
  xml: "application/xml; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  md: "text/plain; charset=utf-8",
};

/** The project files a request path can mean, most specific first: "/" is index.html, "/about" can be about, about.html or about/index.html. */
export function staticCandidates(rawPath: string): string[] {
  let p: string;
  try {
    p = decodeURIComponent(rawPath.split("?")[0]!.split("#")[0]!);
  } catch {
    return [];
  }
  p = p.replace(/^\/+/, "");
  if (p.split("/").some((part) => part === ".." || part === ".")) return [];
  if (p === "") return ["index.html"];
  if (p.endsWith("/")) return [`${p}index.html`];
  const last = p.split("/").at(-1)!;
  return last.includes(".") ? [p] : [p, `${p}.html`, `${p}/index.html`];
}

export function contentTypeFor(path: string): string {
  const ext = path.split(".").at(-1)?.toLowerCase() ?? "";
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}

export async function handlePreviewRequest(request: Request, deps: GatewayDeps): Promise<Response> {
  const { config, store, runtime } = deps;
  const doFetch = deps.fetch ?? fetch;
  const domain = config.preview.domain;
  const secret = config.preview.secret;
  const previewId = domain ? previewIdFromHost(request.headers.get("host"), domain) : null;
  if (!previewId || !secret) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain" } });
  if ((request.headers.get("upgrade") ?? "").toLowerCase() === "websocket") {
    return new Response("WebSocket connections aren't forwarded to previews. Reload the page to see changes.", { status: 501, headers: { "content-type": "text/plain" } });
  }

  const url = new URL(request.url);
  const path = originalPath(url);
  const nowSeconds = Math.floor(deps.now().getTime() / 1000);
  const name = cookieName(config);
  const secure = config.preview.protocol === "https" || (domain ?? "").includes("localhost");

  // 1. Launch: swap the one-use launch token for this host's access cookie.
  if (path.split("?")[0] === PREVIEW_LAUNCH_PATH) {
    const token = url.searchParams.get("t");
    const check = await verifyPreviewToken(token, secret, { kind: "launch", previewId, nowSeconds });
    if (!check.ok) return page(401, "This preview link has expired", "Preview links work once, within a minute. Open the preview again from Farbaek.", deps.appOrigin);
    const launched = await store.launchPreview(previewId, check.claims.u);
    if (!launched.ok) return page(403, "This preview isn't available", "It was already opened, closed, or its session stopped. Open the preview again from Farbaek.", deps.appOrigin);
    const exp = Math.floor(Date.parse(launched.value.expiresAt) / 1000);
    // A preview opened to pick elements (ADR 0149) stays that way for its life.
    const access = await signPreviewToken({ kind: "access", p: previewId, u: check.claims.u, exp, ...(check.claims.pick === true ? { pick: true as const } : {}) }, secret);
    const attrs = ["Path=/", "HttpOnly", `Max-Age=${Math.max(0, exp - nowSeconds)}`, ...(secure ? ["Secure", "SameSite=None", "Partitioned"] : ["SameSite=Lax"])];
    log("info", "sandbox.preview_launched", { preview: previewId, session: launched.value.sessionId });
    return new Response(null, { status: 303, headers: { location: "/", "set-cookie": `${name}=${access}; ${attrs.join("; ")}`, "cache-control": "no-store", "referrer-policy": "no-referrer" } });
  }

  // 2. Every other request needs the access cookie and an open preview.
  const access = await verifyPreviewToken(readCookie(request.headers.get("cookie"), name), secret, { kind: "access", previewId, nowSeconds });
  if (!access.ok) return page(401, "Open this preview from Farbaek", "Previews are private. Open it from your test space session to get access in this browser.", deps.appOrigin);

  let target = accessCache.get(previewId);
  if (!target || target.until <= Date.now()) {
    const preview = await store.getPreview(previewId);
    const role = preview ? await store.memberRoleAsSystem(preview.orgId, access.claims.u) : null;
    const usable = preview && !preview.revokedAt && Date.parse(preview.expiresAt) > deps.now().getTime() && preview.launchedAt !== null && preview.createdBy === access.claims.u && role !== null;
    const session = usable && preview.sessionId ? await store.getSessionAsSystem(preview.sessionId) : null;
    if (usable && preview.projectId) {
      target = { kind: "project", until: Date.now() + 5_000, orgId: preview.orgId, projectId: preview.projectId };
    } else if (usable && session?.state === "ready" && session.providerSandboxId && preview.port !== null) {
      target = { kind: "session", until: Date.now() + 5_000, sessionId: session.id, sandboxId: session.providerSandboxId, port: preview.port };
    } else {
      accessCache.delete(previewId);
      return page(403, "This preview has closed", "It expired, was closed, or its session stopped. Open a new preview from Farbaek.", deps.appOrigin);
    }
    if (accessCache.size > 1000) accessCache.clear();
    accessCache.set(previewId, target);
  }

  // A project preview: the project's current files, served as they are.
  if (target.kind === "project") {
    const method = request.method.toUpperCase();
    if (method !== "GET" && method !== "HEAD") return page(405, "Read-only preview", "This preview shows the project's files. It can't accept form posts or other changes.", deps.appOrigin);
    for (const candidate of staticCandidates(path)) {
      const content = await store.projectFileAsSystem(target.orgId, target.projectId, candidate);
      if (content === null) continue;
      return new Response(method === "HEAD" ? null : content, {
        status: 200,
        headers: {
          "content-type": contentTypeFor(candidate),
          "cache-control": "no-store",
          "content-security-policy": `frame-ancestors ${deps.appOrigin}`,
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
        },
      });
    }
    return page(404, "Not in this project", "There's no file at this address in the project. Previews serve the project's files exactly as they are.", deps.appOrigin);
  }
  // Farbaek's picker script (ADR 0149), served by the gateway itself on the app's own origin. It does nothing unless Farbaek's page turns it on.
  if (path.split("?")[0] === PICKER_PATH) {
    return new Response(pickerScript(deps.appOrigin), {
      status: 200,
      headers: { "content-type": "text/javascript; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer", "x-content-type-options": "nosniff" },
    });
  }
  const picking = access.claims.pick === true;
  if (!runtime) return page(503, "Test space unavailable", "This server has no test space connected right now.", deps.appOrigin);

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES) return page(413, "Request too large", "Previews accept request bodies up to 10 MB.", deps.appOrigin);

  let upstream: { origin: string; headers: Record<string, string> };
  try {
    upstream = await runtime.previewTarget(target.sandboxId, target.port, { method: request.method, path });
  } catch (e) {
    log("warn", "sandbox.preview_target_failed", { preview: previewId, error: e instanceof Error ? e.message : String(e) });
    return page(502, "The test space isn't reachable", "The runtime didn't return this session. It may have stopped.", deps.appOrigin);
  }

  const headers = new Headers();
  request.headers.forEach((value, key) => {
    if (!STRIPPED_REQUEST_HEADERS.includes(key.toLowerCase())) headers.set(key, value);
  });
  const cookies = forwardableCookies(request.headers.get("cookie"));
  if (cookies) headers.set("cookie", cookies);
  for (const [k, v] of Object.entries(upstream.headers)) headers.set(k, v);
  // Pages are read to add the picker, so they're asked for uncompressed.
  if (picking) headers.set("accept-encoding", "identity");

  const method = request.method.toUpperCase();
  let response: Response;
  try {
    response = await doFetch(`${upstream.origin}${path}`, {
      method,
      headers,
      body: method === "GET" || method === "HEAD" ? undefined : request.body,
      redirect: "manual",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      // Required by Node's fetch to stream a request body.
      ...(method === "GET" || method === "HEAD" ? {} : { duplex: "half" }),
    } as RequestInit);
  } catch {
    return page(502, `Nothing answered on port ${target.port}`, "Start your app inside the session (for example npm run dev) and make sure it listens on 0.0.0.0, then reload.", deps.appOrigin);
  }

  const out = new Headers();
  response.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    if (STRIPPED_RESPONSE_HEADERS.includes(k) || STRIPPED_RESPONSE_PREFIXES.some((p) => k.startsWith(p)) || k === "set-cookie") return;
    out.set(key, k === "location" ? rewriteLocation(value, upstream.origin) : value);
  });
  for (const c of response.headers.getSetCookie?.() ?? []) {
    const cname = c.split("=")[0]?.trim();
    // Every preview shares one parent domain, so a Domain attribute would reach other people's previews:
    // the app's cookies stay on its own preview host.
    if (cname !== PREVIEW_COOKIE && cname !== PREVIEW_COOKIE_DEV) out.append("set-cookie", c.replace(/;\s*domain=[^;]*/gi, ""));
  }
  out.set("content-security-policy", `frame-ancestors ${deps.appOrigin}`);
  out.set("referrer-policy", "no-referrer");
  out.set("x-content-type-options", "nosniff");
  out.append("vary", "Cookie");
  if (picking && method === "GET" && response.status === 200 && response.body && isPlainHtml(response.headers)) {
    const body = await withPicker(response.body, PICKER_MAX_HTML_BYTES);
    if (body.injected) out.delete("content-length");
    return new Response(body.stream, { status: response.status, statusText: response.statusText, headers: out });
  }
  return new Response(method === "HEAD" ? null : response.body, { status: response.status, statusText: response.statusText, headers: out });
}

/** An uncompressed UTF-8 HTML page, small enough or of unknown size. */
function isPlainHtml(headers: Headers): boolean {
  const type = headers.get("content-type") ?? "";
  const charset = /charset=([^;\s]+)/i.exec(type)?.[1]?.toLowerCase() ?? "utf-8";
  const encoding = (headers.get("content-encoding") ?? "identity").toLowerCase();
  const size = Number(headers.get("content-length") ?? "0");
  return /^text\/html\b/i.test(type) && (charset === "utf-8" || charset === "utf8") && encoding === "identity" && size <= PICKER_MAX_HTML_BYTES;
}

/**
 * Reads a page up to `max` bytes and adds the picker (ADR 0149). A page that
 * turns out larger is passed on unchanged, the bytes already read first.
 */
async function withPicker(body: ReadableStream<Uint8Array>, max: number): Promise<{ stream: ReadableStream<Uint8Array>; injected: boolean }> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
    if (total > max) {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          for (const c of chunks) controller.enqueue(c);
        },
        async pull(controller) {
          const next = await reader.read();
          if (next.done) controller.close();
          else controller.enqueue(next.value);
        },
        cancel: (reason) => reader.cancel(reason),
      });
      return { stream, injected: false };
    }
  }
  const all = new Uint8Array(total);
  let at = 0;
  for (const c of chunks) {
    all.set(c, at);
    at += c.byteLength;
  }
  const html = new TextDecoder().decode(all);
  const bytes = new TextEncoder().encode(injectPicker(html));
  return { stream: new ReadableStream({ start: (c) => (c.enqueue(bytes), c.close()) }), injected: true };
}
