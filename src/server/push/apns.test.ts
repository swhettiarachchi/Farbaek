import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { APNS_HOSTS, apnsConfig, apnsPayload, providerToken, sendApns, type ApnsTransport } from "./apns";
import { pushToPhones } from "./phone-notifier";

// A throwaway key made for this test, never a real one.
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const TOKEN = "ab".repeat(32);
const MESSAGE = { title: "Your build is ready", body: "Review the change.", url: "/app/tasks/t1", tag: "task:t1" };

function transport(status: number, reason: string | null = null) {
  const sent: { origin: string; path: string; headers: Record<string, string>; body: string }[] = [];
  const t: ApnsTransport = {
    async post(origin, path, headers, body) {
      sent.push({ origin, path, headers, body });
      return { status, reason };
    },
  };
  return { t, sent };
}

describe("push to iPhone through APNs (ADR 0110)", () => {
  it("reads the key from the environment, as the file or as base64, and is off without it", () => {
    expect(apnsConfig({})).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: "ABC123DEFG", APNS_KEY_P8: "not a key" })).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: "short", APNS_KEY_P8: PEM })).toBeNull();
    expect(apnsConfig({ APNS_KEY_ID: "ABC123DEFG", APNS_KEY_P8: PEM.replace(/\n/g, "\\n") })).toMatchObject({ keyId: "ABC123DEFG", teamId: "65BULQ4657", topic: "com.farbaek.app" });
    expect(apnsConfig({ APNS_KEY_ID: "ABC123DEFG", APNS_KEY_P8: Buffer.from(PEM).toString("base64") })).not.toBeNull();
  });

  it("signs its provider token with ES256, verifiable with the key's public half", () => {
    const token = providerToken({ key: privateKey, keyId: "ABC123DEFG", teamId: "65BULQ4657" }, new Date("2026-10-29T12:00:00Z"));
    const [h, c, s] = token.split(".");
    expect(JSON.parse(Buffer.from(h!, "base64url").toString())).toEqual({ alg: "ES256", kid: "ABC123DEFG" });
    expect(JSON.parse(Buffer.from(c!, "base64url").toString())).toEqual({ iss: "65BULQ4657", iat: 1793275200 });
    expect(verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s!, "base64url"))).toBe(true);
  });

  it("sends an alert to Apple's host for the phone's build, and reads Apple's answer", async () => {
    const config = apnsConfig({ APNS_KEY_ID: "ABC123DEFG", APNS_KEY_P8: PEM })!;
    const ok = transport(200);
    expect(await sendApns(config, ok.t, { token: TOKEN, environment: "development" }, MESSAGE)).toBe("sent");
    expect(ok.sent[0]).toMatchObject({ origin: APNS_HOSTS.development, path: `/3/device/${TOKEN}` });
    expect(ok.sent[0]!.headers).toMatchObject({ "apns-topic": "com.farbaek.app", "apns-push-type": "alert", "apns-collapse-id": "task:t1" });
    expect(ok.sent[0]!.headers.authorization).toMatch(/^bearer [\w-]+\.[\w-]+\.[\w-]+$/);
    expect(JSON.parse(ok.sent[0]!.body)).toEqual({ aps: { alert: { title: MESSAGE.title, body: MESSAGE.body }, sound: "default", "thread-id": "task:t1" }, url: "/app/tasks/t1" });

    expect(await sendApns(config, transport(410).t, { token: TOKEN, environment: "production" }, MESSAGE)).toBe("gone");
    expect(await sendApns(config, transport(400, "BadDeviceToken").t, { token: TOKEN, environment: "production" }, MESSAGE)).toBe("gone");
    expect(await sendApns(config, transport(400, "PayloadTooLarge").t, { token: TOKEN, environment: "production" }, MESSAGE)).toBe("failed");
    expect(await sendApns(config, transport(403, "InvalidProviderToken").t, { token: TOKEN, environment: "production" }, MESSAGE)).toBe("failed");
    // A token that isn't one is never sent anywhere.
    const none = transport(200);
    expect(await sendApns(config, none.t, { token: "../../evil", environment: "production" }, MESSAGE)).toBe("gone");
    expect(none.sent).toHaveLength(0);
  });

  it("keeps a payload small and one notification per thread", () => {
    const long = apnsPayload({ ...MESSAGE, title: "t".repeat(500), body: "b".repeat(5_000), tag: "x".repeat(200) });
    expect(Buffer.byteLength(long)).toBeLessThan(4_096);
  });

  it("tells every connected phone and reports what Apple said about each", async () => {
    const config = apnsConfig({ APNS_KEY_ID: "ABC123DEFG", APNS_KEY_P8: PEM })!;
    const noted: [string, string][] = [];
    const { t } = transport(200);
    const sent = await pushToPhones(
      { config, targets: async () => [{ token: TOKEN, environment: "production" }, { token: "cd".repeat(32), environment: "production" }], note: async (tok, o) => void noted.push([tok, o]), transport: () => t },
      "u1",
      MESSAGE,
    );
    expect(sent).toBe(2);
    expect(noted.map((n) => n[1])).toEqual(["sent", "sent"]);
  });
});
