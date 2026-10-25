/**
 * Sending one push message (ADR 0079). Only the browsers' own push services
 * are ever called: an endpoint is accepted, stored and sent to only when it's
 * https on one of their hosts, so a stored address can't point the server
 * anywhere else. A service that says the subscription is gone gets it removed.
 */
import { encryptPush, vapidAuthorization, type VapidKeys } from "./web-push";

const PUSH_HOSTS: readonly RegExp[] = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge on Android, and Chromium browsers
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/, // Safari on iPhone, iPad and Mac
  /^[a-z0-9-]+\.notify\.windows\.com$/, // Edge on Windows
];

export function allowedEndpoint(endpoint: string): boolean {
  if (endpoint.length > 1000) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === "https:" && url.port === "" && !url.username && !url.password && PUSH_HOSTS.some((h) => h.test(url.hostname));
  } catch {
    return false;
  }
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushMessage {
  title: string;
  body: string;
  /** A path in Farbaek to open, such as /app/tasks/<id>. */
  url: string;
  /** Messages with the same tag replace each other on the device. */
  tag: string;
}

export type Fetcher = (url: string, init: RequestInit) => Promise<Response>;
export type PushOutcome = "sent" | "gone" | "failed";

export async function sendPush(keys: VapidKeys, sub: PushSubscriptionKeys, message: PushMessage, options: { fetcher?: Fetcher; now?: Date } = {}): Promise<PushOutcome> {
  if (!allowedEndpoint(sub.endpoint)) return "gone";
  let body: Buffer;
  try {
    body = encryptPush(Buffer.from(JSON.stringify(message), "utf8"), sub);
  } catch {
    return "gone";
  }
  try {
    const res = await (options.fetcher ?? fetch)(sub.endpoint, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
      headers: {
        TTL: String(24 * 3600),
        Urgency: "normal",
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        Authorization: vapidAuthorization(keys, sub.endpoint, options.now ?? new Date()),
      },
      body: new Uint8Array(body),
    });
    await res.body?.cancel().catch(() => undefined);
    if (res.status === 404 || res.status === 410) return "gone";
    return res.ok ? "sent" : "failed";
  } catch {
    return "failed";
  }
}
