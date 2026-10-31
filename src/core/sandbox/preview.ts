/**
 * Preview links. A running app inside a sandbox is never served from
 * Farbaek's own origin: its scripts would run next to the sign-in cookies.
 * Each preview gets its own host, `p-<id>.<preview domain>`, a separate site
 * with no Farbaek cookies.
 *
 * Access is private by default and bound to the person who opened it:
 * 1. Farbaek issues a launch token (HMAC-signed, 60 seconds, one use).
 * 2. The gateway on the preview host checks it and swaps it for a cookie
 *    scoped to that one host, then redirects to "/".
 * 3. Every later request needs that cookie, and the preview record must
 *    still be open (not expired or revoked) with the session running.
 *
 * Tokens are signed with WebCrypto, so this module runs on the server, the
 * edge and in tests alike. The secret never reaches a browser.
 */

export const PREVIEW_HOST_PREFIX = "p-";
export const PREVIEW_ID_LENGTH = 26;
export const PREVIEW_LAUNCH_SECONDS = 60;
export const PREVIEW_COOKIE = "__Host-fpv";
/** Cookie name used on plain-http development hosts, where the __Host- prefix isn't allowed. */
export const PREVIEW_COOKIE_DEV = "fpv";
export const PREVIEW_LAUNCH_PATH = "/__farbaek/launch";

const BASE32 = "abcdefghijklmnopqrstuvwxyz234567";

/** A random 130-bit id in lowercase base32, safe as a DNS label. */
export function newPreviewId(random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n))): string {
  const bytes = random(PREVIEW_ID_LENGTH);
  let out = "";
  for (let i = 0; i < PREVIEW_ID_LENGTH; i++) out += BASE32[(bytes[i] ?? 0) % 32];
  return out;
}

export function isPreviewId(value: string): boolean {
  return value.length === PREVIEW_ID_LENGTH && /^[a-z2-7]+$/.test(value);
}

/** The preview id from a Host header, or null when the host isn't a preview host for this domain. */
export function previewIdFromHost(host: string | null | undefined, previewDomain: string): string | null {
  if (!host || !previewDomain) return null;
  const h = host.trim().toLowerCase();
  const suffix = `.${previewDomain.toLowerCase()}`;
  if (!h.endsWith(suffix)) return null;
  const label = h.slice(0, -suffix.length);
  if (!label.startsWith(PREVIEW_HOST_PREFIX)) return null;
  const id = label.slice(PREVIEW_HOST_PREFIX.length);
  return isPreviewId(id) ? id : null;
}

/**
 * Where a host sits on the preview domain, which holds people's content and
 * must never serve Farbaek itself: the bare domain, one of its preview hosts,
 * or some other name under it (which a wildcard DNS record also reaches).
 * Null for every host outside the preview domain.
 */
export function previewDomainHost(host: string | null | undefined, previewDomain: string | null | undefined): "apex" | "preview" | "other" | null {
  if (!host || !previewDomain) return null;
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  const domain = previewDomain.trim().toLowerCase();
  if (h === domain) return "apex";
  if (!h.endsWith(`.${domain}`)) return null;
  return previewIdFromHost(h, domain) ? "preview" : "other";
}

export function previewOrigin(previewId: string, previewDomain: string, protocol: "http" | "https"): string {
  return `${protocol}://${PREVIEW_HOST_PREFIX}${previewId}.${previewDomain}`;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export type PreviewTokenKind = "launch" | "access";

export interface PreviewTokenClaims {
  kind: PreviewTokenKind;
  /** Preview id. */
  p: string;
  /** User who opened the preview. */
  u: string;
  /** Expiry, seconds since the epoch. */
  exp: number;
  /** Single-use nonce for launch tokens. */
  n?: string;
  /** Opened from the component editor to pick elements (ADR 0149): HTML pages get Farbaek's picker script. */
  pick?: true;
}

/** Where a preview host serves Farbaek's picker script (ADR 0149), same origin as the app so its own CSP allows it. */
export const PICKER_PATH = "/__farbaek/pick.js";
/** The largest page the picker is added to; bigger ones pass through as they are. */
export const PICKER_MAX_HTML_BYTES = 5 * 1024 * 1024;

/** Adds the picker script to an HTML page: inside <head> when there is one, otherwise before </body>, otherwise first. */
export function injectPicker(html: string): string {
  const tag = `<script src="${PICKER_PATH}" defer></script>`;
  const head = /<head(?:\s[^>]*)?>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + tag + html.slice(head.index + head[0].length);
  const body = html.search(/<\/body\s*>/i);
  if (body >= 0) return html.slice(0, body) + tag + html.slice(body);
  return tag + html;
}

export async function signPreviewToken(claims: PreviewTokenClaims, secret: string): Promise<string> {
  if (secret.length < 32) throw new Error("The preview secret must be at least 32 characters.");
  const body = b64url(new TextEncoder().encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), new TextEncoder().encode(body)));
  return `${body}.${b64url(sig)}`;
}

