# FARBAEK Sandbox

Isolated environments where builds, tests and dev servers run, outside Farbaek's servers. Every command is recorded with its real exit code; check runs produce verification receipts that Guard and the task state machine consume. Decision record: [ADR 0013](../adr/0013-sandbox-runtime-and-control-plane.md). Deployment: [deployment.md](deployment.md). API and SDK: [api.md](api.md).

## Status

| Part | State |
| --- | --- |
| Control plane: lifecycle, ownership, quotas, idempotency, sweeper (migration 10) | Built, tested, applied to the hosted project |
| E2B adapter (Firecracker microVMs; self-hosted Embed or E2B Cloud) | Built and typechecked against the SDK; **not yet run against a real runtime** |
| Sandbox Studio: dashboard, create flow, workspace (files, editor, console, preview, checks, details, history) | Built; shows Review Only until a runtime is connected |
| v1 API, SDK, preview gateway | Built, tested with test doubles |
| Real execution | **Blocked** until a runtime is connected and `pnpm sandbox:smoke` passes (see "Connect a runtime") |

## How it fits together

```
Browser / SDK ──► Farbaek (Next.js)                         Runtime (separate machine)
                  ├─ Sandbox Studio pages                   ┌──────────────────────────┐
                  ├─ /api/v1/sandboxes… (auth, rate limits) │ E2B API + orchestrator    │
                  ├─ service: Guard → limits → DB → runtime │  ├─ microVM (session A)   │
                  ├─ preview gateway (p-<id>.<preview host>)│  ├─ microVM (session B)   │
                  └─ sweeper (/api/internal/sandbox/sweep)  │  └─ egress proxy (rules)  │
                         │                                  └──────────────────────────┘
                         ▼
                  Postgres (Supabase): sessions, commands, events, previews, receipts
```

- **Control plane**: the existing app. It decides who may do what, keeps the records and talks to the runtime with a server-only key.
- **Execution plane**: the runtime. Each session is its own Firecracker microVM with its own kernel. Farbaek never runs project code on its own servers, and there is no fallback that would.

Code map:

| Path | What |
| --- | --- |
| `src/core/sandbox/` | Framework-free rules: lifecycle, templates and sizes, request validation, paths, network policy, commands and bounded output, Guard rules, receipts, usage, preview tokens, failure categories, the runtime contract |
| `src/config/sandbox.ts` | Plan limits (internal, not priced) and platform ceilings |
| `src/server/sandbox/` | E2B adapter, registry, service (use cases), Supabase store, HTTP helpers, preview gateway, wiring |
| `src/app/api/v1/…` | Versioned API |
| `src/app/sandbox-preview/…` | Preview gateway entry (preview hosts only) |
| `src/app/app/sandbox/…`, `src/components/sandbox/` | Studio UI |
| `src/sdk/sandbox-client.ts` | TypeScript SDK (also used by the Studio itself) |
| `supabase/migrations/20261017090000_sandboxes.sql` | Schema v10 |
| `tests/db/sandboxes.test.ts`, `src/**/sandbox*.test.ts`, `tests/smoke/` | Tests |

## Session lifecycle

`requested → provisioning → ready ⇄ paused → stopping → terminated | expired`, and `failed` from any non-final state. Termination and expiry are two-phase: the session moves to `stopping`, the runtime destroys the sandbox, then the final state is recorded. If destroying fails, the session stays in `stopping` with `cleanup_status = failed` and the sweeper retries. The runtime's own timeout is always set, so a sandbox ends even if Farbaek is down.

Every change goes through `app_transition_sandbox_session` with an expected version; the SQL transition table mirrors `src/core/sandbox/lifecycle.ts` and a test keeps them equal. Creating a session and running a command take an idempotency key: a retry returns the first result and never starts a second sandbox or runs a command twice.

## Security boundary (what is and isn't claimed)

What Farbaek enforces:

