/**
 * Whether a workspace is the store reviewers' own (ADR 0186), so a free test purchase made while reviewing the app
 * counts there. Its password is given to Apple's and Google's reviewers (ADR 0151), so the account alone proves
 * nothing: a workspace counts only when every member is that account. Someone holding the password could invite
 * their own account into a workspace, or accept an invitation to one, but either way it then has another member and
 * stops counting. Read with the server key; a failure counts as no.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { APP_REVIEW_ACCOUNT } from "@/config/app-review";
import { confirmedEmail } from "@/server/email/wiring";

export async function reviewAccountRuns(admin: SupabaseClient, orgId: string): Promise<boolean> {
  try {
    const { data, error } = await admin.from("organization_members").select("user_id").eq("org_id", orgId).limit(5);
    if (error) return false;
    const members = (data ?? []) as { user_id: string }[];
    if (members.length === 0) return false;
    for (const m of members) {
      if ((await confirmedEmail(admin, m.user_id))?.toLowerCase() !== APP_REVIEW_ACCOUNT) return false;
    }
    return true;
  } catch {
    return false;
  }
}
