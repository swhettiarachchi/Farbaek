/**
 * Push subscriptions in the database (migration v49, ADR 0079), written
 * through the service-role functions and read with the server's key to send.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { PushOutcome, PushSubscriptionKeys } from "./send";

export interface PushStore {
  save(input: { userId: string; endpoint: string; p256dh: string; auth: string; label: string }): Promise<boolean>;
  remove(input: { userId: string; endpoint: string }): Promise<boolean>;
  devices(userId: string): Promise<PushSubscriptionKeys[]>;
  note(endpoint: string, outcome: PushOutcome): Promise<void>;
}

export function createSupabasePushStore(admin: SupabaseClient): PushStore {
  return {
    async save(i) {
      const { error } = await admin.rpc("app_save_push_subscription", { p_user: i.userId, p_endpoint: i.endpoint, p_p256dh: i.p256dh, p_auth: i.auth, p_label: i.label });
      return !error;
    },
    async remove(i) {
      const { error } = await admin.rpc("app_delete_push_subscription", { p_user: i.userId, p_endpoint: i.endpoint });
      return !error;
    },
    async devices(userId) {
      const { data, error } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth").eq("user_id", userId).order("created_at", { ascending: false }).limit(10);
      if (error) throw new Error(`Couldn't read devices: ${error.message}`);
      return z.array(z.object({ endpoint: z.string(), p256dh: z.string(), auth: z.string() })).parse(data);
    },
    async note(endpoint, outcome) {
      await admin.rpc("app_note_push_result", { p_endpoint: endpoint, p_outcome: outcome });
    },
  };
}

/** The devices a person has notifications on for, read as the person: labels only. */
export async function readMyDevices(client: SupabaseClient, userId: string): Promise<{ endpoint: string; label: string; createdAt: string; lastSentAt: string | null }[]> {
  const { data, error } = await client.from("push_subscriptions").select("endpoint, label, created_at, last_sent_at").eq("user_id", userId).order("created_at", { ascending: false });
  if (error) throw new Error(`Couldn't read devices: ${error.message}`);
  return z
    .array(z.object({ endpoint: z.string(), label: z.string(), created_at: z.string(), last_sent_at: z.string().nullable() }))
    .parse(data)
    .map((d) => ({ endpoint: d.endpoint, label: d.label, createdAt: d.created_at, lastSentAt: d.last_sent_at }));
}
