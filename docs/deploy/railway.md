# Deploying Farbaek on Railway

Farbaek runs as one long-lived Node server: cloud agent runs live in the server process (ADR 0022), so serverless hosts with short time limits don't fit. Railway's Hobby plan does.

Railway no longer reads `railway.json` for new services, so the service is set up in the dashboard. Everything below is a setting or a variable **name**. Values never go in the repo.

## Release flow

- Production deploys from **`main`**.
- Work happens on feature branches and reaches `main` through a pull request. A merge is a release.

## Service settings

| Setting | Value |
|---|---|
| Source | GitHub `swhettiarachchi/Farbaek`, branch `main` |
| Builder | Railpack (default). It runs `pnpm build`. |
| Start command | `pnpm start` (Next.js reads Railway's `PORT`) |
| Health check path | `/api/health` |
| Restart policy | On failure |
| Replicas | **1**: running agent runs live in the process |
| Region | The same region as the Supabase project |
| Public networking | Generate a `*.up.railway.app` domain |

A redeploy restarts the server. Agent runs going at that moment show as Interrupted, so deploy when no run is going.

## Variables

**Set in the dashboard, not secret:**

| Name | Value |
|---|---|
| `RAILPACK_NODE_VERSION` | `24` (pins Node; `engines` alone could pick a newer major) |
| `ELECTRON_SKIP_BINARY_DOWNLOAD` | `1` (the desktop app's binary isn't needed on the server) |
| `NEXT_PUBLIC_SITE_URL` | `https://<the Railway domain>` |
| `BILLING_MODE` | `not_connected` until `docs/billing/go-live.md` is done |
| `FARBAEK_ADMIN_EMAILS` | `hello@farbaek.com` |
| `SANDBOX_DEPLOYMENT_ID` | `railway-production` (keeps sandbox cleanup apart from local ones) |
| `AI_PROVIDER` | `anthropic` |

**Pasted by the owner** in Variables → Raw Editor, from their own `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`;
- `ANTHROPIC_API_KEY`, and `GEMINI_API_KEY` if used;
- `SANDBOX_PROVIDER` and that provider's settings (for Vercel: `SANDBOX_VERCEL_TOKEN`, `SANDBOX_VERCEL_TEAM_ID`, `SANDBOX_VERCEL_PROJECT_ID`), `SANDBOX_ISOLATION_VERIFIED_AT`;
- `SANDBOX_PREVIEW_DOMAIN` and `SANDBOX_PREVIEW_SECRET` once there's a preview domain;
- `SANDBOX_CRON_SECRET`.

Leave out `FARBAEK_DEMO_APP` and the local `NEXT_PUBLIC_SITE_URL`.

`NEXT_PUBLIC_*` values are built into the app, so **redeploy after changing them**.

## Supabase settings for the deployed site

- **Authentication → URL Configuration:**
  - Site URL: the Railway domain.
  - Redirect URLs: `https://<railway domain>/auth/callback`, keeping `http://localhost:3000/**` for local work.
- **Authentication → SMTP:**
  - Use Spacemail, sending as `hello@farbaek.com` with the name "Farbaek". The owner types the mailbox password.
  - Without it, Supabase only emails members of the Supabase organisation, about 2 an hour, so nobody else can sign in.

## Checking a deploy

1. `GET /api/health` returns `{"ok":true,"commit":"..."}` with the deployed commit.
2. The home page, pricing and sign-in load.
3. A sign-in link arrives and signs in.
4. `/admin` is 404 for anyone not in `FARBAEK_ADMIN_EMAILS`, and opens for hello@farbaek.com.
5. Railway's deploy logs show no errors.

## Later

- **A custom domain:** farbaek.com or app.farbaek.com, which means DNS changes at Hostinger.
- **A Railway cron service** that calls `POST /api/internal/sandbox/sweep` with `SANDBOX_CRON_SECRET`.
