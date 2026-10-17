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

Known limits: E2B domain filtering is HTTP and HTTPS on ports 80 and 443 only, and allows DNS to 8.8.8.8 when domains are allowed; disk size is best effort; in-guest `ulimit` can be raised by sudo inside the VM; isolation depends on the runtime host's kernel and KVM. The smoke test has not yet run against a real runtime (none is connected).
