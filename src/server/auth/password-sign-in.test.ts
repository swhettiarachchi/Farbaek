import { describe, expect, it } from "vitest";
import { SIGN_IN_LIMITS } from "@/config/sign-in";
import { PASSWORD_MESSAGES, passwordSignInKey, signInWithPassword, type PasswordResult, type PasswordSignInDeps } from "./password-sign-in";
import { signInKey, type LimitResult } from "./sign-in";

function fakeDeps(over: Partial<PasswordSignInDeps> & { limits?: Record<string, LimitResult>; result?: PasswordResult } = {}) {
  const tried: { email: string; password: string; token: string | null }[] = [];
  const limited: { key: string; windowSeconds: number; limit: number }[] = [];
  const deps: PasswordSignInDeps = {
    captchaRequired: false,
    addressKey: passwordSignInKey("address", "203.0.113.7"),
    async rateLimit(key, windowSeconds, limit) {
      limited.push({ key, windowSeconds, limit });
      return over.limits?.[key] ?? "ok";
    },
    async signIn(email, password, token) {
      tried.push({ email, password, token });
      return over.result ?? { ok: true };
    },
    ...over,
  };
  return { deps, tried, limited };
}

const input = (over: Record<string, unknown> = {}) => ({ email: "review@farbaek.com", password: "correct horse", captchaToken: null, ...over });

describe("signing in with a password (ADR 0151)", () => {
  it("signs in with a valid address, lower-cased, and the password as typed", async () => {
    const { deps, tried } = fakeDeps();
    expect(await signInWithPassword(deps, input({ email: "  Review@Farbaek.com " }))).toBeNull();
    expect(tried).toEqual([{ email: "review@farbaek.com", password: "correct horse", token: null }]);
  });

  it("refuses an invalid address or an empty password before anything is counted or tried", async () => {
    for (const [over, message] of [
      [{ email: "not-an-address" }, PASSWORD_MESSAGES.invalidEmail],
      [{ password: "" }, PASSWORD_MESSAGES.missingPassword],
      [{ password: 42 }, PASSWORD_MESSAGES.missingPassword],
      [{ password: "x".repeat(129) }, PASSWORD_MESSAGES.missingPassword],
    ] as const) {
      const { deps, tried, limited } = fakeDeps();
      const state = await signInWithPassword(deps, input(over));
      expect(state).toMatchObject({ status: "error", message });
      expect(tried).toEqual([]);
      expect(limited).toEqual([]);
    }
  });

  it("counts tries by hash, apart from the email link's counts", async () => {
    const { deps, limited } = fakeDeps();
    await signInWithPassword(deps, input());
    expect(limited).toEqual([
      { key: passwordSignInKey("email", "review@farbaek.com"), ...SIGN_IN_LIMITS.passwordsPerEmail },
      { key: deps.addressKey, ...SIGN_IN_LIMITS.passwordsPerAddress },
    ]);
    expect(passwordSignInKey("email", "review@farbaek.com")).not.toBe(signInKey("email", "review@farbaek.com"));
    for (const { key } of limited) {
      expect(key).not.toContain("review");
      expect(key).not.toContain("203.0.113.7");
    }
  });

  it("stops at either limit, and fails closed when the limiter can't answer", async () => {
    const email = passwordSignInKey("email", "review@farbaek.com");
    for (const [limits, message] of [
      [{ [email]: "limited" }, PASSWORD_MESSAGES.tooMany],
      [{ [passwordSignInKey("address", "203.0.113.7")]: "limited" }, PASSWORD_MESSAGES.tooMany],
      [{ [email]: "unavailable" }, PASSWORD_MESSAGES.unavailable],
    ] as const) {
      const { deps, tried } = fakeDeps({ limits });
      expect(await signInWithPassword(deps, input())).toEqual({ status: "error", message, email: "review@farbaek.com" });
      expect(tried).toEqual([]);
    }
  });

  it("needs the browser check once Turnstile is on, and passes its token to Auth", async () => {
    const off = fakeDeps({ captchaRequired: true });
    expect(await signInWithPassword(off.deps, input())).toEqual({ status: "error", message: PASSWORD_MESSAGES.checking, email: "review@farbaek.com" });
    expect(off.tried).toEqual([]);

    const on = fakeDeps({ captchaRequired: true });
    expect(await signInWithPassword(on.deps, input({ captchaToken: "turnstile-token" }))).toBeNull();
    expect(on.tried[0]?.token).toBe("turnstile-token");
  });

  it("gives the same answer for a wrong password, an unknown account and an account without one", async () => {
    const { deps } = fakeDeps({ result: { ok: false, reason: "wrong" } });
    expect(await signInWithPassword(deps, input())).toEqual({ status: "error", message: PASSWORD_MESSAGES.wrong, email: "review@farbaek.com" });
  });

  it("says what Auth refused", async () => {
    for (const [reason, message] of [
      ["rate_limited", PASSWORD_MESSAGES.tooMany],
      ["captcha_failed", PASSWORD_MESSAGES.captchaFailed],
      ["failed", PASSWORD_MESSAGES.failed],
    ] as const) {
      const { deps } = fakeDeps({ result: { ok: false, reason } });
      expect(await signInWithPassword(deps, input())).toEqual({ status: "error", message, email: "review@farbaek.com" });
    }
  });
});
