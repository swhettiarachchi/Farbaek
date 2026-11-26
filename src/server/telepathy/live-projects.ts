import "server-only";
import { createSupabaseServerClient } from "@/server/supabase/server";

/**
 * The projects of a workspace that have a live site (stage 283, ADR 0291), read as the signed-in person. Null when that couldn't
 * be read: a page then says nothing about publishing either way, rather than suggest publishing a site that is already live.
 */
export async function loadLiveProjects(orgId: string): Promise<string[] | null> {
  try {
    const client = await createSupabaseServerClient();
    if (!client) return null;
    const { data, error } = await client.from("sites").select("project_id").eq("org_id", orgId).not("live_deployment_id", "is", null).is("blocked_at", null).limit(500);
    if (error || !Array.isArray(data)) return null;
    return [...new Set(data.map((row) => (row as { project_id?: unknown }).project_id).filter((id): id is string => typeof id === "string"))];
  } catch {
    return null;
  }
}
