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

## 2026-10-14: the signed-in app

### Done

- Migration `20261014090000_projects_and_server_writes.sql` (written and tested, **not yet applied to the hosted project**): projects table with RLS; tasks now belong to a project in the same organization (composite key); the browser can no longer insert tasks; three service-role-only functions `app_create_project` (plan limit re-checked under a row lock, duplicate names rejected), `app_create_task` and `app_apply_task_transition` (optimistic concurrency on version and state, replay-safe by event id). Every call is audited.
- Write path: server action, then authenticated user, role check, TypeScript entitlement and RealityLoop rules (`src/server/workspace/use-cases.ts`), then the SQL function with the secret key. One source of truth for the rules; the database re-checks membership, limits and versions.
- App shell: desktop sidebar (workspace switcher, navigation, approvals badge, honest "coming in later stages" list, plan and account footer) and a five-tab bar on phones (Home, Projects, Tasks, Approvals, More).
- Pages: Mission Control (real counts, trial notice, checklist driven by records), Projects and project detail, Tasks grouped by what they need, task detail (lifecycle from real state and history, timeline, cancel with confirmation), Approvals, Billing (payments not connected, real usage meters with 80% and limit states, plans unavailable with reasons), Settings (rename, people), More, New workspace.
- Demo workspace (`FARBAEK_DEMO_APP=1`, `pnpm start:demo`): read-only sample data, only when Supabase isn't configured, with a ribbon on every screen. A test replays every demo task through the real state machine.
- Routes split into a `(site)` group (marketing header and footer) and `/app` (app shell). URLs unchanged.

### Verified

- `pnpm typecheck`, `pnpm lint`, `pnpm test` (242 tests, 17 files), `pnpm build`.
- Database tests (PGlite): 33, including service-role-only grants, plan-limit enforcement, duplicate names, cross-tenant refusal, version conflicts and replay.
- Browser, demo mode: Mission Control, task detail, billing, projects and tasks at 689px (phone layout) and 1280px (sidebar layout); no horizontal scroll; no console errors after load.
- Bugs found and fixed: demo data used `authorize` where the machine requires `grant_approval` (caught by the new test); status badges wrapped; the seat limit message talked about periods.

### Not verified

- The live write path against the hosted project: needs migration 2 applied, `.env.local` and `SUPABASE_SECRET_KEY`.
- Paid plans anchor usage to the subscription start; until payments exist, non-trial usage uses the UTC calendar month.

### Owner actions

1. Approve applying migration 2 to the hosted project.
2. Add `SUPABASE_SECRET_KEY` (Project Settings > API Keys > Secret keys) to `.env.local` alongside the URL and publishable key. Never commit it.
