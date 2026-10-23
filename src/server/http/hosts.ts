/**
 * Which part of Farbaek a request belongs to, decided from its Host header
 * alone (ADR 0029, ADR 0032). Pure, so every rule is tested; src/proxy.ts
 * only carries the decision out.
 *
 * - p-<id>.<preview domain>: the sandbox preview gateway.
 * - The preview domain (farbaek.si): published sites, and nothing else.
 * - The office host (officespace.farbaek.com): Office Space, the staff
 *   console. Every path maps under /office, so no customer route answers
 *   there, and writes must come from the office itself.
 * - Any other name under the app's own domain (a wildcard record sends
 *   them all here): not found. That includes the office host while the
 *   office is switched off, so it fails closed.
 * - Everything else (www, the Railway address, localhost): the customer
 *   app, where /office doesn't exist.
 */
import { previewDomainHost } from "@/core/sandbox/preview";
import { siteNameFromHost } from "@/core/publish/site";

export const PREVIEW_HOST = /^p-[a-z2-7]{26}\./i;

/** The internal path the office's pages live under. Never shown in a URL. */
export const OFFICE_PREFIX = "/office";

/** Files in /public the office pages load from their own host. */
const OFFICE_PUBLIC = /^\/(?:brand\/[\w.-]+|robots\.txt)$/;

export type RouteDecision =
  | { kind: "preview" }
  | { kind: "site-domain-apex" }
  | { kind: "site" }
  | { kind: "custom-site" }
  | { kind: "not-found" }
  | { kind: "office"; rewrite: string }
  | { kind: "office-public" }
  | { kind: "office-refused" }
  | { kind: "app" };

export interface RouteInput {
  host: string | null;
  pathname: string;
  method: string;
  origin: string | null;
  secFetchSite: string | null;
}

export interface RouteEnv {
  /** The published-sites domain (SANDBOX_PREVIEW_DOMAIN), if set. */
  previewDomain?: string | null;
  /** The office host with any port (OFFICE_HOST), or null when the office is off. */
  officeHost: string | null;
  /** The customer app's host with any port, from NEXT_PUBLIC_SITE_URL. */
  appHost: string | null;
  /**
   * Whether other names may be people's own domains for published sites
   * (ADR 0045). On when the site domain is set; the site route then serves
   * a name only if it's a verified domain, and answers 404 otherwise.
   */
  customDomains?: boolean;
}

/** Lower case, no trailing dot; the port stays. */
export function normalizeHost(host: string | null | undefined): string {
  return (host ?? "").trim().toLowerCase().replace(/\.(?=:\d+$|$)/, "");
}

function hostname(host: string): string {
  return host.replace(/:\d+$/, "");
}

/** The registrable zone under the app's host ("farbaek.com" for "www.farbaek.com"), or null for localhost and IPs. */
export function appZone(appHost: string | null): string | null {
  if (!appHost) return null;
  const name = hostname(normalizeHost(appHost));
  if (name === "localhost" || /^[\d.]+$/.test(name) || name.includes(":")) return null;
  const labels = name.split(".");
  return labels.length >= 3 ? labels.slice(1).join(".") : name;
}

/** localhost, *.localhost, and IPv4 or IPv6 addresses: never a custom domain. */
function isLocalOrAddress(name: string): boolean {
  return name === "localhost" || name.endsWith(".localhost") || /^[\d.]+$/.test(name) || name.includes(":") || name.startsWith("[") || !name.includes(".");
}

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** A write to the office must come from a page on the office itself. */
export function officeWriteAllowed(input: Pick<RouteInput, "method" | "origin" | "secFetchSite">, officeOrigin: string): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return true;
  if (input.origin) return input.origin === officeOrigin;
  return input.secFetchSite === "same-origin";
}

export function originOf(host: string): string {
  const name = hostname(host);
  const local = name === "localhost" || name.endsWith(".localhost");
  return `${local ? "http" : "https"}://${host}`;
}

export function decideRoute(input: RouteInput, env: RouteEnv): RouteDecision {
  const host = normalizeHost(input.host);
  const path = input.pathname || "/";

  if (PREVIEW_HOST.test(host)) return { kind: "preview" };

  const place = previewDomainHost(host, env.previewDomain ?? undefined);
  if (place === "apex") return { kind: "site-domain-apex" };
  if (place === "other") return siteNameFromHost(host, env.previewDomain ?? null) ? { kind: "site" } : { kind: "not-found" };

  const office = env.officeHost ? normalizeHost(env.officeHost) : null;
  const app = env.appHost ? normalizeHost(env.appHost) : null;
  if (office && office !== app && host === office) {
    if (!officeWriteAllowed(input, originOf(office))) return { kind: "office-refused" };
    if (OFFICE_PUBLIC.test(path)) return { kind: "office-public" };
    return { kind: "office", rewrite: `${OFFICE_PREFIX}${path === "/" ? "" : path}` || OFFICE_PREFIX };
  }

  // The office's pages exist only behind the office host.
  if (path === OFFICE_PREFIX || path.startsWith(`${OFFICE_PREFIX}/`)) return { kind: "not-found" };

  // A wildcard record sends every name under the app's domain here; only the app's own host is the app.
  const zone = appZone(app);
  if (zone && app && host !== app) {
    const name = hostname(host);
    if (name === zone || name.endsWith(`.${zone}`)) return { kind: "not-found" };
  }
  // Any other real name, once sites are connected, can only be someone's own domain for a site.
  if (env.customDomains && app && host !== app && !isLocalOrAddress(hostname(host))) return { kind: "custom-site" };
  return { kind: "app" };
}
