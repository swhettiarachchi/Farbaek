/**
 * Migration v41 (ADR 0069): Office Space only on trusted devices. The first
 * device is trusted at sign-in; later ones wait for approval from a trusted
 * device, with the code only the new device shows and a fresh authenticator
 * code. Removing a device keeps it out; the database owner can reset all.
 */
import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb } from "./harness";

const CEO = "00000000-0000-4000-8000-0000000000c0";
const MAL = "00000000-0000-4000-8000-0000000000ba";
const BOOT = "info@farbaek.com";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const LAPTOP = hash("laptop");
const PHONE = hash("phone");
const STRANGER = hash("stranger");

let db: PGlite;
let session: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const events = async () => Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
const lastAction = async () => (await su<{ action: string }>("select action from public.staff_audit_events order by seq desc limit 1"))[0]?.action;

type Check = { status: string; device?: string; code?: string; first?: boolean };
const checkDevice = async (user: string, token: string, label = "Chrome on Windows") =>
  (await q<{ r: Check }>("select public.app_staff_check_device($1, $2, $3, $4, null, 'vitest') as r", [user, token, label, BOOT]))[0]!.r;
const trusted = async (user: string, token: string) => (await q<{ ok: boolean }>("select public.app_staff_device_trusted($1, $2) as ok", [user, token]))[0]!.ok;
const approve = async (from: string, device: string, code: string, strength = "step_up") =>
  (await q<{ r: { ok: boolean; tries_left?: number } }>("select public.app_staff_approve_device($1, $2, $3, $4, $5, $6, null, 'vitest') as r", [CEO, session, from, device, code, strength]))[0]!.r;

beforeAll(async () => {
  db = await createTestDb();
  await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now()), ($2, 'mallory@example.test', now())", [CEO, MAL]);
  session = crypto.randomUUID();
  await su("insert into auth.sessions (id, user_id) values ($1, $2)", [session, CEO]);
}, 60_000);

describe("trusted devices", () => {
  it("answers nobody who isn't staff, the first owner or invited", async () => {
    expect(await checkDevice(MAL, STRANGER)).toEqual({ status: "not_staff" });
    expect(await su("select * from public.staff_devices")).toEqual([]);
    await expect(checkDevice(CEO, "not-a-hash")).rejects.toThrow(/INVALID_DEVICE/);
  });

  it("trusts the first device at sign-in, with one event", async () => {
    const before = await events();
    const r = await checkDevice(CEO, LAPTOP);
    expect(r).toMatchObject({ status: "trusted", first: true });
    expect(await events()).toBe(before + 1);
    expect(await lastAction()).toBe("device.trusted");
    expect(await trusted(CEO, LAPTOP)).toBe(true);
    // Signing in on it again changes nothing and records nothing.
    expect(await checkDevice(CEO, LAPTOP)).toMatchObject({ status: "trusted" });
    expect(await events()).toBe(before + 1);
    // The office session for the rest of the tests.
    expect((await q<{ r: { status: string } }>("select public.app_staff_begin_session($1, $2, now(), null, 'vitest', $3) as r", [CEO, session, BOOT]))[0]!.r.status).toBe("active");
  });

  it("makes a second device wait, with a six-digit code that stays the same", async () => {
    const first = await checkDevice(CEO, PHONE, "Safari on iPhone");
    expect(first.status).toBe("pending");
    expect(first.code).toMatch(/^\d{6}$/);
    expect(await trusted(CEO, PHONE)).toBe(false);
    expect(await checkDevice(CEO, PHONE, "Safari on iPhone")).toEqual(first);
  });

  it("approves only with the right code, a fresh authenticator code and a trusted device", async () => {
    const { device, code } = await checkDevice(CEO, PHONE);
    await expect(approve(LAPTOP, device!, code!, "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(approve(PHONE, device!, code!)).rejects.toThrow(/DEVICE_NOT_TRUSTED/);
    const before = await events();
    const wrong = code === "000000" ? "111111" : "000000";
    expect(await approve(LAPTOP, device!, wrong)).toEqual({ ok: false, tries_left: 4 });
    expect(await events()).toBe(before);
    expect(await approve(LAPTOP, device!, code!)).toEqual({ ok: true });
    expect(await events()).toBe(before + 1);
    expect(await lastAction()).toBe("device.approved");
    expect(await trusted(CEO, PHONE)).toBe(true);
    await expect(approve(LAPTOP, device!, code!)).rejects.toThrow(/DEVICE_NOT_WAITING/);
  });

  it("cancels a request after five wrong codes", async () => {
    const { device, code } = await checkDevice(CEO, STRANGER, "Firefox on Linux");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let left = 4; left >= 0; left--) expect(await approve(LAPTOP, device!, wrong)).toEqual({ ok: false, tries_left: left });
    await expect(approve(LAPTOP, device!, code!)).rejects.toThrow(/DEVICE_NOT_WAITING/);
    // The device asks again and gets a new code.
    const again = await checkDevice(CEO, STRANGER, "Firefox on Linux");
    expect(again.status).toBe("pending");
    expect(again.code).toMatch(/^\d{6}$/);
  });

  it("removes a device at once, and it has to be approved again", async () => {
    const phone = (await su<{ id: string }>("select id from public.staff_devices where token_hash = $1", [PHONE]))[0]!.id;
    const before = await events();
    await q("select public.app_staff_revoke_device($1, $2, $3, null, 'vitest')", [CEO, session, phone]);
    expect(await events()).toBe(before + 1);
    expect(await lastAction()).toBe("device.revoked");
    expect(await trusted(CEO, PHONE)).toBe(false);
    expect((await checkDevice(CEO, PHONE)).status).toBe("pending");
    await expect(q("select public.app_staff_revoke_device($1, $2, $3, null, 'vitest')", [CEO, session, crypto.randomUUID()])).rejects.toThrow(/DEVICE_NOT_FOUND/);
  });

  it("lets only the database owner reset every device, so the next sign-in starts over", async () => {
    await expect(q("select private.reset_staff_devices('info@farbaek.com')")).rejects.toThrow(/permission denied/);
    expect((await su<{ n: number }>("select private.reset_staff_devices('info@farbaek.com') as n"))[0]!.n).toBeGreaterThan(0);
    expect(await lastAction()).toBe("device.reset");
    expect(await trusted(CEO, LAPTOP)).toBe(false);
    expect(await checkDevice(CEO, PHONE)).toMatchObject({ status: "trusted", first: true });
  });

  it("keeps browsers out, and the server key to reads", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, CEO, () => db.query("select * from public.staff_devices"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, CEO, () => db.query("select public.app_staff_device_trusted($1, $2)", [CEO, LAPTOP]))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, CEO, () => db.query("select public.app_staff_check_device($1, $2, 'x', null, null, null)", [CEO, LAPTOP]))).rejects.toThrow(/permission denied/);
    }
    await expect(q("update public.staff_devices set approved_at = now()")).rejects.toThrow(/permission denied/);
    expect((await q("select id from public.staff_devices")).length).toBeGreaterThan(0);
  });

  it("refuses device actions to people without the permission", async () => {
    await expect(as(db, "service_role", null, () => db.query("select public.app_staff_revoke_device($1, $2, $3, null, null)", [MAL, crypto.randomUUID(), crypto.randomUUID()]))).rejects.toThrow(/NOT_STAFF/);
  });
});
