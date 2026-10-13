import { NextResponse, type NextRequest } from "next/server";
import { safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";

/** Finishes email-link sign-in (PKCE): exchanges the one-time code for a session. */
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
  return NextResponse.redirect(`${base}/sign-in?error=link`, { status: 303 });
}
