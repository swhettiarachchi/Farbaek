/**
 * Migration v89 (ADR 0178): a function's refusal reaches the person. PostgREST
 * retries a transaction for ever on error code 40001, so no function may raise it.
 * PGlite has no PostgREST in front of it, which is how this went unnoticed: here
 * a refusal always arrived.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { USERS, as, createOrg, createTestDb } from "./harness";

let db: PGlite;
let org: string;
let project: string;

const asService = <T>(fn: () => Promise<T>) => as(db, "service_role", null, fn);

const save = (content: string, expected: number) =>
  asService(() => db.query("select public.app_save_file($1, $2, 'notes.txt', $3, $4, 1024, 8192, 20)", [project, USERS.alice, content, expected]));

beforeAll(async () => {
  db = await createTestDb();
  org = await createOrg(db, USERS.alice, "Alice Studio");
  project = await asService(async () => (await db.query<{ id: string }>("select public.app_create_project($1, $2, 'Site', null, null) as id", [org, USERS.alice])).rows[0]!.id);
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("refusals that would be retried for ever", () => {
  it("no function raises them", async () => {
    const { rows } = await db.query<{ name: string }>(`
      select n.nspname || '.' || p.proname as name
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and p.prokind = 'f'
        and (p.prosrc like '%40001%' or p.prosrc like '%40P01%' or p.prosrc ilike '%serialization_failure%' or p.prosrc ilike '%deadlock_detected%')
    `);
    expect(rows.map((r) => r.name)).toEqual([]);
  });

  it("a refusal keeps its words, which the app reads, under the ordinary code", async () => {
    await save("first", 0);
    await expect(save("second", 0)).rejects.toMatchObject({ code: "P0001", message: "FILE_CHANGED" });
  });

  it("a rewritten function keeps its security settings and who may call it", async () => {
    const { rows } = await db.query<{ definer: boolean; settings: string[]; anon: boolean; signed_in: boolean; service: boolean }>(`
      select p.prosecdef as definer, p.proconfig as settings,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as signed_in,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'app_apply_proposal'
    `);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ definer: true, anon: false, signed_in: false, service: true });
    expect(rows[0]!.settings.join()).toContain("search_path");
  });
});
