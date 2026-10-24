/**
 * Migration v35: sandbox running time stops counting at the session's
 * expiry, since the runtime kills the sandbox there. Production had a session
 * closed five days late that counted 119 hours and used up its workspace's
 * minutes.
 */
import type { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let keyCounter = 0;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);

/** A 30-minute session, provisioned: running since now. */
async function readySession(minutes = 1000): Promise<string> {
  const id = (
    await q<{ session_id: string }>(
      "select session_id from public.app_create_sandbox_session($1, $2, null, null, 'Try', 'node-ts', 'small', 'img', 'none', 1, 1024, 'test', 'microvm', 1800, 600, 100, $3, now() - interval '1 day', $4)",
      [org, USERS.alice, minutes, `time-cap-${++keyCounter}`],
    )
  )[0]!.session_id;
  await q("select public.app_transition_sandbox_session($1, $2, 0, 'provision', '{}'::jsonb)", [id, USERS.alice]);
  await q("select public.app_transition_sandbox_session($1, $2, 1, 'provisioned', $3)", [id, USERS.alice, JSON.stringify({ provider_sandbox_id: `sbx${keyCounter}`, vcpu: 1, memory_mib: 1024 })]);
  return id;
}

/** Moves a session back in time, as if it had been made `ago` ago and is still marked running. */
const age = (id: string, ago: string) =>
  q(
    `update public.sandbox_sessions set created_at = now() - interval '${ago}', running_since = now() - interval '${ago}' + interval '30 seconds',
       expires_at = now() - interval '${ago}' + interval '1800 seconds' where id = $1`,
    [id],
  );

const row = (id: string) => q<{ billed_seconds: number; state: string }>("select billed_seconds, state from public.sandbox_sessions where id = $1", [id]).then((r) => r[0]!);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("sandbox running time", () => {
  it("closes at the session's expiry when a stop is recorded days later", async () => {
    const id = await readySession();
    await age(id, "5 days");
    await q("select public.app_transition_sandbox_session($1, null, 2, 'expire', '{}'::jsonb)", [id]);
    // Running from 30 seconds after creation until the 30-minute expiry.
    expect(await row(id)).toEqual({ billed_seconds: 1770, state: "stopping" });
  });

  it("still counts a session that's running now, up to now", async () => {
    const id = await readySession();
    await q("update public.sandbox_sessions set running_since = now() - interval '120 seconds' where id = $1", [id]);
    await q("select public.app_transition_sandbox_session($1, $2, 2, 'pause', '{}'::jsonb)", [id, USERS.alice]);
    const r = await row(id);
    expect(r.billed_seconds).toBeGreaterThanOrEqual(120);
    expect(r.billed_seconds).toBeLessThan(130);
  });

  it("doesn't let a session left marked running past its expiry use up the period's minutes", async () => {
    const stuck = await readySession();
    await age(stuck, "5 days");
    // 30 minutes of allowance: the stuck session counts about 30, not 7,200.
    const used = (await q<{ s: number }>("select sum(billed_seconds + greatest(0, extract(epoch from (least(now(), expires_at) - running_since))))::int as s from public.sandbox_sessions where id = $1", [stuck]))[0]!.s;
    expect(used).toBe(1770);
    await q("update public.sandbox_sessions set state = 'terminated' where id = $1", [stuck]);
    await expect(readySession(60)).resolves.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("the correction of sessions already counted past their expiry", () => {
  it("caps them at their lifetime and records the old and new values", async () => {
    const id = await readySession();
    // As production had it: closed late, 428,105 seconds counted.
    await q(
      "update public.sandbox_sessions set state = 'stopping', running_since = null, billed_seconds = 428105, created_at = now() - interval '6 days', expires_at = now() - interval '6 days' + interval '1800 seconds' where id = $1",
      [id],
    );
    const fine = await readySession();
    await q("update public.sandbox_sessions set state = 'terminated', running_since = null, billed_seconds = 53 where id = $1", [fine]);

    const sql = readFileSync("supabase/migrations/20261106090000_sandbox_time_cap.sql", "utf8");
    // The migration's correction, run again as the migration runs it.
    await db.exec(sql.slice(sql.indexOf("with over as")));

    expect((await row(id)).billed_seconds).toBe(1800);
    expect((await row(fine)).billed_seconds).toBe(53);
    const events = await q<{ event: string; detail: { billed_seconds_was: number; billed_seconds: number } }>("select event, detail from public.sandbox_events where session_id = $1 and event = 'session.billing_corrected'", [id]);
    expect(events).toHaveLength(1);
    expect(events[0]!.detail).toMatchObject({ billed_seconds_was: 428105, billed_seconds: 1800 });
    expect(await q("select 1 from public.sandbox_events where session_id = $1 and event = 'session.billing_corrected'", [fine])).toEqual([]);
  });

  it("leaves no way to count with the old function", async () => {
    expect(await q("select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'private' and p.proname = 'sandbox_running_seconds' and p.pronargs = 2")).toEqual([]);
  });
});
