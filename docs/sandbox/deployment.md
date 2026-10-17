# Deploying FARBAEK Sandbox

How to run the execution plane (E2B, or Vercel Sandbox per ADR 0016) and wire the control plane (the Farbaek app) to it in production. Read [README.md](README.md) first for the security model.

## 1. Choose the runtime

| | Self-hosted: E2B Embed | E2B Cloud | Vercel Sandbox |
| --- | --- | --- | --- |
| Who runs the microVMs | You, on a host you control | E2B | Vercel |
| Needs | Linux host with KVM (bare metal, or a VM with nested virtualization), Docker | An E2B account and API key | A Vercel account, a project, an access token |
| Fully self-hosted | Yes, if the Farbaek app and database are too | No: code runs on E2B's infrastructure | No: code runs on Vercel's infrastructure (`iad1` unless `SANDBOX_VERCEL_REGION` is set) |
| Ops | You patch the host, size it, back up template storage | None for the runtime | None; no images to build |
| Limits | One machine by design | Plan-based (session length 1 h Hobby, 24 h Pro) | Hobby: free, hard-capped, 45 min sessions, 10 at once; Pro: 24 h |
| In Farbaek | Everything | Everything | No previews, pause or live metrics (ADR 0016) |

Use E2B Cloud to get going if no KVM host exists yet; switching later is a configuration change (`E2B_DOMAIN` / `E2B_API_URL`, rebuild the images, rerun the smoke test).

## 2. Self-hosted E2B Embed host

Requirements: x86-64 Linux with `/dev/kvm` available (check `ls -l /dev/kvm` and `grep -E 'vmx|svm' /proc/cpuinfo`), Docker with Compose, enough RAM for concurrent sessions (sum of session memory plus the stack; start with 16 GB for a handful of small sessions) and fast disk for templates and snapshots.

Install (from the E2B runtime README, `embed/`):

```bash
mkdir e2b && cd e2b
curl -fsSL --remote-name-all "https://raw.githubusercontent.com/e2b-dev/runtime/main/embed/compose/{compose.yaml,.env}"
docker compose up -d --wait
```

Review `.env` and the reference docs (`docs/REFERENCE.md` in that repository) for ports, secrets (`ADMIN_TOKEN`, `SANDBOX_ACCESS_TOKEN_HASH_SEED`) and storage before exposing anything.

### Network and firewall

- Embed serves plain HTTP. Keep it on a private network or VPN; never expose its API, orchestrator or management ports to the internet.
- Allow inbound only from the Farbaek app servers (API) and, for previews, from the Farbaek app servers to the sandbox proxy. Browsers never talk to the runtime directly.
- Put a TLS-terminating reverse proxy (Caddy, nginx) in front of the runtime if the app reaches it across any network you don't fully control, and set `E2B_DOMAIN` to its name. For a private plain-HTTP address, set `E2B_API_URL` instead.
- Block the host's own metadata service and internal ranges from guest traffic at the host firewall as well, in addition to Farbaek's per-sandbox `denyOut` rules.

### Patching and backups

- Patch the host kernel and Firecracker/E2B components on a schedule; isolation depends on them.
- Back up the runtime's template and snapshot storage and its database per the E2B docs, or treat images as rebuildable (`pnpm sandbox:templates`) and sessions as disposable. Farbaek's own records (sessions, receipts) live in Farbaek's Postgres and follow its backups.

## 3. Farbaek app settings

Set these server-side (never `NEXT_PUBLIC_`). `pnpm setup:env` → `sandbox` writes them locally; in production, use your host's secret store.

