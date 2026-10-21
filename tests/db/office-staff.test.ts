import type { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import { verifyStaffAuditChain, type ChainRow } from "@/core/office/audit-chain";
import { as, createTestDb } from "./harness";

/**
 * Migration v20 (ADR 0032): staff sign-in, roles, sessions and the
 * hash-chained audit log. Everything goes through app_staff_* as the
 * service role; the browser roles can't touch any of it.
 */

const CEO = "00000000-0000-4000-8000-0000000000c0";
const ADA = "00000000-0000-4000-8000-0000000000ad";
const MAL = "00000000-0000-4000-8000-0000000000ba";
const BOOT = "info@farbaek.com";

let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) =>
  as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

async function newSession(user: string): Promise<string> {
  const id = crypto.randomUUID();
  await su("insert into auth.sessions (id, user_id) values ($1, $2)", [id, user]);
  return id;
}
async function begin(user: string, session: string, boot: string | null = BOOT) {
  return (await q<{ r: { status: string; role?: string } }>("select public.app_staff_begin_session($1, $2, now(), null, 'vitest', $3) as r", [user, session, boot]))[0]!.r;
}
async function check(user: string, session: string) {
  return (await q<{ r: { status: string; reason?: string; role?: string } }>("select public.app_staff_check_session($1, $2) as r", [user, session]))[0]!.r;
}
async function eventCount(): Promise<number> {
  return Number((await su<{ n: number }>("select count(*)::int as n from public.staff_audit_events"))[0]!.n);
}
async function actions(): Promise<string[]> {
  return (await su<{ action: string }>("select action from public.staff_audit_events order by seq")).map((r) => r.action);
}

let ceoSession: string;
let adaSession: string;

beforeAll(async () => {
  db = await createTestDb();
  await su(
    "insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now()), ($2, 'ada@farbaek.test', now()), ($3, 'mallory@example.test', now())",
    [CEO, ADA, MAL],
  );
}, 60_000);

describe("who may touch the staff tables", () => {
  it("keeps browsers out and gives the server key reads only", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, MAL, () => db.query("select * from public.staff_members"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, MAL, () => db.query("select public.app_staff_begin_session($1, $2, now(), null, null, $3)", [MAL, crypto.randomUUID(), "mallory@example.test"]))).rejects.toThrow(/permission denied/);
    }
    expect(await q("select * from public.staff_members")).toEqual([]);
    await expect(q("insert into public.staff_members (user_id, email, role) values ($1, 'mallory@example.test', 'owner')", [MAL])).rejects.toThrow(/permission denied/);
    await expect(q("insert into public.staff_sessions (session_id, user_id, first_factor_at) values ($1, $2, now())", [crypto.randomUUID(), MAL])).rejects.toThrow(/permission denied/);
    await expect(q("delete from public.staff_audit_events")).rejects.toThrow(/permission denied/);
  });
});

describe("signing in", () => {
  it("only offers a code to staff, open invites and the first owner's address", async () => {
    const eligible = async (email: string, boot: string | null = BOOT) =>
      (await q<{ r: { eligible: boolean; may_create: boolean } }>("select public.app_staff_sign_in_eligibility($1, $2) as r", [email, boot]))[0]!.r;
    expect(await eligible(" INFO@farbaek.com ")).toEqual({ eligible: true, may_create: true });
    expect(await eligible("mallory@example.test")).toEqual({ eligible: false, may_create: false });
    expect(await eligible("info@farbaek.com", null)).toEqual({ eligible: false, may_create: false });
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [CEO, BOOT])).toEqual([{ ok: true }]);
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [MAL, BOOT])).toEqual([{ ok: false }]);
  });

  it("makes the first owner once, and nobody else from a mailbox alone", async () => {
    expect(await begin(MAL, await newSession(MAL))).toEqual({ status: "not_staff" });
    ceoSession = await newSession(CEO);
    expect(await begin(CEO, ceoSession)).toEqual({ status: "active", role: "owner" });
    expect(await actions()).toEqual(["staff.bootstrapped", "auth.signed_in"]);
    // The bootstrap address no longer works for anyone once there's an owner.
    expect(await begin(MAL, await newSession(MAL), "mallory@example.test")).toEqual({ status: "not_staff" });
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [MAL, "mallory@example.test"])).toEqual([{ ok: false }]);
    // Calling it again for the same session is a no-op.
    expect(await begin(CEO, ceoSession)).toEqual({ status: "active", role: "owner" });
    expect(await eventCount()).toBe(2);
  });

  it("refuses a first factor older than the office allows", async () => {
    await expect(q("select public.app_staff_begin_session($1, $2, now() - interval '13 hours', null, null, $3)", [CEO, await newSession(CEO), BOOT])).rejects.toThrow(/STAFF_SESSION_ENDED/);
  });
});

