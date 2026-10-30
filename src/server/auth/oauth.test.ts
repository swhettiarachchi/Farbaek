import { beforeEach, describe, expect, it } from "vitest";
import { isOAuthProvider, providerReady, resetProviderReady, type OAuthProvider } from "./oauth";

const AUTH = "https://api.farbaek.com/";
const GOOGLE = "https://accounts.google.com/o/oauth2/v2/auth?client_id=123456789012-abcdefghij0123456789klmnopqrstuv.apps.googleusercontent.com&response_type=code";
const APPLE = "https://appleid.apple.com/auth/authorize?client_id=com.farbaek.web&response_mode=form_post";

function ask(provider: OAuthProvider, status: number, location: string | null) {
  resetProviderReady();
  const seen: string[] = [];
  const fetcher = async (url: string) => (seen.push(url), new Response(null, { status, headers: location ? { location } : {} }));
  return { seen, ready: providerReady(provider, { authUrl: AUTH, publishableKey: "pk", returnTo: "https://www.farbaek.com/auth/callback", fetch: fetcher, now: 1_000 }) };
}

describe("signing in with Google or Apple on the website (ADR 0114, ADR 0115)", () => {
  beforeEach(() => resetProviderReady());

  it("offers Google only while Auth sends people to Google under a real client id", async () => {
    const good = ask("google", 302, GOOGLE);
    expect(await good.ready).toBe(true);
    expect(good.seen[0]).toBe("https://api.farbaek.com/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fwww.farbaek.com%2Fauth%2Fcallback");
    expect(await ask("google", 302, "https://accounts.google.com/o/oauth2/v2/auth?client_id=").ready).toBe(false);
    expect(await ask("google", 302, GOOGLE.replace("accounts.google.com", "accounts.google.com.evil.example")).ready).toBe(false);
    // Auth answers 400 while the provider is off or its secret is missing.
    expect(await ask("google", 400, null).ready).toBe(false);
  });

  it("offers Apple only under the website's Services ID", async () => {
    expect(await ask("apple", 302, APPLE).ready).toBe(true);
    expect(await ask("apple", 302, APPLE.replace("com.farbaek.web", "com.farbaek.app")).ready).toBe(false);
    expect(await ask("apple", 302, APPLE.replace("appleid.apple.com", "evil.example")).ready).toBe(false);
  });

  it("remembers each provider's answer apart: five minutes once it works, a minute while it doesn't", async () => {
    let calls = 0;
    const answer = (location: string | null) => async () => (calls++, new Response(null, { status: location ? 302 : 400, headers: location ? { location } : {} }));
    const options = { authUrl: AUTH, publishableKey: "pk", returnTo: "x" };
    expect(await providerReady("google", { ...options, fetch: answer(GOOGLE), now: 0 })).toBe(true);
    expect(await providerReady("apple", { ...options, fetch: answer(null), now: 0 })).toBe(false);
    expect(calls).toBe(2);
    expect(await providerReady("google", { ...options, fetch: answer(GOOGLE), now: 299_000 })).toBe(true);
    expect(await providerReady("apple", { ...options, fetch: answer(APPLE), now: 59_000 })).toBe(false);
    expect(calls).toBe(2);
    expect(await providerReady("apple", { ...options, fetch: answer(APPLE), now: 61_000 })).toBe(true);
    expect(await providerReady("google", { ...options, fetch: answer(GOOGLE), now: 301_000 })).toBe(true);
    expect(calls).toBe(4);
  });

  it("knows only Google and Apple", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("apple")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider(null)).toBe(false);
  });
});
