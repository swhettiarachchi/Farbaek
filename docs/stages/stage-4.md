# Stage 4 (execution broker): FARBAEK Sandbox

The owner asked (2026-10-17) for Farbaek's own sandbox platform: a Farbaek-owned control plane over proven isolation, self-hosted where possible, with real execution, security controls, tests and a deployment path. Spec sections 7 (execution isolation) and 13 (security). Decision: [ADR 0013](../adr/0013-sandbox-runtime-and-control-plane.md). Guide: [docs/sandbox/](../sandbox/README.md).

The owner's message asked to proceed without stopping at a plan, so this stage ran without the usual plan-mode pause; the plan is ADR 0013.

## 2026-10-17: control plane, E2B adapter, Studio, API, gateway

### Audit

- Existing: ADR 0003 interface stub (`SandboxProvider`, `executionMode`, `verificationEvent`), Review Only everywhere, policy engine v1 (the "Guard"), RFC 8785 hashing (the "Canon"), ProofPacks, task state machine waiting in VERIFYING for real exit codes, plan catalog and usage periods, service-role write pattern with RLS reads.
- No hosting target chosen yet; no job runner (ADR 0006 open); dev PC is Windows 10 with 3.8 GB RAM and no KVM.
- Runtime research: docs/research/2026-10-17-sandbox-runtimes.md (E2B runtime and Embed, SDK 2.51.0 types, Firecracker and gVisor requirements).

### Done

- **Domain core** `src/core/sandbox/`: lifecycle table (two-phase stop and expiry), templates (Node.js 22, Python 3.12) and sizes, request validation from catalog ids only, workspace-relative paths, deny-by-default network policy, command checks and bounded output, failure categories, Guard rules for sandbox actions (hashed rule set), sandbox receipts (in-toto), usage metering (running time vs active time), preview ids and HMAC tokens, and the `SandboxRuntime` contract with explicit capabilities.
- **Plan limits** `src/config/sandbox.ts`: concurrent sessions, session length, idle stop, command length, period minutes, sizes, network profiles, preview length; internal and not priced. Capped by the runtime's own ceiling.
- **Migration 10** `20261017090000_sandboxes.sql`: sessions, executions, events, previews, receipts (append-only), a private rate-limit table; 15 service-role-only functions re-checking creator or owner/admin, contributor role, plan limits under a lock, versions, idempotency, one running command per session, launch-once previews; composite keys so a session can only reference its own workspace's project and task.
- **E2B adapter** `src/server/sandbox/e2b-runtime.ts`: no envs from the server, explicit egress rules, `allowPublicTraffic: false`, runtime timeout always set, explicit kill on command timeout, categorized errors with key-like strings scrubbed, tagged listing for orphan cleanup. Registry with no fallback.
- **Service** `src/server/sandbox/service.ts`: create (with project snapshot copy and compensation), run (streamed, bounded, idempotent), cancel, stop, pause, resume, files, previews, metrics, contract check runs with receipts that advance a VERIFYING task only as far as exit codes allow, and the sweeper (expiry, idle, cleanup retries, lost commands, orphans, retention).
- **API v1** (`src/app/api/v1/…`): sessions, executions with SSE streaming, files, previews, checks, receipts, metrics, health; bearer or cookie auth with a same-origin check; idempotency keys; rate limits; a cron-guarded sweeper endpoint.
- **Preview gateway**: separate `p-<id>` hosts routed by `src/proxy.ts`; one-use launch tokens, host-bound cookies, per-request re-checks, server-side traffic token, cookie stripping, WebSocket refusal; app security headers excluded on preview hosts only.
- **SDK** `src/sdk/sandbox-client.ts`, used by the Studio itself.
- **Sandbox Studio**: dashboard (live runtime status, capabilities, usage against limits, search, filters, sort, pages, recent outcomes, failed sessions, connect steps), create flow, and workspace (file explorer with resizable panel, CodeMirror editor, streaming console in a media frame, private preview with device widths, checks and receipts, details with live metrics, history). Navigation entry; "Test runs" left the roadmap list.
- **Scripts**: `pnpm sandbox:templates`, `pnpm sandbox:smoke`, `pnpm sandbox:sweep`; `pnpm setup:env` gained `sandbox` and `verified`; `pnpm check:env` checks the runtime key.
- **Docs**: ADR 0013, research notes, docs/sandbox (README, deployment, API), threat-model section; ADR 0003 marked accepted.
- Dependency: `e2b` 2.51.0 (pinned; installed with a 5-day minimum release age; all 23 new packages at least 18 days old; no install scripts).

