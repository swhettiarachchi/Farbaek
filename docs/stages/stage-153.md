# Stage 153: Every plan can publish, after a rules check

- **Branch:** `feat/publish-on-every-plan`, from `main` after PR #197.
- **Decision:** ADR 0168. It amends ADR 0024 and settles ADR 0029's open "Plans" question.

## Why

- Publishing needs a clean security check, and security checks were Plus and up.
- So on Free (and on Lite, Maker and Starter), the Publish card could never work. The owner found this on Sunrise Bakery.
- They asked Claude to set everything up and accepted the recommendation: every plan can publish after a rules-only check.

## What changed

- **Runner** (`src/server/security/runner.ts`):
  - `checkScope(plan)` gives the full check to `security_checks` plans, and a rules check to the rest (a suspended workspace included). It gives nothing only when the plan can't be read.
  - A rules check runs Farbaek's rules and the OSV.dev lookup.
  - It skips `npm audit`, Semgrep, detect-secrets and the AI review with the plan's reason, and calls none of them.
- **Report** (`src/core/security/report.ts`): an optional `predicate.scope: "rules"`, only on rules checks. A full check's statement and digest are unchanged.
- **Security page:**
  - "Run the rules check" on lower plans, with a note on what it covers and a link to Plus.
  - A rules report is titled "Rules check", in the report and in the history.
- **Rescue page:** says the import gets the rules check on lower plans.
- **Publish card:** adds that every plan can run the check publishing needs.
- **Pricing:**
  - a new `site_publishing` feature on every plan, with its own comparison row;
  - `security_checks` relabelled as "Full security checks: package audits, code scanning and an AI review";
  - the "Security checks from Plus" promise mentions publishing.

## Verified

See the end of this file once checks have run.

## Next

- **After the merge, on production (Far001 is on Free):**
  - Run the rules check on Sunrise Bakery. The report should say "Rules check" and list the four skipped checks.
  - The Publish card should then allow publishing.
  - Don't publish it: Sunrise Bakery stays a private demo.