export type TokenCheck = { ok: true; claims: PreviewTokenClaims } | { ok: false; reason: "malformed" | "signature" | "expired" | "wrong_preview" | "wrong_kind" };

export async function verifyPreviewToken(
  token: string | null | undefined,
  secret: string,
  expect: { kind: PreviewTokenKind; previewId: string; nowSeconds: number },
): Promise<TokenCheck> {
  if (!token || token.length > 2048 || secret.length < 32) return { ok: false, reason: "malformed" };
  const [body, sig, extra] = token.split(".");
  if (!body || !sig || extra !== undefined) return { ok: false, reason: "malformed" };
  const sigBytes = fromB64url(sig);
  const bodyBytes = fromB64url(body);
  if (!sigBytes || !bodyBytes) return { ok: false, reason: "malformed" };
  // crypto.subtle.verify compares in constant time.
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sigBytes as Uint8Array<ArrayBuffer>, new TextEncoder().encode(body));
  if (!valid) return { ok: false, reason: "signature" };
  let claims: PreviewTokenClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(bodyBytes)) as PreviewTokenClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof claims !== "object" || claims === null || typeof claims.exp !== "number" || typeof claims.p !== "string" || typeof claims.u !== "string") {
    return { ok: false, reason: "malformed" };
  }
  if (claims.kind !== expect.kind) return { ok: false, reason: "wrong_kind" };
  if (claims.p !== expect.previewId) return { ok: false, reason: "wrong_preview" };
  if (claims.exp <= expect.nowSeconds) return { ok: false, reason: "expired" };
  return { ok: true, claims };
}

/** Response headers from the app inside the sandbox that the gateway never passes on. */
export const STRIPPED_RESPONSE_HEADERS: readonly string[] = [
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
  "strict-transport-security",
  "x-frame-options",
  "content-security-policy",
  "content-security-policy-report-only",
  "alt-svc",
];

/** Request headers from the browser that are never forwarded into the sandbox. */
export const STRIPPED_REQUEST_HEADERS: readonly string[] = [
  "connection",
  "keep-alive",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "cookie",
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-real-ip",
  "e2b-traffic-access-token",
  "x-access-token",
];

/** Keeps the app's own cookies but never forwards the gateway cookie or anything that looks like a Farbaek or Supabase session. */
export function forwardableCookies(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  const kept = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .filter((c) => {
      const name = c.split("=")[0]?.trim() ?? "";
      return name !== PREVIEW_COOKIE && name !== PREVIEW_COOKIE_DEV && !name.startsWith("sb-") && !name.startsWith("fb_");
    });
  return kept.length ? kept.join("; ") : null;
}

/**
 * Rewrites a redirect from the app inside the sandbox. A Location on the
 * upstream host becomes a path on the preview host; relative ones pass as is;
 * a redirect to any other site is passed on unchanged, because it leaves the
 * preview the same way any website's redirect would, and never lands on
 * Farbaek's origin with Farbaek's cookies.
 */
export function rewriteLocation(location: string, upstreamOrigin: string): string {
  try {
    const target = new URL(location, upstreamOrigin);
    const upstream = new URL(upstreamOrigin);
    if (target.host === upstream.host) return `${target.pathname}${target.search}${target.hash}`;
    return target.toString();
  } catch {
    return "/";
  }
}
