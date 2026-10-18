/**
 * Migration 10: FARBAEK Sandbox records. Ownership, quotas, lifecycle,
 * one running command per session, previews, receipts and Row Level
 * Security, checked against real Postgres (PGlite) with every migration.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { nextSessionState, SESSION_EVENTS, SESSION_STATES } from "@/core/sandbox/lifecycle";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let otherOrg: string;
let project: string;
let archivedProject: string;
let otherProject: string;
const CAROL = "00000000-0000-4000-8000-00000000ca01"; // viewer in Alice's org
const DAVE = "00000000-0000-4000-8000-00000000da0e"; // admin in Alice's org

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const asUser = <T>(uid: string, fn: () => Promise<T>) => as(db, "authenticated", uid, fn);

let keyCounter = 0;
const key = () => `idem-key-${++keyCounter}`;

async function createSession(over: Partial<{ actor: string; org: string; project: string | null; task: string | null; max: number; minutes: number; key: string; network: string }> = {}) {
  const rows = await q<{ session_id: string; created: boolean }>(
    `select * from public.app_create_sandbox_session($1, $2, $3, $4, 'Try', 'node-ts', 'small', 'farbaek-node-small', $5, 1, 1024, 'test', 'microvm', 1800, 600, $6, $7, now() - interval '1 day', $8)`,
    [over.org ?? org, over.actor ?? USERS.alice, over.project === undefined ? project : over.project, over.task ?? null, over.network ?? "none", over.max ?? 100, over.minutes ?? 1000, over.key ?? key()],
  );
  return rows[0]!;
}

const transition = (id: string, actor: string | null, version: number, event: string, patch: Record<string, unknown> = {}) =>
  q<{ v: number }>("select public.app_transition_sandbox_session($1, $2, $3, $4, $5) as v", [id, actor, version, event, JSON.stringify(patch)]).then((r) => r[0]!.v);

async function readySession(actor: string = USERS.alice): Promise<string> {
  const { session_id } = await createSession({ actor });
  await transition(session_id, actor, 0, "provision");
  await transition(session_id, actor, 1, "provisioned", { provider_sandbox_id: `sbx${session_id.replace(/-/g, "").slice(0, 12)}`, vcpu: 1, memory_mib: 1024 });
  return session_id;
}

const startExec = (session: string, actor: string = USERS.alice, idem: string = key()) =>
  q<{ execution_id: string; created: boolean }>("select * from public.app_start_sandbox_execution($1, $2, 'command', null, 'echo hi', 60, '{}'::jsonb, $3)", [session, actor, idem]).then((r) => r[0]!);

const finishExec = (id: string, state: string, exit: number | null) =>
  q("select public.app_finish_sandbox_execution($1, $2, $3, 120, 'hi', '', false, false, null, null, $4)", [id, state, exit, state === "succeeded" ? null : "command_failed"]);

beforeAll(async () => {
  db = await createTestDb();
  await db.query("insert into auth.users (id, email, email_confirmed_at) values ($1, 'carol@example.test', now()), ($2, 'dave@example.test', now())", [CAROL, DAVE]);
  org = await createOrg(db, USERS.alice, "Alice Studio");
  otherOrg = await createOrg(db, USERS.bob, "Bob Works");
  await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member'), ($1, $3, 'viewer'), ($1, $4, 'admin')", [org, USERS.bob, CAROL, DAVE]);
  project = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Site', null, null) as id", [org, USERS.alice]))[0]!.id;
  archivedProject = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Old', null, null) as id", [org, USERS.alice]))[0]!.id;
  await q("select public.app_archive_project($1, $2)", [archivedProject, USERS.alice]);
  otherProject = (await q<{ id: string }>("select public.app_create_project($1, $2, 'Bob site', null, null) as id", [otherOrg, USERS.bob]))[0]!.id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("lifecycle table", () => {
  it("matches the TypeScript state machine for every state and event", async () => {
    for (const from of SESSION_STATES) {
      for (const event of SESSION_EVENTS) {
        // private.* isn't granted to any API role, so this runs as the database owner.
        const sql = (await db.query<{ to: string | null }>("select private.sandbox_next_state($1, $2) as to", [from, event])).rows[0]!.to;
        expect(`${from}+${event}=${sql}`).toBe(`${from}+${event}=${nextSessionState(from, event)}`);
      }
    }
  });
});

describe("starting sessions", () => {
  it("is for contributors in the workspace only", async () => {
    await expect(createSession({ actor: CAROL })).rejects.toThrow(/FORBIDDEN/);
    await expect(createSession({ org: otherOrg, actor: USERS.alice, project: null })).rejects.toThrow(/FORBIDDEN/);
  });

  it("refuses projects from other workspaces and archived projects", async () => {
    await expect(createSession({ project: otherProject })).rejects.toThrow(/NOT_FOUND/);
    await expect(createSession({ project: archivedProject })).rejects.toThrow(/PROJECT_ARCHIVED/);
  });

  it("returns the same session for a repeated idempotency key", async () => {
    const k = key();
    const first = await createSession({ key: k });
    const again = await createSession({ key: k });
    expect(first.created).toBe(true);
    expect(again).toEqual({ session_id: first.session_id, created: false });
    const audit = await q("select 1 from public.audit_events where target = $1", [first.session_id]);
    expect(audit).toHaveLength(1);
  });

  it("enforces the concurrency limit and the period's minutes under a lock", async () => {
    const fresh = await createOrg(db, USERS.bob, "Limits");
    await createSession({ org: fresh, actor: USERS.bob, project: null, max: 1 });
    await expect(createSession({ org: fresh, actor: USERS.bob, project: null, max: 1 })).rejects.toThrow(/SANDBOX_CONCURRENCY_LIMIT/);
    await expect(createSession({ org: fresh, actor: USERS.bob, project: null, max: 5, minutes: 0 })).rejects.toThrow(/SANDBOX_MINUTES_EXHAUSTED/);
    await expect(createSession({ org: fresh, actor: USERS.bob, project: null, max: 0 })).rejects.toThrow(/INVALID_LIMITS/);
  });

  it("refuses forged sizes and durations beyond the platform ceilings", async () => {
    await expect(
      q("select * from public.app_create_sandbox_session($1, $2, null, null, 'x', 'node-ts', 'small', 'img', 'none', 64, 999999, 'test', 'microvm', 1800, 600, 10, 100, now(), $3)", [org, USERS.alice, key()]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      q("select * from public.app_create_sandbox_session($1, $2, null, null, 'x', 'node-ts', 'small', 'img', 'none', 1, 1024, 'test', 'microvm', 999999, 600, 10, 100, now(), $3)", [org, USERS.alice, key()]),
    ).rejects.toThrow(/check constraint/);
    await expect(
      q("select * from public.app_create_sandbox_session($1, $2, null, null, 'x', 'node-ts', 'small', 'img', 'open', 1, 1024, 'test', 'microvm', 1800, 600, 10, 100, now(), $3)", [org, USERS.alice, key()]),
    ).rejects.toThrow(/check constraint/);
  });
});

describe("lifecycle changes", () => {
  it("apply once, in order, under a version check", async () => {
    const { session_id } = await createSession();
    await expect(transition(session_id, USERS.alice, 0, "provisioned", { provider_sandbox_id: "abc" })).rejects.toThrow(/INVALID_TRANSITION/);
    expect(await transition(session_id, USERS.alice, 0, "provision")).toBe(1);
    await expect(transition(session_id, USERS.alice, 0, "provisioned", { provider_sandbox_id: "abc" })).rejects.toThrow(/VERSION_CONFLICT/);
    await expect(transition(session_id, USERS.alice, 1, "provisioned", {})).rejects.toThrow(/INVALID_PATCH/);
    expect(await transition(session_id, USERS.alice, 1, "provisioned", { provider_sandbox_id: "abc123", vcpu: 1, memory_mib: 1024 })).toBe(2);
    const row = (await q<{ state: string; running_since: string | null }>("select state, running_since from public.sandbox_sessions where id = $1", [session_id]))[0]!;
    expect(row.state).toBe("ready");
    expect(row.running_since).not.toBeNull();
  });

  it("only lets the creator or an owner or admin stop a session", async () => {
    const id = await readySession(USERS.alice);
    await expect(transition(id, USERS.bob, 2, "stop")).rejects.toThrow(/FORBIDDEN/);
    await expect(transition(id, CAROL, 2, "stop")).rejects.toThrow(/FORBIDDEN/);
    expect(await transition(id, DAVE, 2, "stop")).toBe(3);
    const row = (await q<{ state: string; cleanup_status: string; end_reason: string }>("select state, cleanup_status, end_reason from public.sandbox_sessions where id = $1", [id]))[0]!;
    expect(row).toEqual({ state: "stopping", cleanup_status: "pending", end_reason: "user" });
    await q("select public.app_record_sandbox_cleanup($1, true, null)", [id]);
    expect(await transition(id, null, 3, "finish_termination")).toBe(4);
    const done = (await q<{ state: string; cleanup_status: string; ended_at: string | null }>("select state, cleanup_status, ended_at from public.sandbox_sessions where id = $1", [id]))[0]!;
    expect(done.state).toBe("terminated");
    expect(done.cleanup_status).toBe("done");
    expect(done.ended_at).not.toBeNull();
    await expect(transition(id, null, 4, "resume")).rejects.toThrow(/INVALID_TRANSITION/);
    const audit = await q<{ action: string }>("select action from public.audit_events where target = $1", [id]);
    expect(audit.map((a) => a.action)).toContain("sandbox.session_stop");
  });

  it("closes running segments on pause and keeps counting on resume", async () => {
    const id = await readySession();
    await q("update public.sandbox_sessions set running_since = now() - interval '120 seconds' where id = $1", [id]);
    await transition(id, USERS.alice, 2, "pause");
    const paused = (await q<{ billed_seconds: number; running_since: string | null }>("select billed_seconds, running_since from public.sandbox_sessions where id = $1", [id]))[0]!;
    expect(paused.billed_seconds).toBeGreaterThanOrEqual(120);
    expect(paused.running_since).toBeNull();
    await transition(id, USERS.alice, 3, "resume");
    await transition(id, null, 4, "expire", { end_reason: "idle" });
    const row = (await q<{ end_reason: string; state: string }>("select end_reason, state from public.sandbox_sessions where id = $1", [id]))[0]!;
    expect(row).toEqual({ end_reason: "idle", state: "stopping" });
  });

  it("records failures with a cleanup flag", async () => {
    const { session_id } = await createSession();
    await transition(session_id, USERS.alice, 0, "provision");
    await transition(session_id, USERS.alice, 1, "fail", { failure_category: "provider_rejected", failure_message: "Template not found", provider_sandbox_id: "leftover1" });
    const row = (await q<{ state: string; cleanup_status: string; failure_category: string }>("select state, cleanup_status, failure_category from public.sandbox_sessions where id = $1", [session_id]))[0]!;
    expect(row).toEqual({ state: "failed", cleanup_status: "pending", failure_category: "provider_rejected" });
    await q("select public.app_record_sandbox_cleanup($1, false, 'runtime timeout')", [session_id]);
    const after = (await q<{ cleanup_status: string; cleanup_attempts: number }>("select cleanup_status, cleanup_attempts from public.sandbox_sessions where id = $1", [session_id]))[0]!;
    expect(after).toEqual({ cleanup_status: "failed", cleanup_attempts: 1 });
  });
});

describe("executions", () => {
  it("allow one running command per session, idempotently", async () => {
    const id = await readySession();
    const idem = key();
    const first = await startExec(id, USERS.alice, idem);
    expect(first.created).toBe(true);
    expect(await startExec(id, USERS.alice, idem)).toEqual({ execution_id: first.execution_id, created: false });
    await expect(startExec(id)).rejects.toThrow(/SESSION_BUSY/);
    await finishExec(first.execution_id, "succeeded", 0);
    const second = await startExec(id);
    expect(second.created).toBe(true);
    await finishExec(second.execution_id, "failed", 2);
  });

  it("only record outcomes that agree with the exit code, once", async () => {
    const id = await readySession();
    const e = await startExec(id);
    await expect(finishExec(e.execution_id, "succeeded", 1)).rejects.toThrow(/INVALID_OUTCOME/);
    await expect(finishExec(e.execution_id, "failed", 0)).rejects.toThrow(/INVALID_OUTCOME/);
    await finishExec(e.execution_id, "timed_out", null);
    await finishExec(e.execution_id, "succeeded", 0); // already finished: no-op
    const row = (await q<{ state: string; exit_code: number | null }>("select state, exit_code from public.sandbox_executions where id = $1", [e.execution_id]))[0]!;
    expect(row).toEqual({ state: "timed_out", exit_code: null });
  });

  it("refuse other members, viewers and sessions that aren't running", async () => {
    const id = await readySession(USERS.alice);
    await expect(startExec(id, USERS.bob)).rejects.toThrow(/FORBIDDEN/);
    await expect(startExec(id, CAROL)).rejects.toThrow(/FORBIDDEN/);
    const own = await startExec(id, DAVE); // admins may operate any session
    await expect(q("select * from public.app_request_sandbox_cancel($1, $2)", [own.execution_id, USERS.bob])).rejects.toThrow(/FORBIDDEN/);
    const cancel = await q<{ already_finished: boolean }>("select * from public.app_request_sandbox_cancel($1, $2)", [own.execution_id, USERS.alice]);
    expect(cancel[0]!.already_finished).toBe(false);
    await finishExec(own.execution_id, "cancelled", null);
    await transition(id, USERS.alice, 2, "pause");
    await expect(startExec(id)).rejects.toThrow(/SESSION_NOT_RUNNING/);
  });
});

describe("previews", () => {
  const pid = (c: string) => c.repeat(26);

  it("launch once, for the person who opened them, while the session runs", async () => {
    const id = await readySession();
    await q("select public.app_create_sandbox_preview($1, $2, $3, 3000, 600)", [id, USERS.alice, pid("a")]);
    await expect(q("select * from public.app_launch_sandbox_preview($1, $2)", [pid("a"), USERS.bob])).rejects.toThrow(/PREVIEW_UNAVAILABLE/);
    const launched = await q<{ port: number }>("select * from public.app_launch_sandbox_preview($1, $2)", [pid("a"), USERS.alice]);
    expect(launched[0]!.port).toBe(3000);
    await expect(q("select * from public.app_launch_sandbox_preview($1, $2)", [pid("a"), USERS.alice])).rejects.toThrow(/PREVIEW_UNAVAILABLE/);
  });

  it("refuse revoked, expired, reserved-port and stopped-session previews", async () => {
    const id = await readySession();
    await q("select public.app_create_sandbox_preview($1, $2, $3, 3000, 600)", [id, USERS.alice, pid("b")]);
    await q("select public.app_revoke_sandbox_preview($1, $2)", [pid("b"), USERS.alice]);
    await expect(q("select * from public.app_launch_sandbox_preview($1, $2)", [pid("b"), USERS.alice])).rejects.toThrow(/PREVIEW_UNAVAILABLE/);

    await q("select public.app_create_sandbox_preview($1, $2, $3, 3000, 600)", [id, USERS.alice, pid("c")]);
    await q("update public.sandbox_previews set expires_at = now() - interval '1 second' where id = $1", [pid("c")]);
    await expect(q("select * from public.app_launch_sandbox_preview($1, $2)", [pid("c"), USERS.alice])).rejects.toThrow(/PREVIEW_UNAVAILABLE/);

    await expect(q("select public.app_create_sandbox_preview($1, $2, $3, 49983, 600)", [id, USERS.alice, pid("d")])).rejects.toThrow(/check constraint/);
    await expect(q("select public.app_create_sandbox_preview($1, $2, $3, 3000, 600)", [id, USERS.bob, pid("e")])).rejects.toThrow(/FORBIDDEN/);

    await q("select public.app_create_sandbox_preview($1, $2, $3, 3000, 600)", [id, USERS.alice, pid("f")]);
    await transition(id, USERS.alice, 2, "stop");
    await expect(q("select * from public.app_launch_sandbox_preview($1, $2)", [pid("f"), USERS.alice])).rejects.toThrow(/PREVIEW_UNAVAILABLE/);
    await expect(q("select public.app_create_sandbox_preview($1, $2, $3, 3000, 600)", [id, USERS.alice, pid("g")])).rejects.toThrow(/SESSION_NOT_RUNNING/);
  });

  it("never outlive their session", async () => {
    const id = await readySession();
    await q("update public.sandbox_sessions set expires_at = now() + interval '5 minutes' where id = $1", [id]);
    const exp = (await q<{ e: string }>("select public.app_create_sandbox_preview($1, $2, $3, 3000, 86400) as e", [id, USERS.alice, pid("h")]))[0]!.e;
    expect(new Date(exp).getTime()).toBeLessThan(Date.now() + 6 * 60_000);
  });
});

describe("receipts", () => {
  const statement = (session: string, orgId: string, status = "verified") => ({
    _type: "https://in-toto.io/Statement/v1",
    subject: [],
    predicateType: "https://farbaek.dev/sandbox-receipt/v1",
    predicate: { status, session: { id: session, organizationId: orgId } },
  });

  it("are recorded once, checked against the session, and never change", async () => {
    const id = await readySession();
    const digest = "d".repeat(64);
    await expect(q("select public.app_record_sandbox_receipt($1, $2, $3, 'verified', $4)", [id, USERS.alice, digest, JSON.stringify(statement(id, otherOrg))])).rejects.toThrow(/INVALID_RECEIPT/);
    await expect(q("select public.app_record_sandbox_receipt($1, $2, $3, 'failed', $4)", [id, USERS.alice, digest, JSON.stringify(statement(id, org))])).rejects.toThrow(/INVALID_RECEIPT/);
    await q("select public.app_record_sandbox_receipt($1, $2, $3, 'verified', $4)", [id, USERS.alice, digest, JSON.stringify(statement(id, org))]);
    await expect(q("update public.sandbox_receipts set status = 'failed' where digest = $1", [digest])).rejects.toThrow(/RECEIPT_IMMUTABLE/);
    await expect(q("update public.sandbox_receipts set statement = '{}'::jsonb where digest = $1", [digest])).rejects.toThrow();
  });
});

describe("Row Level Security and grants", () => {
  it("lets members read their workspace's sessions and nobody else's", async () => {
    const id = await readySession();
    const mine = await asUser(CAROL, async () => (await db.query("select id from public.sandbox_sessions where id = $1", [id])).rows);
    expect(mine).toHaveLength(1);
    const bobInOther = await asUser(USERS.bob, async () => (await db.query("select id from public.sandbox_sessions where org_id = $1", [otherOrg])).rows);
    expect(bobInOther).toHaveLength(0);
    // Bob is a member of Alice's org too, so remove him and check he loses access.
    await q("delete from public.organization_members where org_id = $1 and user_id = $2", [org, USERS.bob]);
    const gone = await asUser(USERS.bob, async () => (await db.query("select id from public.sandbox_sessions where id = $1", [id])).rows);
    expect(gone).toHaveLength(0);
    await q("insert into public.organization_members (org_id, user_id, role) values ($1, $2, 'member')", [org, USERS.bob]);
  });

  it("refuses direct writes and function calls from browsers", async () => {
    await expect(asUser(USERS.alice, () => db.query("insert into public.sandbox_sessions (org_id, created_by, name, template, size, image, network_profile, requested_vcpu, requested_memory_mib, provider, isolation, ttl_seconds, idle_seconds, expires_at, idempotency_key) values ($1, $2, 'x', 'node-ts', 'small', 'i', 'none', 1, 1024, 'p', 'microvm', 600, 600, now(), 'keykeykey')", [org, USERS.alice]))).rejects.toThrow();
    await expect(asUser(USERS.alice, () => db.query("update public.sandbox_sessions set state = 'ready'"))).rejects.toThrow();
    await expect(asUser(USERS.alice, () => db.query("select public.app_rate_limit('x', 60, 10)"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select * from public.app_launch_sandbox_preview($1, $2)", ["a".repeat(26), USERS.alice]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select * from public.sandbox_sessions"))).rejects.toThrow(/permission denied/);
    await expect(asUser(USERS.alice, () => db.query("select * from private.rate_limit_windows"))).rejects.toThrow(/permission denied/);
  });
});

describe("rate limits and retention", () => {
  it("counts requests per key per window", async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) results.push((await q<{ ok: boolean }>("select public.app_rate_limit('user:x:exec', 60, 3) as ok"))[0]!.ok);
    expect(results).toEqual([true, true, true, false]);
    expect((await q<{ ok: boolean }>("select public.app_rate_limit('user:y:exec', 60, 3) as ok"))[0]!.ok).toBe(true);
  });

  it("prunes old history of ended sessions but keeps receipts", async () => {
    const id = await readySession();
    const e = await startExec(id);
    await finishExec(e.execution_id, "succeeded", 0);
    await q("select public.app_record_sandbox_receipt($1, $2, $3, 'verified', $4)", [
      id,
      USERS.alice,
      "e".repeat(64),
      JSON.stringify({ _type: "https://in-toto.io/Statement/v1", predicate: { status: "verified", session: { id, organizationId: org } } }),
    ]);
    await q("update public.sandbox_executions set started_at = now() - interval '40 days' where id = $1", [e.execution_id]);
    // Running sessions keep their history.
    expect((await q<{ n: number }>("select public.app_prune_sandbox_history(now() - interval '30 days') as n"))[0]!.n).toBe(0);
    await transition(id, USERS.alice, 2, "stop");
    await q("select public.app_record_sandbox_cleanup($1, true, null)", [id]);
    await transition(id, null, 3, "finish_termination");
    expect((await q<{ n: number }>("select public.app_prune_sandbox_history(now() - interval '30 days') as n"))[0]!.n).toBe(1);
    expect(await q("select 1 from public.sandbox_receipts where digest = $1", ["e".repeat(64)])).toHaveLength(1);
  });
});