| Variable | Value |
| --- | --- |
| `SANDBOX_PROVIDER` | `e2b` |
| `E2B_API_KEY` | Runtime API key |
| `E2B_DOMAIN` or `E2B_API_URL` | Self-hosted runtime address (omit both for E2B Cloud) |
| `SANDBOX_RUNTIME_MAX_SESSION_MINUTES` | The runtime's own ceiling (60 for E2B Hobby) |
| `SANDBOX_DEPLOYMENT_ID` | Unique per environment (e.g. `farbaek-prod`), so cleanup never touches another environment's sandboxes |
| `SANDBOX_PREVIEW_DOMAIN` | A separate registrable domain, e.g. `farbaek-preview.app` |
| `SANDBOX_PREVIEW_SECRET`, `SANDBOX_CRON_SECRET` | 32+ random characters each; generate per environment, rotate by replacing (open previews then need reopening) |
| `SANDBOX_ISOLATION_VERIFIED_AT` | Set only after `pnpm sandbox:smoke` passes against this environment's runtime |

Then: apply migration 10 (already applied to the hosted Supabase project on 2026-10-17), `pnpm sandbox:templates`, `pnpm sandbox:smoke`, set the verified date, rebuild, deploy.

## 4. Preview routing and TLS

- Use a **separate registrable domain** for previews (not a subdomain of the app's domain), so preview pages can't set or read cookies on Farbaek's site.
- DNS: a wildcard record `*.<preview domain>` pointing at the Farbaek app's load balancer.
- TLS: a wildcard certificate for `*.<preview domain>` (DNS-01 challenge). The app serves both hosts; `src/proxy.ts` sends `p-<id>.*` hosts to the gateway and never to app pages.
- The reverse proxy must pass the original `Host` header and must not strip `Cookie` or `Set-Cookie`.
- Locally, `preview.localhost:3000` works in Chrome and Firefox (`*.localhost` resolves to loopback). If a browser blocks cookies in frames, use "New tab".
- Hosts that cap request duration (serverless) need the API's `maxDuration` raised for long commands, or long checks should move to a job runner (ADR 0006).

## 5. Sweeper (cleanup) and retention

Call `POST /api/internal/sandbox/sweep` with `Authorization: Bearer $SANDBOX_CRON_SECRET` every 2 to 5 minutes (`pnpm sandbox:sweep` does this; any cron, systemd timer or host scheduler works). It:

- expires sessions past their time limit or idle limit and destroys their sandboxes;
- finishes `stopping` sessions and retries failed cleanups (up to 10 attempts, logged as `sandbox.cleanup_failed`);
- marks commands past their deadline as "didn't finish" (`control_plane_interrupted`);
- destroys runtime sandboxes labelled with this `SANDBOX_DEPLOYMENT_ID` that no live session owns;
- prunes command history and events of ended sessions older than 30 days (receipts are kept).

The runtime's own timeout is always set, so compute stops even if the sweeper doesn't run.

## 6. Monitoring

Logs are JSON lines (`at`, `level`, `event`, ids). Alert on:

- `sandbox.runtime_unhealthy`, `sandbox.provision_failed`: runtime problems;
- `sandbox.cleanup_failed`, `sandbox.orphan_destroyed`: cleanup health;
- `sandbox.execution_record_failed`, `sandbox.api_error`: control-plane problems (each carries a request id shown to the user);
- the sweep summary (`sandbox.sweep`) going missing.

`GET /api/v1/sandbox/health` reports live runtime reachability (a real call, cached 30 s), execution mode, capabilities and usage. Watch the runtime host itself (CPU, memory, disk, KVM errors) with your usual tooling.

## 7. Rollback and recovery

- **Turn execution off immediately:** unset `SANDBOX_ISOLATION_VERIFIED_AT` (or `SANDBOX_PROVIDER`) and restart. Guard blocks everything that would run code; stopping and reading still work.
- **Runtime outage:** sessions report `provider_unavailable`; nothing is retried in a way that runs a command twice. Once back, the sweeper reconciles.
- **Bad app release:** roll back the app; migration 10 is additive (new tables and functions only) and compatible with the previous release, which simply doesn't use it.
- **Leaked preview or cron secret:** replace it and restart; existing preview links stop working.
- **Leaked runtime key:** revoke it in the runtime, set the new one, restart; run the sweeper to clean anything started with the old key's sessions.
