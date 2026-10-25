import { describe, expect, it } from "vitest";
import { openToken, sealToken, vaultKey } from "./token-vault";

const BIND = { orgId: "org-1", provider: "vercel" };
const KEY = vaultKey({ PROVIDER_TOKEN_KEY: Buffer.alloc(32, 7).toString("base64") })!;

describe("the provider token vault", () => {
  it("seals and opens a token, and never stores it in the clear", () => {
    const sealed = sealToken("vercel_token_123", KEY, BIND);
    expect(sealed).toMatch(/^v1\.k1\./);
    expect(sealed).not.toContain("vercel_token_123");
    expect(openToken(sealed, KEY, BIND)).toBe("vercel_token_123");
    // A fresh nonce each time.
    expect(sealToken("vercel_token_123", KEY, BIND)).not.toBe(sealed);
  });

  it("won't open for another workspace or provider, after tampering, or with another key", () => {
    const sealed = sealToken("t", KEY, BIND);
    expect(openToken(sealed, KEY, { ...BIND, orgId: "org-2" })).toBeNull();
    expect(openToken(sealed, KEY, { ...BIND, provider: "netlify" })).toBeNull();
    const flipped = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    expect(openToken(flipped, KEY, BIND)).toBeNull();
    const other = vaultKey({ PROVIDER_TOKEN_KEY: Buffer.alloc(32, 9).toString("base64") })!;
    expect(openToken(sealed, other, BIND)).toBeNull();
    expect(openToken("v1.k1.", KEY, BIND)).toBeNull();
    expect(openToken("nonsense", KEY, BIND)).toBeNull();
  });

  it("uses a dedicated key when set, derives one from the server secret otherwise, and fails closed", () => {
    expect(vaultKey({ PROVIDER_TOKEN_KEY: "too-short" })).toBeNull();
    const derived = vaultKey({ SUPABASE_SECRET_KEY: "sb_secret_example" })!;
    expect(derived.id).toBe("d1");
    expect(derived.bytes).toHaveLength(32);
    expect(vaultKey({ SUPABASE_SECRET_KEY: "sb_secret_example" })!.bytes.equals(derived.bytes)).toBe(true);
    // A token sealed with the derived key doesn't open once a dedicated key is set: people reconnect.
    const sealed = sealToken("t", derived, BIND);
    expect(openToken(sealed, KEY, BIND)).toBeNull();
    expect(vaultKey({})).toBeNull();
  });
});
