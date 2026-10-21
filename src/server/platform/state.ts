/**
 * The platform switches as this server last read them (ADR 0032). Reading
 * them is synchronous, so the existing "is AI connected?" style checks can
 * explain a pause without becoming async. The snapshot refreshes every 15
 * seconds when a page loads, and at once when Office Space changes a switch
 * on this server. If the switches can't be read, nothing shows as paused
 * here, but the database still refuses paused work: this only explains.
 */
import { FLAG_DETAILS, PLATFORM_FLAGS, type PlatformFlag } from "@/core/office/flags";
import { createSupabaseAdminClient } from "@/server/supabase/admin";

interface Snapshot {
  readAt: number;
  paused: Map<PlatformFlag, string>;
}

const TTL_MS = 15_000;
const store = globalThis as typeof globalThis & { __farbaekPlatform?: Snapshot };

/** The reason a feature is paused, or null when it isn't (or the switches haven't been read). */
export function platformPause(flag: PlatformFlag): string | null {
  return store.__farbaekPlatform?.paused.get(flag) ?? null;
}

/** Reads the switches if the snapshot is older than 15 seconds (or `force`). Never throws. */
export async function refreshPlatformState(force = false): Promise<void> {
  const current = store.__farbaekPlatform;
  if (!force && current && Date.now() - current.readAt < TTL_MS) return;
  const admin = createSupabaseAdminClient();
  if (!admin) return;
  try {
    const { data, error } = await admin.from("platform_flags").select("key, paused, public_message");
    if (error) return;
    const paused = new Map<PlatformFlag, string>();
    for (const row of (data ?? []) as { key: string; paused: boolean; public_message: string | null }[]) {
      const flag = PLATFORM_FLAGS.find((f) => f === row.key);
      if (flag && row.paused) paused.set(flag, row.public_message?.trim() || FLAG_DETAILS[flag].fallback);
    }
    store.__farbaekPlatform = { readAt: Date.now(), paused };
  } catch {
    // Keep the last snapshot; the database still enforces.
  }
}

/** After Office Space changes a switch, so this server explains it at once. */
export function notePlatformFlag(flag: PlatformFlag, paused: boolean, message: string | null): void {
  const current = store.__farbaekPlatform ?? { readAt: 0, paused: new Map<PlatformFlag, string>() };
  const next = new Map(current.paused);
  if (paused) next.set(flag, message?.trim() || FLAG_DETAILS[flag].fallback);
  else next.delete(flag);
  store.__farbaekPlatform = { readAt: current.readAt, paused: next };
}
