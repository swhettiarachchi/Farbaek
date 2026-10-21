import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createOrg, createTestDb, USERS } from "./harness";

/**
 * Migration v23 (ADR 0032, phase 4): people write to Farbaek and staff
 * answer. A request is its author's alone; staff identity and internal notes
 * never reach them; a suspended workspace or a paused platform can still
 * reach support; and the health read is counts only.
 */

const CEO = "00000000-0000-4000-8000-0000000000d0";
const SUPPORT = "00000000-0000-4000-8000-0000000000d1";
const VIEWER = "00000000-0000-4000-8000-0000000000d2";
const REASON = "A new teammate on the support desk";

let db: PGlite;
let org: string;
const sessions: Record<string, string> = {};
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const su = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;
const asUser = async <T = Record<string, unknown>>(user: string, sql: string, params: unknown[] = []) => as(db, "authenticated", user, async () => (await db.query<T>(sql, params)).rows);
const events = async () => su<{ action: string; detail: Record<string, unknown> }>("select action, detail from public.staff_audit_events order by seq");
const open = (user: string, orgId: string | null, subject = "The preview won't load", body = "It spins and never shows my site.") =>
  q<{ id: string }>("select public.app_support_open($1, $2, 'not_working', $3, $4) as id", [user, orgId, subject, body]).then((r) => r[0]!.id);
const staffReply = (who: string, thread: string, body: string, internal = false) =>
  q("select public.app_staff_support_reply($1, $2, $3, $4, $5, null, null)", [who, sessions[who], thread, body, internal]);

async function signIn(user: string) {
  const session = crypto.randomUUID();
  await su("insert into auth.sessions (id, user_id) values ($1, $2)", [session, user]);
  sessions[user] = session;
  return session;
}

beforeAll(async () => {
  db = await createTestDb();
  await su("insert into auth.users (id, email, email_confirmed_at) values ($1, 'info@farbaek.com', now()), ($2, 'sam@farbaek.test', now()), ($3, 'val@farbaek.test', now())", [CEO, SUPPORT, VIEWER]);
  await q("select public.app_staff_begin_session($1, $2, now(), null, null, 'info@farbaek.com')", [CEO, await signIn(CEO)]);
  for (const [user, email, role] of [
    [SUPPORT, "sam@farbaek.test", "support"],
    [VIEWER, "val@farbaek.test", "viewer"],
  ] as const) {
    await q("select public.app_staff_invite($1, $2, $3, $4, 3, $5, 'step_up', null, null)", [CEO, sessions[CEO], email, role, REASON]);
    await q("select public.app_staff_accept_invite($1, $2, now(), null, null)", [user, await signIn(user)]);
  }
  org = await createOrg(db, USERS.alice, "Alice Studio");
}, 90_000);

afterAll(async () => {
  await db.close();
});

describe("a person's support request", () => {
  it("is opened, answered and closed, and stays its author's alone", async () => {
    const id = await open(USERS.alice, org);
    expect(await asUser(USERS.alice, "select subject, status from public.support_threads")).toEqual([{ subject: "The preview won't load", status: "waiting_on_farbaek" }]);
    expect(await asUser(USERS.bob, "select id from public.support_threads")).toEqual([]);
    expect(await asUser(USERS.bob, "select id from public.support_messages")).toEqual([]);
    await expect(q("select public.app_support_reply($1, $2, 'Me too')", [USERS.bob, id])).rejects.toThrow(/THREAD_MISSING/);

    await staffReply(SUPPORT, id, "Thanks. We restarted the preview host; try again now.");
    await staffReply(SUPPORT, id, "Customer is on the old preview domain.", true);
    const seen = await asUser<{ from_staff: boolean; body: string }>(USERS.alice, "select from_staff, body from public.support_messages order by id");
    expect(seen).toEqual([
      { from_staff: false, body: "It spins and never shows my site." },
      { from_staff: true, body: "Thanks. We restarted the preview host; try again now." },
    ]);
    expect(await asUser(USERS.alice, "select status from public.support_threads")).toEqual([{ status: "waiting_on_you" }]);

    await q("select public.app_support_close($1, $2)", [USERS.alice, id]);
    expect(await asUser(USERS.alice, "select status from public.support_threads")).toEqual([{ status: "closed" }]);
    await q("select public.app_support_reply($1, $2, 'It broke again this morning.')", [USERS.alice, id]);
    expect(await asUser(USERS.alice, "select status, closed_at from public.support_threads")).toEqual([{ status: "waiting_on_farbaek", closed_at: null }]);
  });

  it("never shows a person who on the staff answered, or internal notes", async () => {
    await expect(asUser(USERS.alice, "select assigned_to from public.support_threads")).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "select author_id from public.support_messages")).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "select internal from public.support_messages")).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, "insert into public.support_messages (thread_id, from_staff, body) select id, true, 'x' from public.support_threads")).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_support_open($1, null, 'other', 'Hello there', 'Hi')", [USERS.alice]))).rejects.toThrow(/permission denied/);
  });

  it("checks the workspace, the topic and the lengths", async () => {
    await expect(open(USERS.bob, org)).rejects.toThrow(/FORBIDDEN/);
    await expect(q("select public.app_support_open($1, null, 'pizza', 'Hello there', 'Hi')", [USERS.bob])).rejects.toThrow(/INVALID_SUPPORT/);
    await expect(open(USERS.bob, null, "Hi")).rejects.toThrow(/INVALID_SUPPORT/);
    await expect(open(USERS.bob, null, "Hello there", "   ")).rejects.toThrow(/INVALID_SUPPORT/);
    await expect(open(USERS.bob, null, "Hello there", "x".repeat(4001))).rejects.toThrow(/INVALID_SUPPORT/);
  });

  it("still works while the workspace is suspended and the platform is paused", async () => {
    await su("update public.organizations set suspended_at = now(), suspended_notice = 'Paused while we review a report.' where id = $1", [org]);
    await su("update public.platform_flags set paused = true");
    const id = await open(USERS.alice, org, "Why is my workspace paused?", "I'd like to understand the notice.");
    await q("select public.app_support_reply($1, $2, 'Any update?')", [USERS.alice, id]);
    await staffReply(SUPPORT, id, "We're reviewing it today.");
    await su("update public.organizations set suspended_at = null, suspended_notice = null where id = $1", [org]);
    await su("update public.platform_flags set paused = false");
  });

  it("limits new requests to five a day per person", async () => {
    for (let i = 0; i < 5; i += 1) await open(USERS.bob, null, `Question number ${i}`);
    await expect(open(USERS.bob, null, "One too many")).rejects.toThrow(/SUPPORT_LIMIT/);
  });
});

