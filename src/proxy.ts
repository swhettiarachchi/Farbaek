import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SITE_ROUTE } from "@/core/publish/site";
import { decideRoute } from "@/server/http/hosts";
import { newNonce, officeCsp, officeResponseHeaders } from "@/server/http/office-headers";
import { appHostFromEnv, officeConfig } from "@/server/office/config";
import { siteDomain } from "@/server/publish/config";
import { OFFICE_OPEN_PATH, officeDeviceKnown } from "@/server/office/device-gate";
import { DEVICE_COOKIE } from "@/server/office/device-token";
import { createOfficeProxyClient } from "@/server/office/supabase";
import { readSupabaseConfig, siteUrl } from "@/server/supabase/config";

/**
 * Carries out the host decision in src/server/http/hosts.ts: the preview
 * gateway, published sites, Office Space on its own host, not found for
 * every other name, and the customer app. It also refreshes the Supabase
 * session cookie (the office's own on the office host). This is not the
 * authorization check: every page and action verifies the user itself.
 */
export async function proxy(request: NextRequest) {
  const office = officeConfig();
  const decision = decideRoute(
    {
      host: request.headers.get("host"),
      pathname: request.nextUrl.pathname,
      method: request.method,
      origin: request.headers.get("origin"),
      secFetchSite: request.headers.get("sec-fetch-site"),
      forwardedHost: request.headers.get("x-forwarded-host"),
    },
    // Previews and published sites share one domain; sites can be on without previews (SITES_DOMAIN, ADR 0045).
    { previewDomain: process.env.SANDBOX_PREVIEW_DOMAIN || process.env.SITES_DOMAIN || null, officeHost: office?.host ?? null, appHost: appHostFromEnv(), customDomains: Boolean(siteDomain()) },
  );

  switch (decision.kind) {
    // Preview hosts go to the sandbox preview gateway, whatever the path, and never touch the app's session cookies.
    case "preview":
      return rewriteTo(request, `/sandbox-preview${request.nextUrl.pathname}`);
    case "site-domain-apex":
      return NextResponse.redirect(new URL("/", siteUrl()), 308);
    // A published site (ADR 0029): its route checks the name and serves only that site's live files.
    case "site":
    // Someone's own domain (ADR 0045): the site route serves it only when it's verified, and answers 404 otherwise.
    case "custom-site":
      return rewriteTo(request, `${SITE_ROUTE}${request.nextUrl.pathname}`);
    case "not-found":
      return plain(404, "There's nothing at this address.");
    case "office-refused":
      return plain(403, "That request didn't come from Office Space, so it was refused.");
    case "office-public":
      return NextResponse.next();
    case "office":
      // Hidden from devices the office doesn't know (ADR 0072): the same answer as a name nothing uses.
      if (!OFFICE_OPEN_PATH.test(request.nextUrl.pathname) && !(await officeDeviceKnown(request.cookies.get(DEVICE_COOKIE)?.value))) {
        return plain(404, "There's nothing at this address.");
      }
      return officeRequest(request, decision.rewrite, office?.origin.startsWith("https://") ?? true);
    case "app":
      return appRequest(request);
  }
}

function rewriteTo(request: NextRequest, pathname: string) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  return NextResponse.rewrite(url);
}

function plain(status: number, body: string) {
  return new NextResponse(body, {
    status,
    headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
  });
}

/** Office Space (ADR 0032): its own session cookie, a nonce CSP, no caching, and every path under /office. */
async function officeRequest(request: NextRequest, rewrite: string, https: boolean) {
  const writes: ((response: NextResponse) => void)[] = [];
  const supabase = createOfficeProxyClient(request, (write) => writes.push(write));
  // Validates the JWT and refreshes it when needed; the new cookie reaches this render through the request below.
  if (supabase) await supabase.auth.getClaims();

  const nonce = newNonce();
  const csp = officeCsp(nonce, process.env.NODE_ENV === "development", https);
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("content-security-policy", csp);

  const url = request.nextUrl.clone();
  url.pathname = rewrite;
  const response = NextResponse.rewrite(url, { request: { headers } });
  for (const write of writes) write(response);
  for (const [key, value] of Object.entries(officeResponseHeaders(csp))) response.headers.set(key, value);
  return response;
}

async function appRequest(request: NextRequest) {
  if (!SESSION_PATH.test(request.nextUrl.pathname)) return NextResponse.next();

  const config = readSupabaseConfig();
  if (!config) return NextResponse.next({ request });

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      },
    },
  });

  // Validates the JWT and refreshes it when needed.
  await supabase.auth.getClaims();
  return response;
}

// Where the customer app's session cookie is refreshed; every other page passes straight through.
const SESSION_PATH = /^\/(?:app|admin|auth)(?:\/|$)|^\/sign-in(?:\/|$)/;

export const config = {
  matcher: [
    "/app/:path*",
    "/admin/:path*",
    "/auth/:path*",
    "/sign-in",
    // Every other page too, so other hosts can be routed or refused. Farbaek's own static files are left out.
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
    // Every path on a preview host, including /_next/... of the app inside the sandbox.
    { source: "/:path*", has: [{ type: "host", value: "p-[a-zA-Z2-7]{26}\\..*" }] },
  ],
};
