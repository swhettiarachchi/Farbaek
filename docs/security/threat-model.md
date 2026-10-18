# Threat model (outline)

Version 0.1, 2026-10-13. Grows with each stage. Readiness notes only: this is not a compliance claim.

## What exists today

A static marketing site and pricing page. No accounts, no user data, no secrets, no server actions, no third-party scripts. The approval demo runs entirely in the browser on sample data and sends nothing.

Enforced now:

- Security headers on every route (`next.config.ts`): `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options: DENY`, `Permissions-Policy`, HSTS, and a CSP limiting `frame-ancestors`, `base-uri`, `form-action` and `object-src`.
- `poweredByHeader` disabled.
- Secrets kept out of git by `.gitignore` (`.env*` except `.env.example`), plus the Claude Code guard hook (`.claude/hooks/guard.mjs`).
- Fonts and images self-hosted; no external origins at runtime.

Known gaps:

- No nonce-based `script-src` yet. It needs the Next.js proxy layer and turns pages dynamic, so it arrives with the authenticated app routes.
- No `/.well-known/security.txt` until the owner provides a real disclosure contact.

## Trust boundaries (planned system)

| Boundary | Main threats (STRIDE) | Planned enforcement |
| --- | --- | --- |
| Browser to API | Spoofing (stolen sessions), tampering (forged requests), elevation (IDOR/BOLA) | httpOnly Secure SameSite cookies, CSRF protection, server-side authorization on every request, org-scoped queries, cross-tenant tests |
| API to database | Information disclosure across tenants | `org_id`-first scoping in code, RLS as defence in depth, unique and foreign-key constraints |
| API to model providers | Data exfiltration, prompt injection (LLM01), unbounded consumption (LLM10) | Server-side keys only, bounded context, token and time budgets, model output treated as untrusted |
| Agent to tools / sandbox | Tool misuse (ASI02), unexpected code execution (ASI05), goal hijack (ASI01) | Typed tool schemas, path canonicalization, policy check before every side effect, microVM sandbox with deny-by-default egress |
| Approvals | Replay, stale approval, payload swap | Approval bound to SHA-256 of the RFC 8785 canonical payload plus contract, policy and resource versions (implemented in `src/core/trust/approval.ts`), expiry, server-side reviewer authorization |
| Webhooks (payments) | Spoofing, replay, out-of-order delivery | Signature verification on the raw body, timestamp tolerance, unique `webhook_id`, re-fetch provider state |
| Desktop / mobile / Mesh | Device spoofing, path traversal on import, archive bombs | PAKE or Noise pairing, short-lived scoped tokens, manifest and hash validation, no auto-execution on import |
| Previews | Credential theft from generated code | Separate registrable domain, restrictive CSP, no shared cookies |

## OWASP mapping (to be filled per stage)

The security evaluation suite (Stage 3) maps scenarios to the OWASP Top 10 for LLM Applications 2025 (LLM01 to LLM10) and the OWASP Top 10 for Agentic Applications 2026 (ASI01 to ASI10). Coverage is reported per ID, together with its limits.

## Principles

- Fail closed when authorization, policy, quota or identity checks are unavailable (already true of `checkFeature` and `checkQuota`).
- Emergency pause, revocation, exports and billing stay available in every state (`ALWAYS_AVAILABLE_OPERATIONS`).
- A model never decides safety on its own. Prompts and hidden buttons are not security boundaries.

## Sandbox boundary (2026-10-17, ADR 0013)

What is built and enforced; full details in `docs/sandbox/README.md`.

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Sandbox to host and other tenants | Escape, cross-tenant access (ASI05) | One Firecracker microVM per session (runtime-provided). Code never runs on the app server; Guard blocks execution unless isolation was verified on this deployment | `sandbox.test.ts` (Guard), `runtime.smoke.test.ts` (real runtime, when connected) |
| Sandbox to secrets | Credential exfiltration | No server environment passed in; runtime key only authenticates the SDK | smoke test (no secret names inside) |
| Sandbox to network | SSRF, metadata theft, exfiltration | Deny-all egress, or npm and PyPI hosts only; private, link-local, loopback, CGNAT and multicast always denied; allow lists never contain IPs | `sandbox.test.ts` (rules), smoke test (metadata and internet blocked) |
| Browser or API client to sessions | IDOR, guessing ids, cross-tenant reads, unauthorized stop, forged limits | RLS reads; service-role `app_*` writes that re-check creator or owner/admin, contributor role, plan limits under a lock, versions, idempotency; only catalog ids accepted for sizes; another workspace's record is "not found" | `tests/db/sandboxes.test.ts`, `service.test.ts` |
| Cookie-authenticated API | CSRF | Same-origin `Origin` check on changes; bearer clients exempt | `wiring.test.ts` |
| Previews | Cookie theft by generated apps, link reuse, cross-tenant access, SSRF through the gateway, framing the app | Separate preview hosts; one-use 60 s HMAC launch token bound to the person; host-only cookie; preview, membership and session re-checked per request; upstream built from stored ids only; Farbaek and Supabase cookies never forwarded; WebSockets refused | `gateway.test.ts`, `sandbox.test.ts` (tokens, hosts) |
| Resource exhaustion | Runaway processes, endless sessions, cost | Runtime timeout always set, idle stop, per-command timeout with explicit kill, one running command per session, concurrency and period minutes per workspace, output and file caps, rate limits, sweeper and orphan cleanup | `service.test.ts`, `tests/db/sandboxes.test.ts` |
| Evidence | Tampering with results | Receipts are in-toto statements with RFC 8785 digests, append-only (trigger), checked against the session on insert; verdicts only from real exit codes | `sandbox.test.ts`, `tests/db/sandboxes.test.ts` |

