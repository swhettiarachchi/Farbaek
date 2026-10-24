import { describe, expect, it } from "vitest";
import { checkStaff } from "./access";
import { officeConfig } from "./config";
import { CODE_SENT_MESSAGE, SIGN_IN_PAUSED, openSession, requestStaffCode, startEnrollment, uniqueFactorName, verifySecondFactor, verifyStaffCode, type OfficeAuth, type SignInDeps } from "./sign-in";
import type { StaffStore } from "./staff-store";
import { hardenOfficeCookie } from "./supabase";

const NOW = new Date("2026-10-22T12:00:00Z");
const ts = (minutesAgo: number) => Math.floor(NOW.getTime() / 1000) - minutesAgo * 60;

function fakes(over: { eligible?: boolean; mayCreate?: boolean; limited?: boolean; codeOk?: boolean; totp?: boolean; mayEnroll?: boolean; begin?: "active" | "invite_pending" | "not_staff"; aal?: string; device?: "trusted" | "pending" | "not_staff" | "error"; noDevice?: boolean } = {}) {
  const log: string[] = [];
  let aal = over.aal ?? "aal1";
  const auth: OfficeAuth = {
    async sendCode(email, create, redirect) {
      log.push(`send:${email}:${create}:${redirect}`);
      return { ok: true };
    },
    async verifyCode() {
      return over.codeOk ?? true;
    },
    async claims() {
      return { sub: "u1", session_id: "s1", aal, amr: [...(aal === "aal2" ? [{ method: "totp", timestamp: ts(0) }] : []), { method: "otp", timestamp: ts(5) }], email: "info@farbaek.com" };
    },
    async verifiedTotp() {
      return over.totp ? [{ id: "f1", friendlyName: null }] : [];
    },
    async unverifiedFactorIds() {
      return ["old"];
    },
    async enroll() {
      log.push("enroll");
      return { id: "f2", qr: "data:image/svg+xml;utf-8,<svg/>", secret: "ABC", uri: "otpauth://totp/x" };
    },
    async unenroll(id) {
      log.push(`unenroll:${id}`);
    },
    async verifyTotp(id, code) {
      log.push(`totp:${id}:${code}`);
      if (code === "000000") return false;
      aal = "aal2";
      return true;
    },
    async signOut() {
      log.push("signout");
    },
  };
  const store = {
    async rateLimit() {
      return !over.limited;
    },
    async eligibility() {
      return { ok: true, value: { eligible: over.eligible ?? true, may_create: over.mayCreate ?? false } };
    },
    async mayEnroll() {
      return over.mayEnroll ?? false;
    },
    async noteEnrollment() {
      log.push("noted");
      return { ok: true, value: null };
    },
    async checkDevice() {
      log.push("device");
      if (over.device === "error") return { ok: false, code: "UNKNOWN" };
      const status = over.device ?? "trusted";
      return { ok: true, value: status === "pending" ? { status, device: "00000000-0000-4000-8000-0000000000d1", code: "042517" } : { status } };
    },
    async beginSession() {
      log.push("begin");
      return { ok: true, value: { status: over.begin ?? "active", role: "owner" } };
    },
    async acceptInvite() {
      log.push("accept");
      return { ok: true, value: { status: "active", role: "admin" } };
    },
    async record(_a: unknown, e: { action: string }) {
      log.push(`event:${e.action}`);
      return { ok: true, value: 1 };
    },
  } as unknown as StaffStore;
  const deps: SignInDeps = {
    auth,
    store,
    office: { host: "officespace.farbaek.com", origin: "https://officespace.farbaek.com", ownerEmail: "info@farbaek.com" },
    meta: { ipHash: "a".repeat(32), userAgent: "vitest", requestId: "r1" },
    now: () => NOW,
    device: over.noDevice ? null : { hash: "d".repeat(64), label: "Chrome on Windows" },
  };
  return { deps, log };
}

