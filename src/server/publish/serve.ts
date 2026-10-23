/**
 * Serving published sites (ADR 0029): `<name>.<site domain>` answers with
 * the live deployment's files, exactly the stored revisions that were
 * published. Only on the site domain, never on Farbaek's own: people's HTML
 * must not share an origin with Farbaek. Reads only, no cookies, nothing
 * forwarded.
 */
import { DEPLOYMENT_HEADER } from "@/core/launch/health";
import { SITE_ROUTE, siteNameFromHost, type PublishedFile } from "@/core/publish/site";
import { contentTypeFor, staticCandidates } from "@/server/sandbox/gateway";

export { SITE_ROUTE, siteNameFromHost };

export type ServedSite = { state: "live"; deploymentId: string; projectId: string; files: PublishedFile[] } | { state: "none" | "blocked" | "paused" | "suspended" };

export interface SiteServeDeps {
  domain: string | null;
  /** What the name is doing right now (ADR 0029; blocked, paused and suspended from ADR 0032). */
  liveSite: (name: string) => Promise<ServedSite>;
  content: (projectId: string, path: string, revision: number) => Promise<string | null>;
  /** The site a verified custom domain belongs to (ADR 0045), or null. */
  nameForDomain?: (hostname: string) => Promise<string | null>;
}

const BASE_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
};

function page(status: number, title: string, body: string): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${title}</title><style>body{font:16px/1.6 system-ui,sans-serif;margin:0;display:grid;place-items:center;min-height:100vh;color:#15171c;background:#fafafa}main{max-width:32rem;padding:24px}h1{font-size:22px;margin:0 0 8px}p{margin:0;color:#4d5360}</style></head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`;
  return new Response(html, { status, headers: { ...BASE_HEADERS, "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

const notFound = (title: string, body: string) => page(404, title, body);

export async function handleSiteRequest(request: Request, deps: SiteServeDeps): Promise<Response> {
  const host = request.headers.get("host");
  // A name on the site domain, or else a custom domain someone verified for a site.
  const hostname = (host ?? "").trim().toLowerCase().replace(/:\d+$/, "").replace(/\.$/, "");
  const name = siteNameFromHost(host, deps.domain) ?? (deps.nameForDomain && hostname ? await deps.nameForDomain(hostname) : null);
  if (!name) return new Response("Not found", { status: 404, headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return new Response("Published sites are read-only.", { status: 405, headers: { ...BASE_HEADERS, allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" } });
  }

  const site = await deps.liveSite(name);
  // Visitors see a neutral page; the site's owner sees why on their project page.
  if (site.state === "blocked") return page(403, "This site isn't available", "It has been taken offline.");
  if (site.state === "paused" || site.state === "suspended") return page(503, "This site is temporarily unavailable", "Please check back later.");
  if (site.state !== "live") return notFound("There's no site here", "Nothing is published at this address right now.");

  const url = new URL(request.url);
  // src/proxy.ts rewrites site hosts to this route; the original path follows the prefix.
  const path = url.pathname.startsWith(SITE_ROUTE) ? url.pathname.slice(SITE_ROUTE.length) || "/" : url.pathname;
  const byPath = new Map(site.files.map((f) => [f.path, f]));
  for (const candidate of staticCandidates(path)) {
    // Hidden folders (.farbaek/skills, .claude and the like) hold the project's own notes, not the site; .well-known is public by design.
    if (candidate.split("/").some((seg) => seg.startsWith(".") && seg !== ".well-known")) continue;
    const file = byPath.get(candidate);
    if (!file) continue;
    const etag = `"${file.sha256}"`;
    // The deployment id lets Farbaek's live check confirm exactly which version is answering (ADR 0033). It isn't a secret.
    const headers = { ...BASE_HEADERS, "content-type": contentTypeFor(candidate), "cache-control": "public, max-age=30, must-revalidate", etag, [DEPLOYMENT_HEADER]: site.deploymentId };
    if (request.headers.get("if-none-match") === etag) return new Response(null, { status: 304, headers });
    const content = await deps.content(site.projectId, file.path, file.revision);
    if (content === null) continue;
    return new Response(method === "HEAD" ? null : content, { status: 200, headers });
  }
  return notFound("Page not found", "This site has no page at this address.");
}
