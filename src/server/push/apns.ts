/**
 * Notifications to Farbaek for iPhone through Apple's push service (APNs,
 * ADR 0110). Token-based: a short ES256 JSON Web Token signed with the
 * owner's APNs key, made at most every 40 minutes (Apple refuses new ones
 * more often than every 20, and old ones after an hour). Sent over HTTP/2,
 * which APNs requires, with Node's own http2 module. Only Apple's two hosts
 * are ever called.
 */
import { createPrivateKey, sign, type KeyObject } from "node:crypto";
import { connect } from "node:http2";
import { IOS_APP } from "@/config/ios-app";
import type { PushMessage, PushOutcome } from "./send";

export interface ApnsConfig {
  key: KeyObject;
  keyId: string;
  teamId: string;
  topic: string;
}

export type ApnsEnvironment = "production" | "development";
export const APNS_HOSTS: Record<ApnsEnvironment, string> = { production: "https://api.push.apple.com", development: "https://api.sandbox.push.apple.com" };

/** The key and its id from the environment, or null while push for iPhone isn't set up. */
export function apnsConfig(env: Record<string, string | undefined> = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim() ?? "";
  const raw = env.APNS_KEY_P8?.trim() ?? "";
  if (!/^[A-Z0-9]{10}$/.test(keyId) || !raw) return null;
  // Pasted as the file, with escaped newlines, or as base64 of the file.
  const pem = raw.includes("BEGIN PRIVATE KEY") ? raw.replace(/\\n/g, "\n") : Buffer.from(raw, "base64").toString("utf8");
  try {
    const key = createPrivateKey({ key: pem, format: "pem" });
    if (key.asymmetricKeyType !== "ec") return null;
    return { key, keyId, teamId: IOS_APP.teamId, topic: IOS_APP.bundleId };
  } catch {
    return null;
  }
}

const b64url = (data: Buffer | string) => Buffer.from(data).toString("base64url");

/** The provider token: ES256 over header.claims, the signature as raw r||s. */
export function providerToken(config: Pick<ApnsConfig, "key" | "keyId" | "teamId">, now: Date): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: config.keyId }));
  const claims = b64url(JSON.stringify({ iss: config.teamId, iat: Math.floor(now.getTime() / 1000) }));
  const signature = sign("sha256", Buffer.from(`${header}.${claims}`), { key: config.key, dsaEncoding: "ieee-p1363" });
  return `${header}.${claims}.${b64url(signature)}`;
}

const TOKEN_LIFE_MS = 40 * 60_000;
let cached: { token: string; madeAt: number; keyId: string } | null = null;

function currentToken(config: ApnsConfig, now: Date): string {
  if (!cached || cached.keyId !== config.keyId || now.getTime() - cached.madeAt > TOKEN_LIFE_MS) {
    cached = { token: providerToken(config, now), madeAt: now.getTime(), keyId: config.keyId };
  }
  return cached.token;
}

/** What a phone shows: the alert, a sound, threads by tag, and the path to open. Under Apple's 4 KB. */
export function apnsPayload(message: PushMessage): string {
  return JSON.stringify({
    aps: { alert: { title: message.title.slice(0, 120), body: message.body.slice(0, 400) }, sound: "default", "thread-id": message.tag.slice(0, 64) },
    url: message.url,
  });
}

export interface ApnsTransport {
  post(origin: string, path: string, headers: Record<string, string>, body: string): Promise<{ status: number; reason: string | null }>;
}

/** HTTP/2 to Apple, one connection for a batch of sends, closed after. */
export function http2Transport(): ApnsTransport & { close(): void } {
  const sessions = new Map<string, ReturnType<typeof connect>>();
  return {
    post(origin, path, headers, body) {
      return new Promise((resolve) => {
        let session = sessions.get(origin);
        if (!session || session.closed || session.destroyed) {
          session = connect(origin);
          session.on("error", () => undefined);
          sessions.set(origin, session);
        }
        const req = session.request({ ":method": "POST", ":path": path, ...headers });
        let status = 0;
        let text = "";
        const timer = setTimeout(() => req.close(), 10_000);
        req.setEncoding("utf8");
        req.on("response", (h) => {
          status = Number(h[":status"] ?? 0);
        });
        req.on("data", (chunk: string) => {
          if (text.length < 2_000) text += chunk;
        });
        const done = () => {
          clearTimeout(timer);
          let reason: string | null = null;
          try {
            reason = text ? ((JSON.parse(text) as { reason?: string }).reason ?? null) : null;
          } catch {
            reason = null;
          }
          resolve({ status, reason });
        };
        req.on("end", done);
        req.on("close", done);
        req.on("error", () => resolve({ status: 0, reason: null }));
        req.end(body);
      });
    },
    close() {
      for (const s of sessions.values()) s.close();
      sessions.clear();
    },
  };
}

const GONE_REASONS = new Set(["BadDeviceToken", "DeviceTokenNotForTopic", "Unregistered"]);

/** Sends one alert to one phone. Apple saying the token is no longer valid makes it "gone". */
export async function sendApns(config: ApnsConfig, transport: ApnsTransport, device: { token: string; environment: ApnsEnvironment }, message: PushMessage, now = new Date()): Promise<PushOutcome> {
  if (!/^[0-9a-f]{64,200}$/.test(device.token)) return "gone";
  const { status, reason } = await transport.post(
    APNS_HOSTS[device.environment],
    `/3/device/${device.token}`,
    {
      authorization: `bearer ${currentToken(config, now)}`,
      "apns-topic": config.topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "apns-expiration": String(Math.floor(now.getTime() / 1000) + 24 * 3600),
      "apns-collapse-id": message.tag.slice(0, 64),
      "content-type": "application/json",
    },
    apnsPayload(message),
  );
  if (status === 200) return "sent";
  if (status === 410 || (status === 400 && reason !== null && GONE_REASONS.has(reason))) return "gone";
  return "failed";
}