describe("requesting a code", () => {
  it("sends one only when eligible, but answers the same either way", async () => {
    const staff = fakes({ eligible: true, mayCreate: true });
    expect(await requestStaffCode(staff.deps, " Info@Farbaek.com ")).toEqual({ status: "sent", email: "info@farbaek.com" });
    expect(staff.log).toContain("send:info@farbaek.com:true:https://officespace.farbaek.com/sign-in");

    const stranger = fakes({ eligible: false });
    expect(await requestStaffCode(stranger.deps, "mallory@example.test")).toEqual({ status: "sent", email: "mallory@example.test" });
    expect(stranger.log.some((l) => l.startsWith("send:"))).toBe(false);
    expect(CODE_SENT_MESSAGE).toContain("If this address belongs to Farbaek staff");
  });

  it("refuses a bad address and pauses after too many requests", async () => {
    expect(await requestStaffCode(fakes().deps, "not-an-email")).toMatchObject({ status: "error" });
    expect(await requestStaffCode(fakes({ limited: true }).deps, "info@farbaek.com")).toEqual({ status: "error", message: SIGN_IN_PAUSED, email: "info@farbaek.com" });
  });
});

describe("checking the email code", () => {
  it("goes to the authenticator, to enrolment, or nowhere", async () => {
    expect(await verifyStaffCode(fakes({ totp: true }).deps, "info@farbaek.com", "123 456")).toEqual({ status: "verify" });
    expect(await verifyStaffCode(fakes({ mayEnroll: true }).deps, "info@farbaek.com", "123456")).toEqual({ status: "enroll" });
    const nobody = fakes({ mayEnroll: false });
    expect(await verifyStaffCode(nobody.deps, "info@farbaek.com", "123456")).toEqual({ status: "not_staff" });
    expect(nobody.log).toContain("signout");
  });

  it("logs a wrong code and refuses malformed ones", async () => {
    const wrong = fakes({ codeOk: false });
    expect(await verifyStaffCode(wrong.deps, "info@farbaek.com", "123456")).toMatchObject({ status: "error" });
    expect(wrong.log).toContain("event:auth.code_failed");
    expect(await verifyStaffCode(fakes().deps, "info@farbaek.com", "12345")).toMatchObject({ status: "error" });
    expect(await verifyStaffCode(fakes({ limited: true }).deps, "info@farbaek.com", "123456")).toEqual({ status: "error", message: SIGN_IN_PAUSED });
  });
});

describe("the authenticator", () => {
  it("numbers a second authenticator added the same day, since Supabase Auth refuses a repeated name", () => {
    expect(uniqueFactorName("Office Space 2026-10-24", [])).toBe("Office Space 2026-10-24");
    expect(uniqueFactorName("Office Space 2026-10-24", ["Office Space 2026-10-24", null])).toBe("Office Space 2026-10-24 (2)");
    expect(uniqueFactorName("Office Space 2026-10-24", ["Office Space 2026-10-24", "Office Space 2026-10-24 (2)"])).toBe("Office Space 2026-10-24 (3)");
  });

  it("only starts enrolment for someone allowed, clearing half-finished factors first", async () => {
    expect(await startEnrollment(fakes({ mayEnroll: false }).deps)).toEqual({ status: "sign_in" });
    const ok = fakes({ mayEnroll: true });
    expect(await startEnrollment(ok.deps)).toMatchObject({ status: "ready", factorId: "f2" });
    expect(ok.log).toEqual(["unenroll:old", "enroll"]);
    // Someone who already has an authenticator adds another only from a full (aal2) session.
    expect(await startEnrollment(fakes({ totp: true, aal: "aal1" }).deps)).toEqual({ status: "sign_in" });
    expect(await startEnrollment(fakes({ totp: true, aal: "aal2" }).deps)).toMatchObject({ status: "ready" });
  });

  it("opens the office session after a right code, joining from an invite when there is one", async () => {
    const enrol = fakes({ mayEnroll: true });
    expect(await verifySecondFactor(enrol.deps, "f2", "123456", true)).toEqual({ status: "in", welcome: true });
    expect(enrol.log).toEqual(["totp:f2:123456", "noted", "device", "begin"]);

    const invited = fakes({ totp: true, begin: "invite_pending" });
    expect(await verifySecondFactor(invited.deps, null, "123456", false)).toEqual({ status: "in", welcome: true });
    expect(invited.log).toContain("accept");

    const wrong = fakes({ totp: true });
    expect(await verifySecondFactor(wrong.deps, null, "000000", false)).toMatchObject({ status: "error" });
    expect(wrong.log).toContain("event:auth.totp_failed");

    const outsider = fakes({ aal: "aal2", begin: "not_staff" });
    // Not staff by the device check too: signed out before any session.
    const stranger = fakes({ aal: "aal2", device: "not_staff" });
    expect(await openSession(stranger.deps, false)).toEqual({ status: "not_staff" });
    expect(stranger.log).toEqual(["device", "signout"]);
    expect(await openSession(outsider.deps, false)).toEqual({ status: "not_staff" });
    expect(outsider.log).toContain("signout");
  });
});

