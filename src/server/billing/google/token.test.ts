import { createPublicKey, generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { ANDROIDPUBLISHER_SCOPE, GoogleAuthError, googleAccessTokens, googleServiceAccount, serviceAccountAssertion } from "./token";

// A key made for this test only; it is never stored.
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pem = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
const file = (over: Record<string, unknown> = {}) => JSON.stringify({ type: "service_account", client_email: "farbaek-play@farbaek-play.iam.gserviceaccount.com", private_key: pem, token_uri: "https://oauth2.googleapis.com/token", ...over });
const NOW = new Date("2026-11-03T12:00:00Z");

describe("the Google Play service account (ADR 0154)", () => {
  it("reads the key file, as it is or in base64, and refuses anything else", () => {
    expect(googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: file() })?.clientEmail).toBe("farbaek-play@farbaek-play.iam.gserviceaccount.com");
    expect(googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: Buffer.from(file()).toString("base64") })).not.toBeNull();
    expect(googleServiceAccount({})).toBeNull();
    expect(googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: file({ type: "authorized_user" }) })).toBeNull();
    expect(googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: file({ client_email: "someone@gmail.com" }) })).toBeNull();
    // The assertion only ever goes to Google's own token endpoint.
    expect(googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: file({ token_uri: "https://example.com/token" }) })).toBeNull();
    expect(googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: "{ not json" })).toBeNull();
  });

  it("signs an RS256 assertion for Google's token endpoint with the androidpublisher scope", () => {
    const account = googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: file() })!;
    const jwt = serviceAccountAssertion(account, NOW);
    const [h, c, s] = jwt.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" });
    const claims = JSON.parse(Buffer.from(c!, "base64url").toString());
    expect(claims).toEqual({ iss: account.clientEmail, scope: ANDROIDPUBLISHER_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: NOW.getTime() / 1000, exp: NOW.getTime() / 1000 + 3600 });
    expect(verify("RSA-SHA256", Buffer.from(`${h}.${c}`), createPublicKey(privateKey), Buffer.from(s!, "base64url"))).toBe(true);
  });

  it("swaps it for an access token, keeps it for 50 minutes, and reports failures without Google's body", async () => {
    const account = googleServiceAccount({ GOOGLE_PLAY_SERVICE_ACCOUNT: file() })!;
    let calls = 0;
    let clock = NOW.getTime();
    const fetcher = (async (_url: string, init: RequestInit) => {
      calls++;
      expect(String(init.body)).toContain("grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer");
      return new Response(JSON.stringify({ access_token: `token-${calls}`, expires_in: 3599 }), { status: 200 });
    }) as unknown as typeof fetch;
    const token = googleAccessTokens(account, fetcher, () => new Date(clock));
    expect(await token()).toBe("token-1");
    clock += 49 * 60_000;
    expect(await token()).toBe("token-1");
    clock += 2 * 60_000;
    expect(await token()).toBe("token-2");

    const refused = googleAccessTokens(account, (async () => new Response('{"error":"invalid_grant","error_description":"secret detail"}', { status: 400 })) as unknown as typeof fetch);
    await expect(refused()).rejects.toThrow(GoogleAuthError);
    await expect(refused()).rejects.not.toThrow(/secret detail/);
  });
});
