"use server";

import { redirect } from "next/navigation";
import { CHALLENGE_PATTERN, STATE_PATTERN, isPhonePlatform } from "@/server/phone/tokens";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * "Use another account" on the connect page: signs this browser out of
 * Farbaek and returns to sign-in, which comes back to the same phone request.
 * The app's sign-in sheet shares the browser's sign-in, so without this a
 * phone that signed out would reconnect as the last account, with no way to
 * pick another. The return address is rebuilt from checked fields, never
 * taken from the form.
 */
export async function switchAccountAction(form: FormData): Promise<void> {
  const challenge = String(form.get("challenge") ?? "");
  const state = String(form.get("state") ?? "");
  const platform = String(form.get("platform") ?? "");
  const device = String(form.get("device") ?? "").slice(0, 80);
  const supabase = await createSupabaseServerClient();
  if (supabase) await supabase.auth.signOut();
  if (!CHALLENGE_PATTERN.test(challenge) || !STATE_PATTERN.test(state) || !isPhonePlatform(platform)) redirect("/sign-in");
  const back = `/auth/connect?${new URLSearchParams({ challenge, state, platform, ...(device ? { device } : {}) })}`;
  redirect(`/sign-in?next=${encodeURIComponent(back)}`);
}
