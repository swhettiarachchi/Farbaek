import { describe, expect, it } from "vitest";
import { SIGN_IN_LIMITS } from "@/config/sign-in";
import { requestSignIn, signInKey, SIGN_IN_MESSAGES, type LimitResult, type SendResult, type SignInDeps } from "./sign-in";

function fakeDeps(over: Partial<SignInDeps> & { limits?: Record<string, LimitResult>; send?: SendResult } = {}) {
  const sent: { email: string; token: string | null }[] = [];
  const limited: { key: string; windowSeconds: number; limit: number }[] = [];
  const deps: SignInDeps = {
    captchaRequired: false,
    addressKey: signInKey("address", "203.0.113.7"),
    async rateLimit(key, windowSeconds, limit) {
      limited.push({ key, windowSeconds, limit });
      return over.limits?.[key] ?? "ok";
    },
    async sendLink(email, token) {
      sent.push({ email, token });
      return over.send ?? { ok: true };
    },
    ...over,
  };
  return { deps, sent, limited };
}

describe("asking for a sign-in link", () => {
  it("sends a link to a valid address, lower-cased, and answers the same way for any account", async () => {
    const { deps, sent } = fakeDeps();
    expect(await requestSignIn(deps, { email: "  Ada@Example.com ", captchaToken: null })).toEqual({ status: "sent", email: "ada@example.com" });
    expect(sent).toEqual([{ email: "ada@example.com", token: null }]);
  });

  it("refuses an invalid address before anything is counted or sent", async () => {
    const { deps, sent, limited } = fakeDeps();
    expect(await requestSignIn(deps, { email: "not-an-address", captchaToken: null })).toEqual({ status: "error", message: SIGN_IN_MESSAGES.invalidEmail, email: "not-an-address" });
    expect(sent).toEqual([]);
    expect(limited).toEqual([]);
  });

  it("counts the email address and the network address by hash, with their own limits", async () => {
    const { deps, limited } = fakeDeps();
    await requestSignIn(deps, { email: "ada@example.com", captchaToken: null });
    expect(limited).toEqual([
      { key: signInKey("email", "ada@example.com"), ...SIGN_IN_LIMITS.linksPerEmail },
      { key: deps.addressKey, ...SIGN_IN_LIMITS.linksPerAddress },
    ]);
    for (const { key } of limited) {
      expect(key).not.toContain("ada");
      expect(key).not.toContain("203.0.113.7");
      expect(key.length).toBeLessThanOrEqual(200);
    }
  });

  it("stops at either limit, and fails closed when the limiter can't answer", async () => {
    const email = signInKey("email", "ada@example.com");
    for (const [limits, message] of [
      [{ [email]: "limited" }, SIGN_IN_MESSAGES.tooMany],
      [{ [signInKey("address", "203.0.113.7")]: "limited" }, SIGN_IN_MESSAGES.tooMany],
      [{ [email]: "unavailable" }, SIGN_IN_MESSAGES.unavailable],
    ] as const) {
      const { deps, sent } = fakeDeps({ limits });
      expect(await requestSignIn(deps, { email: "ada@example.com", captchaToken: null })).toEqual({ status: "error", message, email: "ada@example.com" });
      expect(sent).toEqual([]);
    }
  });

  it("needs a browser check token once Turnstile is on, and passes it to Auth", async () => {
    const off = fakeDeps({ captchaRequired: true });
    expect(await requestSignIn(off.deps, { email: "ada@example.com", captchaToken: "" })).toEqual({ status: "error", message: SIGN_IN_MESSAGES.checking, email: "ada@example.com" });
    expect(off.sent).toEqual([]);
    expect(off.limited).toEqual([]);

    const on = fakeDeps({ captchaRequired: true });
    expect((await requestSignIn(on.deps, { email: "ada@example.com", captchaToken: "token-1" })).status).toBe("sent");
    expect(on.sent).toEqual([{ email: "ada@example.com", token: "token-1" }]);
  });

  it("ignores an oversized token", async () => {
    const { deps, sent } = fakeDeps({ captchaRequired: true });
    expect((await requestSignIn(deps, { email: "ada@example.com", captchaToken: "x".repeat(2049) })).status).toBe("error");
    expect(sent).toEqual([]);
  });

  it("says what Auth refused", async () => {
    for (const [reason, message] of [
      ["rate_limited", SIGN_IN_MESSAGES.tooMany],
      ["captcha_failed", SIGN_IN_MESSAGES.captchaFailed],
      ["failed", SIGN_IN_MESSAGES.failed],
    ] as const) {
      const { deps } = fakeDeps({ send: { ok: false, reason } });
      expect(await requestSignIn(deps, { email: "ada@example.com", captchaToken: null })).toEqual({ status: "error", message, email: "ada@example.com" });
    }
  });

  it("writes its messages without em dashes", () => {
    for (const message of Object.values(SIGN_IN_MESSAGES)) expect(message).not.toContain("—");
  });
});