### Verified

- 545 tests pass, 10 skipped (the real-runtime smoke tests, which only run with `pnpm sandbox:smoke`). New: 42 domain tests, 21 database tests (lifecycle table equal to TypeScript, contributor-only creation, cross-workspace refusal, idempotency, concurrency and minutes under a lock, forged sizes and durations, version conflicts, creator or owner/admin only, billing segments, one running command, outcome consistency, launch-once previews, receipts immutable, RLS and grants, rate limits, retention keeps receipts), 29 service tests, 9 gateway tests, 6 SDK tests, 2 same-origin tests. Typecheck, lint and production build pass.
- Migration 10 on the hosted project (2026-10-17): the first run was cancelled when Supabase pointed out the private rate-limit table had no RLS; RLS was added to the migration file, re-tested, and the editor contents then matched the tested file (38,364 bytes, `sha256 3093f7d1…7d03`). Supabase's remaining warning was its generic "destructive operations" notice for `delete` and `revoke` statements inside function bodies; nothing is dropped. Result: success. Read-only check: 6 tables, all with RLS; 5 readable by members, none writable from browsers, none readable by anon; 15 functions, all security definer, all service-role only, none callable by browser roles; receipt immutability trigger enabled.
- All ten migrations are on the hosted project:
  `supabase migration repair --status applied 20261013120000 20261014090000 20261014120000 20261015090000 20261015120000 20261015150000 20261015180000 20261015210000 20261016090000 20261017090000`
- Live on the owner's signed-in session (production build): dashboard shows Review Only with the reason, real trial limits (2 sessions, 600 minutes) and zero usage; create page offers only plan options and keeps Start disabled with the reason; `/api/v1/sandbox/health` answers; unauthenticated and malformed-token requests get 401 (a 500 on malformed tokens was found and fixed); a preview host, even for `/_next/static/…`, reaches the gateway and never the app; the gateway path on the app host is 404; the sweeper refuses without its secret; no horizontal scroll at desktop width.

### Not verified

- **Real execution.** No runtime is connected: this PC has no KVM, and an E2B Cloud account or a KVM Linux host is the owner's to provide. The adapter is typechecked against the SDK's real types, and `pnpm sandbox:smoke` is ready to prove it; until it passes, execution stays off.
- The workspace screens with a running session (they need a runtime). Their logic is covered by tests, but not seen live.
- The 375px layout of the signed-in Sandbox pages: Chrome blocks script-opened popups and the app forbids framing, so a phone-width render wasn't possible from here. The pages use the same mobile-first patterns as the rest of the app (single column below `md`, 16px inputs, cards instead of the table).
- Preview cookies on `*.localhost` in a frame (Secure, SameSite=None, Partitioned): depends on the browser; "New tab" is the fallback.

### Next

1. Owner: choose the runtime. Either an E2B Cloud account now, or a Linux host with KVM for E2B Embed (docs/sandbox/deployment.md). Then `pnpm setup:env` → `sandbox`, `pnpm sandbox:templates`, `pnpm sandbox:smoke`, `pnpm setup:env` → `verified`, rebuild.
2. Run the API smoke test against the live app, check the workspace screens at 375px and desktop, and schedule `pnpm sandbox:sweep`.
3. Then: a durable job runner for long builds (ADR 0006), copying sandbox edits back to the project through change proposals, interactive terminals over a WebSocket gateway, and shareable preview links as an explicit, revocable owner decision.

