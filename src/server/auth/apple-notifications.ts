/**
 * Apple's server-to-server notifications for Sign in with Apple (ADR 0114).
 * Apple posts a JSON Web Token signed with one of its published RS256 keys
 * (appleid.apple.com/auth/keys). Its "events" claim says what happened:
 *
 * - consent-revoked: the person removed Farbaek from their Apple Account's
 *   Sign in with Apple list;
 * - account-delete: they deleted their Apple Account;
 * - email-disabled / email-enabled: they turned Hide My Email forwarding to
 *   Farbaek off or on.
 *
 * The first two sign the person out everywhere (migration v73). Nothing in a
 * notification counts before its signature, issuer, audience and age are
 * checked.
 */
import { createPublicKey, verify as verifySignature, type JsonWebKey, type KeyObject } from "node:crypto";
import { IOS_APP } from "@/config/ios-app";
import { APPLE_ID_HOST, APPLE_SERVICES_ID } from "./apple";

export class AppleIdTokenError extends Error {}

export interface AppleIdKeys {
  /** The public key Apple published under this id, or null when there's none. */
  key(kid: string): Promise<KeyObject | null>;
}

const AUDIENCES = new Set([IOS_APP.bundleId, APPLE_SERVICES_ID]);
const MAX_AGE_SECONDS = 7 * 24 * 3600;
const SEGMENT = /^[A-Za-z0-9_-]+$/;

function decodeJson(segment: string): Record<string, unknown> {
  const value = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AppleIdTokenError("not an object");
  return value as Record<string, unknown>;
}

/** The token's claims once Apple's signature, issuer, audience and dates check out. */
export async function verifyAppleIdToken(token: unknown, keys: AppleIdKeys, now: Date): Promise<Record<string, unknown>> {
  if (typeof token !== "string" || token.length > 8192) throw new AppleIdTokenError("no token");
  const parts = token.split(".");
  if (parts.length !== 3 || !parts.every((p) => SEGMENT.test(p))) throw new AppleIdTokenError("malformed");
  const [head, body, signature] = parts as [string, string, string];
  let header: Record<string, unknown>;
  let claims: Record<string, unknown>;
  try {
    header = decodeJson(head);
    claims = decodeJson(body);
  } catch {
    throw new AppleIdTokenError("unreadable");
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string") throw new AppleIdTokenError("unexpected algorithm");
  const key = await keys.key(header.kid);
  if (!key) throw new AppleIdTokenError("unknown key");
  if (!verifySignature("RSA-SHA256", Buffer.from(`${head}.${body}`), key, Buffer.from(signature, "base64url"))) throw new AppleIdTokenError("bad signature");

  const seconds = now.getTime() / 1000;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== APPLE_ID_HOST) throw new AppleIdTokenError("wrong issuer");
  if (!audiences.some((a) => typeof a === "string" && AUDIENCES.has(a))) throw new AppleIdTokenError("wrong audience");
  if (typeof claims.iat !== "number" || claims.iat > seconds + 300 || claims.iat < seconds - MAX_AGE_SECONDS) throw new AppleIdTokenError("out of date");
  if (typeof claims.exp === "number" && claims.exp < seconds - 300) throw new AppleIdTokenError("expired");
  return claims;
}

export interface AppleIdEvent {
  type: "consent-revoked" | "account-delete" | "email-disabled" | "email-enabled";
  sub: string;
}

const EVENT_TYPES = new Set<AppleIdEvent["type"]>(["consent-revoked", "account-delete", "email-disabled", "email-enabled"]);
const SUB = /^[A-Za-z0-9._-]{1,255}$/;

/** The event in a notification's claims. Apple sends it as a JSON string; an object is read too. */
export function appleIdEvent(claims: Record<string, unknown>): AppleIdEvent | null {
  let events: unknown = claims.events;
  if (typeof events === "string") {
    try {
      events = JSON.parse(events);
    } catch {
      return null;
    }
  }
  if (!events || typeof events !== "object") return null;
  const { type, sub } = events as { type?: unknown; sub?: unknown };
  if (typeof type !== "string" || !EVENT_TYPES.has(type as AppleIdEvent["type"]) || typeof sub !== "string" || !SUB.test(sub)) return null;
  return { type: type as AppleIdEvent["type"], sub };
}

export interface AppleIdNotificationDeps {
  keys: AppleIdKeys;
  /** Signs the person with this Apple id out everywhere; their user id, or null when no account has it. */
  ended(sub: string): Promise<string | null>;
  now(): Date;
}

/** 200 when the notification is handled or needs nothing; 400 when it isn't Apple's. */
export async function receiveAppleIdNotification(deps: AppleIdNotificationDeps, body: unknown): Promise<{ status: number; outcome: string }> {
  const payload = body && typeof body === "object" ? (body as { payload?: unknown }).payload : undefined;
  let claims: Record<string, unknown>;
  try {
    claims = await verifyAppleIdToken(payload, deps.keys, deps.now());
  } catch (e) {
    if (e instanceof AppleIdTokenError) return { status: 400, outcome: "unsigned" };
    throw e;
  }
  const event = appleIdEvent(claims);
  if (!event) return { status: 200, outcome: "unknown_event" };
  if (event.type === "email-disabled" || event.type === "email-enabled") return { status: 200, outcome: event.type };
  const user = await deps.ended(event.sub);
  return { status: 200, outcome: user ? "signed_out" : "no_account" };
}

/** Apple's published keys, read once an hour, and again when a token names a key not seen yet. */
export function appleIdKeys(fetcher: (url: string, init: RequestInit) => Promise<Response> = fetch): AppleIdKeys {
  let cached: { at: number; keys: Map<string, KeyObject> } | null = null;
  async function load(): Promise<Map<string, KeyObject>> {
    const r = await fetcher(`${APPLE_ID_HOST}/auth/keys`, { signal: AbortSignal.timeout(8_000), redirect: "error" });
    if (!r.ok) throw new Error(`Apple's keys: HTTP ${r.status}`);
    const body = (await r.json()) as { keys?: unknown };
    const keys = new Map<string, KeyObject>();
    for (const k of Array.isArray(body.keys) ? body.keys : []) {
      const jwk = k as JsonWebKey & { kid?: unknown };
      if (jwk.kty !== "RSA" || typeof jwk.kid !== "string") continue;
      keys.set(jwk.kid, createPublicKey({ key: jwk, format: "jwk" }));
    }
    cached = { at: Date.now(), keys };
    return keys;
  }
  return {
    async key(kid) {
      const fresh = cached && Date.now() - cached.at < 3_600_000 ? cached.keys : await load();
      if (fresh.has(kid)) return fresh.get(kid)!;
      // A key Apple added since the last read; at most one extra read a minute.
      if (cached && Date.now() - cached.at > 60_000) return (await load()).get(kid) ?? null;
      return null;
    },
  };
}
