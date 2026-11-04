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

- **New tests:**
  - `checkScope`: Free, Lite, Maker and Starter get the rules check, and Plus gets the full one. A suspended workspace gets the rules check with the billing reason. An unreadable plan gets none.
  - A rules check runs the rules and OSV.dev and skips the other four with the reason. It calls no audit, scan or reviewer, and reserves no usage.
  - A full check's report has no `scope`.
  - In the catalog, `site_publishing` is on Free.
- **Checks:** typecheck and lint are clean, and the full suite passes 2,637 tests.
- **On a demo production build:**
  - Pricing at 1280 and 375 px shows the new row ticked on every plan, and "Full security checks" from Plus. The promise card reads well on a phone.
  - No sideways scroll and no console errors.
  - The demo workspace's Security page is unchanged, because its plan has full checks.

## Checked on production (2026-11-04, after PR #198)

- On the Free workspace, Sunrise Bakery's Security page shows **Run the rules check** and the note.
- The check scored 97 (grade A). It's titled "Rules check" and lists the four skipped checks with the plan as the reason. OSV.dev was skipped because the site has no lockfile.
- The Publish card no longer asks for a security check. It still needs an owner's reason, because Studio edits came after the last verified change (ADR 0050). It wasn't published: Sunrise Bakery stays a private demo.
