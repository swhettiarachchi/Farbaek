import { describe, expect, it } from "vitest";
import { allowedEndpoint, sendPush, type Fetcher } from "./send";
import { vapidKeys } from "./web-push";

const KEYS = vapidKeys({ SUPABASE_SECRET_KEY: "sb_secret_example" })!;
const SUB = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc123",
  p256dh: "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4",
  auth: "BTBZMqHH6r4Tts7J_aSIgg",
};
const MESSAGE = { title: "Ready to review: Cart total", body: "The change is waiting for you.", url: "/app/tasks/t1", tag: "task:t1" };

describe("push endpoints", () => {
  it("accepts only the browsers' push services over https", () => {
    for (const ok of [SUB.endpoint, "https://updates.push.services.mozilla.com/wpush/v2/x", "https://web.push.apple.com/QF1", "https://wns2-par02p.notify.windows.com/w/?token=x"]) expect(allowedEndpoint(ok), ok).toBe(true);
    for (const bad of ["http://fcm.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://evil.example/x", "https://fcm.googleapis.com.evil.example/x", "https://u:p@fcm.googleapis.com/x", "not a url"]) {
      expect(allowedEndpoint(bad), bad).toBe(false);
    }
  });
});

describe("sendPush", () => {
  it("sends one encrypted message with VAPID, and never follows a redirect", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher: Fetcher = async (url, init) => (calls.push({ url, init }), new Response(null, { status: 201 }));
    expect(await sendPush(KEYS, SUB, MESSAGE, { fetcher })).toBe("sent");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(calls[0]!.url).toBe(SUB.endpoint);
    expect(headers["Content-Encoding"]).toBe("aes128gcm");
    expect(headers.Authorization).toMatch(/^vapid t=.+, k=/);
    expect(calls[0]!.init.redirect).toBe("error");
    // The body is ciphertext: the message never travels in the clear.
    expect(Buffer.from(calls[0]!.init.body as Uint8Array).toString("utf8")).not.toContain("Ready to review");
  });

  it("reports a gone subscription so it can be removed, and other failures as failures", async () => {
    const answer = (status: number): Fetcher => async () => new Response(null, { status });
    expect(await sendPush(KEYS, SUB, MESSAGE, { fetcher: answer(410) })).toBe("gone");
    expect(await sendPush(KEYS, SUB, MESSAGE, { fetcher: answer(404) })).toBe("gone");
    expect(await sendPush(KEYS, SUB, MESSAGE, { fetcher: answer(500) })).toBe("failed");
    const down: Fetcher = async () => {
      throw new TypeError("fetch failed");
    };
    expect(await sendPush(KEYS, SUB, MESSAGE, { fetcher: down })).toBe("failed");
    expect(await sendPush(KEYS, { ...SUB, endpoint: "https://evil.example/x" }, MESSAGE, { fetcher: answer(201) })).toBe("gone");
  });
});
