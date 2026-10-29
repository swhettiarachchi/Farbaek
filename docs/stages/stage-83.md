# Stage 83: The app's nonce CSP, report-only first

The signed-in app had no `script-src`. This stage adds a nonce policy and sends it report-only, so production shows what it would block before it blocks anything.

- **Decision record:** `docs/adr/0107-app-csp-report-only.md`.
- **Branch:** `feat/app-csp`.

## 2026-10-29

### Done

- **`server/http/app-headers.ts`:**
  - `appCsp` (nonce, `strict-dynamic`, connections to Farbaek only, frames from the preview domain);
  - `appCspHeaders` (report-only unless `APP_CSP_ENFORCE=1`);
  - `parseCspReports` (both report formats, keeping only the directive, the blocked origin and the page's path).
- **The proxy** sets the policy on `/app` and `/admin`, and Next.js puts the nonce on its scripts.
- **`/api/csp-report`** logs violations, with limits on size and rate, and skips preview frames.
- **`csp-safe.tsx`** sets Zod's `jitless` in the browser, so its `eval` probe doesn't report.

### Verified

- **Unit:** `app-headers.test.ts`, 4 tests.
- **The demo production build in a real browser:**
  - `/app` sends the report-only policy, every one of its scripts carries the nonce, and marketing pages are unchanged;
  - a disallowed frame was reported to the server within seconds, with the query string stripped;
  - every app route at 375 and 1280 pixels: 70 page views, no console errors, no sideways scroll;
  - before `jitless`, Mesh and task pages reported Zod's `eval` probe; after it, they didn't;
  - the only reports left come from previews of people's own sites. Their inline scripts are expected, and they're why enforcing waits.
- **Typecheck and lint** are clean.

### Not verified yet

- **Reports from real signed-in use in production**, after the merge. Search the app logs for `csp.violation`.

### Next

- **Load previews of people's sites from the preview domain** instead of a `srcdoc` frame. Then set `APP_CSP_ENFORCE=1`.
