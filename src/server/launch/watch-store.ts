/**
 * A project's outcome watch (migration v50, ADR 0080), read as the person.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

export interface WatchView {
  state: "unknown" | "ok" | "breached";
  enabledBy: string | null;
  createdAt: string;
  breachedAt: string | null;
  lastCheckedAt: string | null;
  lastDetail: string | null;
  /** Newest first, at most 24. */
  history: { at: string; ok: boolean; detail: string | null }[];
}

const Row = z.object({
  state: z.enum(["unknown", "ok", "breached"]),
  enabled_by: z.string().nullable(),
  created_at: z.string(),
  breached_at: z.string().nullable(),
  last_checked_at: z.string().nullable(),
  last_detail: z.string().nullable(),
  history: z.array(z.object({ at: z.string(), ok: z.boolean(), detail: z.string().nullable() })).catch([]),
});

export async function readWatch(client: SupabaseClient, orgId: string, projectId: string): Promise<WatchView | null> {
  const { data, error } = await client
    .from("outcome_watches")
    .select("state, enabled_by, created_at, breached_at, last_checked_at, last_detail, history")
    .eq("org_id", orgId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw new Error(`Couldn't read the watch: ${error.message}`);
  if (!data) return null;
  const r = Row.parse(data);
  return { state: r.state, enabledBy: r.enabled_by, createdAt: r.created_at, breachedAt: r.breached_at, lastCheckedAt: r.last_checked_at, lastDetail: r.last_detail, history: r.history };
}
