import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { IOS_APP } from "@/config/ios-app";
import { APPLE_SERVICES_ID, appleClientSecret, appleSignInKey, appleSignInOn, appleWebReady, appleWebSecret, exchangeAppleCode, resetAppleWebReady, revokeAppleToken } from "./apple";

// A throwaway P-256 key made for this test, never Apple's.
const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const ENV = { APPLE_SIGN_IN_KEY_ID: "ABCDE12345", APPLE_SIGN_IN_KEY_P8: PEM };
const NOW = new Date("2026-10-29T12:00:00Z");

function apple(answer: Response) {
  const sent: { url: string; form: URLSearchParams }[] = [];
  const fetcher = async (url: string, init: RequestInit) => {
    sent.push({ url, form: new URLSearchParams(String(init.body)) });
    return answer;
  };
  return { sent, fetcher };
}

describe("Sign in with Apple's REST API (ADR 0113)", () => {
  it("reads the key pasted as the file, with escaped newlines or as base64, and stays off without it", () => {
    expect(appleSignInKey(ENV)?.keyId).toBe("ABCDE12345");
    expect(appleSignInKey({ ...ENV, APPLE_SIGN_IN_KEY_P8: PEM.replace(/\n/g, "\\n") })).not.toBeNull();
    expect(appleSignInKey({ ...ENV, APPLE_SIGN_IN_KEY_P8: Buffer.from(PEM).toString("base64") })).not.toBeNull();
    expect(appleSignInKey({ ...ENV, APPLE_SIGN_IN_KEY_ID: "short" })).toBeNull();
    expect(appleSignInKey({ ...ENV, APPLE_SIGN_IN_KEY_P8: "not a key" })).toBeNull();
    expect(appleSignInOn(ENV)).toBe(false);
    expect(appleSignInOn({ ...ENV, APPLE_SIGN_IN: "on" })).toBe(true);
    expect(appleSignInOn({ APPLE_SIGN_IN: "on" })).toBe(false);
  });

  it("signs a five-minute client secret Apple can check with the key", () => {
    const key = appleSignInKey(ENV)!;
    const [header, claims, signature] = appleClientSecret(key, NOW).split(".") as [string, string, string];
    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABCDE12345" });
    const iat = NOW.getTime() / 1000;
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({ iss: IOS_APP.teamId, iat, exp: iat + 300, aud: "https://appleid.apple.com", sub: IOS_APP.bundleId });
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), { key: pair.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("exchanges an authorization code for Apple's refresh token, and only Apple's host is called", async () => {
    const key = appleSignInKey(ENV)!;
    const ok = apple(Response.json({ access_token: "a", refresh_token: "r.0.refresh-token", id_token: "x.y.z" }));
    expect(await exchangeAppleCode(key, "c0de.0.abc", { now: NOW, fetch: ok.fetcher })).toBe("r.0.refresh-token");
    expect(ok.sent[0]!.url).toBe("https://appleid.apple.com/auth/token");
    expect(Object.fromEntries(ok.sent[0]!.form)).toMatchObject({ client_id: IOS_APP.bundleId, code: "c0de.0.abc", grant_type: "authorization_code" });
    expect(ok.sent[0]!.form.get("client_secret")?.split(".")).toHaveLength(3);

    expect(await exchangeAppleCode(key, "used", { now: NOW, fetch: apple(Response.json({ error: "invalid_grant" }, { status: 400 })).fetcher })).toBeNull();
    expect(await exchangeAppleCode(key, "odd", { now: NOW, fetch: apple(Response.json({ refresh_token: "has spaces in it" })).fetcher })).toBeNull();
  });

  it("revokes the refresh token when the account is deleted", async () => {
    const key = appleSignInKey(ENV)!;
    const ok = apple(new Response(null, { status: 200 }));
    expect(await revokeAppleToken(key, "r.0.refresh-token", { now: NOW, fetch: ok.fetcher })).toBe(true);
    expect(ok.sent[0]!.url).toBe("https://appleid.apple.com/auth/revoke");
    expect(Object.fromEntries(ok.sent[0]!.form)).toMatchObject({ client_id: IOS_APP.bundleId, token: "r.0.refresh-token", token_type_hint: "refresh_token" });
    expect(await revokeAppleToken(key, "r.0.refresh-token", { now: NOW, fetch: apple(new Response(null, { status: 400 })).fetcher })).toBe(false);
  });
});

describe("Sign in with Apple on the website (ADR 0114)", () => {
  it("makes Auth's client secret for the website's Services ID, inside Apple's six-month limit", () => {
    const key = appleSignInKey(ENV)!;
    const { secret, expiresAt } = appleWebSecret(key, NOW);
    const claims = JSON.parse(Buffer.from(secret.split(".")[1]!, "base64url").toString()) as { sub: string; iat: number; exp: number };
    expect(claims.sub).toBe(APPLE_SERVICES_ID);
    expect(claims.exp).toBe(expiresAt);
    expect(claims.exp - claims.iat).toBe(180 * 86_400);
    expect(claims.exp - claims.iat).toBeLessThan(15_777_000);
  });

  it("offers the button only while Auth's flow sends people to Apple under the website's id", async () => {
    const ask = (status: number, location: string | null) => {
      resetAppleWebReady();
      const seen: string[] = [];
      const fetcher = async (url: string) => (seen.push(url), new Response(null, { status, headers: location ? { location } : {} }));
      return { seen, ready: appleWebReady({ authUrl: "https://api.farbaek.com/", publishableKey: "pk", returnTo: "https://www.farbaek.com/auth/callback", fetch: fetcher, now: 1_000 }) };
    };
    const good = ask(302, "https://appleid.apple.com/auth/authorize?client_id=com.farbaek.web&response_mode=form_post");
    expect(await good.ready).toBe(true);
    expect(good.seen[0]).toBe("https://api.farbaek.com/auth/v1/authorize?provider=apple&redirect_to=https%3A%2F%2Fwww.farbaek.com%2Fauth%2Fcallback");
    expect(await ask(302, "https://appleid.apple.com/auth/authorize?client_id=com.farbaek.app").ready).toBe(false);
    expect(await ask(400, null).ready).toBe(false);
    expect(await ask(302, "https://evil.example/auth/authorize?client_id=com.farbaek.web").ready).toBe(false);

    // Remembered for five minutes once it works, a minute while it doesn't.
    resetAppleWebReady();
    let calls = 0;
    const fetcher = async () => (calls++, new Response(null, { status: 302, headers: { location: "https://appleid.apple.com/auth/authorize?client_id=com.farbaek.web" } }));
    const options = { authUrl: "https://api.farbaek.com", publishableKey: "pk", returnTo: "x", fetch: fetcher };
    await appleWebReady({ ...options, now: 0 });
    await appleWebReady({ ...options, now: 299_000 });
    expect(calls).toBe(1);
    await appleWebReady({ ...options, now: 301_000 });
    expect(calls).toBe(2);
  });
});
