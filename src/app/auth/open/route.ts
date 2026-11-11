import { NextResponse, type NextRequest } from "next/server";
import { IOS_APP_CLIENT } from "@/core/billing/store-client";
import { safeNextPath, siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";
import { WORKSPACE_COOKIE } from "@/server/workspace/context";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Opens a page signed in, from the one-time link the iPhone app asks for (ADR 0177). The link works once and then it's
 * gone, and only someone already signed in on the phone can get one. If it's used or too old, the person signs in as usual.
 *
 * Pages for the app's in-app browser carry the mark that keeps purchases off them. A link to pay on the website, which
 * the app opens in Safari where Apple allows it (`client=web`, ADR 0186), doesn't, and names the workspace to open (`ws`).
 * The workspace is only a preference: the website opens it only if the person belongs to it.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const tokenHash = params.get("token_hash") ?? "";
  const next = safeNextPath(params.get("next"));
  const toWeb = params.get("client") === "web";
  const ws = params.get("ws") ?? "";
  const base = siteUrl();
  const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
  if (/^[0-9a-f]{20,128}$/i.test(tokenHash)) {
    const supabase = await createSupabaseServerClient();
    // Auth versions name this "magiclink" or "email"; a failed try doesn't use the token up.
    for (const type of ["magiclink", "email"] as const) {
      const { data } = (await supabase?.auth.verifyOtp({ token_hash: tokenHash, type })) ?? { data: null };
      if (data?.session) {
        const to = new URL(`${base}${next}`);
        if (!toWeb) to.searchParams.set("client", IOS_APP_CLIENT);
        const response = NextResponse.redirect(to, { status: 303, headers });
        if (UUID.test(ws)) {
          response.cookies.set(WORKSPACE_COOKIE, ws.toLowerCase(), { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 365 });
        }
        return response;
      }
    }
  }
  const signIn = new URLSearchParams({ error: "link", next });
  if (!toWeb) signIn.set("client", IOS_APP_CLIENT);
  return NextResponse.redirect(`${base}/sign-in?${signIn}`, { status: 303, headers });
}