Vercel Sandbox (ADR 0016) keeps the same boundaries: microVM per session, no server environment, explicit egress (`deny-all`, or the registry hosts with private and metadata ranges denied), runtime timeout always set, Review Only until the smoke test passes. It exposes no ports, so previews are off there, and its access token is kept server-side for an account used only for sandboxes. Tested by `vercel-runtime.test.ts` (fake SDK) and the smoke test when connected.

Known limits: Vercel's domain allowlist matches the TLS SNI only (domain fronting through the same CDN is possible where the CDN accepts it); E2B domain filtering is HTTP and HTTPS on ports 80 and 443 only, and allows DNS to 8.8.8.8 when domains are allowed; disk size is best effort; in-guest `ulimit` can be raised by sudo inside the VM; isolation depends on the runtime host's kernel and KVM. The smoke test has not yet run against a real runtime (none is connected).

## Agent boundary (2026-10-18, ADR 0018)

The Farbaek Agent desktop app runs model-driven work on the person's own computer. Full details in `docs/agent/README.md`.

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Model output to tools | Goal hijack and prompt injection from project files (ASI01, LLM01), malformed or truncated calls | Zod registry; unknown tools and bad input are errors, never run; calls from a reply cut off at `max_tokens` never run; a refusal ends the run; file contents and command output go back marked as project data | `loop.test.ts`, `agent.test.ts` |
| Tools to the disk | Path traversal, symlink and junction escapes, hard links to outside files, device names, TOCTOU swaps | Lexical rules (`..`, absolute, `:`, device names, trailing dots, 8.3 names); `realpath` root; `lstat` walk refusing links; multi-link files refused; opened handle identity checked; writes through an exclusive temp file and a rename (POSIX adds `O_NOFOLLOW`) | `fs-guard.test.ts` (real junctions and hard links in temp folders) |
| Tools to processes | Shell injection, planted binaries, secret leakage into commands, runaway processes | No shell; bare program names resolved to absolute paths, skipping relative and in-project PATH entries; allowlisted environment (the app's provider keys never reach a command); cmd.exe metacharacters refused for `.cmd`/`.bat`; bounded output; timeout and cancel kill the process tree (`taskkill /T /F`, process groups) | `broker.test.ts` (real processes: both PIDs gone after timeout and cancel) |
| Permissions | Tool misuse (ASI02), unexpected code execution (ASI05) | Modes and contract scope enforced per call; commands beyond read-only need a person's approval bound to the exact command by `approvalBindingHash`; the answer is checked against the pending request | `agent.test.ts`, `loop.test.ts`, `runs.test.ts` |
| Agent to Farbaek | Token theft or replay, acting after removal, cross-tenant writes, forged proposals | Only hashes of codes and tokens stored; codes single-use, 10 minutes, rate-limited; the person's role re-checked per request; proposals re-validated server-side and created by `app_create_agent_proposal`, which checks the agent, the person and the workspace; browsers can't read token hashes or pairing codes; HTTPS only (HTTP to localhost for development) | `tests/db/agents.test.ts`, `service.test.ts`, `farbaek-client.test.ts`, live smoke test |
| Secrets on the computer | Token theft from disk, the token reaching the window | `safeStorage` (DPAPI, Keychain, libsecret or KWallet); nothing stored when only plain-text storage exists; the token never crosses the preload bridge; model keys are no longer stored (ADR 0021), and ones an earlier version stored are deleted on start | Live check: the token file holds ciphertext only |
| The window | XSS reaching Node, remote content, navigation, permission abuse | Context isolation, Chromium sandbox, no Node integration, strict CSP, every page network request cancelled, navigation, new windows, webviews and permissions denied, Zod-validated IPC accepted only from the app's own page | Live check over the DevTools protocol: no `process` or `require`, page fetch blocked, invalid IPC refused |

Known limits: Controlled Development runs commands with the person's own rights (labelled "not isolated"); on Windows a folder swapped for a junction between the parent check and the rename is a remaining window; a background process that outlives its parent on Windows is reported, not guaranteed killed (no job objects in Node); installers are unsigned until certificates exist.

## Model gateway and the usage wallet (2026-10-18, ADR 0020, ADR 0021)

| Boundary | Threats | Enforcement (built) | Tested by |
| --- | --- | --- | --- |
| Agent to the model gateway | Using Farbaek as a free model proxy, reaching models the plan doesn't include, smuggling server tools or remote content, oversized requests (LLM10) | Agent token, contributor role and an approved-contract task in the agent's own workspace on every step; the server picks the model (pins honoured only when the plan includes them); only text, tool use, tool results and thinking blocks pass the schema; 6 MB bodies, 30 steps a minute per agent, 32,000 output tokens a step; every step reserved and settled through the wallet | `gateway.test.ts`, `routing.test.ts` |
| Project content to the model provider | Disclosure of project files to a third party | Sent only for the paired person's task, only to the provider this server uses, and said plainly on the Agents page; Farbaek doesn't store the conversation (the ledger keeps model and token counts) | Code review; Agents page copy |
| The usage wallet | Overspending, races between parallel calls, refund abuse, forged grants | Reserve and settle only through service-role functions under the organization lock; grants issued by the server from the catalog (kind, 70-day cap, key prefix checked in SQL); soonest-expiry draw records exactly which grants it touched; free-retry refunds capped over 31 days in the database; browsers can read their own grants only | `tests/db/ai-credits.test.ts`, `wallet.test.ts`, `ai-usage.test.ts` |
| Model choice from the browser | Effort or model values used to reach a stronger model | Effort parsed as an enum and routed on the server after the plan is resolved; unknown values fall back to Balanced | `ai-drafting.test.ts`, `routing.test.ts` |
