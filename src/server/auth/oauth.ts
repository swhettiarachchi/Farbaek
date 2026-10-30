/**
 * Signing in on the website with an Apple or Google account (ADR 0114,
 * ADR 0115). Both go through Supabase Auth's own OAuth flows with PKCE; this
 * file only decides whether a flow is fully set up, so its button shows only
 * while it works.
 *
 * Auth's authorize address must send the browser to the provider under
 * Farbaek's own client id. Asked at most every five minutes per provider
 * (every minute after a failure).
 */
import { APPLE_ID_HOST, APPLE_SERVICES_ID } from "./apple";

export const OAUTH_PROVIDERS = ["google", "apple"] as const;
export type OAuthProvider = (typeof OAUTH_PROVIDERS)[number];

export function isOAuthProvider(value: unknown): value is OAuthProvider {
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

/** A Google OAuth client id: the project number, a dash, then a key ending in apps.googleusercontent.com. */
export const GOOGLE_CLIENT_ID = /^[0-9]{6,20}-[a-z0-9]{10,64}\.apps\.googleusercontent\.com$/;

/** Where Auth must send the browser for each flow to count as set up. */
const DESTINATION: Record<OAuthProvider, (location: URL) => boolean> = {
  apple: (u) => u.origin === APPLE_ID_HOST && u.pathname === "/auth/authorize" && u.searchParams.get("client_id") === APPLE_SERVICES_ID,
  google: (u) => u.origin === "https://accounts.google.com" && u.pathname.startsWith("/o/oauth2/") && GOOGLE_CLIENT_ID.test(u.searchParams.get("client_id") ?? ""),
};

type Fetch = (input: string, init: RequestInit) => Promise<Response>;

const answers = new Map<OAuthProvider, { at: number; value: boolean }>();

export async function providerReady(
  provider: OAuthProvider,
  options: { authUrl: string; publishableKey: string; returnTo: string; fetch?: Fetch; now?: number },
): Promise<boolean> {
  const now = options.now ?? Date.now();
  const last = answers.get(provider);
  if (last && now - last.at < (last.value ? 300_000 : 60_000)) return last.value;
  let value = false;
  try {
    const url = `${options.authUrl.replace(/\/$/, "")}/auth/v1/authorize?${new URLSearchParams({ provider, redirect_to: options.returnTo })}`;
    const r = await (options.fetch ?? fetch)(url, { headers: { apikey: options.publishableKey }, redirect: "manual", signal: AbortSignal.timeout(5_000) });
    const location = r.headers.get("location");
    value = r.status >= 300 && r.status < 400 && location !== null && DESTINATION[provider](new URL(location));
  } catch {
    value = false;
  }
  answers.set(provider, { at: now, value });
  return value;
}

/** For tests: forget every answer. */
export function resetProviderReady(): void {
  answers.clear();
}
