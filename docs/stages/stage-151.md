# Stage 151: Security review and hardening

- **Branch:** `fix/security-hardening`.
- **Migration:** none.
- **ADR:** 0167.

## 2026-11-04

### Asked

"Also check platform security", as part of the launch audit.

### What was reviewed

Three read-only reviews ran side by side:

| Review | What it covered |
| --- | --- |
| Authorization | All 48 server action files and 69 route handlers. All 87 migrations were scanned, and the SQL functions the risky paths call were read. |
| The web surface | Live response headers, cookies, CSRF, redirects, server-side fetches, previews, iframes and postMessage. |
| Data and integrations | RLS and grants, SECURITY DEFINER functions, the Dodo and Apple webhooks, uploads and imports, secrets in tracked files, logging, and `pnpm audit`. |

None found a critical or high issue.

### Fixed (ADR 0167)

- **Request bodies:**
  - **The problem:** webhooks, Apple notifications, CSP reports, the phone, sandbox and agent APIs and the mesh relay all read the whole body before checking its size.
  - **The fix:** they now read the stream with a hard limit (`src/server/http/body.ts`).
- **An open redirect after sign-in:**
  - **The problem:** `?next=/%09/evil.example` got through, because browsers turn `/<tab>/` into `//`.
  - **The fix:** `safeNextPath` now refuses control characters, whitespace and backslashes, and resolves the path against the site.
- **A workspace's own AI gateway** can no longer redirect the server to an address that wasn't checked.
- **Session cookies** are now HttpOnly, SameSite=Lax, and Secure on https.
- **The preview's CSP** now comes before anything the page says.
- **Sandbox app cookies** lose their `Domain` attribute, so they stay on their own preview host.
- **`/admin`** needs a second factor (aal2); otherwise it sends a listed admin to Office Space.
- **Mesh relay:** only one computer per fingerprint in a workspace.

### Verified

- **Unit tests for each fix:**
  - the capped reader stops an endless chunked body early;
  - 9 new `next` cases;
  - the cookie options;
  - the comment trick in the preview;
  - the cookie domain;
  - the admin second factor;
  - the fingerprint rule.
- **Full suite:** 2,631 pass. Lint is clean, the security evaluation passes 36 of 36, and the production build succeeds.
- **In a browser,** the software site's preview document (as the builder makes it):
  - the page stays in standards mode;
  - the CSP meta is the first element in the head;
  - the page's own `lang` and look are kept, and the kit runs.
- **Checked and fine:** database errors reach people as friendly messages, not raw Postgres text.

### Not checked

- **Signing in on production with the new cookie flags.** This is checked after the merge (the session cookie should no longer show in `document.cookie`).

### For the owner

- **Settings and requests only you can do:**
  - Turn on Supabase Auth's captcha in production (`GOTRUE_SECURITY_CAPTCHA_ENABLED` with the Turnstile secret).
  - Ask for `farbaek.si` to be added to the Public Suffix List.
  - Confirm `deploy/vps/supabase/farbaek.env` holds only settings, not secrets (auto mode wouldn't let the review read it).
- **Your say on dependency updates:** zod 4.6.6 once it's two weeks old, and e2b and @vercel/sandbox when they ship a patched undici.
- **Larger work to plan:**
  - enforcing the app's script CSP (previews move to the preview domain first);
  - an https App Link for the Android sign-in callback.
