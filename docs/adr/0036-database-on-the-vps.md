# ADR 0036: Farbaek's database on its own server

- Status: accepted (2026-10-22).
- Follows ADR 0035, which moved the app onto the owner's VPS.

## Context

After Railway's breach (`docs/security/incident-2026-10-21-railway.md`), the owner asked for everything to run on their own Hostinger KVM 2: the app first (ADR 0035), then the database.

Farbaek is built on Supabase, and uses only its core:
- **Data:** Postgres with RLS across `public` and `private`, 23 migrations, no extensions.
- **The data API:** PostgREST, through `supabase-js` `.from` and `.rpc`.
- **Sign-in:** GoTrue: email codes and links, office TOTP two-factor, admin calls, `getClaims`.
- **Not used:** Storage, Realtime, Edge Functions or cron.

## Decision

Run **self-hosted Supabase** from Supabase's own Docker images on the same server. It isn't plain Postgres, so every policy, `app_*` function and sign-in flow keeps working **with no app code changes**:
- `src/server/supabase/config.ts` accepts any key format;
- `src/server/observability/log.ts` already redacts JWT-style keys.

### What runs

- **The official compose,** untouched, at commit `3fc8af38` (2026-09-30), in `/opt/farbaek/supabase/docker`.
- **Farbaek's override,** `deploy/vps/supabase/compose.farbaek.yaml`, which runs only Postgres 17, Auth, PostgREST, the Envoy gateway, postgres-meta and Studio. Realtime, Storage, imgproxy, Edge Functions and Supavisor are off.
- **Pinned images:**

  | Service | Image |
  | --- | --- |
  | Postgres | `supabase/postgres:17.6.1.136` |
  | Auth | `gotrue:v2.196.0` |
  | Data API | `postgrest:v14.17` |
  | Metadata | `postgres-meta:v0.99.0` |
  | Studio | `studio:2026.09.07` |
  | Gateway | `envoy:v1.39.1` |

- **`COMPOSE_FILE`** in the stack's `.env` names the override, so any `docker compose` there applies it.

### What's reachable

- **Nothing is published to the internet.** Docker's published ports bypass ufw, so the gateway's port 8000 is removed. Postgres has none, and Studio listens on `127.0.0.1:54323` for an SSH tunnel.
- **Caddy serves `https://api.farbaek.com`,** forwarding only `/auth/v1/*` and `/rest/v1/*` to the gateway on Farbaek's Docker network. Every other path gets a 404, so Studio's gateway route is never public.

### Secrets

- **Made on the server:** Supabase's own `utils/generate-keys.sh --update-env`, with its output discarded, makes the JWT secret, the `anon` and `service_role` keys, and the Postgres and Studio passwords, into the stack's `.env` (mode 600).
- **Typed by the owner:** the SMTP password and the cloud database's connection string. They come in through the settings form, which sends them over SSH to `farbaek-set-env`; that writes only the files on a fixed list.
- **Pointing the app at the new database:**
  - the app's publishable key becomes the `anon` key (public by design, as before);
  - its secret key becomes the `service_role` key;
  - its URL becomes `https://api.farbaek.com`.

### Sign-in

- **The same allowed addresses as on Supabase Cloud:** the site URL `https://www.farbaek.com`, plus `/auth/callback` on it, `officespace.farbaek.com/sign-in` and localhost.
- **Email sign-in only:** no phone sign-up and no anonymous users.
- **Email** goes through Spacemail SMTP (`mail.spacemail.com:465`) as hello@farbaek.com.

### The move

Following Supabase's guide, "Restore a Platform Project to Self-Hosted":
1. `supabase db dump` with the CLI pinned at v2.120.0 and checked against its published checksum: roles, schema, then data with `--use-copy`.
2. Check that the Postgres major versions match.
3. Restore in one transaction, with `session_replication_role = replica` for the data.
4. Compare row counts per table in `public` and `private`, and for `auth.users`, `auth.identities` and `auth.mfa_factors`.

A rehearsal runs first, while the cloud database stays live; the final copy is made at cutover. Everyone signs in once more, because the signing secret changes. Staff whose two-factor doesn't carry over use `docs/runbooks/office-recovery.md`.

### Backups

- **Nightly:** `pg_dump -Fc`, kept for 14 days in `/opt/farbaek/backups` (mode 700).
- **Off the server:** a copy through `rclone` (pinned at 1.71.1) to a private Cloudflare R2 bucket, using a token limited to that bucket.
- **Weekly restore test:** restores the newest dump into a throwaway container and checks every table is there with rows.

## Alternatives considered

- **Stay on Supabase Cloud:** it wasn't breached and is managed. The owner chose to run everything themselves.
- **Plain Postgres:** it would mean rewriting sign-in, the RLS claims and the data API. Self-hosted Supabase keeps the code unchanged.

## Consequences

- **Farbaek now owns:**
  - the database's patching (updated deliberately by moving the pinned commit);
  - its backups, which are now essential;
  - capacity: the database shares 8 GB with the app and builds, with 2 GB of swap.
- **The way back for 7 days after cutover:** Supabase Cloud is left untouched, and restoring the app's previous settings switches back. After that the owner decides whether to delete it or keep it as a development database.
