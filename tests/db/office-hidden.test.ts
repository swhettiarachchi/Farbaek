/**
 * Migration v44 (ADR 0072): the office is invisible to unknown devices; a new
 * device is added with a one-time code made on a trusted device.
 */
import type { PGlite } from "@electric-sql/pglite";
import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb } from "./harness";

const CEO = "00000000-0000-4000-8000-0000000000c0";
const BOOT = "info@farbaek.com";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const LAPTOP = hash("laptop");
const PHONE = hash("phone");
const STRANGER = hash("stranger");

let db: PGlite;
let session: string;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const known = async (token: string | null) => (await q<{ ok: boolean }>("select public.app_office_device_known($1) as ok", [token]))[0]!.ok;
const invite = async (code: string, from = LAPTOP, strength = "step_up") => (await q<{ at: string }>("select public.app_staff_create_device_invite($1, $2, $3, $4, $5, null, 'vitest') as at", [CEO, session, from, hash(code), strength]))[0]!.at;
const redeem = async (code: string, token: string) => (await q<{ ok: boolean }>("select public.app_staff_redeem_device_invite($1, $2, 'Chrome on Android', null, 'vitest') as ok", [hash(code), token]))[0]!.ok;
const trusted = async (token: string) => (await q<{ ok: boolean }>("select public.app_staff_device_trusted($1, $2) as ok", [CEO, token]))[0]!.ok;

beforeAll(async () => {
  db = await createTestDb();
  await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now())", [CEO]);
  session = crypto.randomUUID();
  await su("insert into auth.sessions (id, user_id) values ($1, $2)", [session, CEO]);
}, 60_000);

describe("the hidden office", () => {
  it("is open while no device is trusted, so the first one can sign in", async () => {
    expect(await known(null)).toBe(true);
    expect(await known(STRANGER)).toBe(true);
  });

  it("then shows itself only to known devices", async () => {
    await q("select public.app_staff_check_device($1, $2, 'Chrome on Windows', $3, null, 'vitest')", [CEO, LAPTOP, BOOT]);
    await q("select public.app_staff_begin_session($1, $2, now(), null, 'vitest', $3)", [CEO, session, BOOT]);
    expect(await known(LAPTOP)).toBe(true);
    expect(await known(STRANGER)).toBe(false);
    expect(await known(null)).toBe(false);
    expect(await known("not-a-hash")).toBe(false);
  });

  it("adds a device with a code made on a trusted device, once, within 15 minutes", async () => {
    await expect(invite("K7P29XQM", LAPTOP, "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(invite("K7P29XQM", STRANGER)).rejects.toThrow(/DEVICE_NOT_TRUSTED/);
    const expires = await invite("K7P29XQM");
    expect(Date.parse(expires) - Date.now()).toBeGreaterThan(14 * 60_000);
    expect(await redeem("WRONGONE", PHONE)).toBe(false);
    expect(await known(PHONE)).toBe(false);
    expect(await redeem("K7P29XQM", PHONE)).toBe(true);
    expect(await known(PHONE)).toBe(true);
    expect(await trusted(PHONE)).toBe(true);
    // Used once: the same code does nothing for another device.
    expect(await redeem("K7P29XQM", STRANGER)).toBe(false);
  });

  it("keeps one live code at a time, and expired codes do nothing", async () => {
    await invite("FIRSTONE");
    await invite("SECONDXX");
    expect(await redeem("FIRSTONE", STRANGER)).toBe(false);
    await su("update public.staff_device_invites set expires_at = now() - interval '1 second' where code_hash = $1", [hash("SECONDXX")]);
    expect(await redeem("SECONDXX", STRANGER)).toBe(false);
    expect(await known(STRANGER)).toBe(false);
  });

  it("forgets a removed device, and reopens only after a full reset over SSH", async () => {
    const phone = (await su<{ id: string }>("select id from public.staff_devices where token_hash = $1", [PHONE]))[0]!.id;
    await q("select public.app_staff_revoke_device($1, $2, $3, null, 'vitest')", [CEO, session, phone]);
    expect(await known(PHONE)).toBe(false);
    await su("select private.reset_staff_devices('info@farbaek.com')");
    expect(await known(STRANGER)).toBe(true);
  });

  it("keeps the codes out of everyone's reach but its own functions", async () => {
    await expect(q("select * from public.staff_device_invites")).rejects.toThrow(/permission denied/);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, CEO, () => db.query("select public.app_office_device_known(null)"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, CEO, () => db.query("select public.app_staff_redeem_device_invite($1, $2, 'x', null, null)", [hash("x"), PHONE]))).rejects.toThrow(/permission denied/);
    }
  });
});
