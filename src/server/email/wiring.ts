/**
 * The server's notifier (ADR 0060), or null when email is off: no
 * SMTP_PASSWORD, or no server key to look up the person's own address.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readEmailConfig } from "./config";
import { createNotifier, type EmailPreference, type Notifier } from "./notify";

/** Only a confirmed address: the one the person signed in with. */
export async function confirmedEmail(admin: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
  return data.user.email;
}

/** Whether the person wants this kind of email (ADR 0063). No saved choice means yes; a failed lookup means no. */
export async function wantsEmail(admin: SupabaseClient, userId: string, kind: EmailPreference): Promise<boolean> {
  const { data, error } = await admin.from("email_preferences").select("work_updates, trial_reminders").eq("user_id", userId).maybeSingle();
  if (error) return false;
  if (!data) return true;
  return (data as Record<EmailPreference, boolean>)[kind] !== false;
}

export function serverNotifier(): Notifier | null {
  const config = readEmailConfig();
  if (!config) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return createNotifier({
    config,
    emailOf: (userId) => confirmedEmail(admin, userId),
    wants: (userId, kind) => wantsEmail(admin, userId, kind),
  });
}
