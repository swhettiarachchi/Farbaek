import { describe, expect, it } from "vitest";
import { authenticate, connectFromBrowser, exchangeCode, refreshPhone, type PhoneAuthDeps, type PhoneSession, type PhoneStore } from "./auth";
import { challengeFor, cleanDeviceName, sha256Hex } from "./tokens";

const SITE = "https://www.farbaek.com";
const VERIFIER = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
const STATE = "state-1234";
const ALICE = "00000000-0000-4000-8000-00000000a11c";
const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiJ4In0.c2ln";

function fakeDeps(options: { limit?: boolean; session?: PhoneSession | null } = {}) {
  const codes = new Map<string, { userId: string; challenge: string; used: boolean; platform: "ios"; deviceName: string }>();
  const devices = new Map<string, { deviceId: string; userId: string; revoked: boolean }>();
  const store: PhoneStore = {
    async createCode(i) {
      codes.set(i.codeHash, { userId: i.userId, challenge: i.challenge, used: false, platform: "ios", deviceName: i.deviceName });
      return "ok";
    },
    async redeemCode(hash, challenge) {
      const c = codes.get(hash);
      if (!c || c.used) return null;
      c.used = true;
      return c.challenge === challenge ? { userId: c.userId, platform: c.platform, deviceName: c.deviceName } : null;
    },
    async register(i) {
      devices.set(i.sessionId, { deviceId: `device-${devices.size + 1}`, userId: i.userId, revoked: false });
      return `device-${devices.size}`;
    },
    async seen(sessionId) {
      const d = devices.get(sessionId);
      return d && !d.revoked ? { deviceId: d.deviceId, userId: d.userId, platform: "ios", push: false } : null;
    },
    async revoke() {
      return "signed_out";
    },
    async setPush() {
      return true;
    },
    async rateLimit() {
      return options.limit !== false;
    },
  };
  const session: PhoneSession = { accessToken: JWT, refreshToken: "refresh-abc123", expiresAt: 2_000_000_000, sessionId: "session-1" };
  const deps: PhoneAuthDeps = {
    store,
    auth: {
      newSession: async () => (options.session === undefined ? session : options.session),
      refresh: async (t) => (t === "refresh-abc123" ? session : null),
      verify: async (t) => (t === JWT ? { userId: ALICE, email: "alice@example.test", sessionId: "session-1", expiresAt: 2_000_000_000 } : null),
      appleSession: async () => null,
    },
  };
  return { deps, codes, devices };
}

const connect = (deps: PhoneAuthDeps, over: Partial<{ userId: string | null; requestOrigin: string | null; challenge: string; state: string; platform: string }> = {}) =>
  connectFromBrowser(deps, {
    userId: "userId" in over ? over.userId! : ALICE,
    requestOrigin: "requestOrigin" in over ? over.requestOrigin! : SITE,
    siteOrigin: SITE,
    fields: { challenge: over.challenge ?? challengeFor(VERIFIER), state: over.state ?? STATE, platform: over.platform ?? "ios", device: "Ada's iPhone" },
  });

const codeFrom = (answer: Awaited<ReturnType<typeof connectFromBrowser>>) => (answer.kind === "app" ? answer.params.code! : "");

describe("connecting a phone from the browser (ADR 0110)", () => {
  it("answers the app with a one-time code, kept only as its hash", async () => {
    const { deps, codes } = fakeDeps();
    const answer = await connect(deps);
    expect(answer.kind).toBe("app");
    if (answer.kind !== "app") return;
    expect(answer.params).toEqual({ code: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), state: "state-1234" });
    expect([...codes.keys()]).toEqual([sha256Hex(codeFrom(answer))]);
  });

  it("refuses a post from anywhere but Farbaek's own pages", async () => {
    const { deps } = fakeDeps();
    expect(await connect(deps, { requestOrigin: "https://evil.example" })).toEqual({ kind: "refused", status: 403, message: expect.any(String) });
    expect((await connect(deps, { requestOrigin: null })).kind).toBe("refused");
  });

  it("sends a signed-out browser to sign in and back, and returns bad requests to the app", async () => {
    const { deps } = fakeDeps();
    const out = await connect(deps, { userId: null });
    expect(out.kind).toBe("sign_in");
    expect(out.kind === "sign_in" && decodeURIComponent(out.location)).toContain("/auth/connect?challenge=");
    expect(await connect(deps, { challenge: "short" })).toEqual({ kind: "app", params: { error: "invalid_request", state: "state-1234" } });
    expect((await connect(deps, { state: "<script>" })).kind).toBe("refused");
  });

  it("names the device as the person will recognise it", () => {
    expect(cleanDeviceName("  Ada's\u0000 iPhone\n 15 ", "ios")).toBe("Ada's iPhone 15");
    expect(cleanDeviceName("", "ios")).toBe("iPhone");
    expect(cleanDeviceName("x".repeat(80), "android")).toHaveLength(60);
  });
});