describe("staff on support", () => {
  it("lets support answer and assign, records each step without the message, and refuses viewers", async () => {
    const id = await open(USERS.alice, null, "Billing question", "When does the trial end?");
    const before = (await events()).length;
    await staffReply(SUPPORT, id, "The trial runs 14 days from the start.");
    await q("select public.app_staff_support_update($1, $2, $3, 'close', null, null)", [SUPPORT, sessions[SUPPORT], id]);
    await q("select public.app_staff_support_update($1, $2, $3, 'reopen', null, null)", [SUPPORT, sessions[SUPPORT], id]);
    const after = (await events()).slice(before);
    expect(after.map((e) => e.action)).toEqual(["support.replied", "support.closed", "support.reopened"]);
    expect(JSON.stringify(after)).not.toContain("trial runs");
    expect(await su("select assigned_to from public.support_threads where id = $1", [id])).toEqual([{ assigned_to: SUPPORT }]);

    const queue = (await q<{ r: { id: string; email: string; assignedEmail: string | null; messages: number }[] }>("select public.app_office_support_queue('waiting_on_farbaek', false) as r"))[0]!.r;
    expect(queue.find((t) => t.id === id)).toMatchObject({ email: "alice@example.test", assignedEmail: "sam@farbaek.test", messages: 2 });
    expect((await q<{ r: unknown[] }>("select public.app_office_support_queue('waiting_on_farbaek', true) as r"))[0]!.r).toEqual([]);
    await staffReply(SUPPORT, id, "Checked the billing record.", true);
    const thread = (await q<{ r: { email: string; messages: { internal: boolean; staffEmail: string | null }[] } }>("select public.app_office_support_thread($1) as r", [id]))[0]!.r;
    expect(thread.email).toBe("alice@example.test");
    expect(thread.messages.map((m) => [m.internal, m.staffEmail])).toEqual([
      [false, null],
      [false, "sam@farbaek.test"],
      [true, "sam@farbaek.test"],
    ]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_office_support_queue('closed', false)"))).rejects.toThrow(/permission denied/);

    await expect(staffReply(VIEWER, id, "Hello")).rejects.toThrow(/STAFF_FORBIDDEN/);
    await expect(q("select public.app_staff_support_update($1, $2, $3, 'delete', null, null)", [SUPPORT, sessions[SUPPORT], id])).rejects.toThrow(/INVALID_SUPPORT/);
    expect((await events()).length).toBe(before + 4);
  });
});

describe("system health", () => {
  it("reads runs, the audit chain, switches and the support queue, for the server only", async () => {
    const h = (await q<{ h: Record<string, unknown> }>("select public.app_office_health(now()) as h"))[0]!.h;
    expect(h.runs).toEqual({ live: 0, stuck: 0, failed24: 0, finished24: 0 });
    expect(h.paused).toEqual([]);
    expect(h.audit).toMatchObject({ lastCheck: null });
    expect((h.audit as { events: number }).events).toBeGreaterThan(0);
    expect((h.support as { waiting: number }).waiting).toBeGreaterThan(0);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_office_health(now())"))).rejects.toThrow(/permission denied/);
  });
});
