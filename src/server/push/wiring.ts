/**
 * Push on this server (ADR 0079): on whenever VAPID keys can be had, which
 * they can wherever the Supabase secret is set.
 */
import { createSupabaseAdminClient } from "@/server/supabase/admin";
import type { Notifier } from "@/server/email/notify";
import { createPushNotifier, type PushDeps } from "./notifier";
import { createSupabasePushStore } from "./store";
import { vapidKeys } from "./web-push";

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
