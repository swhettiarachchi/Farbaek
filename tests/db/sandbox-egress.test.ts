/**
 * Migration v78: the Sandbox Egress Ledger (ADR 0127). Only the server
 * records a command's network record, once, as an object of bounded size;
 * members read it with the command; nobody else writes it.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let execution: string;

const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const EGRESS = { allowed: [{ host: "registry.npmjs.org", port: 443, attempts: 2 }], blocked: [{ host: "evil.example", port: 443, attempts: 1 }], unreadable: 0, truncated: false };
const record = (id: string, egress: unknown) => q("select public.app_record_sandbox_egress($1, $2)", [id, egress === null ? null : JSON.stringify(egress)]);

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  await createOrg(db, USERS.bob, "Bob Labs");
  const [s] = await q<{ session_id: string }>(
    "select * from public.app_create_sandbox_session($1, $2, null, null, 'Try', 'node-ts', 'small', 'img', 'package_registries', 1, 1024, 'test', 'microvm', 1800, 600, 100, 1000, now() - interval '1 day', 'egress-session-key')",
    [org, USERS.alice],
  );
  const session = s!.session_id;
  await q("select public.app_transition_sandbox_session($1, $2, 0, 'provision', '{}')", [session, USERS.alice]);
  await q("select public.app_transition_sandbox_session($1, $2, 1, 'provisioned', $3)", [session, USERS.alice, JSON.stringify({ provider_sandbox_id: "sbx123456789", vcpu: 1, memory_mib: 1024 })]);
  const [e] = await q<{ execution_id: string }>("select * from public.app_start_sandbox_execution($1, $2, 'command', null, 'npm install', 60, '{}'::jsonb, 'egress-exec-key')", [session, USERS.alice]);
  execution = e!.execution_id;
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("a command's network record", () => {
  it("is refused when it isn't the expected shape, then stored once", async () => {
    await expect(record(execution, null)).rejects.toThrow(/INVALID_EGRESS/);
    await expect(record(execution, { allowed: "x", blocked: [] })).rejects.toThrow(/INVALID_EGRESS/);
    await expect(record(execution, [1, 2])).rejects.toThrow(/INVALID_EGRESS/);
    await expect(record("00000000-0000-4000-8000-000000000000", EGRESS)).rejects.toThrow(/NOT_FOUND/);
    await record(execution, EGRESS);
    await expect(record(execution, EGRESS)).rejects.toThrow(/ALREADY_RECORDED/);
    expect((await db.query<{ egress: unknown }>("select egress from public.sandbox_executions where id = $1", [execution])).rows[0]!.egress).toEqual(EGRESS);
  });

  it("can't be larger than 64 KB", async () => {
    await expect(db.query("update public.sandbox_executions set egress = $2 where id = $1", [execution, JSON.stringify({ allowed: [], blocked: [], pad: "x".repeat(70_000) })])).rejects.toThrow(/egress_check/);
  });

  it("is read by members with the command, and written only by the server", async () => {
    expect(await as(db, "authenticated", USERS.alice, async () => (await db.query<{ egress: unknown }>("select egress from public.sandbox_executions where id = $1", [execution])).rows)).toEqual([{ egress: EGRESS }]);
    expect(await as(db, "authenticated", USERS.bob, async () => (await db.query("select egress from public.sandbox_executions where id = $1", [execution])).rows)).toEqual([]);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("select public.app_record_sandbox_egress($1, $2)", [execution, JSON.stringify(EGRESS)]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", null, () => db.query("select public.app_record_sandbox_egress($1, $2)", [execution, JSON.stringify(EGRESS)]))).rejects.toThrow(/permission denied/);
    await expect(as(db, "authenticated", USERS.alice, () => db.query("update public.sandbox_executions set egress = null"))).rejects.toThrow(/permission denied/);
  });
});
