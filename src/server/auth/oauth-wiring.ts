/**
 * Apple and Google sign-in on this server (ADR 0114, ADR 0115): whether each
 * is offered right now, and the start of its flow.
 */
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readSupabaseConfig, safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { appleSignInOn } from "./apple";
import { providerReady, type OAuthProvider } from "./oauth";
import { signInKey } from "./sign-in";

/**
 * Offered only while Auth's flow really reaches the provider. Apple also needs
 * the key that revokes its tokens when an account is deleted (ADR 0113).
 */
export async function oauthAvailable(provider: OAuthProvider): Promise<boolean> {
  const config = readSupabaseConfig();
  if (!config) return false;
  if (provider === "apple" && !appleSignInOn()) return false;
  return providerReady(provider, { authUrl: config.url, publishableKey: config.publishableKey, returnTo: `${siteUrl()}/auth/callback` });
}

/**
 * Starts the provider's flow: Auth sends the browser to the provider, the
 * provider back to Auth, and Auth to /auth/callback with a one-time code this
 * browser alone can exchange (PKCE). Started by a plain link, since the
 * site's form-action policy keeps form redirects on Farbaek. Rate-limited per
 * network, as email links are, because Auth's Turnstile check doesn't cover
 * OAuth flows.
 */
export async function startOAuth(request: NextRequest, provider: OAuthProvider): Promise<NextResponse> {
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const base = siteUrl();
  const back = (error: string) => NextResponse.redirect(`${base}/sign-in?${new URLSearchParams({ error, next })}`, { status: 303 });

  if (!(await oauthAvailable(provider))) return back(`${provider}_off`);
  const admin = createSupabaseAdminClient();
  // Caddy sets X-Forwarded-For from the connection, so its first entry is the visitor's address.
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip")?.trim() || "unknown";
  if (admin) {
    // One limit across providers, so switching between them doesn't double it.
    const { data, error } = await admin.rpc("app_rate_limit", { p_key: `oauth-web:${signInKey("address", address)}`, p_window_seconds: 600, p_limit: 20 });
    if (error || data !== true) return back("limited");
  }

  const supabase = await createSupabaseServerClient();
  if (!supabase) return back(`${provider}_off`);
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: `${base}/auth/callback?${new URLSearchParams({ next, via: provider })}`, skipBrowserRedirect: true },
  });
  if (error || !data.url) return back(provider);
  return NextResponse.redirect(data.url, { status: 303, headers: { "cache-control": "no-store", "referrer-policy": "no-referrer" } });
}
