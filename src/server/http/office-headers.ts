/**
 * Security headers for Office Space (ADR 0032). The static set is sent by
 * next.config.ts for every office response; the proxy adds the per-request
 * ones: a nonce Content-Security-Policy (office pages are always rendered
 * per request, so Next.js puts the nonce on its own scripts), no caching,
 * and a separate browsing context group. The two sets never overlap.
 */

/** Sent by next.config.ts on the office host. */
export const OFFICE_STATIC_HEADERS = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "no-referrer" },
  { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
] as const;

export function newNonce(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(18))).toString("base64");
}

/** `https` is false only for a local office on plain http, where upgrading requests would break it. */
export function officeCsp(nonce: string, dev: boolean, https = true): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // Motion and React set style attributes, which nonces can't cover.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${dev ? " ws: wss:" : ""}`,
    "frame-src 'none'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev || !https ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** The per-request headers the proxy sets on office responses. */
export function officeResponseHeaders(csp: string): Record<string, string> {
  return {
    "Content-Security-Policy": csp,
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cache-Control": "no-store, max-age=0",
  };
}

/** For next.config.ts: matches the office host, whatever OFFICE_HOST names at build time. */
export function officeHostPattern(officeHost: string | undefined): string {
  const label = (officeHost?.split(".")[0] ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "") || "officespace";
  return `${label}\\..*`;
}
