/**
 * How a phone signs in, stays signed in and is refused (ADR 0110).
 *
 * 1. The app opens www.farbaek.com/app/connect in the system browser sheet
 *    with a PKCE challenge. The person signs in there as usual (email link,
 *    Turnstile and all) and agrees to connect the phone.
 * 2. The page's form posts here from Farbaek's own origin. Farbaek stores a
 *    one-time code bound to the challenge and sends the browser back to the
 *    app at farbaek://connected.
 * 3. The app redeems the code with its verifier and gets its own Supabase
 *    session, recorded as a connected phone.
 * 4. Every request after that carries the session's access token, and the
 *    phone's record is checked each time, so disconnecting it in Settings
 *    takes effect at once.
 *
 * On iPhone, Sign in with Apple (ADR 0113) replaces steps 1 to 3: the app
 * sends Apple's identity token and the nonce it hashed into the request, and
 * Supabase Auth checks both and makes (or finds) the account.
 */
import { APPLE_CODE_PATTERN, APPLE_NONCE_PATTERN, CHALLENGE_PATTERN, CODE_PATTERN, STATE_PATTERN, VERIFIER_PATTERN, APP_VERSION_PATTERN, challengeFor, cleanDeviceName, isPhonePlatform, newConnectCode, sha256Hex, type PhonePlatform } from "./tokens";

export type PhoneResult<T> = { ok: true; value: T } | { ok: false; status: number; code: string; message: string };

export interface PhoneSession {
  accessToken: string;
  refreshToken: string;
  /** When the access token expires, in seconds since 1970. */
  expiresAt: number;
  sessionId: string;
}

export interface PhoneDevice {
  deviceId: string;
  userId: string;
  platform: PhonePlatform;
  push: boolean;
}

export interface PhoneStore {
  createCode(input: { userId: string; codeHash: string; challenge: string; platform: PhonePlatform; deviceName: string }): Promise<"ok" | "too_many">;
  redeemCode(codeHash: string, challenge: string): Promise<{ userId: string; platform: PhonePlatform; deviceName: string } | null>;
  register(input: { userId: string; sessionId: string; platform: PhonePlatform; name: string; appVersion: string | null }): Promise<string>;
  seen(sessionId: string): Promise<PhoneDevice | null>;
  /** "signed_out" when the Supabase session ended too; "refused" when only Farbaek's record could be closed. */
  revoke(userId: string, deviceId: string): Promise<"signed_out" | "refused" | "not_found">;
  setPush(sessionId: string, token: string | null, environment: "production" | "development"): Promise<boolean>;
  rateLimit(key: string, windowSeconds: number, limit: number): Promise<boolean>;
}

export interface SessionAuth {
  /** A new Supabase session for the person, separate from any browser's. Null when Auth can't make one. */
  newSession(userId: string): Promise<PhoneSession | null>;
  /** A refreshed session, or null when the refresh token is no longer valid. */
  refresh(refreshToken: string): Promise<PhoneSession | null>;
  /** The person behind a valid access token, or null. */
  verify(accessToken: string): Promise<{ userId: string; email: string; sessionId: string; expiresAt: number } | null>;
  /** A new session from Apple's identity token, once Auth has checked it and its nonce. Null when Auth refused it. */
  appleSession(identityToken: string, nonce: string): Promise<{ userId: string; session: PhoneSession } | null>;
}

export interface PhoneAuthDeps {
  store: PhoneStore;
  auth: SessionAuth;
  /** Keeps Apple's refresh token for the sign-in's authorization code, so deleting the account can revoke it. Never throws. */
  keepApple?: (userId: string, authorizationCode: string) => Promise<void>;
}

export interface PhoneCaller {
  userId: string;
  email: string;
  sessionId: string;
  deviceId: string;
  platform: PhonePlatform;
  push: boolean;
  accessToken: string;
  expiresAt: number;
}

export interface TokenGrant {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  deviceId?: string;
}

const refuse = (status: number, code: string, message: string): PhoneResult<never> => ({ ok: false, status, code, message });