describe("sessions", () => {
  it("stay active while used, and end when idle, too old or signed out in Supabase", async () => {
    expect(await check(CEO, ceoSession)).toMatchObject({ status: "active", role: "owner" });

    const idle = await newSession(CEO);
    await begin(CEO, idle);
    expect(await check(CEO, ceoSession)).toEqual({ status: "ended", reason: "replaced" });
    await su("update public.staff_sessions set last_seen_at = now() - interval '31 minutes' where session_id = $1", [idle]);
    expect(await check(CEO, idle)).toEqual({ status: "ended", reason: "idle" });

    const old = await newSession(CEO);
    await begin(CEO, old);
    await su("update public.staff_sessions set first_factor_at = now() - interval '13 hours' where session_id = $1", [old]);
    expect(await check(CEO, old)).toEqual({ status: "ended", reason: "expired" });

    const gone = await newSession(CEO);
    await begin(CEO, gone);
    await su("delete from auth.sessions where id = $1", [gone]);
    expect(await check(CEO, gone)).toEqual({ status: "ended", reason: "auth_session_gone" });

    expect(await check(MAL, crypto.randomUUID())).toEqual({ status: "not_staff" });
    expect(await check(CEO, crypto.randomUUID())).toEqual({ status: "no_session" });

    ceoSession = await newSession(CEO);
    await begin(CEO, ceoSession);
    expect(await check(CEO, ceoSession)).toMatchObject({ status: "active" });
  });
});

describe("managing staff", () => {
  const invite = (session: string, email: string, role: string, strength = "step_up", reason = "New support hire for the October launch") =>
    q<{ id: string }>("select public.app_staff_invite($1, $2, $3, $4, 7, $5, $6, null, null) as id", [CEO, session, email, role, reason, strength]);

  it("invites need an owner, a fresh authenticator code and a reason", async () => {
    const before = await eventCount();
    await expect(invite(ceoSession, "ada@farbaek.test", "admin", "aal2")).rejects.toThrow(/STEP_UP_REQUIRED/);
    await expect(invite(ceoSession, "ada@farbaek.test", "admin", "step_up", "short")).rejects.toThrow(/REASON_REQUIRED/);
    await expect(invite(ceoSession, "not an email", "admin")).rejects.toThrow(/INVALID_EMAIL/);
    await expect(invite(ceoSession, "ada@farbaek.test", "superuser")).rejects.toThrow(/INVALID_ROLE/);
    await expect(invite(ceoSession, "info@farbaek.com", "admin")).rejects.toThrow(/ALREADY_STAFF/);
    expect(await eventCount()).toBe(before);

    await invite(ceoSession, "ada@farbaek.test", "viewer");
    await invite(ceoSession, "ADA@farbaek.test", "admin"); // replaces the open one
    expect(await su("select role from public.staff_invites where email = 'ada@farbaek.test' and revoked_at is null")).toEqual([{ role: "admin" }]);
    expect(await eventCount()).toBe(before + 2);
    await expect(su("update public.staff_invites set expires_at = created_at + interval '8 days'")).rejects.toThrow(/staff_invites_window/);
  });

  it("an invited person joins with the role on the invite, once", async () => {
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [ADA, BOOT])).toEqual([{ ok: true }]);
    adaSession = await newSession(ADA);
    expect(await begin(ADA, adaSession)).toEqual({ status: "invite_pending" });
    const r = (await q<{ r: { status: string; role: string } }>("select public.app_staff_accept_invite($1, $2, now(), null, null) as r", [ADA, adaSession]))[0]!.r;
    expect(r).toEqual({ status: "active", role: "admin" });
    await expect(q("select public.app_staff_accept_invite($1, $2, now(), null, null)", [ADA, adaSession])).rejects.toThrow(/ALREADY_STAFF/);
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [ADA, BOOT])).toEqual([{ ok: false }]);
    await expect(q("select public.app_staff_accept_invite($1, $2, now(), null, null)", [MAL, await newSession(MAL)])).rejects.toThrow(/INVITE_NOT_FOUND/);
  });

  it("admins can't manage staff, nobody changes themselves, and the office keeps an owner", async () => {
    const change = (actor: string, session: string, target: string, role: string) =>
      q("select public.app_staff_change_role($1, $2, $3, $4, 'Rebalancing who does what this month', 'step_up', null, null)", [actor, session, target, role]);
    await expect(change(ADA, adaSession, CEO, "viewer")).rejects.toThrow(/STAFF_FORBIDDEN/);
    await expect(change(CEO, ceoSession, CEO, "viewer")).rejects.toThrow(/CANNOT_CHANGE_SELF/);
    await change(CEO, ceoSession, ADA, "owner");
    await change(ADA, adaSession, CEO, "admin");
    // Ada is now the only owner: the database refuses to leave none, whoever asks.
    await expect(su("update public.staff_members set role = 'viewer' where user_id = $1", [ADA])).rejects.toThrow(/LAST_OWNER/);
    await expect(su("update public.staff_members set removed_at = now() where user_id = $1", [ADA])).rejects.toThrow(/LAST_OWNER/);
    await expect(su("delete from public.staff_members where user_id = $1", [CEO])).rejects.toThrow(/STAFF_ROWS_ARE_KEPT/);
    await change(ADA, adaSession, CEO, "owner");
    expect((await su<{ action: string; detail: unknown }>("select action, detail from public.staff_audit_events where action = 'staff.role_changed' order by seq")).map((e) => e.detail)).toEqual([
      { from: "admin", to: "owner" },
      { from: "owner", to: "admin" },
      { from: "admin", to: "owner" },
    ]);
  });

  it("a lost authenticator opens a 24-hour window and ends their sessions", async () => {
    await q("select public.app_staff_allow_mfa_reset($1, $2, $3, 'Ada lost her phone on the train', 'step_up', null, null)", [CEO, ceoSession, ADA]);
    expect(await check(ADA, adaSession)).toEqual({ status: "ended", reason: "revoked" });
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [ADA, BOOT])).toEqual([{ ok: true }]);
    await q("select public.app_staff_note_enrollment($1, null, null, null)", [ADA]);
    expect(await q("select public.app_staff_may_enroll($1, $2) as ok", [ADA, BOOT])).toEqual([{ ok: false }]);
  });

  it("removing someone keeps the row, ends their sessions and frees the address", async () => {
    adaSession = await newSession(ADA);
    await begin(ADA, adaSession);
    await q("select public.app_staff_remove($1, $2, $3, 'Contract ended at the end of October', 'step_up', null, null)", [CEO, ceoSession, ADA]);
    expect(await check(ADA, adaSession)).toEqual({ status: "not_staff" });
    expect(await su("select role, removed_at is not null as removed from public.staff_members where user_id = $1", [ADA])).toEqual([{ role: "owner", removed: true }]);
    await expect(q("select public.app_staff_remove($1, $2, $3, 'Removing myself for testing', 'step_up', null, null)", [CEO, ceoSession, CEO])).rejects.toThrow(/CANNOT_CHANGE_SELF/);
  });

  it("only lets the server log sign-in, access, factor and audit events", async () => {
    await q("select public.app_record_staff_event($1, $2, 'aal2', 'access.denied', 'page', '/staff', 'denied', '{}'::jsonb, null, null, null)", [CEO, ceoSession]);
    await expect(q("select public.app_record_staff_event($1, $2, 'aal2', 'workspace.suspended', 'org', 'x', 'success', '{}'::jsonb, null, null, null)", [CEO, ceoSession])).rejects.toThrow(/INVALID_EVENT/);
  });
});

