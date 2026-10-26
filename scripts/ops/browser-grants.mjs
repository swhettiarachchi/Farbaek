// The privileges browsers' roles (anon, authenticated) should have, from every
// migration applied in order to an in-process Postgres, written as SQL that
// sets exactly those (ADR 0088).
//
// A database restored without its privileges (pg_restore --no-acl) takes
// Supabase's default "grant all" on every table and function, including the
// service-role-only app_* functions. Run this after any restore and apply the
// output, then read it back with --check.
//
//   node scripts/ops/browser-grants.mjs > grants.sql     the SQL to apply
//   node scripts/ops/browser-grants.mjs --check          the queries that read the state back, one line per object
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = new URL("../../supabase/migrations/", import.meta.url);
// The same stand-in for Supabase's roles and default privileges as tests/db/harness.ts.
const STUB = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key, email text not null, email_confirmed_at timestamptz, created_at timestamptz not null default now());
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

/** One line per object and browser role: what it may do. The same query runs against production to compare. */
export const STATE_SQL = `
with roles(r) as (values ('anon'), ('authenticated')),
rels as (
  select c.oid, n.nspname, c.relname, c.relkind from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'S')
),
table_privs as (
  select 'table ' || rels.relname || ' ' || roles.r || ': ' ||
         coalesce(nullif(array_to_string(array(
           select p from unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) p
            where rels.relkind <> 'S' and has_table_privilege(roles.r, rels.oid, p)
           union all
           select p from unnest(array['USAGE', 'SELECT', 'UPDATE']) p where rels.relkind = 'S' and has_sequence_privilege(roles.r, rels.oid, p)
         ), ','), ''), '-') as line
    from rels, roles
),
col_privs as (
  select 'column ' || rels.relname || '.' || a.attname || ' ' || roles.r || ': ' ||
         array_to_string(array(
           select p from unnest(array['SELECT', 'INSERT', 'UPDATE', 'REFERENCES']) p
            where has_column_privilege(roles.r, rels.oid, a.attnum, p) and not has_table_privilege(roles.r, rels.oid, p)
         ), ',') as line
    from rels join pg_attribute a on a.attrelid = rels.oid and a.attnum > 0 and not a.attisdropped, roles
   where rels.relkind in ('r', 'p', 'v')
),
funcs as (
  select 'function ' || n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ') ' || roles.r || ': ' ||
         case when has_function_privilege(roles.r, p.oid, 'execute') then 'EXECUTE' else '-' end as line
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace, roles
   where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
),
schemas as (
  select 'schema ' || s || ' ' || roles.r || ': ' || case when has_schema_privilege(roles.r, s, 'usage') then 'USAGE' else '-' end as line
    from unnest(array['public', 'private']) s, roles
)
select line from table_privs
union all select line from col_privs where line !~ ': $'
union all select line from funcs
union all select line from schemas
order by 1;
`;

async function intended() {
  const db = new PGlite();
  await db.exec(STUB);
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) await db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));
  const lines = (await db.query(STATE_SQL)).rows.map((r) => r.line);
  // Who holds each function's EXECUTE in the intended state: PUBLIC, or the roles named.
  const publicExec = new Set(
    (
      await db.query(`
        select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')
           and (p.proacl is null or exists (select 1 from aclexplode(p.proacl) x where x.grantee = 0 and x.privilege_type = 'EXECUTE'))`)
    ).rows.map((r) => r.sig),
  );
  // Each function's signature as the state lines show it, and fully qualified for the SQL.
  const sigs = (
    await db.query(`
      select p.oid::int as oid, n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private') and p.prokind in ('f', 'p')`)
  ).rows;
  await db.exec("set search_path = ''");
  const qualified = new Map((await db.query("select oid::int as oid, oid::regprocedure::text as q from pg_proc where oid = any($1::oid[])", [sigs.map((s) => s.oid)])).rows.map((r) => [r.oid, r.q]));
  const qualify = new Map(sigs.map((s) => [s.sig, qualified.get(s.oid)]));
  await db.close();
  return { lines, publicExec, qualify };
}

function toSql({ lines, publicExec, qualify }) {
  const out = [];
  const tables = new Map();
  const columns = [];
  const funcs = new Map();
  for (const line of lines) {
    const m = line.match(/^(table|column|function|schema) (.+) (anon|authenticated): (.*)$/);
    if (!m) throw new Error(`Unexpected line: ${line}`);
    const [, kind, name, role, privs] = m;
    if (kind === "table") tables.set(`${name}|${role}`, privs === "-" ? [] : privs.split(","));
    else if (kind === "column") columns.push({ name, role, privs: privs.split(",") });
    else if (kind === "function") {
      const f = funcs.get(name) ?? { anon: false, authenticated: false };
      f[role] = privs === "EXECUTE";
      funcs.set(name, f);
    }
  }
  out.push("revoke all on all tables in schema public from anon, authenticated;");
  out.push("revoke all on all sequences in schema public from anon, authenticated;");
  for (const [key, privs] of [...tables].sort()) {
    if (privs.length === 0) continue;
    const [name, role] = key.split("|");
    out.push(`grant ${privs.join(", ").toLowerCase()} on public.${name} to ${role};`);
  }
  for (const c of columns.sort((a, b) => (a.name + a.role).localeCompare(b.name + b.role))) {
    const [table, column] = c.name.split(".");
    for (const p of c.privs) out.push(`grant ${p.toLowerCase()} (${column}) on public.${table} to ${c.role};`);
  }
  for (const [sig, f] of [...funcs].sort()) {
    const q = qualify.get(sig);
    if (!q) throw new Error(`No signature for ${sig}`);
    out.push(`revoke all on function ${q} from public, anon, authenticated;`);
    if (publicExec.has(sig)) out.push(`grant execute on function ${q} to public;`);
    else {
      const to = ["anon", "authenticated"].filter((r) => f[r]);
      if (to.length) out.push(`grant execute on function ${q} to ${to.join(", ")};`);
    }
  }
  return out;
}

const state = await intended();
if (process.argv.includes("--state")) {
  process.stdout.write(state.lines.join("\n") + "\n");
} else if (process.argv.includes("--check")) {
  process.stdout.write(STATE_SQL);
} else {
  process.stdout.write(toSql(state).join("\n") + "\n");
}
