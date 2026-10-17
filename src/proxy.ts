import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { readSupabaseConfig } from "@/server/supabase/config";

/**
 * Refreshes the Supabase session cookie on app and auth routes. Marketing
 * pages are excluded so they stay static. This is not the authorization
 * check: every page and action verifies the user itself.
 */
export async function proxy(request: NextRequest) {
  // Preview hosts (p-<id>.<preview domain>) go to the sandbox preview gateway,
  // whatever the path, and never touch the app's session cookies.
  if (PREVIEW_HOST.test(request.headers.get("host") ?? "")) {
    const url = request.nextUrl.clone();
    url.pathname = `/sandbox-preview${request.nextUrl.pathname}`;
    return NextResponse.rewrite(url);
  }

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

export const config = {
  matcher: [
    "/app/:path*",
    "/auth/:path*",
    "/sign-in",
    // Every path on a preview host, including /_next/... of the app inside the sandbox.
    { source: "/:path*", has: [{ type: "host", value: "p-[a-zA-Z2-7]{26}\\..*" }] },
  ],
};
