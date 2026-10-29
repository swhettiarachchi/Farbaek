/**
 * Push on this server (ADR 0079): on whenever VAPID keys can be had, which
 * they can wherever the Supabase secret is set.
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { Notifier } from "@/server/email/notify";
import { createPushNotifier, type PushDeps } from "./notifier";
import { createSupabasePushStore } from "./store";
import { vapidKeys } from "./web-push";
import { apnsConfig } from "./apns";
import { createPhonePushNotifier } from "./phone-notifier";
import { createSupabasePhoneStore } from "@/server/phone/store";

export function serverPushDeps(): PushDeps | null {
  const keys = vapidKeys();
  const admin = createSupabaseAdminClient();
  if (!keys || !admin) return null;
  const store = createSupabasePushStore(admin);
  return { keys, devices: (u) => store.devices(u), note: (e, o) => store.note(e, o) };
}

export function serverPushNotifier(): Notifier | null {
  const deps = serverPushDeps();
  return deps ? createPushNotifier(deps) : null;
}

/** The public key browsers subscribe with, or null when push is off on this server. */
export function vapidPublicKey(): string | null {
  return vapidKeys()?.publicKey ?? null;
}

/** Notifications to connected iPhones (ADR 0110), once the owner's APNs key is set. */
export function serverPhoneNotifier(): Notifier | null {
  const config = apnsConfig();
  const admin = createSupabaseAdminClient();
  if (!config || !admin) return null;
  const store = createSupabasePhoneStore(admin);
  return createPhonePushNotifier({ config, targets: (u) => store.targets(u), note: (t, o) => store.note(t, o) });
}