describe("the audit log", () => {
  const rows = async () =>
    (await su<ChainRow & { seq: string | number }>("select seq, prev_hash, envelope, row_hash, action, result, target_type, target_id from public.staff_audit_events order by seq")).map((r) => ({ ...r, seq: Number(r.seq) }));

  it("is a gapless chain the TypeScript verifier accepts", async () => {
    const all = await rows();
    expect(all.length).toBeGreaterThan(10);
    expect(all.map((r) => r.seq)).toEqual(all.map((_, i) => i + 1));
    expect(await verifyStaffAuditChain(all)).toMatchObject({ ok: true, checked: all.length, throughSeq: all.length });
    // Checking from the middle needs only the row before.
    expect(await verifyStaffAuditChain(all.slice(5), all[4]!)).toMatchObject({ ok: true, throughSeq: all.length });
  });

  it("can't be changed or emptied, even by the table's owner", async () => {
    await expect(q("update public.staff_audit_events set reason = 'x'")).rejects.toThrow(/permission denied/);
    await expect(su("update public.staff_audit_events set reason = 'edited' where seq = 1")).rejects.toThrow(/STAFF_AUDIT_IMMUTABLE/);
    await expect(su("delete from public.staff_audit_events where seq = 1")).rejects.toThrow(/STAFF_AUDIT_IMMUTABLE/);
    await expect(su("truncate public.staff_audit_events")).rejects.toThrow(/STAFF_AUDIT_IMMUTABLE/);
  });

  it("shows tampering when someone gets past the triggers", async () => {
    await su("alter table public.staff_audit_events disable trigger staff_audit_events_immutable");
    await su("update public.staff_audit_events set envelope = replace(envelope, 'staff.invited', 'staff.inviter') where action = 'staff.invited'");
    const edited = await verifyStaffAuditChain(await rows());
    expect(edited.ok).toBe(false);
    await su("update public.staff_audit_events set envelope = replace(envelope, 'staff.inviter', 'staff.invited') where action = 'staff.invited'");
    expect((await verifyStaffAuditChain(await rows())).ok).toBe(true);
    await su("delete from public.staff_audit_events where seq = 3");
    expect(await verifyStaffAuditChain(await rows())).toMatchObject({ ok: false, firstBadSeq: 4 });
    await su("alter table public.staff_audit_events enable trigger staff_audit_events_immutable");
  });

  it("records each chain check in its own append-only table", async () => {
    await q("select public.app_staff_record_verification($1, $2, 12, $3, true, null)", [CEO, ceoSession, "a".repeat(64)]);
    await expect(su("delete from public.staff_audit_verifications")).rejects.toThrow(/STAFF_AUDIT_IMMUTABLE/);
    await expect(q("select public.app_staff_record_verification($1, $2, 12, null, true, null)", [MAL, crypto.randomUUID()])).rejects.toThrow(/NOT_STAFF/);
  });
});
