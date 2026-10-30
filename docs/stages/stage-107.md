# Stage 107: Known vulnerabilities from OSV.dev

The security check looks every lockfile's exact versions up in OSV.dev, so pnpm, yarn and Python projects get dependency findings too, with or without a sandbox.

- **Decision record:** `docs/adr/0130-osv-dependency-check.md`.
- **Branch:** `feat/osv` (from main at `5ff4c51`).
- **No migration.**

## 2026-10-30

### Done

- **`src/core/security/osv.ts`:**
  - the lockfile readers (npm v1 to v3, pnpm, yarn, pip, poetry);
  - the batch query;
  - findings with severity, CVE, link and fixed version.
- **`src/server/security/osv-client.ts`:** api.osv.dev only, batches and details, checked responses.
- **The runner:**
  - the new `osv` check, leaving npm packages to `npm audit` when it ran;
  - reasons for each skip;
  - the label "Known vulnerabilities from OSV.dev".
- **The Privacy Policy:** package names and versions go to OSV.dev when a check runs.
- **The spec audit:** §10 and the stale claims section corrected.

### Verified

- `src/core/security/osv.test.ts` (5):
  - every lockfile format, with ranges, comments and `node_modules` ignored;
  - Python names normalised;
  - v1 lockfiles, and broken ones;
  - findings, severity, fixed versions, and missing details.
- `src/server/security/osv-client.test.ts` (2): batches of 1,000, 40 details, unreachable, odd answers, failed details.
- `src/server/security/runner.test.ts` (2 new): findings reported; npm left to `npm audit`; skip reasons.
- **A real lookup:** OSV.dev returned advisories for `lodash` 4.17.15 and `django` 3.2.0 through the client's own code. It ran once from the dev PC as a temporary test, then deleted.
- `pnpm typecheck`, `pnpm lint`, `pnpm test`.