describe("redeeming the code", () => {
  it("gives the phone its own session for the right verifier, once", async () => {
    const { deps } = fakeDeps();
    const answer = await connect(deps);
    const code = codeFrom(answer);
    const grant = await exchangeCode(deps, { code, verifier: VERIFIER, appVersion: "1.0 (3)", clientKey: "k" });
    expect(grant).toEqual({ ok: true, value: { accessToken: JWT, refreshToken: "refresh-abc123", expiresAt: 2_000_000_000, deviceId: "device-1" } });
    expect((await exchangeCode(deps, { code, verifier: VERIFIER, appVersion: null, clientKey: "k" })).ok).toBe(false);
  });

  it("refuses the wrong verifier, and the code is then gone", async () => {
    const { deps } = fakeDeps();
    const answer = await connect(deps);
    const code = codeFrom(answer);
    const wrong = await exchangeCode(deps, { code, verifier: "x".repeat(43), appVersion: null, clientKey: "k" });
    expect(wrong).toMatchObject({ ok: false, status: 400, code: "INVALID_GRANT" });
    expect((await exchangeCode(deps, { code, verifier: VERIFIER, appVersion: null, clientKey: "k" })).ok).toBe(false);
  });

  it("is rate-limited per network, and says so when Auth can't make a session", async () => {
    expect(await exchangeCode(fakeDeps({ limit: false }).deps, { code: "a".repeat(43), verifier: VERIFIER, appVersion: null, clientKey: "k" })).toMatchObject({ status: 429 });
    const { deps } = fakeDeps({ session: null });
    const answer = await connect(deps);
    const code = codeFrom(answer);
    expect(await exchangeCode(deps, { code, verifier: VERIFIER, appVersion: null, clientKey: "k" })).toMatchObject({ status: 503, code: "SIGN_IN_UNAVAILABLE" });
  });
});

describe("staying signed in", () => {
  async function connected() {
    const f = fakeDeps();
    const answer = await connect(f.deps);
    await exchangeCode(f.deps, { code: codeFrom(answer), verifier: VERIFIER, appVersion: null, clientKey: "k" });
    return f;
  }

  it("accepts a connected phone's access token, and refuses it once the phone is disconnected", async () => {
    const { deps, devices } = await connected();
    expect(await authenticate(deps, `Bearer ${JWT}`)).toMatchObject({ ok: true, value: { userId: ALICE, deviceId: "device-1", accessToken: JWT } });
    expect(await authenticate(deps, null)).toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
    expect(await authenticate(deps, "Bearer a.b.c")).toMatchObject({ status: 401, code: "TOKEN_EXPIRED" });
    devices.get("session-1")!.revoked = true;
    expect(await authenticate(deps, `Bearer ${JWT}`)).toMatchObject({ status: 401, code: "DISCONNECTED" });
    expect(await refreshPhone(deps, { refreshToken: "refresh-abc123", clientKey: "k" })).toMatchObject({ status: 401, code: "DISCONNECTED" });
  });

  it("refreshes only a valid refresh token", async () => {
    const { deps } = await connected();
    expect(await refreshPhone(deps, { refreshToken: "refresh-abc123", clientKey: "k" })).toMatchObject({ ok: true, value: { accessToken: JWT } });
    expect(await refreshPhone(deps, { refreshToken: "wrong-token", clientKey: "k" })).toMatchObject({ status: 401, code: "SIGNED_OUT" });
    expect(await refreshPhone(deps, { refreshToken: 42, clientKey: "k" })).toMatchObject({ status: 401 });
  });
});
