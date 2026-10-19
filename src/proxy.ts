import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { previewDomainHost } from "@/core/sandbox/preview";
import { readSupabaseConfig, siteUrl } from "@/server/supabase/config";

/**
 * Routes preview hosts to the preview gateway, keeps Farbaek off the rest of
 * the preview domain, and refreshes the Supabase session cookie on app and
 * auth routes only. This is not the authorization check: every page and
 * action verifies the user itself.
 */
export async function proxy(request: NextRequest) {
  // Preview hosts (p-<id>.<preview domain>) go to the sandbox preview gateway,
  // whatever the path, and never touch the app's session cookies.
  if (PREVIEW_HOST.test(request.headers.get("host") ?? "")) {
    const url = request.nextUrl.clone();
    url.pathname = `/sandbox-preview${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

  // The preview domain holds people's content, and a wildcard record sends every name under it here.
  // Only preview hosts are served there; the bare domain goes to Farbaek's own address.
  const place = previewDomainHost(request.headers.get("host"), process.env.SANDBOX_PREVIEW_DOMAIN);
  if (place === "apex") return NextResponse.redirect(new URL("/", siteUrl()), 308);
  if (place === "other") {
    return new NextResponse("There's nothing at this address.", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" },
    });
  }

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

const PREVIEW_HOST = /^p-[a-z2-7]{26}\./i;
// Where the session cookie is refreshed; every other page passes straight through.
const SESSION_PATH = /^\/(?:app|admin|auth)(?:\/|$)|^\/sign-in(?:\/|$)/;

export const config = {
  matcher: [
    "/app/:path*",
    "/admin/:path*",
    "/auth/:path*",
    "/sign-in",
    // Every other page too, so names on the preview domain can be refused. Farbaek's own static files are left out.
    "/((?!_next/static|_next/image|favicon\\.ico).*)",
    // Every path on a preview host, including /_next/... of the app inside the sandbox.
    { source: "/:path*", has: [{ type: "host", value: "p-[a-zA-Z2-7]{26}\\..*" }] },
  ],
};
