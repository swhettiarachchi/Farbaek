# 0013. FARBAEK Sandbox: E2B runtime behind a Farbaek control plane

- Status: accepted (runtime connection pending; see "Blockers")
- Date: 2026-10-17
- Supersedes the open choice in ADR 0003 ("E2B or Vercel Sandbox").

## Context

Farbaek needs to run builds, tests and dev servers for code written by people and AI agents, which is untrusted by definition (spec sections 7 and 13). The owner asked for a self-hosted, cost-efficient execution platform that Farbaek controls: Farbaek owns the control plane, policy and evidence; proven open-source infrastructure provides the isolation. Rebuilding a hypervisor or microVM orchestrator is out of scope.

Options evaluated on 2026-10-17 against official sources (docs/research/2026-10-17-sandbox-runtimes.md):

| Option | Isolation | What Farbaek would operate | Fit |
| --- | --- | --- | --- |
| E2B (open-source runtime, Apache-2.0) | Firecracker microVM per sandbox, own kernel | Self-hosted: E2B Embed on one Linux host with KVM (Docker Compose, Terraform for GCP, AWS and Azure, or Kubernetes); larger: the Nomad/Terraform cluster. Or E2B Cloud | Best: same SDK and API for self-hosted and cloud |
| Firecracker directly | microVM | Our own orchestrator: image building, networking, snapshots, scheduling, envd-like agent | Rebuilding E2B; rejected |
| gVisor (runsc) | User-space kernel; no KVM needed | Our own container orchestration, egress proxy and file and process API | Possible later as a second adapter; more to build |
| Docker alone | Shared kernel | | Not a boundary for hostile multi-tenant code; rejected |

## Decision

1. **Runtime: E2B**, used only through a Farbaek-owned `SandboxRuntime` interface (`src/core/sandbox/runtime.ts`) with explicit capabilities. The E2B adapter (`src/server/sandbox/e2b-runtime.ts`) is the first implementation; a gVisor or other adapter can be added without touching the app.
2. **Target deployment: self-hosted E2B Embed** on a Linux host with KVM that Farbaek controls, reached privately (E2B_DOMAIN or E2B_API_URL). **E2B Cloud** works with the same adapter as an interim, with no code change. The UI and docs say which one is in use; Farbaek never calls itself fully self-hosted unless the runtime is.
3. **No fallback.** Without a configured runtime whose isolation was verified on this deployment (`pnpm sandbox:smoke`, then `SANDBOX_ISOLATION_VERIFIED_AT`), Farbaek stays in Review Only and says why. Nothing ever runs on the app server.
4. **Control plane in the existing app.** Sessions, commands, previews, receipts and usage are Postgres records (migration 10) written only by service-role `app_*` functions that re-check ownership, plan limits, versions and idempotency; members read through RLS. The TypeScript lifecycle table and the SQL one are tested to be equal.
5. **Guard** gets a sandbox rule set (`src/core/sandbox/guard.ts`) in the same engine family as change proposals: who may start, run, write, preview or stop; nothing runs without verified isolation. Check runs produce **sandbox receipts** (in-toto statements, RFC 8785 digests, append-only) that can move a task in VERIFYING only as far as the real exit codes allow. A receipt never authorizes a deployment.
6. **Network: deny by default.** Sessions have no egress, or only the npm and PyPI registries; private, link-local (metadata) and CGNAT ranges are always denied. Rules are enforced by the runtime outside the VM.
7. **Previews on separate hosts** (`p-<id>.<preview domain>`), private by default: a one-use 60-second launch token, a host-only cookie bound to the person, and a gateway that adds the runtime's traffic token server-side. E2B public URLs are turned off (`allowPublicTraffic: false`).
8. **Cost:** the runtime's own timeout is always set; sessions expire on time and idle limits; a sweeper finishes cleanups and destroys orphans by deployment label; usage is metered as provisioned running time (vCPU-seconds, GiB-seconds) separately from active command time. Plan limits live in `src/config/sandbox.ts` (internal, not priced).

## Consequences

- One external dependency (`e2b` 2.51.0, pinned; 23 transitive packages, all at least 18 days old at install, none with install scripts).
- Previews need a separate preview domain with wildcard DNS and TLS in production. WebSockets (dev-server hot reload) aren't forwarded.
- Commands run as request-scoped streams; there is no durable job queue yet (ADR 0006 is still open). Concurrency is admission control in the database (one running command per session, per-workspace session limits), not a queue.

## Blockers (2026-10-17)

- This development PC (Windows 10, 3.8 GB RAM, no KVM) can't host Firecracker or gVisor, so no runtime runs here.
- E2B Embed needs a Linux host with KVM (bare metal, or a VM with nested virtualization); E2B Cloud needs an account. Both are the owner's decision and account; Farbaek never creates accounts or spends money.
- Until one is connected and `pnpm sandbox:smoke` passes, execution is honestly unavailable.
