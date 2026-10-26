/**
 * What browsers' roles may do, after every migration (ADR 0088). New tables
 * and functions take Supabase's default "grant all", so a migration that
 * forgets its revokes shows up here. scripts/ops/browser-grants.mjs writes
 * the same state as SQL for a restored database.
 */
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestDb } from "./harness";

let db: PGlite;
const rows = async <T>(sql: string) => (await db.query<T>(sql)).rows;

beforeAll(async () => {
  db = await createTestDb();
}, 60_000);

afterAll(async () => {
  await db.close();
});

describe("browsers' roles", () => {
  it("run only the functions meant for a signed-in person, and none signed out", async () => {
    const callable = (role: string) =>
      rows<{ name: string }>(`
        select p.proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege('${role}', p.oid, 'execute')
         order by 1`).then((r) => r.map((x) => x.name));
    expect(await callable("anon")).toEqual([]);
    expect(await callable("authenticated")).toEqual([
      "ai_credits_used",
      "app_autonomy_record",
      "app_incident_changes",
      "app_replay_history",
      "create_organization",
      "get_project_file",
      "search_project_files",
    ]);
  });

  it("only read tables, and write one column: a workspace's name", async () => {
    const writes = await rows<{ grant: string }>(`
      select c.relname || ' ' || r.role || ' ' || p.priv as grant
        from pg_class c join pg_namespace n on n.oid = c.relnamespace,
             unnest(array['anon', 'authenticated']) r(role),
             unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES']) p(priv)
       where n.nspname = 'public' and c.relkind in ('r', 'p') and has_table_privilege(r.role, c.oid, p.priv)`);
    expect(writes).toEqual([]);
    const columns = await rows<{ grant: string }>(`
      select c.relname || '.' || a.attname || ' ' || r.role || ' ' || p.priv as grant
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped,
             unnest(array['anon', 'authenticated']) r(role),
             unnest(array['INSERT', 'UPDATE']) p(priv)
       where n.nspname = 'public' and c.relkind in ('r', 'p') and has_column_privilege(r.role, c.oid, a.attnum, p.priv)
       order by 1`);
    expect(columns.map((c) => c.grant)).toEqual(["organizations.name authenticated UPDATE"]);
  });

  it("can't read any table signed out", async () => {
    const reads = await rows<{ name: string }>(`
      select c.relname as name from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind in ('r', 'p', 'v') and has_table_privilege('anon', c.oid, 'SELECT')`);
    expect(reads).toEqual([]);
  });
});
