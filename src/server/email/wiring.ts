/**
 * The server's notifier (ADR 0060), or null when email is off: no
 * SMTP_PASSWORD, or no server key to look up the person's own address.
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import { readEmailConfig } from "./config";
import { createNotifier, type Notifier } from "./notify";

export function serverNotifier(): Notifier | null {
  const config = readEmailConfig();
  if (!config) return null;
  const admin = createSupabaseAdminClient();
  if (!admin) return null;
  return createNotifier({
    config,
    // Only a confirmed address: the one the person signed in with.
    async emailOf(userId) {
      const { data, error } = await admin.auth.admin.getUserById(userId);
      if (error || !data.user?.email || !data.user.email_confirmed_at) return null;
      return data.user.email;
    },
  });
}
