# ADR 0130: Known vulnerabilities from OSV.dev

- Status: accepted (2026-10-30).
- From master spec §10 ("static, dependency and secret findings: Semgrep (SAST), OSV-Scanner (dependencies), gitleaks and/or TruffleHog (secrets)"). Extends ADR 0024's security check.

## Context

The security check's dependency findings came from `npm audit` in a sandbox, so only projects with a `package-lock.json`, on a server with a connected sandbox, got any. pnpm, yarn and Python projects got none.

## Decision

**A new check, "Known vulnerabilities from OSV.dev":**
- Farbaek reads the exact versions a project's lockfiles pin: `package-lock.json` (v1 to v3), `pnpm-lock.yaml`, `yarn.lock`, `requirements*.txt` (`==` pins only) and `poetry.lock`. It never guesses a version from a range.
- It looks them up in OSV.dev, the open database behind OSV-Scanner. It's free, needs no key and runs no code; Farbaek sends package names and versions only.

**Calls:**
- only to `https://api.osv.dev`;
- batches of 1,000;
- details for up to 40 advisories, 8 at a time, each with a 15-second timeout and no redirects;
- responses checked with zod.

**Findings:** one per package and advisory, with:
- the advisory id and any CVE;
- the severity GitHub's review gave it, or medium when there's none;
- a link to osv.dev;
- the first fixed version OSV.dev lists, or the fact that none is listed.

An advisory whose details couldn't be fetched still counts, by its id.

**No double counting:** when `npm audit` ran in the same check, npm packages are left to it and OSV.dev covers the rest. The check's detail says so.

**Skips:** the check is skipped with the reason, never failed, when there's no lockfile, nothing exact to look up, or OSV.dev can't be reached.

**Privacy:** the Privacy Policy says package names and versions go to OSV.dev (run by Google) when a check runs.

## Consequences

- Every project with a lockfile gets dependency findings, sandbox or not, across npm, pnpm, yarn and PyPI.
- Semgrep (static analysis) and gitleaks (secrets in history) are still not built. Farbaek's own rules cover secrets in the current files.
