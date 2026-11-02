/**
 * Access to the Google Play Developer API (ADR 0154). The owner's service
 * account key, set as GOOGLE_PLAY_SERVICE_ACCOUNT (the JSON file, or base64
 * of it, by scripts/vps/set-google-play.ps1), signs a short RS256 assertion
 * that Google's token endpoint swaps for an access token with the
 * androidpublisher scope. Only node:crypto. Nothing from the key or a token
 * is ever logged or shown; errors carry Google's status, never a body.
 */
import { createPrivateKey, sign, type KeyObject } from "node:crypto";

export const ANDROIDPUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const TOKEN_URI = "https://oauth2.googleapis.com/token";
const CLIENT_EMAIL = /^[a-z0-9-]{1,63}@[a-z0-9-]{1,63}\.iam\.gserviceaccount\.com$/;

export interface GoogleServiceAccount {
  clientEmail: string;
  key: KeyObject;
}

export class GoogleAuthError extends Error {
  constructor(readonly status: number | null) {
    super(status === null ? "Google's token endpoint couldn't be reached." : `Google's token endpoint answered ${status}.`);
    this.name = "GoogleAuthError";
  }
}

/** The service account from the environment, or null when it isn't set or isn't a usable Google service account key. */
export function googleServiceAccount(env: Record<string, string | undefined> = process.env): GoogleServiceAccount | null {
  const raw = env.GOOGLE_PLAY_SERVICE_ACCOUNT?.trim() ?? "";
  if (!raw) return null;
  try {
    const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const file = JSON.parse(json) as Record<string, unknown>;
    if (file.type !== "service_account" || typeof file.client_email !== "string" || typeof file.private_key !== "string") return null;
    if (!CLIENT_EMAIL.test(file.client_email)) return null;
    // The assertion is only ever sent to Google's own endpoint, whatever the file says.
    if (file.token_uri !== undefined && file.token_uri !== TOKEN_URI) return null;
    const key = createPrivateKey({ key: file.private_key, format: "pem" });
    if (key.asymmetricKeyType !== "rsa") return null;
    return { clientEmail: file.client_email, key };
  } catch {
    return null;
  }
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** The signed assertion Google's token endpoint takes (RFC 7523), valid for an hour. */
export function serviceAccountAssertion(account: GoogleServiceAccount, now: Date): string {
  const iat = Math.floor(now.getTime() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({ iss: account.clientEmail, scope: ANDROIDPUBLISHER_SCOPE, aud: TOKEN_URI, iat, exp: iat + 3600 }));
  const signature = sign("RSA-SHA256", Buffer.from(`${header}.${claims}`), account.key);
  return `${header}.${claims}.${b64url(signature)}`;
}

const TOKEN_LIFE_MS = 50 * 60_000;

/** A function that returns a current access token, asking Google again only after 50 minutes. */
export function googleAccessTokens(account: GoogleServiceAccount, fetcher: typeof fetch = fetch, now: () => Date = () => new Date()): () => Promise<string> {
  let cached: { token: string; until: number } | null = null;
  return async () => {
    const at = now();
    if (cached && cached.until > at.getTime()) return cached.token;
    let res: Response;
    try {
      res = await fetcher(TOKEN_URI, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: serviceAccountAssertion(account, at) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {
      throw new GoogleAuthError(null);
    }
    if (!res.ok) throw new GoogleAuthError(res.status);
    const body = (await res.json().catch(() => null)) as { access_token?: unknown; expires_in?: unknown } | null;
    if (!body || typeof body.access_token !== "string" || !body.access_token) throw new GoogleAuthError(res.status);
    const life = typeof body.expires_in === "number" && body.expires_in > 120 ? Math.min(TOKEN_LIFE_MS, (body.expires_in - 60) * 1000) : TOKEN_LIFE_MS;
    cached = { token: body.access_token, until: at.getTime() + life };
    return cached.token;
  };
}
