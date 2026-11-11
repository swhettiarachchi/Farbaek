import { afterEach, describe, expect, it, vi } from "vitest";
import { API_KEY_PATTERN, apiKeyHint, apiKeyState, looksLikeApiKey } from "@/core/workspace/api-keys";
import type { SessionAuth } from "@/server/phone/auth";
import { accessTokenForKey, apiKeySha256, forgetKeySessions, identifyKey, newApiKey, type KeyIdentity } from "./keys";

const who: KeyIdentity = { keyId: "k1", orgId: "o1", userId: "u1", role: "owner", suspended: false };
const NOW = Date.parse("2026-11-11T10:00:00Z");
const s = (token: string, expiresInSeconds: number) => ({ accessToken: token, refreshToken: `r-${token}`, expiresAt: Math.floor(NOW / 1000) + expiresInSeconds, sessionId: "s" });

function fakeAuth(over: Partial<SessionAuth> = {}) {
  const calls: string[] = [];
  // Whose each handed-out session is, as Auth's own check of a token would say.
  const owner = new Map<string, string>();
  const auth = {
    newSession: vi.fn(async (userId: string) => {
      calls.push(`new:${userId}`);
      const session = s(`new-${calls.length}`, 3600);
      owner.set(session.accessToken, userId);
      return session;
    }),
    refresh: vi.fn(async (refresh: string) => {
      calls.push(`refresh:${refresh}`);
      const session = s(`fresh-${calls.length}`, 3600);
      owner.set(session.accessToken, owner.get(refresh.slice(2)) ?? "");
      return session;
    }),
    signInToken: vi.fn(),
    verify: vi.fn(async (token: string) => (owner.has(token) ? { userId: owner.get(token)!, email: "", sessionId: "s", expiresAt: 0 } : null)),
    appleSession: vi.fn(),
    ...over,
  } as unknown as SessionAuth;
  return { auth, calls };
}

afterEach(() => forgetKeySessions());

describe("a developer API key (ADR 0187)", () => {
  it("is fbk_ and 256 random bits, shown later only by its first characters", () => {
    const key = newApiKey();
    expect(key).toMatch(API_KEY_PATTERN);
    expect(newApiKey()).not.toBe(key);
    expect(apiKeyHint(key)).toBe(key.slice(0, 8));
    expect(apiKeyHint(key)).toMatch(/^fbk_[A-Za-z0-9_-]{4}$/);
    expect(apiKeySha256(key)).toMatch(/^[0-9a-f]{64}$/);
    expect([looksLikeApiKey(key), looksLikeApiKey("eyJhbGciOi.session.token")]).toEqual([true, false]);
  });

  it("says whether a key works, has expired or was revoked", () => {
    const now = new Date(NOW);
    expect(apiKeyState({ expiresAt: "2026-12-01T00:00:00Z", revokedAt: null }, now)).toBe("working");
    expect(apiKeyState({ expiresAt: "2026-11-01T00:00:00Z", revokedAt: null }, now)).toBe("expired");
    expect(apiKeyState({ expiresAt: "2026-12-01T00:00:00Z", revokedAt: "2026-11-05T00:00:00Z" }, now)).toBe("revoked");
  });

  it("asks the database only about a well-formed key, by its hash", async () => {
    const rpc = vi.fn(async () => ({ data: [{ key_id: "k1", org_id: "o1", user_id: "u1", role: "admin", suspended: false }], error: null }));
    const admin = { rpc } as never;
    expect(await identifyKey(admin, "fbk_short")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
    const key = newApiKey();
    expect(await identifyKey(admin, key)).toEqual({ keyId: "k1", orgId: "o1", userId: "u1", role: "admin", suspended: false });
    expect(rpc).toHaveBeenCalledWith("app_api_key_session", { p_sha256: apiKeySha256(key) });
    const none = { rpc: vi.fn(async () => ({ data: [], error: null })) } as never;
    expect(await identifyKey(none, key)).toBeNull();
  });
});

describe("the session a key acts through", () => {
  it("signs in once, then reuses the session while it has time left", async () => {
    const { auth, calls } = fakeAuth();
    expect(await accessTokenForKey(who, auth, () => NOW)).toBe("new-1");
    expect(await accessTokenForKey(who, auth, () => NOW + 30 * 60_000)).toBe("new-1");
    expect(calls).toEqual(["new:u1"]);
  });

  it("refreshes a session near its end, and signs in again if the refresh fails", async () => {
    const { auth, calls } = fakeAuth();
    await accessTokenForKey(who, auth, () => NOW);
    expect(await accessTokenForKey(who, auth, () => NOW + 59 * 60_000)).toBe("fresh-2");
    expect(calls).toEqual(["new:u1", "refresh:r-new-1"]);
    const failing = fakeAuth({ refresh: vi.fn(async () => null) });
    forgetKeySessions();
    await accessTokenForKey(who, failing.auth, () => NOW);
    expect(await accessTokenForKey(who, failing.auth, () => NOW + 59 * 60_000)).toBe("new-2");
  });

  it("starts one session for calls that arrive together", async () => {
    const { auth, calls } = fakeAuth();
    const [a, b] = await Promise.all([accessTokenForKey(who, auth, () => NOW), accessTokenForKey(who, auth, () => NOW)]);
    expect([a, b]).toEqual(["new-1", "new-1"]);
    expect(calls).toEqual(["new:u1"]);
  });

  it("never lends one key's session to another key or person", async () => {
    const { auth, calls } = fakeAuth();
    await accessTokenForKey(who, auth, () => NOW);
    await accessTokenForKey({ ...who, keyId: "k2", userId: "u2" }, auth, () => NOW);
    // The same key now names someone else (it can't, but if it did): a fresh sign-in, not the old session.
    await accessTokenForKey({ ...who, userId: "u3" }, auth, () => NOW);
    expect(calls).toEqual(["new:u1", "new:u2", "new:u3"]);
  });

  it("says so when Auth gives no session", async () => {
    const { auth } = fakeAuth({ newSession: vi.fn(async () => null) });
    expect(await accessTokenForKey(who, auth, () => NOW)).toBeNull();
  });

  it("never uses a session that belongs to someone else, and signs it out", async () => {
    const retired: string[] = [];
    // The maker's address changed between the lookup and the sign-in: Auth hands back another account's session.
    const { auth } = fakeAuth({ verify: vi.fn(async () => ({ userId: "someone-else", email: "", sessionId: "s", expiresAt: 0 })) });
    expect(await accessTokenForKey(who, auth, () => NOW, async (t) => retired.push(t))).toBeNull();
    expect(retired).toEqual(["new-1"]);
  });

  it("signs out a session it replaces, but not one it only refreshed", async () => {
    const retired: string[] = [];
    const retire = async (t: string) => retired.push(t);
    const { auth } = fakeAuth();
    await accessTokenForKey(who, auth, () => NOW, retire);
    await accessTokenForKey(who, auth, () => NOW + 59 * 60_000, retire);
    expect(retired).toEqual([]);
    forgetKeySessions();
    const failing = fakeAuth({ refresh: vi.fn(async () => null) });
    await accessTokenForKey(who, failing.auth, () => NOW, retire);
    await accessTokenForKey(who, failing.auth, () => NOW + 59 * 60_000, retire);
    expect(retired).toEqual(["new-1"]);
  });
});
