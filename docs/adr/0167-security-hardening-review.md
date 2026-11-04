# ADR 0167: Hardening from the platform security review

- Status: accepted (2026-11-04).
- Amends ADR 0026 (the admin console) and the request handling of ADRs 0094, 0102 and 0149.

## Context

Before launch, the owner asked for a check of the platform's security as well as its interface. Three read-only reviews covered:
- **authorization:** 48 server action files, 69 route handlers and the SQL write functions;
- **the web surface:** headers, cookies, redirects, server-side fetches, previews and iframes;
- **data and integrations:** RLS and grants, webhooks, uploads, secrets and dependencies.

None found a critical or high issue.
- **The access model held:**
  - every write function checks membership and role on the server;
  - RLS is on every table;
  - webhooks verify their signatures;
  - uploads are sniffed by content, and SVG is refused;
  - published sites live on their own domain.
- **The medium and low findings below were confirmed in the code.**

## Decision

- **Request bodies are read with a hard limit as they stream in** (`src/server/http/body.ts`).
  - Webhooks, the Apple notifications, the CSP report endpoint, the phone API, the sandbox and agent APIs and the mesh relay used `request.text()` or `arrayBuffer()`, checking the size only afterwards.
  - A chunked body with no Content-Length could make the server hold gigabytes before refusing it.
- **Sign-in's `next` destination is resolved, not pattern-matched** (`safeNextPath`).
  - `/<tab>/evil.example` passed the old check, and browsers drop the tab, so it became `//evil.example`: a redirect to another site straight after sign-in.
  - Control characters, whitespace and backslashes are now refused, and the path must resolve to this site.
- **A workspace's own AI gateway can't redirect Farbaek's server.** Its address is checked to be public, and the client now refuses redirects. A gateway could otherwise bounce requests to an internal address that was never checked.
- **Session cookies are HttpOnly, SameSite=Lax, and Secure on https** (`sessionCookieOptions`). No browser code reads the session, so an injected script can't lift it.
- **The static preview's policy goes first.** The CSP meta and the navigation guard are inserted right after the doctype, before anything the page says, so a commented-out `<head>` or an early script can't get ahead of them.
- **Sandbox previews can't set cookies for the shared preview domain.** The gateway drops the `Domain` attribute from an app's cookies, so they stay on that preview's host.
- **The `/admin` console needs a second factor.**
  - It reads every workspace with the server key, and was protected only by an email allowlist and a magic link.
  - It now also requires an aal2 session. A listed admin without one is sent to Office Space, which has the same views behind MFA, trusted devices and an audit log.
- **One computer per mesh fingerprint in a workspace:** another member's agent can't claim a reachable computer's fingerprint and take its calls.

## Not changed here (owner or larger work)

- **Enforce the app's script CSP.** It's report-only on `/app`. Static previews inherit it, so they need to move to the preview domain first.
- **Add `farbaek.si` to the Public Suffix List,** so published sites and previews are separate sites to browsers. This is a request the domain owner files.
- **Turn on Supabase Auth's captcha** (`GOTRUE_SECURITY_CAPTCHA_ENABLED`), so calls straight to `/auth/v1` meet Turnstile too. This is a production setting.
- **Android: return the phone connect code through an https App Link** instead of the `farbaek://` scheme, which another app could register.
- **Dependencies:** zod 4.6.6 (a fix for memory use on oversized input), once it's two weeks old, and e2b and @vercel/sandbox when they ship a patched undici. Installs wait for the owner.
- **Smaller items:**
  - a rate limit on creating workspaces;
  - HSTS preload, and HSTS on the apex redirect;
  - a manager's say over an agent's lease;
  - stricter Apple certificate parsing.

## Consequences

- **The fixes are server-side and fail closed;** tests cover each one.
- **People signed in today** get HttpOnly session cookies at their next session refresh, with no sign-out.
- **The owner reaches the cross-workspace views through Office Space,** or through `/admin` after signing in with a second factor.
