import { NextResponse, type NextRequest } from "next/server";
import { IOS_APP_CLIENT } from "@/core/billing/store-client";
import { safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * Opens a page signed in, from the one-time link the iPhone app asks for (ADR 0177). The link works once and then it's
 * gone, and only someone already signed in on the phone can get one. If it's used or too old, the person signs in as usual.
 */
export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get("token_hash") ?? "";
  const next = safeNextPath(request.nextUrl.searchParams.get("next"));
  const base = siteUrl();
  if (/^[0-9a-f]{20,128}$/i.test(tokenHash)) {
    const supabase = await createSupabaseServerClient();
    // Auth versions name this "magiclink" or "email"; a failed try doesn't use the token up.
    for (const type of ["magiclink", "email"] as const) {
      const { data } = (await supabase?.auth.verifyOtp({ token_hash: tokenHash, type })) ?? { data: null };
      if (data?.session) {
        const to = new URL(`${base}${next}`);
        to.searchParams.set("client", IOS_APP_CLIENT);
        return NextResponse.redirect(to, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
      }
    }
  }
  return NextResponse.redirect(`${base}/sign-in?${new URLSearchParams({ error: "link", next, client: IOS_APP_CLIENT })}`, { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
