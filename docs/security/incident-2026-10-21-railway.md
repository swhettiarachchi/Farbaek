# Incident: Railway environment variables exposed (2026-10-21)

- Status: open. The keys still need rotating.
- Source: Railway's security notice of 2026-10-21 (blog.railway.com/p/security-disclosure-wednesday-october-21st), confirmed on status.railway.com.
- The owner received Railway's direct email, so Farbaek is treated as affected.

## What happened

Railway detected unauthorised access to the systems that store customer environment variables. For some customers, the attacker obtained the decrypted values.

Railway's recommendations:
- revoke and reissue every variable stored there;
- check AI providers for unexpected usage;
- review logs.

Builds and deployments were paused from 07:24 UTC on 2026-10-21 and were still paused at 02:19 UTC on 2026-10-22.

## What was exposed

Farbaek's production server runs on Railway. Its secrets, by name, from `.env.example`, are listed below; the owner confirms which were actually set. The `NEXT_PUBLIC_*` values are public by design and need no action.

| Variable | What an attacker could do | Where to rotate |
| --- | --- | --- |
| `SUPABASE_SECRET_KEY` | Read and change every workspace; it bypasses row level security | Supabase, Project Settings, API Keys: create a new secret key, then delete the old one |
| `ANTHROPIC_API_KEY` | Spend on Farbaek's Anthropic account | console.anthropic.com, API keys; check Usage |
| `GEMINI_API_KEY` | Spend on the Google account | Google AI Studio, API keys |
| `SANDBOX_VERCEL_TOKEN`, `E2B_API_KEY` | Use the sandbox provider account | Vercel account tokens and team activity; E2B dashboard |
| `EMAIL_PROVIDER_API_KEY` | Send mail as Farbaek | The email provider |
| `DODO_PAYMENTS_API_KEY`, `DODO_PAYMENTS_WEBHOOK_KEY` | Only if set; billing is `not_connected` | Dodo Payments dashboard |
| `SANDBOX_PREVIEW_SECRET`, `SANDBOX_CRON_SECRET` | Forge preview links, trigger sandbox cleanup | New random values |

To make a new random value:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

## What was checked (2026-10-22, read only, production database)

Changes since 2026-10-20 00:00 UTC, through the Supabase SQL Editor:

| Check | Result |
| --- | --- |
| Accounts created or signed in | 0 |
| Workspaces or members added | 0 |
| Staff added or changed, staff invites | 0 |
| Staff actions | 0 |
| Usage grants, trials started | 0 |
| Announcements | 0 |
| Sites published | 0 |
| Workspace audit events | 9, all one account's build on 2026-10-20 between 13:43 and 13:45 UTC, before the incident began |
| Platform pause flags | 5 rows at 09:19 UTC on 2026-10-21, all unpaused and with no author: the seed rows from applying migration v21 (`docs/stages/stage-7.md`) |

Nothing in the database shows the secret key being used to change data.

Reads leave no rows, so this can't rule out data being read. The Supabase request logs can show that. The free plan keeps them for one day, so they cover the window only until about 2026-10-22 07:00 UTC. That log check was not run: auto mode refused production log reads without the owner's go-ahead.

## Still to do

1. **The owner rotates every key** in the table above, puts the new values into Railway's variables and `.env.local`, and deletes the old keys. Deleting them stops production's server writes and AI until Railway can redeploy. With no paying customers that is accepted, and it's preferred to leaving a leaked key live.
2. **Review usage and access:**
   - Anthropic and Google usage, and Vercel activity;
   - the GitHub security log, following Railway's guides;
   - the Supabase request logs for the secret key used from addresses other than Railway's.
3. **When Railway restores deploys:** redeploy, then confirm sign-in, a build and a publish work with the new keys.
4. Record each rotation here with its date, never the value.

## Rotations

| Date | Key | Done by | Checked |
| --- | --- | --- | --- |
| 2026-10-22 | `SUPABASE_SECRET_KEY`: new key `railway_server_2026_10_22`, old key `default` deleted | Owner | Supabase accepts the new key for auth admin and database requests (200), checked from `.env.local` by a script that prints only results |
| 2026-10-22 | `SUPABASE_SECRET_KEY` again: `railway_server_2026_10_22` deleted, replaced by `vps_server_2026_10_22` | Owner | 200 from the VPS, status code only |
| 2026-10-22 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: the old one deleted, replaced by `farbaek_web`. Publishable keys are public by design; deleting it stopped the Railway site, which can't redeploy | Owner | 200 from the VPS |
| 2026-10-22 | `ANTHROPIC_API_KEY`: a new key | Owner | 200 from Anthropic's models endpoint on the VPS. Deleting the old key: owner to confirm |
| 2026-10-22 | `SANDBOX_PREVIEW_SECRET`, `SANDBOX_CRON_SECRET`: new random values, made on this PC by the owner's settings form and sent over SSH | Owner's form | Set on the VPS, names checked only |

**2026-10-22, during the database move:**
- The Supabase Cloud database password contained an `@`, which broke the connection address.
- The Supabase CLI's parse error quoted part of the address, including part of the password, into Claude's session output. The local copy of that output was deleted, but the password is treated as exposed: the owner resets it to a generated one.
- `scripts/vps/db-move.sh` now checks the address's shape without printing it, and sends every tool's output to a log on the server only.

The production values now live only on the VPS, in `/opt/farbaek/env/production.env` (ADR 0035). The owner entered them through a local form that sent them over SSH, so no value passed through a chat or a log.
