# 0024. Security checks: rules, packages and an AI review, with fixes by the agent

- Status: accepted
- Date: 2026-10-18

## Context

People build websites and apps on Farbaek with an agent. The owner wants security checks on the platform, included from the cheaper plans: the research found competitors keep them for business tiers. Projects built quickly often ship common, serious mistakes, such as tables without Row Level Security, secrets in client code, wildcard CORS or raw HTML.

## Decision

A **security check** on a project (Plus and up, and in the trial; `security_checks`) runs three checks and reports each as run or skipped, with the reason (since ADR 0168, plans below Plus run a rules check: the rules and the OSV.dev lookup, with the rest skipped for the plan):

1. **Farbaek's rules** (`src/core/security/rules.ts`): deterministic checks over every file, on Farbaek's servers, with no code run.
   - Credentials and signed tokens in code; secret-looking public env names (`NEXT_PUBLIC_…SECRET`); server keys in browser code; tables without Row Level Security across SQL migrations.
   - Wildcard CORS, raw HTML, `eval`, SQL built from strings, weak hashes, Django debug, a missing Content Security Policy.
   - Conservative: placeholders, env reads and tests don't count, and a secret's value is never echoed.
2. **Known package vulnerabilities**: `npm audit --json --package-lock-only` in a short sandbox session created as the person, with registry-only network. It reads the lockfile only: nothing is installed and no package code runs. The session is stopped right after.
3. **AI review** of up to 8 of the riskiest files, routed to Sonnet (Balanced) and metered from the wallet (`security_review`).
   - The files are sent as data, with instructions to ignore any instructions inside them.
   - The output is schema-validated. Findings about files the model wasn't shown are dropped, and lines outside the file are cleared.
   - A failed review is refunded, and the rest of the check still reports.

**The report** is an in-toto statement (`https://farbaek.dev/security-report/v1`):
- It holds the files' digest, the checks, every finding (deduplicated, numbered most serious first) and a score: 100 minus 30, 15, 7 or 3 per critical, high, medium or low finding, graded A to F.
- It's stored with its SHA-256 digest in `security_reports` (migration 18): one running check per project, written only by the server and read by members.
- A check that runs longer than 15 minutes is marked failed the next time someone looks.

**Fix with the agent** turns a finding into a task in the project. From there it's the normal flow: contract, then Build, then review.

## Consequences

- Every project gets a quick, honest read of common risks, with no setup.
- The page says it's a guide, not a certification. Skipped checks are listed with their reasons, so a high score never hides what wasn't checked.
- Python packages aren't audited yet (`pip-audit` would need installing in the sandbox). Scheduled checks on higher tiers can come later, through the same runner.
