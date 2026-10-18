# 0005. Auth and database

- Status: accepted. Schema applied to the hosted project on 2026-10-13 (see docs/stages/stage-1.md)
- Date: 2026-10-13

## Context

The owner already has a Farbaek Supabase project (from session notes dated 2026-10-11). Claude's Supabase connector is signed in to a different account and cannot see it, so migrations must go through the Supabase CLI, run by the owner.

## Decision

- **PostgreSQL on Supabase**, with **Supabase Auth** (email verification, then passkeys), since the project already exists. Better Auth stays the fallback if Supabase Auth can't meet the organization model.
- **Drizzle ORM** with SQL migrations committed to the repo.
- Authorization is enforced in server code for every request. Row Level Security is defence in depth, covered by dedicated cross-tenant tests.
- Tenant-scoped indexes put `org_id` first. Trials get a unique constraint on `org_id`; usage gets a unique key on `(org_id, idempotency_key)`.
- Database tests use an in-process Postgres (PGlite) run serially, because of the dev PC's memory.

## Owner actions needed

1. Run `supabase login` and `supabase link` against the Farbaek project.
2. Put the project URL and keys into a local `.env.local` (never committed).
3. Optionally reconnect Claude's Supabase connector to the right account.
