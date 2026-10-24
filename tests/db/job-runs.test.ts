/**
 * Migration v43 (ADR 0071): background jobs record their last success and
 * last failure; only the server key and the database owner can.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createTestDb } from "./harness";

let db: PGlite;
const q = async <T = Record<string, unknown>>(sql: string, params: unknown[] = []) => as(db, "service_role", null, async () => (await db.query<T>(sql, params)).rows);
const runs = () => q<{ job: string; last_ok_at: string | null; last_failed_at: string | null; last_detail: string | null }>("select * from public.app_job_runs()");

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("job runs", () => {
  it("records a success, then a failure, keeping both times", async () => {
    await q("select public.app_note_job_run('db_backup', true, 'farbaek-20261024.dump')");
    await q("select public.app_note_job_run('db_backup', false, 'pg_dump failed')");
    const [row] = await runs();
    expect(row).toMatchObject({ job: "db_backup", last_detail: "pg_dump failed" });
    expect(row!.last_ok_at).not.toBeNull();
    expect(row!.last_failed_at).not.toBeNull();
  });

  it("refuses jobs it doesn't know", async () => {
    await expect(q("select public.app_note_job_run('mine_bitcoin', true, null)")).rejects.toThrow(/check constraint/);
  });

  it("is out of reach of browsers, and the database owner can record runs (the backup scripts)", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(as(db, role, USERS.alice, () => db.query("select public.app_note_job_run('db_backup', true, null)"))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, USERS.alice, () => db.query("select * from public.job_runs"))).rejects.toThrow(/permission denied/);
    }
    await db.query("select public.app_note_job_run('restore_test', true, '54 tables')");
    expect((await runs()).map((r) => r.job)).toEqual(["db_backup", "restore_test"]);
  });
});
