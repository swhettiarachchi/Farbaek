# ADR 0168: Every plan can publish, after a rules check

- Status: accepted (2026-11-04).
- Amends ADR 0024 (security checks) and settles the open "Plans" question in ADR 0029 (publish).

## Context

Publishing a static site needs a finished security check of exactly its files that found nothing critical (ADR 0029). Security checks were a Plus-and-up feature (`security_checks`), so Free, Lite, Maker and Starter could build a site but never publish it. Their Publish card pointed to a Security page that said the check comes with Plus.

ADR 0029 left it to the owner whether Free should publish, "for example after a rules-only check". On 2026-11-04 the owner asked Claude to set everything up and accepted the recommendation: a site people can put online is the strongest reason to sign up.

## Decision

**Two scopes of check** (`checkScope` in `src/server/security/runner.ts`):

- **Full** (`security_checks`: Plus and up, and the trial), as before:
  - Farbaek's rules;
  - `npm audit` and Semgrep with detect-secrets in a sandbox;
  - the OSV.dev lookup;
  - the AI review.
- **Rules**, for every other plan. It runs what costs Farbaek nothing per check:
  - Farbaek's rules over every file, in the server process;
  - the OSV.dev lookup of locked package versions, a free public API.
  - The package audit, Semgrep, detect-secrets and the AI review are listed as skipped, with the reason "Included from the Plus plan up, and in the trial."
  - No sandbox session is made and no AI usage is reserved.
- **A suspended paid workspace** is on Free until billing is fixed, so it gets the rules check too, with "Paid features are paused until billing is resolved" as the reason. Only a plan that can't be read refuses a check.

**The report:**
- A rules check's statement carries `predicate.scope: "rules"`.
- A full check's statement has no `scope`, so its shape and digest are what they were.
- The predicate type stays `https://farbaek.dev/security-report/v1`.

**Publishing is unchanged:**
- The gate (`publishGate` and `app_publish_site`) accepts any finished check of exactly these files with no critical findings.
- Free's one active project caps it at one site.

**What people see:**
- **The Security page:**
  - On lower plans it says "Run the rules check".
  - A note says what the check covers and that the rest comes with Plus.
  - A rules report is titled "Rules check", in the report and in the history.
- **Rescue imports** start the rules check on lower plans.
- **Pricing:**
  - A new `site_publishing` feature on every plan: "Publish sites at their own address, after Farbaek's rules check".
  - `security_checks` is now labelled "Full security checks: package audits, code scanning and an AI review".
  - The "Security checks from Plus" promise is still true, and now adds that every plan can publish after the rules check.

## Consequences

- Every plan has a working path from build to a live site.
- Full checks stay a reason to choose Plus.
- A rules check is a narrower guide than a full check. The report says so: it carries its title and lists every check it skipped, with the reason. A good grade never hides what wasn't checked (ADR 0024).
- Rules checks cost Farbaek only server time and an OSV.dev request. One running check per project still applies.
