/**
 * A nonce Content-Security-Policy for the signed-in app (ADR 0107), sent as
 * report-only first: browsers report what it would block, to
 * /api/csp-report, and block nothing. Once production reports are clean,
 * APP_CSP_ENFORCE=1 sends the same policy as Content-Security-Policy.
 *
 * App pages are rendered per request, so Next.js puts the nonce on its own
 * scripts. Scripts are strict ('strict-dynamic' from a nonce); images, fonts,
 * styles and media stay open to https, because previews of people's own
 * sites (srcdoc frames) inherit this policy. The browser talks only to
 * Farbaek itself; app previews load from the preview domain.
 */

export const CSP_REPORT_PATH = "/api/csp-report";

/** Cloudflare Turnstile, which only the sign-in pages load (ADR 0067). */
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";

/**
 * The hash of the site layout's one inline script (`earlyMarkScript`, ADR 0171). That layout is static, so it can't carry a
 * nonce, and this lets exactly that text run on the sign-in pages. A test fails if the script changes without this.
 */
export const EARLY_MARK_SHA256 = "L3Nsn+QgUfcxU3eUyZIB4K+MFlBfOWKhS0c3yicwqAs=";

export function appCsp(nonce: string, opts: { dev: boolean; https: boolean; previewDomain: string | null; signIn?: boolean }): string {
  const preview = opts.previewDomain ? ` https://*.${opts.previewDomain}` : "";
  const turnstile = opts.signIn ? ` ${TURNSTILE_ORIGIN}` : "";
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${opts.signIn ? ` 'sha256-${EARLY_MARK_SHA256}'` : ""}${opts.dev ? " 'unsafe-eval'" : ""}`,
    // Motion and React set style attributes, which nonces can't cover; previews of people's sites bring their own styles.
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "media-src 'self' data: blob: https:",
    `connect-src 'self'${turnstile}${opts.dev ? " ws: wss:" : ""}`,
    `frame-src 'self'${preview}${turnstile}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // report-uri, not report-to: every browser sends it straight away, and Chrome ignores report-uri when report-to is there.
    `report-uri ${CSP_REPORT_PATH}`,
    ...(opts.dev || !opts.https ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

/** The nonce in a policy, for the rare inline script of our own that has to run before the page paints. */
export function nonceFromCsp(csp: string | null): string | undefined {
  return csp?.match(/'nonce-([^']+)'/)?.[1];
}

/** The response header: enforced, or report-only when enforcing is switched off. */
export function appCspHeaders(csp: string, enforce: boolean): Record<string, string> {
  return { [enforce ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only"]: csp };
}

/**
 * Whether the app's policy is enforced (ADR 0169). It is, by default, since previews moved to
 * their own frame document; `APP_CSP_ENFORCE=0` sends it report-only again, for an incident.
 */
export function appCspEnforced(setting: string | undefined): boolean {
  return setting?.trim() !== "0";
}

/** The app's pages, where the policy applies. */
export const APP_CSP_PATH = /^\/(?:app|admin|shared)(?:\/|$)/;

/**
 * Pages where people sign in or consent, which render per request so they can carry a nonce too (ADR 0175). Report-only for now,
 * because a mistake here would stop anyone signing in.
 */
export const SIGN_IN_CSP_PATH = /^\/(?:sign-in|auth\/connect|invite)(?:\/|$)/;

export interface CspViolation {
  directive: string;
  blocked: string;
  page: string;
  disposition: string;
}

const short = (s: unknown, n = 200) => (typeof s === "string" ? s.slice(0, n) : "");

/** Where a URL points, without its path or query, so a report never carries a token or a person's data. */
function originOnly(value: string): string {
  if (!value) return "";
  if (/^(inline|eval|wasm-eval|data|blob|self|trusted-types-[a-z-]+)$/i.test(value)) return value;
  try {
    const u = new URL(value);
    return u.origin === "null" ? u.protocol : u.origin;
  } catch {
    return value.slice(0, 40);
  }
}

function pathOnly(value: string): string {
  try {
    return new URL(value).pathname.slice(0, 120);
  } catch {
    return "";
  }
}

/**
 * Reads a report body in either format (application/csp-report from
 * report-uri, application/reports+json from report-to). At most 20
 * violations; anything else is ignored.
 */
export function parseCspReports(body: unknown): CspViolation[] {
  const out: CspViolation[] = [];
  const push = (r: Record<string, unknown>) => {
    const directive = short(r["effective-directive"] ?? r.effectiveDirective ?? r["violated-directive"] ?? r.violatedDirective, 80);
    if (!directive) return;
    out.push({
      directive,
      blocked: originOnly(short(r["blocked-uri"] ?? r.blockedURL ?? r.blockedUri, 500)),
      // A preview of someone's site (a srcdoc frame) has no address of its own.
      page: pathOnly(short(r["document-uri"] ?? r.documentURL ?? r.documentUri, 500)) || "(a preview frame)",
      disposition: short(r.disposition, 20) || "report",
    });
  };
  if (Array.isArray(body)) {
    for (const item of body.slice(0, 20)) {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "csp-violation") {
        const b = (item as { body?: unknown }).body;
        if (b && typeof b === "object") push(b as Record<string, unknown>);
      }
    }
  } else if (body && typeof body === "object") {
    const r = (body as { "csp-report"?: unknown })["csp-report"];
    if (r && typeof r === "object") push(r as Record<string, unknown>);
  }
  return out;
}