- **Isolation** comes from the runtime: one Firecracker microVM per session (E2B). Farbaek only marks a deployment as Sandboxed after `pnpm sandbox:smoke` passed on it and `SANDBOX_ISOLATION_VERIFIED_AT` is set; otherwise everything that would run code is blocked by Guard with the reason.
- **No secrets inside.** Sandboxes are created with no environment variables from the server. The smoke test checks that none of Farbaek's secret names are visible inside.
- **Network deny by default**: no egress, or only `registry.npmjs.org`, `registry.yarnpkg.com`, `pypi.org`, `files.pythonhosted.org`. Private, link-local (cloud metadata), loopback, CGNAT and multicast ranges are always in `denyOut`, and allow rules only ever name public hostnames (allow wins over deny in E2B). The runtime enforces the rules outside the VM.
- **Ownership** is checked in TypeScript and again in SQL: only a session's creator or an owner or admin can run commands, write files, open previews, pause, resume or stop it. Members and viewers can read records; another workspace's session is "not found".
- **Limits**: concurrency and period minutes per workspace (checked under a lock), session length capped by plan and by the runtime, idle stop, per-command timeout (killed at the deadline), one running command per session, output capped at 128K characters per stream (start and end kept), files 512 KB, project copy 3,000 files or 25 MB, per-user rate limits.
- **Paths** are relative to `/home/user/project`; absolute paths, `..`, backslashes and control characters are refused before reaching the runtime. The control plane never extracts archives.
- **Previews** live on separate hosts and are private: see below.
- **Audit**: lifecycle events per session, audit events for privileged actions, structured JSON logs with correlation ids and secret redaction.

Defence in depth inside the guest: commands run under `ulimit` (processes, open files, file size). A process with sudo inside the VM can raise these; the VM's fixed CPU and memory are the real ceiling.

Known limits and residual risks:

- E2B's domain filtering covers HTTP and HTTPS on ports 80 and 443; when domains are allowed, DNS to 8.8.8.8 is allowed too, which is a possible low-bandwidth exfiltration channel for the "package registries" profile. The "no network" profile has no egress at all.
- A blocked TCP connection may look established from inside the sandbox (E2B behaviour); the smoke test checks for an application-level response.
- Disk size is a best-effort minimum on E2B, not a hard per-session quota.
- Isolation quality depends on the runtime host (kernel, KVM, patching). Self-hosting moves that responsibility to the operator.
- Passing tests don't mean code is secure, and a receipt never authorizes a deployment.

## Previews

1. "Open preview" asks the server for a link. Guard checks the session, port (1024 to 65535; never the runtime's own 49983 or 49999) and role, then records a preview with a random 130-bit id and an expiry (the plan's preview minutes, never beyond the session).
2. The link is `p-<id>.<SANDBOX_PREVIEW_DOMAIN>/__farbaek/launch?t=<token>`: a different site from Farbaek, so the app inside can't read Farbaek's cookies. The token is HMAC-signed, valid 60 seconds, usable once, and bound to the person.
3. The gateway swaps it for a cookie scoped to that one host (`HttpOnly`, `Secure`, `SameSite=None`, `Partitioned` on HTTPS) and redirects to `/`.
4. Every request re-checks the cookie, the preview (open, not revoked), the person's membership and the session, then forwards to the upstream the adapter builds from the stored sandbox id and port. The runtime's traffic token is added server-side. Farbaek and Supabase cookies are never forwarded; upstream `X-Frame-Options` and CSP are replaced with `frame-ancestors <app origin>`.

Not supported yet: WebSockets (hot reload), shareable public links.

## Connect a runtime

1. Run a runtime: E2B Embed on a Linux host with KVM you control (see [deployment.md](deployment.md)), or an E2B Cloud account.
2. `pnpm setup:env`, type `sandbox`: enter the E2B API key (hidden) and, for self-hosting, the domain. Preview and sweeper secrets are generated.
3. `pnpm sandbox:templates` builds `farbaek-node-small`, `farbaek-node-standard`, `farbaek-python-small`, `farbaek-python-standard`.
4. `pnpm sandbox:smoke` runs the real-runtime checks (start, echo, exit codes, timeout kill, files, no Docker socket, no secrets, metadata and internet blocked, destroy). It never runs during `pnpm test`.
5. When it passes: `pnpm setup:env`, type `verified`. Rebuild and restart. The dashboard then shows Sandboxed and live runtime health.
6. Schedule `pnpm sandbox:sweep` (or POST the sweep endpoint) every 2 to 5 minutes.

`pnpm check:env` confirms the settings without printing values. For an end-to-end API check through a running server, set `FARBAEK_SMOKE_BASE_URL` and `FARBAEK_SMOKE_ACCESS_TOKEN` and run `pnpm sandbox:smoke`.

## Usage and cost

Runtimes bill for the time a sandbox exists and runs, whatever it does. Farbaek meters running time per session (pauses close a segment) and derives vCPU-seconds and GiB-seconds from the sizes the runtime reports; active command time is tracked separately. Plan limits (`src/config/sandbox.ts`) cap concurrent sessions, session length, idle time, command length and period minutes. These are Farbaek's measurements, not a provider invoice, and no savings figures are claimed.