export const PHONE_MESSAGES = {
  grant: "This sign-in has expired or was already used. Sign in again from the app.",
  unavailable: "Signing in phones isn't available right now. Try again in a few minutes.",
  limited: "Too many sign-in attempts from this network. Wait a minute and try again.",
  expired: "Your sign-in has expired. Open the app again to refresh it.",
  disconnected: "This phone was disconnected from Farbaek. Sign in again to use it.",
  busy: "Too many requests from this phone in the last minute. Wait a moment and try again.",
  apple: "Apple's sign-in couldn't be checked, so you're not signed in. Try Continue with Apple again.",
} as const;

const ACCESS_TOKEN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const REFRESH_TOKEN = /^[A-Za-z0-9_-]{8,512}$/;

/**
 * Where the connect form sends the browser: back to the app with these values
 * (through /auth/connect/done, since the site's form-action policy keeps a
 * form's redirect on Farbaek), or to sign-in when the browser's session ended.
 */
export type ConnectAnswer = { kind: "app"; params: Record<string, string> } | { kind: "sign_in"; location: string } | { kind: "refused"; status: number; message: string };

/**
 * The connect form's post. It must come from Farbaek's own pages (the
 * Origin header), so another site can't connect a phone to someone's
 * account; a cookie alone isn't enough.
 */
export async function connectFromBrowser(
  deps: Pick<PhoneAuthDeps, "store">,
  input: { userId: string | null; requestOrigin: string | null; siteOrigin: string; fields: { challenge: unknown; state: unknown; platform: unknown; device: unknown } },
): Promise<ConnectAnswer> {
  if (!input.requestOrigin || input.requestOrigin !== input.siteOrigin) return { kind: "refused", status: 403, message: "Connect a phone from Farbaek's own page." };
  const { challenge, state, platform, device } = input.fields;
  if (typeof state !== "string" || !STATE_PATTERN.test(state)) return { kind: "refused", status: 400, message: "Open the sign-in from the Farbaek app again." };
  if (typeof challenge !== "string" || !CHALLENGE_PATTERN.test(challenge) || !isPhonePlatform(platform)) return { kind: "app", params: { error: "invalid_request", state } };
  if (!input.userId) {
    const back = `/auth/connect?${new URLSearchParams({ challenge, state, platform, ...(typeof device === "string" ? { device } : {}) })}`;
    return { kind: "sign_in", location: `/sign-in?next=${encodeURIComponent(back)}` };
  }
  const code = newConnectCode();
  const created = await deps.store.createCode({ userId: input.userId, codeHash: sha256Hex(code), challenge, platform, deviceName: cleanDeviceName(device, platform) });
  if (created === "too_many") return { kind: "app", params: { error: "too_many", state } };
  return { kind: "app", params: { code, state } };
}

/** The app redeems its code with the verifier only it has, and gets its own session. */
export async function exchangeCode(deps: PhoneAuthDeps, input: { code: unknown; verifier: unknown; appVersion: unknown; clientKey: string }): Promise<PhoneResult<TokenGrant>> {
  if (!(await deps.store.rateLimit(`phone-token:${input.clientKey}`, 60, 20))) return refuse(429, "RATE_LIMITED", PHONE_MESSAGES.limited);
  const { code, verifier } = input;
  if (typeof code !== "string" || !CODE_PATTERN.test(code) || typeof verifier !== "string" || !VERIFIER_PATTERN.test(verifier)) return refuse(400, "INVALID_GRANT", PHONE_MESSAGES.grant);
  const redeemed = await deps.store.redeemCode(sha256Hex(code), challengeFor(verifier));
  if (!redeemed) return refuse(400, "INVALID_GRANT", PHONE_MESSAGES.grant);
  const session = await deps.auth.newSession(redeemed.userId);
  if (!session) return refuse(503, "SIGN_IN_UNAVAILABLE", PHONE_MESSAGES.unavailable);
  const appVersion = typeof input.appVersion === "string" && APP_VERSION_PATTERN.test(input.appVersion) ? input.appVersion : null;
  const deviceId = await deps.store.register({ userId: redeemed.userId, sessionId: session.sessionId, platform: redeemed.platform, name: redeemed.deviceName, appVersion });
  return { ok: true, value: { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt, deviceId } };
}

