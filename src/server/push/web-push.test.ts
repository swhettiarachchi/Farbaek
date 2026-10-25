import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { encryptPush, fromB64u, vapidAuthorization, vapidKeys } from "./web-push";

// RFC 8291, section 5 and appendix A.
const RFC = {
  plaintext: "V2hlbiBJIGdyb3cgdXAsIEkgd2FudCB0byBiZSBhIHdhdGVybWVsb24",
  asPrivate: "yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw",
  uaPublic: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
  salt: "DGv6ra1nlYgDCS1FRnbzlw",
  message:
    "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
};

describe("Web Push encryption (RFC 8291)", () => {
  it("matches the RFC's worked example byte for byte", () => {
    const out = encryptPush(fromB64u(RFC.plaintext), { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: fromB64u(RFC.salt), serverPrivateKey: fromB64u(RFC.asPrivate) });
    expect(out.toString("base64url")).toBe(RFC.message);
  });

  it("uses a fresh salt and key for every message", () => {
    const sub = { p256dh: RFC.uaPublic, auth: RFC.auth };
    const a = encryptPush(Buffer.from("hi"), sub);
    const b = encryptPush(Buffer.from("hi"), sub);
    expect(a.subarray(0, 16).equals(b.subarray(0, 16))).toBe(false);
    expect(a.readUInt32BE(16)).toBe(4096);
    expect(a[20]).toBe(65);
  });

  it("refuses a subscription with malformed keys", () => {
    expect(() => encryptPush(Buffer.from("x"), { p256dh: "AAAA", auth: RFC.auth })).toThrow(/INVALID_SUBSCRIPTION/);
    expect(() => encryptPush(Buffer.from("x"), { p256dh: RFC.uaPublic, auth: "AAAA" })).toThrow(/INVALID_SUBSCRIPTION/);
  });
});

describe("VAPID (RFC 8292)", () => {
  it("derives a stable key pair from the server secret, or uses a dedicated one", () => {
    const a = vapidKeys({ SUPABASE_SECRET_KEY: "sb_secret_example" })!;
    expect(vapidKeys({ SUPABASE_SECRET_KEY: "sb_secret_example" })!.publicKey).toBe(a.publicKey);
    expect(fromB64u(a.publicKey)).toHaveLength(65);
    expect(vapidKeys({ SUPABASE_SECRET_KEY: "another" })!.publicKey).not.toBe(a.publicKey);
    expect(vapidKeys({ VAPID_PRIVATE_KEY: RFC.asPrivate })!.publicKey).toBe("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
    expect(vapidKeys({ VAPID_PRIVATE_KEY: "short" })).toBeNull();
    expect(vapidKeys({})).toBeNull();
  });

  it("signs a JWT for the push service's origin that its public key verifies", () => {
    const keys = vapidKeys({ SUPABASE_SECRET_KEY: "sb_secret_example" })!;
    const now = new Date("2026-10-25T10:00:00.000Z");
    const header = vapidAuthorization(keys, "https://fcm.googleapis.com/fcm/send/abc", now);
    const m = /^vapid t=([^.]+)\.([^.]+)\.([^,]+), k=(.+)$/.exec(header)!;
    expect(m[4]).toBe(keys.publicKey);
    expect(JSON.parse(Buffer.from(m[2]!, "base64url").toString())).toEqual({ aud: "https://fcm.googleapis.com", exp: Math.floor(now.getTime() / 1000) + 43_200, sub: "mailto:hello@farbaek.com" });
    const pub = fromB64u(keys.publicKey);
    const jwk = { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") };
    const ok = createVerify("sha256").update(`${m[1]}.${m[2]}`).verify({ key: jwk, format: "jwk", dsaEncoding: "ieee-p1363" }, fromB64u(m[3]!));
    expect(ok).toBe(true);
  });
});
