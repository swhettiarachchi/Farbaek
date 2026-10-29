import { generateKeyPairSync, sign, type KeyObject } from "node:crypto";
import { describe, expect, it } from "vitest";
import { appleIdEvent, appleIdKeys, receiveAppleIdNotification, verifyAppleIdToken, type AppleIdKeys } from "./apple-notifications";

// A throwaway RSA key standing in for Apple's, never Apple's own.
const apple = generateKeyPairSync("rsa", { modulusLength: 2048 });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });
const NOW = new Date("2026-10-29T12:00:00Z");
const SECONDS = NOW.getTime() / 1000;
const KEYS: AppleIdKeys = { key: async (kid) => (kid === "apple-1" ? apple.publicKey : null) };

const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
function token(claims: Record<string, unknown>, options: { kid?: string; key?: KeyObject; alg?: string } = {}) {
  const head = b64({ alg: options.alg ?? "RS256", kid: options.kid ?? "apple-1" });
  const body = b64(claims);
  return `${head}.${body}.${sign("RSA-SHA256", Buffer.from(`${head}.${body}`), options.key ?? apple.privateKey).toString("base64url")}`;
}
const event = (type: string, sub = "001234.abcdef0123456789.1200") => ({
  iss: "https://appleid.apple.com",
  aud: "com.farbaek.app",
  iat: SECONDS - 60,
  jti: "j1",
  events: JSON.stringify({ type, sub, event_time: SECONDS - 61 }),
});

describe("Apple's account notices for Sign in with Apple (ADR 0114)", () => {
  it("accepts a token only when Apple's key signed it for Farbaek, recently", async () => {
    await expect(verifyAppleIdToken(token(event("consent-revoked")), KEYS, NOW)).resolves.toMatchObject({ aud: "com.farbaek.app" });
    await expect(verifyAppleIdToken(token({ ...event("consent-revoked"), aud: "com.farbaek.web" }), KEYS, NOW)).resolves.toBeTruthy();
    for (const bad of [
      token(event("consent-revoked"), { key: stranger.privateKey }),
      token(event("consent-revoked"), { kid: "unknown" }),
      token(event("consent-revoked"), { alg: "none" }),
      token({ ...event("consent-revoked"), aud: "com.someone.else" }),
      token({ ...event("consent-revoked"), iss: "https://evil.example" }),
      token({ ...event("consent-revoked"), iat: SECONDS - 8 * 86400 }),
      token({ ...event("consent-revoked"), iat: SECONDS + 3600 }),
      "not.a.token",
      42,
    ]) {
      await expect(verifyAppleIdToken(bad, KEYS, NOW)).rejects.toThrow();
    }
  });

  it("reads the event Apple sends as a JSON string", () => {
    expect(appleIdEvent(event("account-delete"))).toEqual({ type: "account-delete", sub: "001234.abcdef0123456789.1200" });
    expect(appleIdEvent({ events: { type: "email-disabled", sub: "001234.x.1" } })).toEqual({ type: "email-disabled", sub: "001234.x.1" });
    expect(appleIdEvent({ events: "{not json" })).toBeNull();
    expect(appleIdEvent({ events: JSON.stringify({ type: "something-new", sub: "001" }) })).toBeNull();
    expect(appleIdEvent({ events: JSON.stringify({ type: "consent-revoked", sub: "has spaces" }) })).toBeNull();
  });

  it("signs the person out when they stop using Sign in with Apple or delete their Apple Account, and only then", async () => {
    const ended: string[] = [];
    const deps = { keys: KEYS, ended: async (sub: string) => (ended.push(sub), sub === "001234.abcdef0123456789.1200" ? "user-1" : null), now: () => NOW };
    expect(await receiveAppleIdNotification(deps, { payload: token(event("consent-revoked")) })).toEqual({ status: 200, outcome: "signed_out" });
    expect(await receiveAppleIdNotification(deps, { payload: token(event("account-delete", "001234.nobody.1")) })).toEqual({ status: 200, outcome: "no_account" });
    expect(await receiveAppleIdNotification(deps, { payload: token(event("email-disabled")) })).toEqual({ status: 200, outcome: "email-disabled" });
    expect(await receiveAppleIdNotification(deps, { payload: token(event("consent-revoked"), { key: stranger.privateKey }) })).toEqual({ status: 400, outcome: "unsigned" });
    expect(await receiveAppleIdNotification(deps, null)).toEqual({ status: 400, outcome: "unsigned" });
    expect(ended).toEqual(["001234.abcdef0123456789.1200", "001234.nobody.1"]);
  });

  it("reads Apple's published keys once an hour, not for every notice", async () => {
    const jwk = apple.publicKey.export({ format: "jwk" });
    const urls: string[] = [];
    let published = [{ ...jwk, kid: "apple-1", use: "sig", alg: "RS256" }];
    const keys = appleIdKeys(async (url) => (urls.push(url), Response.json({ keys: published })));
    expect(await keys.key("apple-1")).not.toBeNull();
    expect(await keys.key("apple-1")).not.toBeNull();
    expect(urls).toEqual(["https://appleid.apple.com/auth/keys"]);
    // A new key within a minute of the last read waits; the token is refused and Apple sends it again.
    published = [...published, { ...jwk, kid: "apple-2", use: "sig", alg: "RS256" }];
    expect(await keys.key("apple-2")).toBeNull();
  });
});
