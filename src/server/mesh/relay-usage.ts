/**
 * The workspace's relayed bytes today (UTC), read as the person, for the
 * share of the day's relay allowance the Mesh page shows (ADR 0094). Usage
 * is shown as a share, never in units.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { RELAY_LIMITS } from "./relay-hub";

export async function relayShareToday(client: SupabaseClient, orgId: string): Promise<number> {
  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await client.from("mesh_relay_days").select("bytes").eq("org_id", orgId).eq("day", today).maybeSingle();
  if (error) throw new Error(`Couldn't read the relay's day: ${error.message}`);
  const bytes = z.object({ bytes: z.coerce.number() }).nullable().parse(data ?? null)?.bytes ?? 0;
  return Math.min(1, bytes / RELAY_LIMITS.dailyBytes);
}
