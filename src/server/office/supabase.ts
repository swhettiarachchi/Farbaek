/**
 * Supabase clients for Office Space (ADR 0032). The office keeps its
 * session in its own cookie, "__Host-fb-office": the __Host- prefix makes
 * the browser refuse it unless it's Secure, on path / and tied to this one
 * host, so no other name under farbaek.com can set or read it. It's also
 * HttpOnly (every auth call runs on the server), SameSite=Strict, and lives
 * 12 hours at most. @supabase/ssr picks its own cookie lifetime, so every
 * write goes through hardenOfficeCookie.
 */
import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { OFFICE_POLICY } from "@/config/office";
import { readSupabaseConfig } from "@/server/supabase/config";

export const OFFICE_COOKIE = "__Host-fb-office";

export function hardenOfficeCookie(options: CookieOptions = {}): CookieOptions {
  const removing = options.maxAge === 0 || (options.expires instanceof Date && options.expires.getTime() <= Date.now());
  return {
    path: "/",
    secure: true,
    httpOnly: true,
    sameSite: "strict",
    maxAge: removing ? 0 : OFFICE_POLICY.maxSessionHours * 3600,
  };
}

/** For Server Components and Server Actions on the office host. */
export async function createOfficeServerClient() {
  const config = readSupabaseConfig();
  if (!config) return null;
  const store = await cookies();
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { name: OFFICE_COOKIE, path: "/", secure: true, sameSite: "strict" },
    cookies: {
      getAll() {
        return store.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) store.set(name, value, hardenOfficeCookie(options));
        } catch {
          // Server Components can't set cookies; the proxy refreshes the session instead.
        }
      },
    },
  });
}

/** For src/proxy.ts: refreshes the office session and copies any new cookie onto the response. */
export function createOfficeProxyClient(request: NextRequest, apply: (set: (response: NextResponse) => void) => void) {
  const config = readSupabaseConfig();
  if (!config) return null;
  return createServerClient(config.url, config.publishableKey, {
    cookieOptions: { name: OFFICE_COOKIE, path: "/", secure: true, sameSite: "strict" },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        apply((response) => {
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, hardenOfficeCookie(options));
          for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
        });
      },
    },
  });
}
