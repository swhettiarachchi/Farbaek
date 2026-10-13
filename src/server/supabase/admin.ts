import { createClient } from "@supabase/supabase-js";
import { readSupabaseConfig } from "./config";

/**
 * Server-only Supabase client with the secret key. It bypasses Row Level
 * Security, so it is used only to call the app_* write functions after the
 * server has authenticated the user and run the TypeScript rules.
 *
 * Never import this from a "use client" file. The key has no NEXT_PUBLIC_
 * prefix, so Next.js never sends it to the browser.
 */
export function createSupabaseAdminClient() {
  const config = readSupabaseConfig();
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!config || !secret || secret.length < 20) return null;
  return createClient(config.url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

export function hasServerWriteKey(): boolean {
  const secret = process.env.SUPABASE_SECRET_KEY;
  return Boolean(secret && secret.length >= 20);
}
