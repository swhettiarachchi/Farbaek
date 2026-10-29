import { NextResponse, type NextRequest } from "next/server";
import { appleWebAvailable } from "@/server/auth/apple-wiring";
import { signInKey } from "@/server/auth/sign-in";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";

export const dynamic = "force-dynamic";

/**
 * Starts Sign in with Apple on the website (ADR 0114): Auth sends the browser
 * to Apple, Apple back to Auth, and Auth here to /auth/callback with a
 * one-time code this browser alone can exchange (PKCE). A plain link starts
 * it, since the site's form-action policy keeps form redirects on Farbaek.
 * Rate-limited per network, as email links are.
 */
export async function GET(request: NextRequest) {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const base = siteUrl();
  const back = (error: string) => NextResponse.redirect(`${base}/sign-in?${new URLSearchParams({ error, next })}`, { status: 303 });

  if (!(await appleWebAvailable())) return back("apple_off");
  const admin = createSupabaseAdminClient();
  // Caddy sets X-Forwarded-For from the connection, so its first entry is the visitor's address.
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  if (admin) {
    const { data, error } = await admin.rpc("app_rate_limit", { p_key: `apple-web:${signInKey("address", address)}`, p_window_seconds: 600, p_limit: 20 });
    if (error || data !== true) return back("limited");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return back("apple_off");
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: { redirectTo: `${base}/auth/callback?${new URLSearchParams({ next, via: "apple" })}`, skipBrowserRedirect: true },
  });
  if (error || !data.url) return back("apple");
  return NextResponse.redirect(data.url, { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