describe("trusted devices", () => {
  it("opens no session on a device that isn't trusted yet, and gives it its code", async () => {
    const waiting = fakes({ aal: "aal2", device: "pending" });
    expect(await openSession(waiting.deps, false)).toEqual({ status: "device", code: "042517" });
    expect(waiting.log).not.toContain("begin");
  });

  it("fails closed without a device, or when it can't be checked", async () => {
    const none = fakes({ aal: "aal2", noDevice: true });
    expect(await openSession(none.deps, false)).toMatchObject({ status: "error" });
    expect(none.log).not.toContain("begin");
    const broken = fakes({ aal: "aal2", device: "error" });
    expect(await openSession(broken.deps, false)).toMatchObject({ status: "error" });
    expect(broken.log).not.toContain("begin");
  });
});

describe("the office gate", () => {
  const claims = (aal: string, minutesAgo = 5) => ({ sub: "u1", session_id: "s1", aal, amr: [{ method: "otp", timestamp: ts(minutesAgo) }] });
  const active = { ok: true as const, value: { status: "active" as const, role: "admin" as const, last_seen_at: NOW.toISOString() } };

  it("refuses at each step, and lets a live staff session through", () => {
    expect(checkStaff({ hostOk: false, configured: true, claims: claims("aal2"), check: active, now: NOW })).toEqual({ ok: false, reason: "not_found" });
    expect(checkStaff({ hostOk: true, configured: false, claims: claims("aal2"), check: active, now: NOW })).toEqual({ ok: false, reason: "not_found" });
    expect(checkStaff({ hostOk: true, configured: true, claims: null, check: null, now: NOW })).toEqual({ ok: false, reason: "sign_in" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal1"), check: active, now: NOW })).toEqual({ ok: false, reason: "verify" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2", 13 * 60), check: active, now: NOW })).toEqual({ ok: false, reason: "sign_in" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2"), check: { ok: false, code: "UNKNOWN" }, now: NOW })).toEqual({ ok: false, reason: "unavailable" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2"), check: { ok: true, value: { status: "not_staff" } }, now: NOW })).toEqual({ ok: false, reason: "not_staff" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2"), check: { ok: true, value: { status: "ended", reason: "idle" } }, now: NOW })).toEqual({ ok: false, reason: "ended" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2"), check: active, deviceTrusted: true, now: NOW })).toMatchObject({ ok: true, role: "admin" });
    // A live session on a device that isn't trusted, or unknown, goes to the device page.
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2"), check: active, deviceTrusted: false, now: NOW })).toEqual({ ok: false, reason: "device" });
    expect(checkStaff({ hostOk: true, configured: true, claims: claims("aal2"), check: active, now: NOW })).toEqual({ ok: false, reason: "device" });
  });
});

describe("office settings and cookie", () => {
  it("turns the office on only for a valid host that isn't the app's", () => {
    const env = { NEXT_PUBLIC_SITE_URL: "https://www.farbaek.com" } as unknown as NodeJS.ProcessEnv;
    expect(officeConfig(env)).toBeNull();
    expect(officeConfig({ ...env, OFFICE_HOST: "www.farbaek.com" })).toBeNull();
    expect(officeConfig({ ...env, OFFICE_HOST: "bad host" })).toBeNull();
    expect(officeConfig({ ...env, OFFICE_HOST: "OfficeSpace.farbaek.com", OFFICE_OWNER_EMAIL: " Info@Farbaek.com " })).toEqual({
      host: "officespace.farbaek.com",
      origin: "https://officespace.farbaek.com",
      ownerEmail: "info@farbaek.com",
    });
    expect(officeConfig({ ...env, OFFICE_HOST: "officespace.localhost:3000" })?.origin).toBe("http://officespace.localhost:3000");
  });

  it("hardens every office cookie whatever the library asks for", () => {
    expect(hardenOfficeCookie({ path: "/x", domain: "farbaek.com", sameSite: "none", secure: false, httpOnly: false, maxAge: 34_560_000 })).toEqual({
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "strict",
      maxAge: 12 * 3600,
    });
    expect(hardenOfficeCookie({ maxAge: 0 }).maxAge).toBe(0);
  });
});
