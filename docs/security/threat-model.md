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