## 2026-10-17: Vercel Sandbox runtime (ADR 0016)

### Done

- At the owner's request, Vercel Sandbox is a second runtime beside E2B: `SANDBOX_PROVIDER=vercel`. Adapter `src/server/sandbox/vercel-runtime.ts` on the official SDK, pinned to `@vercel/sandbox` 3.5.1 (released 2026-09-28; the four newer releases were days old).
- The same guarantees as E2B: Firecracker microVM per session, no server environment inside, explicit egress (`deny-all`, or the registry hosts with private and metadata ranges denied), runtime timeout always set, the project folder at `/home/user/project`, `ulimit` wrapper, Review Only until the smoke test passes.
- Commands run in their own process group (`setsid -w`), so cancel and timeouts stop everything a command started. The group id fits the existing `pid` column, so the database is unchanged.
- Off on Vercel, with the reason shown in the app: previews (its ports are public with no sign-in), pause and resume (would use Hobby's 15 GB lifetime snapshot storage), live metrics (not reported by the SDK). Runtimes can now carry these reasons (`capabilities.unavailable`).
- Templates start from `vercel/sandbox/universal`; the size picks the vCPUs. Template labels now say "Node.js LTS and npm" and "Python 3 and pip", and the Python commands use `python3`.
- `node scripts/setup-env.mjs sandbox` asks for the runtime (Vercel by default) and takes the token hidden, plus the team and project IDs. `pnpm check:env` lists one sandbox to confirm the credentials without starting anything. `pnpm sandbox:templates` says there's nothing to build on Vercel.
- ADR 0016; sandbox README, deployment guide, threat model and `.env.example` updated.

### Verified

- 18 adapter tests against a fake SDK: credentials, selection and Review Only, capabilities and reasons, firewall policy (deny-all; registries with private ranges denied and no deny-all range), create parameters (no env, no ports, not persistent, timeout capped, tags, vCPU rounding, folder prepared), destroy and gone sandboxes, streaming and real exit codes, timeout kills the group with no exit code, cancel, file writes and reads (paths kept inside the project, 512 KB cap), folder listing, error categories.

### Not verified

- A real Vercel account. Creating one is the owner's step; then `pnpm check:env` and `pnpm sandbox:smoke` are the first live checks.

### Next

1. Owner: a Vercel account kept only for sandboxes (Hobby is free and hard-capped), a project in it, and an access token with an expiry. Then `node scripts/setup-env.mjs sandbox` → `vercel`.
2. Run `pnpm check:env` and `pnpm sandbox:smoke`; on a pass, `node scripts/setup-env.mjs verified` and restart.

## 2026-10-18: Vercel Sandbox connected and verified live

- Through the owner's signed-in Chrome, at their request: confirmed the account is on the free Hobby plan (nothing bought or upgraded), created an empty project `farbaek-sandbox` (`prj_nOEnEl11EzIxq3Fa4VB4zsT2qQGY`) in team `team_OShrLOPoOQrfxJXRZTEgoV3V`, so sandboxes stay apart from the owner's four live sites. The owner created the access token (90-day expiry) and pasted it into the hidden prompt; Claude never saw it.
- `node scripts/setup-env.mjs sandbox` now takes `--team`, `--project` and `--plan`, since IDs aren't secrets, so only the token is typed.
- `pnpm check:env`: "Vercel Sandbox accepts the token".
- `pnpm sandbox:smoke` against the real account: 8 of 8 passed (run twice). Sandbox `fb-d5tys2…`: 1 vCPU and 2048 MiB reported, guest kernel 6.18.49; real output and exit codes (7 reported as 7); a command killed at its 2-second timeout with no exit code; files written, read back and listed in `/home/user/project`; no Docker socket and none of the server's secret names inside; cloud metadata (169.254.169.254, metadata.google.internal) and the internet blocked; the sandbox deleted afterwards.
- The API smoke test was skipped (it needs `FARBAEK_SMOKE_BASE_URL` and an access token).
