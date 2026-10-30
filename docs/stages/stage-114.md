# Stage 114: Semgrep and a secret scan

The security check now also runs Semgrep, with Farbaek's own 14 rules, and Yelp's detect-secrets on a project's files in a disposable sandbox. Only each finding's rule, file and line come back.

- **Decision record:** `docs/adr/0137-semgrep-and-secret-scan.md`.
- **Branch:** `feat/static-scan` (from `feat/mutation-trials`).
- **Migration:** none.

## 2026-10-30

### Done

- **`src/core/security/static-scan.ts`:**
  - pinned versions (Semgrep 1.179.0 and detect-secrets 1.5.0, checked on PyPI: released 2026-10-02 and 2024-05-06);
  - the 14-rule Semgrep ruleset and its YAML;
  - the in-sandbox script that compacts each report;
  - the install and scan commands;
  - parsers into findings;
  - dropping findings at a line another check already reported.
- **The runner:** step 2c, with two checks (`sast` and `secrets`), each reported as run or not run on its own.
- **The wiring:** one Python sandbox session with registry-only network. The rules and script are written to `.farbaek-scan/`, the tools are installed into a throwaway environment, and the sandbox stops.
- **The security page:** labels the sources "Semgrep" and "Secret scan".
- **Privacy page:** what runs, where it comes from, and that nothing about the project is sent.

### Verified

- `src/core/security/static-scan.test.ts` (5):
  - pins and flags;
  - every YAML line's shape and quoting;
  - Semgrep reports, including prefixed rule ids, unknown rules and failed runs;
  - secret types and severity, never the value;
  - no double counting.
- `src/server/security/runner.test.ts` (2 new, 2 updated): findings added without repeats; each tool's failure reported with its reason.
- `pnpm typecheck`, lint, full `pnpm test`.

### Not verified

- **Semgrep and detect-secrets in a real sandbox:** this PC has no Python, and a production sandbox needs a signed-in security check. If Semgrep ever refuses the ruleset, the report says so ("Semgrep stopped (exit 7): ...") rather than showing a clean result. The first live security check will show whether both ran.
