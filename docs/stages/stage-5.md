# Stage 5: going live

## 2026-10-18: Public addresses, the admin console and the Railway setup

Decisions: [ADR 0026](../adr/0026-admin-console.md) (admin console). Deploy steps: then Railway, now [docs/deploy/vps.md](../deploy/vps.md) (the Railway guide was removed on 2026-10-23).

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

### Live on Railway (2026-10-18)

- **Release:** pull request swhettiarachchi/Farbaek#1 merged into `main` (`94d3cbd`).
- **Railway service:** project "remarkable-peace", US East, 1 replica, restart on failure, health check `/api/health`, Railpack with Node 24.21.0 and pnpm 12.11.2.
- **Variables:** the plain ones set in the dashboard; the owner pasted the secret ones. `NEXT_PUBLIC_SITE_URL` and `SANDBOX_DEPLOYMENT_ID` were reset after the paste, to the Railway address and `railway-production`.
- **Domains:**
  - `farbaek-production.up.railway.app` and `www.farbaek.com` (HTTPS) serve the app;
  - `farbaek.com` forwards to `https://www.farbaek.com` (301, Spaceship URL redirect).
  - farbaek.com's nameservers are Spaceship's, so DNS is managed in Spaceship's Advanced DNS: `www` CNAME to Railway, the Railway verification TXT, and the Spacemail records Spaceship added.
- **Email:** Spacemail for farbaek.com is verified (MX, SPF, DKIM and autodiscover by Spaceship; DMARC `p=none` added).
- **Supabase Auth:** Site URL is the Railway address. Allowed redirects: localhost, the Railway address, farbaek.com and www.farbaek.com.
- **Checked live:**
  - `/api/health` returns ok with commit `94d3cbd`;
  - home, pricing, sign-in and `security.txt` return 200, and the sign-in form shows (Supabase connected);
  - `/app` redirects to sign-in, and `/admin` returns 404 when signed out;
  - both public addresses appear on the home page.

### Next

1. Supabase custom SMTP through Spacemail (`mail.spacemail.com`, port 465, SSL, user hello@farbaek.com; the owner types the password). Until then only Supabase team members get sign-in emails.
2. Set `NEXT_PUBLIC_SITE_URL` and Supabase's Site URL to `https://www.farbaek.com`, then redeploy.
3. Sign in as hello@farbaek.com and check the admin console live.

### Earlier next steps

1. Merge into `main` through a pull request and create the Railway service.
2. Finish the Spacemail DNS records and verify the domain.
3. Set up Supabase SMTP with hello@farbaek.com (the owner types the password).
4. Point Supabase's Site URL and redirect URLs at the Railway domain.
5. Later: admin actions (migration 19), a custom domain, the sandbox sweep cron.
