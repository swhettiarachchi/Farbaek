/**
 * Developer API keys on this server (stage 177, ADR 0187).
 *
 * A key acts as the person who made it, in its one workspace, through a sign-in session that never leaves this
 * server. That keeps Row Level Security in force for every call a key makes, exactly as for the person signed in.
 * The session is kept in memory per key and refreshed with its refresh token; the key itself is checked in the
 * database on every call, so a revoked or expired key, or one whose maker is no longer an owner or admin, stops at
 * once, whatever is cached.
 */
import { createHash, randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { API_KEY_PATTERN, API_KEY_PREFIX } from "@/core/workspace/api-keys";
import type { SessionAuth } from "@/server/phone/auth";
import { ORG_ROLES, type OrgRole } from "@/server/workspace/types";

export function newApiKey(): string {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function apiKeySha256(key: string): string {
  return createHash("sha256").update(key, "utf8").digest("hex");
}

export interface KeyIdentity {
  keyId: string;
  orgId: string;
  userId: string;
  role: OrgRole;
  suspended: boolean;
}

const Row = z.object({ key_id: z.string(), org_id: z.string(), user_id: z.string(), role: z.enum(ORG_ROLES), suspended: z.boolean() });

/** What a key may do now, or null when it's not a working key. */
export async function identifyKey(admin: SupabaseClient, key: string): Promise<KeyIdentity | null> {
  if (!API_KEY_PATTERN.test(key)) return null;
  const { data, error } = await admin.rpc("app_api_key_session", { p_sha256: apiKeySha256(key) });
  if (error) throw new Error(`app_api_key_session: ${error.message}`);
  const row = z.array(Row).parse(data ?? [])[0];
  return row ? { keyId: row.key_id, orgId: row.org_id, userId: row.user_id, role: row.role, suspended: row.suspended } : null;
}

interface Cached {
  userId: string;
  accessToken: string;
  refreshToken: string;
  /** Seconds since 1970, as Auth gives it. */
  expiresAt: number;
}

/** Sessions kept for keys, newest use last. Bounded, so a burst of keys can't grow it without end. */
const sessions = new Map<string, Cached>();
const MAX_CACHED = 500;
/** Use a session only while it has at least this long left. */
const MARGIN_SECONDS = 120;
/** One session at a time per key, so concurrent first calls don't each sign in. */
const inflight = new Map<string, Promise<string | null>>();

/** Signs a session out at Auth, so one that's no longer kept doesn't linger. Never throws. */
export type RetireSession = (accessToken: string) => Promise<unknown>;

function remember(keyId: string, value: Cached, retire?: RetireSession): void {
  sessions.delete(keyId);
  sessions.set(keyId, value);
  while (sessions.size > MAX_CACHED) {
    const [oldest, dropped] = sessions.entries().next().value!;
    sessions.delete(oldest);
    void retire?.(dropped.accessToken).catch(() => undefined);
  }
}

/**
 * An access token that acts as the key's maker. Null when Auth won't give one, or gives one for anyone else (an
 * address that changed between looking the person up and signing them in): that session is signed out, never used.
 */
export function accessTokenForKey(identity: KeyIdentity, auth: SessionAuth, now: () => number = () => Date.now(), retire?: RetireSession): Promise<string | null> {
  const running = inflight.get(identity.keyId);
  if (running) return running;
  const drop = (token: string) => void retire?.(token).catch(() => undefined);
  const work = (async () => {
    const cached = sessions.get(identity.keyId);
    const nowSeconds = Math.floor(now() / 1000);
    if (cached && cached.userId === identity.userId && cached.expiresAt - MARGIN_SECONDS > nowSeconds) {
      remember(identity.keyId, cached, retire);
      return cached.accessToken;
    }
    // A refresh keeps the same session at Auth; anything else replaces it, and the old one is signed out.
    const refreshed = cached && cached.userId === identity.userId ? await auth.refresh(cached.refreshToken).catch(() => null) : null;
    if (refreshed) {
      remember(identity.keyId, { userId: identity.userId, accessToken: refreshed.accessToken, refreshToken: refreshed.refreshToken, expiresAt: refreshed.expiresAt }, retire);
      return refreshed.accessToken;
    }
    sessions.delete(identity.keyId);
    if (cached) drop(cached.accessToken);
    const fresh = await auth.newSession(identity.userId).catch(() => null);
    if (!fresh) return null;
    const whose = await auth.verify(fresh.accessToken).catch(() => null);
    if (whose?.userId !== identity.userId) {
      drop(fresh.accessToken);
      return null;
    }
    remember(identity.keyId, { userId: identity.userId, accessToken: fresh.accessToken, refreshToken: fresh.refreshToken, expiresAt: fresh.expiresAt }, retire);
    return fresh.accessToken;
  })().finally(() => inflight.delete(identity.keyId));
  inflight.set(identity.keyId, work);
  return work;
}

/** For tests: forget every kept session. */
export function forgetKeySessions(): void {
  sessions.clear();
  inflight.clear();
}