/** Sign in with Apple on iPhone: Auth checks Apple's token, then the phone is recorded like any other. */
export async function signInWithApple(
  deps: PhoneAuthDeps,
  input: { identityToken: unknown; nonce: unknown; authorizationCode: unknown; device: unknown; appVersion: unknown; clientKey: string },
): Promise<PhoneResult<TokenGrant>> {
  if (!(await deps.store.rateLimit(`phone-apple:${input.clientKey}`, 60, 20))) return refuse(429, "RATE_LIMITED", PHONE_MESSAGES.limited);
  const { identityToken, nonce } = input;
  if (typeof identityToken !== "string" || identityToken.length > 4096 || !ACCESS_TOKEN.test(identityToken) || typeof nonce !== "string" || !APPLE_NONCE_PATTERN.test(nonce)) {
    return refuse(400, "APPLE_REFUSED", PHONE_MESSAGES.apple);
  }
  const signedIn = await deps.auth.appleSession(identityToken, nonce);
  if (!signedIn) return refuse(400, "APPLE_REFUSED", PHONE_MESSAGES.apple);
  const appVersion = typeof input.appVersion === "string" && APP_VERSION_PATTERN.test(input.appVersion) ? input.appVersion : null;
  const deviceId = await deps.store.register({ userId: signedIn.userId, sessionId: signedIn.session.sessionId, platform: "ios", name: cleanDeviceName(input.device, "ios"), appVersion });
  if (deps.keepApple && typeof input.authorizationCode === "string" && APPLE_CODE_PATTERN.test(input.authorizationCode)) await deps.keepApple(signedIn.userId, input.authorizationCode);
  const { session } = signedIn;
  return { ok: true, value: { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt, deviceId } };
}

/** A fresh access token, only while the phone is still connected. */
export async function refreshPhone(deps: PhoneAuthDeps, input: { refreshToken: unknown; clientKey: string }): Promise<PhoneResult<TokenGrant>> {
  if (!(await deps.store.rateLimit(`phone-refresh:${input.clientKey}`, 60, 60))) return refuse(429, "RATE_LIMITED", PHONE_MESSAGES.limited);
  if (typeof input.refreshToken !== "string" || !REFRESH_TOKEN.test(input.refreshToken)) return refuse(401, "SIGNED_OUT", PHONE_MESSAGES.disconnected);
  const session = await deps.auth.refresh(input.refreshToken);
  if (!session) return refuse(401, "SIGNED_OUT", PHONE_MESSAGES.disconnected);
  if (!(await deps.store.seen(session.sessionId))) return refuse(401, "DISCONNECTED", PHONE_MESSAGES.disconnected);
  return { ok: true, value: { accessToken: session.accessToken, refreshToken: session.refreshToken, expiresAt: session.expiresAt } };
}

/** Every request after sign-in: a valid access token, from a phone that's still connected, under its rate limit. */
export async function authenticate(deps: PhoneAuthDeps, authorization: string | null): Promise<PhoneResult<PhoneCaller>> {
  const token = authorization?.match(/^Bearer\s+(\S+)$/)?.[1] ?? "";
  if (token.length > 4096 || !ACCESS_TOKEN.test(token)) return refuse(401, "UNAUTHENTICATED", "Sign in from the Farbaek app.");
  const claims = await deps.auth.verify(token);
  if (!claims) return refuse(401, "TOKEN_EXPIRED", PHONE_MESSAGES.expired);
  const device = await deps.store.seen(claims.sessionId);
  if (!device || device.userId !== claims.userId) return refuse(401, "DISCONNECTED", PHONE_MESSAGES.disconnected);
  if (!(await deps.store.rateLimit(`phone:${device.deviceId}`, 60, 120))) return refuse(429, "RATE_LIMITED", PHONE_MESSAGES.busy);
  return {
    ok: true,
    value: { userId: claims.userId, email: claims.email, sessionId: claims.sessionId, deviceId: device.deviceId, platform: device.platform, push: device.push, accessToken: token, expiresAt: claims.expiresAt },
  };
}
