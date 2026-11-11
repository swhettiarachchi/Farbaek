/**
 * The workspace's developer API keys for Settings (ADR 0187), read as the person: Row Level Security shows them to
 * owners and admins only, and no browser can read a key's hash.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApiKeyView } from "@/core/workspace/api-keys";

const Row = z.object({
  id: z.string(),
  name: z.string(),
  hint: z.string(),
  created_by: z.string(),
  created_at: z.string(),
  expires_at: z.string(),
  last_used_at: z.string().nullable(),
  revoked_at: z.string().nullable(),
});

export async function readApiKeys(user: SupabaseClient, orgId: string): Promise<ApiKeyView[] | null> {
  const { data, error } = await user
    .from("api_keys")
    .select("id, name, hint, created_by, created_at, expires_at, last_used_at, revoked_at")
    .eq("org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return null;
  return z
    .array(Row)
    .parse(data ?? [])
    .map((r) => ({ id: r.id, name: r.name, hint: r.hint, createdBy: r.created_by, createdAt: r.created_at, expiresAt: r.expires_at, lastUsedAt: r.last_used_at, revokedAt: r.revoked_at }));
}
