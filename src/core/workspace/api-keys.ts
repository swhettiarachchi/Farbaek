/**
 * Developer API keys (stage 177, ADR 0187): what a key looks like and what
 * people can choose. A key is "fbk_" plus 32 random bytes in base64url, made
 * on the server; Farbaek keeps only its SHA-256 and shows it once.
 */

export const API_KEY_PREFIX = "fbk_";

/** A whole key: the prefix and 43 base64url characters (256 bits). */
export const API_KEY_PATTERN = /^fbk_[A-Za-z0-9_-]{43}$/;

/** How long a new key works, in days. There's no key that never ends. */
export const API_KEY_DAYS = [30, 90, 365] as const;
export type ApiKeyDays = (typeof API_KEY_DAYS)[number];
export const DEFAULT_API_KEY_DAYS: ApiKeyDays = 90;

/** What a plan without the developer API is told. */
export const API_NOT_IN_PLAN = "The developer API comes with the Lite plan and up.";

/** At most this many working keys in a workspace (the database holds the line). */
export const MAX_API_KEYS = 10;

/** The part of a key that's shown again later, so people can tell keys apart: "fbk_" and four characters. */
export function apiKeyHint(key: string): string {
  return key.slice(0, API_KEY_PREFIX.length + 4);
}

/** Whether a bearer token is meant to be an API key, rather than a sign-in session. */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

export interface ApiKeyView {
  id: string;
  name: string;
  hint: string;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

export type ApiKeyState = "working" | "expired" | "revoked";

export function apiKeyState(key: Pick<ApiKeyView, "expiresAt" | "revokedAt">, now: Date): ApiKeyState {
  if (key.revokedAt) return "revoked";
  return Date.parse(key.expiresAt) <= now.getTime() ? "expired" : "working";
}
