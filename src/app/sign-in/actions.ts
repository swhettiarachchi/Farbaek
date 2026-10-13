"use server";

import { z } from "zod";
import { siteUrl } from "@/server/supabase/config";
import { createSupabaseServerClient } from "@/server/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string; email?: string };

const Email = z.email().max(254);

export async function requestSignInLink(_previous: SignInState, form: FormData): Promise<SignInState> {
  const raw = String(form.get("email") ?? "").trim().toLowerCase();
  const parsed = Email.safeParse(raw);
  if (!parsed.success) return { status: "error", message: "Enter a valid email address.", email: raw };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { status: "error", message: "Sign-in isn't connected in this environment yet.", email: raw };

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=/app`, shouldCreateUser: true },
  });

  if (error) {
    if (error.status === 429) {
      return { status: "error", message: "Too many sign-in emails were requested. Wait a few minutes and try again.", email: raw };
    }
    return { status: "error", message: "The sign-in email couldn't be sent. Try again in a moment.", email: raw };
  }
  // Same response whether or not the account already existed.
  return { status: "sent", email: parsed.data };
}
