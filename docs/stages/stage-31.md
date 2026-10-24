# Stage 31: Apps verify with their own build and tests

Stage 27 let static sites be verified when their plan lists no checks. Apps with packages still couldn't be: their changes waited in "Verifying" for good.

- **Decision record:** `docs/adr/0058-app-check.md`.
- **Branch:** `feat/app-check`, from `main` after #38.

## 2026-10-24

### Done

**`src/core/realityloop/app-check.ts`:**
- **`appChecks`:** an app's own `build`, and its `test` when it's real (not npm's placeholder or a watcher), using the package manager its lockfile names, with `CI=1`. A Python project gets `python3 -m compileall -q .`.
- **`checksToRun`** moved here. It runs the plan's checks, else the site check for a static site, else the app's own checks.
- **`fallbackChecksWords`:** what the task page says will run.

**Callers:**
- the verification runner;
- the sandbox wiring's `requiredChecks`;
- the task page.

All three read the project's `package.json`.

**The sandbox's registry profile** now also allows `fonts.googleapis.com` and `fonts.gstatic.com`, so a Next.js app using `next/font/google` can build. The threat model notes it.

**`scripts/site-check-script.mjs`** normalises line endings, so a Windows checkout no longer fails the staleness test.

### Verified

- **Unit tests** (`app-check.test.ts`):
  - plan checks win;
  - the site check for static sites;
  - build and tests for npm and pnpm apps;
  - the placeholder and watchers are skipped;
  - an unreadable `package.json` has nothing to run;
  - Python compiles;
  - the task page's words.
- **The runner:**
  - starts for a static site and for an app with a build;
  - refuses an app with neither a build nor tests;
  - refuses a project with nothing to check.
- **Sandbox network:** the font hosts are allowed; `github.com` and `www.googleapis.com` are still blocked; the Vercel policy lists exactly the allowed hosts.
- **The site-check script** is up to date from a CRLF checkout.

### Not verified

- **A live sandbox run of an app's build check.** The first real one is an app task in production.

### Next

- Run "Check the site now" or "Run the checks now" on the waiting production tasks.
