/**
 * Connected phones in the database (migration v70, ADR 0110): written only
 * through the service-role functions, read with the server's key to check a
 * phone and to send its notifications, and read as the person in Settings.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ApnsEnvironment } from "@/server/push/apns";
import type { PushOutcome } from "@/server/push/send";
import type { PhoneStore } from "./auth";
import { PHONE_PLATFORMS } from "./tokens";

export interface PhonePushStore {
  targets(userId: string): Promise<{ token: string; environment: ApnsEnvironment }[]>;
  note(token: string, outcome: PushOutcome): Promise<void>;
}

const Platform = z.enum(PHONE_PLATFORMS);

export function createSupabasePhoneStore(admin: SupabaseClient): PhoneStore & PhonePushStore {
  return {
    async createCode(i) {
      const { error } = await admin.rpc("app_phone_code_create", { p_user: i.userId, p_code_hash: i.codeHash, p_challenge: i.challenge, p_platform: i.platform, p_device_name: i.deviceName });
      if (error?.message.includes("TOO_MANY_CODES")) return "too_many";
      if (error) throw new Error(`Couldn't save the sign-in code: ${error.message}`);
      return "ok";
    },
    async redeemCode(codeHash, challenge) {
      const { data, error } = await admin.rpc("app_phone_code_redeem", { p_code_hash: codeHash, p_challenge: challenge });
      if (error) throw new Error(`Couldn't redeem the sign-in code: ${error.message}`);
      const row = z.array(z.object({ user_id: z.string(), platform: Platform, device_name: z.string() })).parse(data ?? [])[0];
      return row ? { userId: row.user_id, platform: row.platform, deviceName: row.device_name } : null;
    },
    async register(i) {
      const { data, error } = await admin.rpc("app_phone_register", { p_user: i.userId, p_session: i.sessionId, p_platform: i.platform, p_name: i.name, p_app_version: i.appVersion });
      if (error) throw new Error(`Couldn't record the phone: ${error.message}`);
      return z.string().parse(data);
    },
    async seen(sessionId) {
      if (!z.uuid().safeParse(sessionId).success) return null;
      const { data, error } = await admin.rpc("app_phone_seen", { p_session: sessionId });
      if (error) throw new Error(`Couldn't check the phone: ${error.message}`);
      const row = z.array(z.object({ device_id: z.string(), user_id: z.string(), platform: Platform, push: z.boolean() })).parse(data ?? [])[0];
      return row ? { deviceId: row.device_id, userId: row.user_id, platform: row.platform, push: row.push } : null;
    },
    async revoke(userId, deviceId) {
      const { data, error } = await admin.rpc("app_phone_revoke", { p_user: userId, p_device: deviceId });
      if (error) throw new Error(`Couldn't disconnect the phone: ${error.message}`);
      return data === true ? "signed_out" : data === false ? "refused" : "not_found";
    },
    async setPush(sessionId, token, environment) {
      const { data, error } = await admin.rpc("app_phone_set_push", { p_session: sessionId, p_token: token, p_environment: environment });
      if (error) throw new Error(`Couldn't save the phone's notifications: ${error.message}`);
      return data === true;
    },
    async rateLimit(key, windowSeconds, limit) {
      const { data, error } = await admin.rpc("app_rate_limit", { p_key: key, p_window_seconds: windowSeconds, p_limit: limit });
      // Fail closed: if the counter can't be read, the request is refused.
      return !error && data === true;
    },
    async targets(userId) {
      const { data, error } = await admin.from("phone_devices").select("push_token, push_environment").eq("user_id", userId).is("revoked_at", null).not("push_token", "is", null).limit(10);
      if (error) throw new Error(`Couldn't read the phones: ${error.message}`);
      return z
        .array(z.object({ push_token: z.string(), push_environment: z.enum(["production", "development"]) }))
        .parse(data ?? [])
        .map((r) => ({ token: r.push_token, environment: r.push_environment }));
    },
    async note(token, outcome) {
      await admin.rpc("app_phone_note_push", { p_token: token, p_outcome: outcome });
    },
  };
}

export interface PhoneListItem {
  id: string;
  name: string;
  platform: "ios" | "android";
  appVersion: string | null;
  createdAt: string;
  lastSeenAt: string;
}

/** The person's connected phones, read as the person: names and times only. */
export async function readMyPhones(client: SupabaseClient, userId: string): Promise<PhoneListItem[]> {
  const { data, error } = await client
    .from("phone_devices")
    .select("id, name, platform, app_version, created_at, last_seen_at")
    .eq("user_id", userId)
    .is("revoked_at", null)
    .order("last_seen_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Couldn't read your phones: ${error.message}`);
  return z
    .array(z.object({ id: z.string(), name: z.string(), platform: Platform, app_version: z.string().nullable(), created_at: z.string(), last_seen_at: z.string() }))
    .parse(data ?? [])
    .map((r) => ({ id: r.id, name: r.name, platform: r.platform, appVersion: r.app_version, createdAt: r.created_at, lastSeenAt: r.last_seen_at }));
}
