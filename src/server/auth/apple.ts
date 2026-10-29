/**
 * Sign in with Apple (ADR 0113). Supabase Auth checks Apple's identity token
 * itself (signature, audience com.farbaek.app, and the nonce's SHA-256), so
 * this file holds only what Auth doesn't do: Apple's REST API, which needs a
 * client secret signed with the owner's Sign in with Apple key.
 *
 * - At sign-in, the app's one-time authorization code is exchanged for
 *   Apple's refresh token, kept server-side (migration v72).
 * - When the account is deleted, that token is revoked, as Apple requires of
 *   apps that offer Sign in with Apple, so the Apple ID's link to Farbaek
 *   ends too.
 *
 * Only Apple's own host is called. Off until APPLE_SIGN_IN=on and the key is
 * set (scripts/vps/set-apple-sign-in.ps1); the app shows the button only then.
 *
 * The website (ADR 0114) signs in through Auth's own Apple flow, under the
 * Services ID below. Auth needs a client secret for it that Apple lets live
 * at most six months, so the server makes a 180-day one here and
 * scripts/vps/apple-web-secret.sh renews it well before it ends.
 */
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { IOS_APP } from "@/config/ios-app";

export const APPLE_ID_HOST = "https://appleid.apple.com";
/** The website's Services ID. Auth's web flow uses the first id in GOTRUE_EXTERNAL_APPLE_CLIENT_ID, so it goes first there. */
export const APPLE_SERVICES_ID = "com.farbaek.web";
/** Apple's longest allowed client secret is 15,777,000 seconds; Auth's lasts 180 days. */
export const APPLE_WEB_SECRET_SECONDS = 180 * 86_400;

export interface AppleSignInKey {
  key: KeyObject;
  keyId: string;
  teamId: string;
  clientId: string;
}

/** The owner's Sign in with Apple key from the environment, or null while it isn't set. */
export function appleSignInKey(env: Record<string, string | undefined> = process.env): AppleSignInKey | null {
  const keyId = env.APPLE_SIGN_IN_KEY_ID?.trim() ?? "";
  const raw = env.APPLE_SIGN_IN_KEY_P8?.trim() ?? "";
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !raw) return null;
  // Pasted as the file, with escaped newlines, or as base64 of the file.
  const pem = raw.includes("BEGIN PRIVATE KEY") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  try {
    const key = createPrivateKey({ key: pem, format: "pem" });
    if (key.asymmetricKeyType !== "ec") return null;
    return { key, keyId, teamId: IOS_APP.teamId, clientId: IOS_APP.bundleId };
  } catch {
    return null;
  }
}

/** Offered only when it's switched on and the key that revokes tokens is in place. */
export function appleSignInOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.APPLE_SIGN_IN?.trim() === "on" && appleSignInKey(env) !== null;
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** The client secret: an ES256 JSON Web Token for appleid.apple.com, good for five minutes unless asked otherwise. */
export function appleClientSecret(config: AppleSignInKey, now: Date, options: { subject?: string; lifetimeSeconds?: number } = {}): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat, exp: iat + (options.lifetimeSeconds ?? 300), aud: APPLE_ID_HOST, sub: options.subject ?? config.clientId }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: config.key, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64url(signature)}`;
}

/** Auth's client secret for the website's flow, and when it ends (seconds since 1970). */
export function appleWebSecret(config: AppleSignInKey, now: Date): { secret: string; expiresAt: number } {
  return {
    secret: appleClientSecret(config, now, { subject: APPLE_SERVICES_ID, lifetimeSeconds: APPLE_WEB_SECRET_SECONDS }),
    expiresAt: Math.floor(now.getTime() / 1000) + APPLE_WEB_SECRET_SECONDS,
  };
}

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

let webReady: { at: number; value: boolean } | null = null;

/**
 * Whether Auth's Apple flow for the website is fully set up: its authorize
 * address must send the browser to Apple under the website's Services ID.
 * Asked at most every five minutes (every minute after a failure), so the
 * button shows only while the whole flow works.
 */
export async function appleWebReady(options: { authUrl: string; publishableKey: string; returnTo: string; fetch?: Fetch; now?: number }): Promise<boolean> {
  const now = options.now ?? Date.now();
  if (webReady && now - webReady.at < (webReady.value ? 300_000 : 60_000)) return webReady.value;
  let value = false;
  try {
    const url = `${options.authUrl.replace(/\/$/, "")}/auth/v1/authorize?${new URLSearchParams({ provider: "apple", redirect_to: options.returnTo })}`;
    const r = await (options.fetch ?? fetch)(url, { headers: { apikey: options.publishableKey }, redirect: "manual", signal: AbortSignal.timeout(5_000) });
    const location = r.headers.get("location") ?? "";
    value = r.status >= 300 && r.status < 400 && location.startsWith(`${APPLE_ID_HOST}/auth/authorize?`) && new URL(location).searchParams.get("client_id") === APPLE_SERVICES_ID;
  } catch {
    value = false;
  }
  webReady = { at: now, value };
  return value;
}

/** For tests: forget the last answer. */
export function resetAppleWebReady(): void {
  webReady = null;
}
const TIMEOUT_MS = 8_000;

function post(fetcher: Fetch, path: string, form: Record<string, string>): Promise<Response> {
  return fetcher(`${APPLE_ID_HOST}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    redirect: "error",
  });
}

const REFRESH_TOKEN = /^[A-Za-z0-9._-]{8,1024}$/;

/** Apple's refresh token for a sign-in's authorization code, or null when Apple refused it. */
export async function exchangeAppleCode(config: AppleSignInKey, code: string, options: { now?: Date; fetch?: Fetch } = {}): Promise<string | null> {
  const r = await post(options.fetch ?? fetch, "/auth/token", {
    client_id: config.clientId,
    client_secret: appleClientSecret(config, options.now ?? new Date()),
    code,
    grant_type: "authorization_code",
  });
  if (!r.ok) return null;
  const body = (await r.json().catch(() => null)) as { refresh_token?: unknown } | null;
  return typeof body?.refresh_token === "string" && REFRESH_TOKEN.test(body.refresh_token) ? body.refresh_token : null;
}

/** Ends the Apple ID's link to Farbaek. Apple answers 200 for a token it revoked or no longer knows. */
export async function revokeAppleToken(config: AppleSignInKey, refreshToken: string, options: { now?: Date; fetch?: Fetch } = {}): Promise<boolean> {
  const r = await post(options.fetch ?? fetch, "/auth/revoke", {
    client_id: config.clientId,
    client_secret: appleClientSecret(config, options.now ?? new Date()),
    token: refreshToken,
    token_type_hint: "refresh_token",
  });
  return r.ok;
}
