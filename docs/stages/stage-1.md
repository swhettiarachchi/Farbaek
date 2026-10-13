# Stage 1: core application (in progress)

## 2026-10-13: Supabase connected

### Done

- Core schema migration `supabase/migrations/20261013120000_core_schema.sql`: organizations, members, trials, billing accounts, evaluation events, tasks, task transitions and audit events. RLS on every table, explicit least-privilege grants, helper functions in a `private` schema, and a security-definer `create_organization()` that requires a confirmed email, makes the caller owner and starts the 14-day trial for the caller's first organization only.
- `tests/db/schema.test.ts`: runs the migration in PGlite with a Supabase auth stand-in. 16 tests cover tenant isolation, trial rules, blocked browser writes (billing, trials, usage, audit, task state, truncate) and the 14-day constraint.
- App wiring: `@supabase/ssr` server client, a session-refresh proxy limited to `/app`, `/auth` and `/sign-in` (marketing pages stay static), email-link sign-in with PKCE callback, and `/app` to create a workspace and see its trial and plan limits.
- Redirects use `NEXT_PUBLIC_SITE_URL`, never the Host header; post-login paths must be same-site.

### Applied to the hosted project (owner approved in chat, via Claude in Chrome)

- Redirect URL `http://localhost:3000/auth/callback` added (Authentication > URL Configuration). Site URL was already `http://localhost:3000`.
- Migration run in the SQL Editor. Before running, the editor contents were hashed in the page and matched the tested file (`sha256 068d80bf…1e36`). Result: success.
- Read-only check afterwards: 8 tables, all with RLS; 1 to 2 policies each; `anon` has no select; `authenticated` has no table-wide insert or update (only the column grants on tasks and organization names).

Already correct, so left unchanged: sign-ups allowed, email confirmation required, email provider enabled.

### Owner actions

1. Create `.env.local` from `.env.example` and fill `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Project Settings > API Keys > Publishable key). Claude doesn't write `.env` files.
2. When you start using the Supabase CLI, record this migration as applied so it isn't run twice:
   `supabase migration repair --status applied 20261013120000`
3. Before inviting anyone outside the team: configure custom SMTP. Supabase's built-in email sender is rate-limited and only delivers to the project's team members.
4. Optional: delete the "Untitled query" the SQL Editor auto-saved under Private queries (it now holds only the read-only verification query).

### Not verified yet

- End-to-end sign-in against the hosted project. That needs `.env.local` and a click on the emailed link.
- Server-side writes (task transitions, usage metering, webhooks) need `SUPABASE_SECRET_KEY` and come next.

### Next

Sign in once end to end, then: the app shell (sidebar and bottom tabs), Mission Control, server-side task transitions through the RealityLoop machine with optimistic concurrency, the trial reminder job (pg_cron is available on the project), Billing in not-connected mode, and Playwright plus axe.
