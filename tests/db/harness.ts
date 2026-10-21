/**
 * In-process Postgres (PGlite) with a minimal stand-in for Supabase's auth
 * schema and roles, plus every migration in supabase/migrations applied in
 * filename order. Not covered: Supabase's auth service, PostgREST or the
 * hosted database.
 */
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS_DIR = new URL("../../supabase/migrations/", import.meta.url);

export const MIGRATION_FILES = readdirSync(MIGRATIONS_DIR)
  .filter((f) => f.endsWith(".sql"))
  .sort();

export function readMigration(name: string): string {
  return readFileSync(new URL(name, MIGRATIONS_DIR), "utf8");
}

const SUPABASE_STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text not null, email_confirmed_at timestamptz);
  create table auth.sessions (id uuid primary key, user_id uuid not null, created_at timestamptz not null default now(), not_after timestamptz);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
`;

export const USERS = {
  alice: "00000000-0000-4000-8000-00000000a11c",
  bob: "00000000-0000-4000-8000-000000000b0b",
  unverified: "00000000-0000-4000-8000-0000000000aa",
} as const;

export async function createTestDb(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const file of MIGRATION_FILES) await db.exec(readMigration(file));
  await db.query(
    "insert into auth.users (id, email, email_confirmed_at) values ($1, 'alice@example.test', now()), ($2, 'bob@example.test', now()), ($3, 'new@example.test', null)",
    [USERS.alice, USERS.bob, USERS.unverified],
  );
  return db;
}

export type Role = "authenticated" | "anon" | "service_role";

export async function as<T>(db: PGlite, role: Role, uid: string | null, fn: () => Promise<T>): Promise<T> {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [uid ?? ""]);
  await db.exec(`set role ${role}`);
  try {
    return await fn();
  } finally {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', '', false)");
  }
}

export async function createOrg(db: PGlite, uid: string, name: string): Promise<string> {
  return as(db, "authenticated", uid, async () => {
    const r = await db.query<{ id: string }>("select public.create_organization($1) as id", [name]);
    return r.rows[0]!.id;
  });
}
