# Stage 5: going live

## 2026-10-18: Public addresses, the admin console and the Railway setup

Decisions: [ADR 0026](../adr/0026-admin-console.md) (admin console). Deploy steps: [docs/deploy/railway.md](../deploy/railway.md).

### Done

- **Public addresses** (`src/config/contact.ts`): hello@farbaek.com for general questions and Enterprise, support@farbaek.com for help.
  - They appear in the site footer, on pricing (Enterprise), on the sign-in page, in Settings, and on the phone "More" page.
  - `public/.well-known/security.txt` points to support@.
- **Admin console** at `/admin`, read-only:
  - pages: Overview (this month's AI list cost, people, workspaces, runs and security checks, and the deployment's connections), Workspaces, People, Activity;
  - the gate: `FARBAEK_ADMIN_EMAILS` allowlist, a session, a confirmed email still on the list, and the server key; anyone else gets a 404, with the 404 page's title too;
  - a shortcut appears in the app's sidebar and "More" page for listed people only.
- **`/api/health`** for the host's health check: no database, returns the deployed commit.
- **Deploy guide** for Railway, with every setting and variable name. Railway no longer reads `railway.json` for new services, so settings live in the dashboard.

### Verified

- 10 new unit tests: each admin refusal, allowlist parsing, AI cost from ledger units, and the health route. 804 tests pass (14 skipped); typecheck, lint and the build pass.
- On a local production build, signed in as the owner's account:
  - **not on the list:** `/admin` returns 404, titled "Page not found", and there's no admin shortcut;
  - **on a temporary local list:** all four console pages show real data, for example AI list cost $0.04 from 11 settled calls, 1 workspace on the Pro trial, the finished cloud run, the 97/A security check, and recorded actions with the actor's email. The connections show the server key, AI and sandbox as on, and previews, payments and trial emails as off, with reasons and no values.
- Public pages at 375px: no sideways scroll; both addresses show in the footer, on pricing and on sign-in.

### Not verified

- **The console at phone width:** the signed-in Chrome window is maximised and couldn't be resized. Its layout uses the same patterns as the app: a nav row and tables that scroll inside their own frame.
- **Signing in as hello@farbaek.com:** that needs the Spacemail records finished and Supabase sending through Spacemail SMTP.

### Next

1. Merge into `main` through a pull request and create the Railway service.
2. Finish the Spacemail DNS records and verify the domain.
3. Set up Supabase SMTP with hello@farbaek.com (the owner types the password).
4. Point Supabase's Site URL and redirect URLs at the Railway domain.
5. Later: admin actions (migration 19), a custom domain, the sandbox sweep cron.
