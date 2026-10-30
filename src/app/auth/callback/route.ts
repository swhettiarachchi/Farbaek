import { NextResponse, type NextRequest } from "next/server";
import { isOAuthProvider } from "@/server/auth/oauth";
import { safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Finishes sign-in (PKCE): exchanges the one-time code from an email link, or
 * from signing in with Apple or Google (ADR 0114, ADR 0115; marked via=) for
 * a session.
 */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const base = siteUrl();

  if (code) {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error) return NextResponse.redirect(`${base}${next}`, { status: 303 });
    }
  }
  const via = request.nextUrl.searchParams.get("via");
  return NextResponse.redirect(`${base}/sign-in?${new URLSearchParams({ error: isOAuthProvider(via) ? via : "link", next })}`, { status: 303 });
}
